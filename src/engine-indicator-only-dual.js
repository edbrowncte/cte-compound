import { HtlEngine as IndicatorOnlyUnitsEngine, __indicatorOnlyUnitsTest } from "./engine-indicator-only-units.js";
import { __indicatorOnlyTest } from "./engine-indicator-only.js";
import { candles, currentEvent } from "./horizon-platform-engine.js";
import { STRATEGY_ENGINE_VERSION } from "./horizon-strategy-v1.js";
import { REGISTERED_PERFORMANCE_VERSION } from "./horizon-registered-performance.js";

const IO_DUAL_VERSION="INDICATOR_ONLY_DUAL@1.0.0";
const TF_MS=Object.freeze({S5:5000,S30:30000,M1:60000,M5:300000,M15:900000,M30:1800000,H1:3600000,H4:14400000,D:86400000,W:604800000});
const response=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{"Content-Type":"application/json","Cache-Control":"no-store"}});

function defaultTicket(slot){return{slot,enabled:false,pair:slot===1?"EUR_USD":"GBP_USD",timeframe:"M1",indicator:"ASSET",length:10,filter:0,units:100};}
function normalizeTicket(value={},slot=1){const base=__indicatorOnlyTest.normalizeIndicatorOnly(value);return{slot,enabled:Boolean(value?.enabled),pair:base.pair,timeframe:base.timeframe,indicator:base.indicator,length:base.length,filter:base.filter,units:__indicatorOnlyUnitsTest.normalizeIndicatorOnlyUnits(value?.units)};}
function structuralFingerprint(ticket){return JSON.stringify({pair:ticket.pair,timeframe:ticket.timeframe,indicator:ticket.indicator,length:ticket.length,filter:ticket.filter});}
function normalizeTickets(value,state={}){
  const incoming=Array.isArray(value)?value:[],legacy=state.indicatorOnly?{...state.indicatorOnly,units:state.indicatorOnlyUnits}:null;
  const tickets=[normalizeTicket(incoming[0]??legacy??defaultTicket(1),1),normalizeTicket(incoming[1]??defaultTicket(2),2)],active=tickets.filter(ticket=>ticket.enabled);
  if(active.length===2&&active[0].pair===active[1].pair)throw Object.assign(new Error("Indicator Only tickets must use two separate currency pairs."),{status:409});
  return tickets;
}
function activeTickets(state){try{return normalizeTickets(state.indicatorOnlyTickets,state).filter(ticket=>ticket.enabled);}catch{return[];}}
function ticketCadenceMs(ticket){return __indicatorOnlyTest.indicatorOnlyCadenceMs(ticket.timeframe);}
function ticketRuntime(state,slot){state.indicatorOnlyTicketRuntime=state.indicatorOnlyTicketRuntime||{};state.indicatorOnlyTicketRuntime[slot]=state.indicatorOnlyTicketRuntime[slot]||{engagedAt:new Date().toISOString(),lastEventId:null,lastExecutionEventId:null,lastDirection:0,lastCandle:null,lastSignalAt:null,nextDue:0};return state.indicatorOnlyTicketRuntime[slot];}
function eventIsFresh(event){return Number(event?.bars)===1;}
function eventObservedAt(event,timeframe){const start=Date.parse(event?.startTime||event?.crossingTime||"");return Number.isFinite(start)?new Date(start+(TF_MS[timeframe]||0)).toISOString():null;}
function restoreTradingMode(runtime,state){if(runtime?.normalTradingMode)return runtime.normalTradingMode;if(runtime?.normalAutoRotateMode)return"AUTO_ROTATE";const pairs=Array.isArray(runtime?.normalSelectedPairs)?runtime.normalSelectedPairs:state.selectedPairs||[];return pairs.length===1?"MANUAL_1_PAIR":pairs.length?"MANUAL_MULTI":"ALL_PAIRS";}

export const __indicatorOnlyDualTest=Object.freeze({IO_DUAL_VERSION,normalizeTicket,normalizeTickets,structuralFingerprint,eventIsFresh,eventObservedAt,ticketCadenceMs});

export class HtlEngine extends IndicatorOnlyUnitsEngine{
  async fetch(request){
    const url=new URL(request.url),path=url.pathname;
    if(path==="/control/selectedPairs"&&request.method==="POST"){
      const body=await request.clone().json().catch(()=>({}));
      if(Object.prototype.hasOwnProperty.call(body,"indicatorOnlyTickets"))return this.configureIndicatorOnlyTickets(body.indicatorOnlyTickets);
      const state=(await this.ctx.storage.get("state"))||{};
      if(activeTickets(state).length)return response({ok:false,error:"Indicator Only tickets are active. Disengage both IO tickets before changing normal automated pair selection.",indicatorOnlyTickets:normalizeTickets(state.indicatorOnlyTickets,state)},409);
    }
    if(path==="/control/indicatorOnly"&&request.method==="GET"){
      const state=(await this.ctx.storage.get("state"))||{},tickets=normalizeTickets(state.indicatorOnlyTickets,state),active=tickets.filter(ticket=>ticket.enabled),primary=active[0]||tickets[0];
      return response({indicatorOnly:{...primary,enabled:active.length>0,ticketCount:active.length},indicatorOnlyTickets:tickets,indicatorOnlyTicketRuntime:state.indicatorOnlyTicketRuntime||{}});
    }
    if(path==="/control/status"&&request.method==="GET"){
      const parent=await super.fetch(request),payload=await parent.clone().json().catch(()=>({})),state=(await this.ctx.storage.get("state"))||{},tickets=normalizeTickets(state.indicatorOnlyTickets,state),active=tickets.filter(ticket=>ticket.enabled),primary=active[0]||tickets[0];
      return response({...payload,indicatorOnly:{...primary,enabled:active.length>0,ticketCount:active.length},indicatorOnlyTickets:tickets,indicatorOnlyTicketRuntime:state.indicatorOnlyTicketRuntime||{},indicatorOnlyDualVersion:IO_DUAL_VERSION},parent.status);
    }
    return super.fetch(request);
  }

  async configureIndicatorOnlyTickets(value){
    const state=(await this.ctx.storage.get("state"))||{},prior=normalizeTickets(state.indicatorOnlyTickets,state),next=normalizeTickets(value,state),priorActive=prior.filter(ticket=>ticket.enabled),nextActive=next.filter(ticket=>ticket.enabled);
    for(let index=0;index<2;index++)if(prior[index].enabled&&next[index].enabled&&structuralFingerprint(prior[index])!==structuralFingerprint(next[index]))return response({ok:false,error:`Disengage IO Ticket ${index+1} before changing pair, timeframe, indicator, length, or filter. Units remain editable while active.`,indicatorOnlyTickets:prior},409);
    if(!priorActive.length&&nextActive.length){
      state.indicatorOnlyDualRuntime={normalSelectedPairs:Array.isArray(state.selectedPairs)?[...state.selectedPairs]:[],normalManualSelectMode:state.manualSelectMode!==false,normalAutoRotateMode:Boolean(state.autoRotateMode),normalTradingMode:state.tradingMode||null,engagedAt:new Date().toISOString()};
      state.pendingReversals={};state.ageLastPlan=null;state.lastNoOrderReason=null;
    }
    state.indicatorOnlyTickets=next;state.indicatorOnly={...next[0],enabled:false};state.indicatorOnlyUnits=next[0].units;
    for(const ticket of next){const runtime=ticketRuntime(state,ticket.slot);if(ticket.enabled&&!prior[ticket.slot-1].enabled){runtime.engagedAt=new Date().toISOString();runtime.nextDue=Date.now()+250;}if(!ticket.enabled&&prior[ticket.slot-1].enabled)runtime.disengagedAt=new Date().toISOString();}
    if(nextActive.length){state.selectedPairs=nextActive.map(ticket=>ticket.pair);state.manualSelectMode=true;state.autoRotateMode=false;state.tradingMode="INDICATOR_ONLY_DUAL";await this.ctx.storage.put("state",state);await this.ctx.storage.setAlarm(Date.now()+250);}
    else{
      const runtime=state.indicatorOnlyDualRuntime||{};state.selectedPairs=Array.isArray(runtime.normalSelectedPairs)?runtime.normalSelectedPairs:state.selectedPairs;state.manualSelectMode=runtime.normalManualSelectMode!==undefined?runtime.normalManualSelectMode:state.manualSelectMode;state.autoRotateMode=runtime.normalAutoRotateMode!==undefined?runtime.normalAutoRotateMode:state.autoRotateMode;state.tradingMode=restoreTradingMode(runtime,state);state.indicatorOnlyDualRuntime={...runtime,disengagedAt:new Date().toISOString()};await this.ctx.storage.put("state",state);if(await this.ctx.storage.getAlarm()!==null)await this.ctx.storage.deleteAlarm();
    }
    await this.write({type:nextActive.length?"INDICATOR_ONLY_DUAL_ENGAGED":"INDICATOR_ONLY_DUAL_DISENGAGED",executionPolicy:IO_DUAL_VERSION,decisionMode:"INDICATOR_ONLY_DUAL",message:nextActive.length?`Indicator Only dual authority active · ${nextActive.map(ticket=>`${ticket.pair} ${ticket.timeframe} ${ticket.indicator} L${ticket.length} F${ticket.filter} U${ticket.units}`).join(" · ")}`:"Indicator Only dual authority disengaged · normal certified automation restored"},false);
    return response({ok:true,indicatorOnly:{...(nextActive[0]||next[0]),enabled:nextActive.length>0,ticketCount:nextActive.length},indicatorOnlyTickets:next,tradingMode:state.tradingMode});
  }

  async reconcile(requirements,token,accountId,state,config,positionsSnapshot=null,excludedPairs=new Set()){
    if(activeTickets(state).length)return;
    return super.reconcile(requirements,token,accountId,state,config,positionsSnapshot,excludedPairs);
  }

  async tickTicket(state,ticket,token,accountId){
    const runtime=ticketRuntime(state,ticket.slot),now=Date.now();if(Number(runtime.nextDue)>now)return;
    runtime.nextDue=now+ticketCadenceMs(ticket);
    const count=Math.max(650,Math.min(1200,ticket.length*3+100)),data=await candles(ticket.pair,token,ticket.timeframe,count),lastCandle=data.at(-1)?.time;state.lastScanAt=new Date().toISOString();
    if(!lastCandle){state.lastNoOrderReason=`IO Ticket ${ticket.slot} · no completed ${ticket.timeframe} candle for ${ticket.pair}`;return;}
    const settings=__indicatorOnlyTest.indicatorOnlySettings(ticket),event=currentEvent(data,ticket.pair,ticket.timeframe,ticket.indicator,settings),positions=await this.loadPositions(token,accountId),position=positions.find(item=>item.instrument===ticket.pair),existing=__indicatorOnlyTest.positionDirection(position),observedAt=eventObservedAt(event,ticket.timeframe);
    state.openPositionsCount=positions.length;runtime.lastCandle=lastCandle;runtime.lastSignalAt=new Date().toISOString();runtime.lastDirection=Number(event?.direction||0);runtime.lastEventId=event?.id||null;runtime.lastSignal=event?.direction>0?"BUY":event?.direction<0?"SELL":null;runtime.units=ticket.units;runtime.eventStartTime=event?.startTime||null;runtime.eventObservedAt=observedAt;runtime.eventBars=Number(event?.bars)||null;
    if(!event?.direction){state.lastNoOrderReason=`IO Ticket ${ticket.slot} · ${ticket.pair} ${ticket.timeframe} ${ticket.indicator} has no registered BUY/SELL state`;return;}
    if(existing===event.direction){state.lastNoOrderReason=`IO Ticket ${ticket.slot} HOLD · ${ticket.pair} already ${event.direction>0?"BUY":"SELL"}`;return;}
    if(!eventIsFresh(event)){
      state.lastNoOrderReason=`IO Ticket ${ticket.slot} STALE_SIGNAL_WITHHELD · ${ticket.pair} ${ticket.timeframe} ${ticket.indicator} ${event.direction>0?"BUY":"SELL"} began ${event.startTime||"unknown"} · ${event.bars} completed bars old`;
      if(runtime.lastStaleEventId!==event.id){runtime.lastStaleEventId=event.id;await this.write({type:"INDICATOR_ONLY_STALE_SIGNAL",executionPolicy:IO_DUAL_VERSION,pair:ticket.pair,direction:event.direction>0?"BUY":"SELL",timeframe:ticket.timeframe,strategy:ticket.indicator,htlLength:ticket.length,filter:ticket.filter,units:ticket.units,event:event.id,eventStartTime:event.startTime||null,eventObservedAt:observedAt,eventBars:event.bars,indicatorOnlyTicket:ticket.slot,message:state.lastNoOrderReason},false);}return;
    }
    const executionEventId=`IO${ticket.slot}:${runtime.engagedAt||"session"}:${event.id}:${lastCandle}`,candidate={pair:ticket.pair,event:{...event,id:executionEventId},configuration:{primary:{length:ticket.length,filter:ticket.filter,score:null,trades:null,net:null,maxDrawdown:null,winRate:null},settings,strategyEngineVersion:STRATEGY_ENGINE_VERSION,performanceVersion:REGISTERED_PERFORMANCE_VERSION},IO:{...ticket,version:IO_DUAL_VERSION,ticket:ticket.slot}},context=this.decisionContext(candidate,{});
    await this.write({type:"INDICATOR_ONLY_SIGNAL",executionPolicy:IO_DUAL_VERSION,pair:ticket.pair,direction:event.direction>0?"BUY":"SELL",event:executionEventId,eventStartTime:event.startTime||null,eventObservedAt:observedAt,eventBars:event.bars,timeframe:ticket.timeframe,strategy:ticket.indicator,htlLength:ticket.length,filter:ticket.filter,units:ticket.units,indicatorOnlyTicket:ticket.slot,existingDirection:existing>0?"BUY":existing<0?"SELL":null,message:`IO Ticket ${ticket.slot} fresh ${event.direction>0?"BUY":"SELL"} transition · ${ticket.pair} ${ticket.timeframe} ${ticket.indicator}`},false);
    if(existing){const longUnits=Number(position?.long?.units||0),shortUnits=Math.abs(Number(position?.short?.units||0)),fill=await this.closePosition(ticket.pair,existing,longUnits,shortUnits,token,accountId,executionEventId,`IO Ticket ${ticket.slot} opposing fresh indicator signal reversal`,context);if(!fill){state.lastNoOrderReason=`IO Ticket ${ticket.slot} reversal close failed for ${ticket.pair}`;return;}}
    const fill=await this.executeIndicatorOnlyUnits(candidate,token,accountId,state);if(fill){const executionAt=Date.now(),observedMs=Date.parse(observedAt||"");runtime.lastExecutionEventId=executionEventId;runtime.lastExecutionAt=new Date(executionAt).toISOString();runtime.lastExecutionUnits=ticket.units;runtime.executionDelayMs=Number.isFinite(observedMs)?Math.max(0,executionAt-observedMs):null;await this.write({type:"INDICATOR_ONLY_EXECUTION_TIMING",executionPolicy:IO_DUAL_VERSION,pair:ticket.pair,direction:event.direction>0?"BUY":"SELL",timeframe:ticket.timeframe,strategy:ticket.indicator,indicatorOnlyTicket:ticket.slot,event:executionEventId,eventStartTime:event.startTime||null,eventObservedAt:observedAt,executionAt:runtime.lastExecutionAt,executionDelayMs:runtime.executionDelayMs,message:`IO Ticket ${ticket.slot} execution delay ${runtime.executionDelayMs??"unknown"} ms from completed-candle event observation`},false);}
  }

  async tick(){
    const state=(await this.ctx.storage.get("state"))||{},tickets=activeTickets(state),legacy=__indicatorOnlyTest.normalizeIndicatorOnly(state.indicatorOnly);if(!tickets.length&&!legacy.enabled)return super.tick();if(this.running)return;this.running=true;
    try{
      const now=Date.now();if(state.backoffUntil&&now<state.backoffUntil){state.lastRun=new Date().toISOString();state.lastNoOrderReason=`Indicator Only account backoff until ${new Date(state.backoffUntil).toISOString()}`;return;}
      const {token,accountId}=await this.resolveIndicatorOnlyAccount(state);try{await this.syncTransactions(state,token,accountId);}catch(error){state.transactionSyncError=String(error?.message||error);}
      const work=tickets.length?tickets:[normalizeTicket({...legacy,units:state.indicatorOnlyUnits},1)];for(const ticket of work){try{await this.tickTicket(state,ticket,token,accountId);}catch(error){const runtime=ticketRuntime(state,ticket.slot);runtime.lastError=String(error?.message||error);runtime.lastErrorAt=new Date().toISOString();await this.write({type:"ERROR",executionPolicy:IO_DUAL_VERSION,pair:ticket.pair,timeframe:ticket.timeframe,strategy:ticket.indicator,indicatorOnlyTicket:ticket.slot,message:`IO Ticket ${ticket.slot} · ${runtime.lastError}`});}}state.lastRun=new Date().toISOString();state.lastError=null;
    }catch(error){state.lastRun=new Date().toISOString();state.lastError=String(error?.message||error);await this.write({type:"ERROR",executionPolicy:IO_DUAL_VERSION,message:state.lastError});}
    finally{
      await this.ctx.storage.put("state",state);const latest=activeTickets(state);if(latest.length){const nextTimes=latest.map(ticket=>{const runtime=ticketRuntime(state,ticket.slot);return Number(runtime.nextDue)>Date.now()?Number(runtime.nextDue):Date.now()+ticketCadenceMs(ticket);}),due=Number(state.backoffUntil)>Date.now()?Number(state.backoffUntil):Math.min(...nextTimes);await this.ctx.storage.setAlarm(due);}else if(__indicatorOnlyTest.normalizeIndicatorOnly(state.indicatorOnly).enabled){const due=Number(state.backoffUntil)>Date.now()?Number(state.backoffUntil):Date.now()+ticketCadenceMs(normalizeTicket({...state.indicatorOnly,units:state.indicatorOnlyUnits},1));await this.ctx.storage.setAlarm(due);}else if(await this.ctx.storage.getAlarm()!==null)await this.ctx.storage.deleteAlarm();this.running=false;
    }
  }
}
