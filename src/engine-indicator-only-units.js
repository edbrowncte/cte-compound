import { HtlEngine as IndicatorOnlyEngine, __indicatorOnlyTest } from "./engine-indicator-only.js";
import { candles, currentEvent } from "./horizon-platform-engine.js";
import { STRATEGY_ENGINE_VERSION } from "./horizon-strategy-v1.js";
import { REGISTERED_PERFORMANCE_VERSION } from "./horizon-registered-performance.js";

const API="https://api-fxtrade.oanda.com";
const IO_UNITS_VERSION="INDICATOR_ONLY_UNITS@1.0.0";
const DEFAULT_IO_UNITS=100;
const MAX_IO_UNITS=100000000;
const response=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{"Content-Type":"application/json","Cache-Control":"no-store"}});

function normalizeIndicatorOnlyUnits(value){
  return Math.max(1,Math.min(MAX_IO_UNITS,Math.trunc(Number(value))||DEFAULT_IO_UNITS));
}

function ioClientOrderId(pair,eventId){
  let hash=2166136261;
  const input=String(eventId||"");
  for(let index=0;index<input.length;index++){hash^=input.charCodeAt(index);hash=Math.imul(hash,16777619);}
  return `cte-io-${String(pair||"").replaceAll("_","")}-${(hash>>>0).toString(36)}`.slice(0,64);
}

async function callOanda(path,token,init={}){
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),15000);
  try{
    const result=await fetch(API+path,{method:init.method||"GET",headers:{Authorization:`Bearer ${token}`,Accept:"application/json",...(init.body?{"Content-Type":"application/json"}:{})},body:init.body,redirect:"manual",cache:"no-store",signal:controller.signal});
    const payload=await result.json().catch(()=>({}));
    if(!result.ok)throw Object.assign(new Error(payload.errorMessage||payload.errorCode||`OANDA HTTP ${result.status}`),{status:result.status,payload});
    return payload;
  }catch(error){
    if(controller.signal.aborted)throw Object.assign(new Error("OANDA request timed out"),{status:504});
    throw error;
  }finally{clearTimeout(timeout);}
}

export const __indicatorOnlyUnitsTest=Object.freeze({IO_UNITS_VERSION,DEFAULT_IO_UNITS,MAX_IO_UNITS,normalizeIndicatorOnlyUnits,ioClientOrderId});

export class HtlEngine extends IndicatorOnlyEngine{
  async fetch(request){
    const url=new URL(request.url),path=url.pathname;
    if(path==="/control/selectedPairs"&&request.method==="POST"){
      const body=await request.clone().json().catch(()=>({}));
      if(Object.prototype.hasOwnProperty.call(body,"indicatorOnly")){
        const parent=await super.fetch(request),payload=await parent.clone().json().catch(()=>({}));
        if(!parent.ok)return parent;
        const state=(await this.ctx.storage.get("state"))||{},units=normalizeIndicatorOnlyUnits(body.indicatorOnly?.units??state.indicatorOnlyUnits);
        state.indicatorOnlyUnits=units;await this.ctx.storage.put("state",state);
        if(payload.indicatorOnly)payload.indicatorOnly={...payload.indicatorOnly,units};
        return response(payload,parent.status);
      }
    }
    if((path==="/control/indicatorOnly"||path==="/control/status")&&request.method==="GET"){
      const parent=await super.fetch(request),payload=await parent.clone().json().catch(()=>({})),state=(await this.ctx.storage.get("state"))||{},units=normalizeIndicatorOnlyUnits(state.indicatorOnlyUnits);
      if(payload.indicatorOnly)payload.indicatorOnly={...payload.indicatorOnly,units};
      return response(payload,parent.status);
    }
    return super.fetch(request);
  }

  decisionContext(candidate,config){
    const context=super.decisionContext(candidate,config);
    return candidate?.IO?{...context,indicatorOnlyUnits:normalizeIndicatorOnlyUnits(candidate.IO.units)}:context;
  }

  async executeIndicatorOnlyUnits(candidate,token,accountId,state){
    state.lastTradeAttemptAt=new Date().toISOString();
    const{pair,event}=candidate,direction=event.direction>0?"BUY":"SELL",requested=normalizeIndicatorOnlyUnits(candidate?.IO?.units),context=this.decisionContext(candidate,{});
    const summary=(await callOanda(`/v3/accounts/${accountId}/summary`,token)).account||{},marginAvailable=Number(summary.marginAvailable||0);
    if(marginAvailable<=0){state.lastNoOrderReason=`Indicator Only · no margin available: ${marginAvailable}`;await this.write({type:"NO_ORDER",pair,direction,units:requested,message:state.lastNoOrderReason,...context});return null;}

    const pricing=await callOanda(`/v3/accounts/${accountId}/pricing?instruments=${pair}&includeUnitsAvailable=true`,token),priceData=pricing.prices?.[0],available=priceData?.unitsAvailable?.default?Math.max(0,Math.trunc(Number(event.direction>0?priceData.unitsAvailable.default.long:priceData.unitsAvailable.default.short)||0)):0,safeCapacity=Math.floor(available*.8);
    if(requested>safeCapacity){state.lastNoOrderReason=`Indicator Only · requested ${requested} units exceeds 80% directional capacity ${safeCapacity} (available ${available})`;await this.write({type:"NO_ORDER",pair,direction,units:requested,message:state.lastNoOrderReason,...context});return null;}

    state.pendingOrders=state.pendingOrders||{};
    const pending=state.pendingOrders[pair];
    if(pending?.event===event.id){
      try{
        const found=await callOanda(`/v3/accounts/${accountId}/orders/@${encodeURIComponent(pending.clientId)}`,token);
        state.lastNoOrderReason=`Existing IO OANDA order ${pending.clientId} recovered; duplicate submission suppressed`;
        await this.write({type:"ORDER_RECONCILED",pair,direction,units:requested,transaction:found.order?.id||found.lastTransactionID||null,event:event.id,...context,message:state.lastNoOrderReason});return null;
      }catch(error){if(Number(error?.status)!==404)throw error;delete state.pendingOrders[pair];}
    }

    const signed=event.direction>0?requested:-requested,clientId=ioClientOrderId(pair,event.id),order={order:{instrument:pair,units:String(signed),type:"MARKET",timeInForce:"FOK",positionFill:"DEFAULT",clientExtensions:{id:clientId,tag:"cte-compound-io",comment:String(event.id).slice(0,64)}}};
    state.pendingOrders[pair]={clientId,event:event.id,direction,units:requested,createdAt:new Date().toISOString()};await this.ctx.storage.put("state",state);
    const result=await callOanda(`/v3/accounts/${accountId}/orders`,token,{method:"POST",body:JSON.stringify(order)}),fill=result.orderFillTransaction;
    if(!fill){const rejected=result.orderRejectTransaction||result.orderCancelTransaction,reason=rejected?.rejectReason||rejected?.reason||"OANDA returned no IO order fill";delete state.pendingOrders[pair];await this.ctx.storage.put("state",state);state.lastNoOrderReason=`Indicator Only order rejected: ${reason} (Requested: ${requested}, Available: ${available})`;await this.write({type:"ORDER_REJECTED",pair,direction,units:requested,transaction:rejected?.id||result.lastTransactionID||null,event:event.id,message:reason,...context});return null;}
    delete state.pendingOrders[pair];await this.ctx.storage.put("state",state);state.lastNoOrderReason=`Indicator Only order filled: ${direction} ${requested} units`;
    await this.write({type:"ORDER_FILLED",pair,direction,units:Math.abs(Number(fill.units)||requested),transaction:fill.id||result.lastTransactionID||null,clientOrderId:clientId,price:fill.price||null,accountBalance:fill.accountBalance??null,event:event.id,message:state.lastNoOrderReason,...context});return fill;
  }

  async tickIndicatorOnly(state,control){
    const units=normalizeIndicatorOnlyUnits(state.indicatorOnlyUnits),ioControl={...control,units},{token,accountId}=await this.resolveIndicatorOnlyAccount(state);
    try{await this.syncTransactions(state,token,accountId);}catch(error){state.transactionSyncError=String(error?.message||error);}
    const count=Math.max(650,Math.min(1200,ioControl.length*3+100)),data=await candles(ioControl.pair,token,ioControl.timeframe,count),lastCandle=data.at(-1)?.time;
    state.lastScanAt=new Date().toISOString();
    if(!lastCandle){state.lastNoOrderReason=`Indicator Only · no completed ${ioControl.timeframe} candle for ${ioControl.pair}`;return;}

    const settings=__indicatorOnlyTest.indicatorOnlySettings(ioControl),event=currentEvent(data,ioControl.pair,ioControl.timeframe,ioControl.indicator,settings),positions=await this.loadPositions(token,accountId),position=positions.find(item=>item.instrument===ioControl.pair),existing=__indicatorOnlyTest.positionDirection(position),runtime=state.indicatorOnlyRuntime||{};
    state.openPositionsCount=positions.length;runtime.lastCandle=lastCandle;runtime.lastSignalAt=new Date().toISOString();runtime.lastDirection=Number(event?.direction||0);runtime.lastEventId=event?.id||null;runtime.lastSignal=event?.direction>0?"BUY":event?.direction<0?"SELL":null;runtime.units=units;state.indicatorOnlyRuntime=runtime;
    if(!event?.direction){state.lastNoOrderReason=`Indicator Only · ${ioControl.pair} ${ioControl.timeframe} ${ioControl.indicator} has no registered BUY/SELL state`;return;}
    if(existing===event.direction){state.lastNoOrderReason=`Indicator Only HOLD · ${ioControl.pair} already ${event.direction>0?"BUY":"SELL"} · ${units} units configured for next entry/reversal`;return;}

    const executionEventId=`IO:${runtime.engagedAt||"session"}:${event.id}:${lastCandle}`,candidate={pair:ioControl.pair,event:{...event,id:executionEventId},configuration:{primary:{length:ioControl.length,filter:ioControl.filter,score:null,trades:null,net:null,maxDrawdown:null,winRate:null},settings,strategyEngineVersion:STRATEGY_ENGINE_VERSION,performanceVersion:REGISTERED_PERFORMANCE_VERSION},IO:{...ioControl,version:IO_UNITS_VERSION}},context=this.decisionContext(candidate,{});
    await this.write({type:"INDICATOR_ONLY_SIGNAL",executionPolicy:IO_UNITS_VERSION,pair:ioControl.pair,direction:event.direction>0?"BUY":"SELL",event:executionEventId,timeframe:ioControl.timeframe,strategy:ioControl.indicator,htlLength:ioControl.length,filter:ioControl.filter,units,existingDirection:existing>0?"BUY":existing<0?"SELL":null,message:`Indicator Only authoritative ${event.direction>0?"BUY":"SELL"} signal · ${ioControl.pair} ${ioControl.timeframe} ${ioControl.indicator} · ${units} units`},false);
    if(existing){const longUnits=Number(position?.long?.units||0),shortUnits=Math.abs(Number(position?.short?.units||0)),fill=await this.closePosition(ioControl.pair,existing,longUnits,shortUnits,token,accountId,executionEventId,"Indicator Only opposing indicator signal reversal",context);if(!fill){state.lastNoOrderReason=`Indicator Only reversal close failed for ${ioControl.pair}`;return;}}
    const fill=await this.executeIndicatorOnlyUnits(candidate,token,accountId,state);if(fill){runtime.lastExecutionEventId=executionEventId;runtime.lastExecutionAt=new Date().toISOString();runtime.lastExecutionUnits=units;}state.indicatorOnlyRuntime=runtime;
  }
}
