import { HtlEngine as CertifiedHtlEngine } from "./engine-certified-execution.js";
import { PAIRS, TIMEFRAMES, candles, currentEvent } from "./horizon-platform-engine.js";
import { STRATEGY_ENGINE_VERSION, DEFAULT_STRATEGY_SETTINGS, normalizeStrategySettings } from "./horizon-strategy-v1.js";
import { REGISTERED_PERFORMANCE_VERSION } from "./horizon-registered-performance.js";
import { credentials } from "./engine-base.js";

const API="https://api-fxtrade.oanda.com";
const INDICATOR_ONLY_VERSION="INDICATOR_ONLY@1.0.0";
const INDICATORS=new Set(["ASSET","DARE_N","DARE","COMBO","NAI","APEX"]);
const response=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{"Content-Type":"application/json","Cache-Control":"no-store"}});

function normalizeIndicatorOnly(value={}){
  return{
    enabled:Boolean(value?.enabled),
    pair:PAIRS.includes(String(value?.pair||""))?String(value.pair):"EUR_USD",
    timeframe:TIMEFRAMES.includes(String(value?.timeframe||""))?String(value.timeframe):"M1",
    indicator:INDICATORS.has(String(value?.indicator||""))?String(value.indicator):"ASSET",
    length:Math.max(3,Math.min(200,Math.trunc(Number(value?.length))||10)),
    filter:Math.max(0,Math.min(10,Number(value?.filter)||0)),
  };
}

function indicatorOnlyFingerprint(value={}){
  const control=normalizeIndicatorOnly(value);
  return JSON.stringify({pair:control.pair,timeframe:control.timeframe,indicator:control.indicator,length:control.length,filter:control.filter});
}

function indicatorOnlyCadenceMs(timeframe){
  if(timeframe==="S5")return 5000;
  if(timeframe==="S30")return 30000;
  return 60000;
}

function indicatorOnlySettings(value={}){
  const control=normalizeIndicatorOnly(value),settings=normalizeStrategySettings(DEFAULT_STRATEGY_SETTINGS);
  if(control.indicator==="ASSET"||control.indicator==="DARE"||control.indicator==="COMBO")settings.assetLength=control.length;
  if(control.indicator==="DARE_N"){settings.dareNLength=control.length;settings.dareNFilter=control.filter;}
  if(control.indicator==="NAI"){settings.naiLength=control.length;settings.naiFilter=control.filter;}
  if(control.indicator==="APEX"){settings.apexLength=control.length;settings.apexFilter=control.filter;}
  return normalizeStrategySettings(settings);
}

function positionDirection(position){
  const longUnits=Number(position?.long?.units||0),shortUnits=Math.abs(Number(position?.short?.units||0));
  return longUnits>0?1:shortUnits>0?-1:0;
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

async function exactLiveAccount(token,configured,state,writeLedger=null){
  const payload=await callOanda("/v3/accounts",token),accounts=payload.accounts||[],eligible=accounts.filter(item=>{
    const serialized=String(JSON.stringify(item?.properties||{})).toUpperCase(),tags=Array.isArray(item?.tags)?item.tags.map(tag=>String(tag).toUpperCase()):[],id=String(item?.id||"");
    return id.endsWith("-001")&&!id.toUpperCase().includes("MT4")&&!tags.some(tag=>tag.includes("MT4"))&&!serialized.includes("MT4");
  });
  const score=id=>{if(!configured)return 0;if(id===configured)return 3;if(String(configured).length>=11&&id.endsWith(String(configured).slice(-11)))return 2;const digits=String(configured).replace(/\D/g,"");return digits&&id.includes(digits)?1:0;};
  eligible.sort((left,right)=>score(String(right.id))-score(String(left.id)));
  for(const candidate of eligible){
    try{
      const summary=await callOanda(`/v3/accounts/${candidate.id}/summary`,token);
      if(summary.account&&(summary.account.state===undefined||summary.account.state==="OPEN")){
        if(state&&state.resolvedAccountId!==candidate.id){state.resolvedAccountId=candidate.id;if(writeLedger)await writeLedger({type:"CONFIGURATION",message:`Resolved live account ID to authorized non-MT4 account: ${candidate.id}`});}
        return candidate.id;
      }
    }catch{}
  }
  throw new Error(`Configured OANDA account ${configured} is not authorized or is an MT4-linked account`);
}

function restoredTradingMode(runtime,state){
  if(runtime?.normalTradingMode)return runtime.normalTradingMode;
  if(runtime?.normalAutoRotateMode)return"AUTO_ROTATE";
  const pairs=Array.isArray(runtime?.normalSelectedPairs)?runtime.normalSelectedPairs:state.selectedPairs||[];
  return pairs.length===1?"MANUAL_1_PAIR":pairs.length?"MANUAL_MULTI":"ALL_PAIRS";
}

export const __indicatorOnlyTest=Object.freeze({INDICATOR_ONLY_VERSION,normalizeIndicatorOnly,indicatorOnlyFingerprint,indicatorOnlyCadenceMs,indicatorOnlySettings,positionDirection});

export class HtlEngine extends CertifiedHtlEngine{
  async fetch(request){
    const url=new URL(request.url),path=url.pathname;
    if(path==="/control/indicatorOnly"&&request.method==="GET"){
      const state=(await this.ctx.storage.get("state"))||{};
      return response({indicatorOnly:normalizeIndicatorOnly(state.indicatorOnly),indicatorOnlyRuntime:state.indicatorOnlyRuntime||null});
    }
    if(path==="/control/selectedPairs"&&request.method==="POST"){
      const body=await request.clone().json().catch(()=>({})),state=(await this.ctx.storage.get("state"))||{};
      if(Object.prototype.hasOwnProperty.call(body,"indicatorOnly"))return this.configureIndicatorOnly(state,body.indicatorOnly);
      if(normalizeIndicatorOnly(state.indicatorOnly).enabled)return response({ok:false,error:"Indicator Only is active. Disengage IO before changing normal automated pair selection.",indicatorOnly:normalizeIndicatorOnly(state.indicatorOnly)},409);
    }
    if(path==="/control/status"&&request.method==="GET"){
      const parent=await super.fetch(request),payload=await parent.json().catch(()=>({})),state=(await this.ctx.storage.get("state"))||{};
      return response({...payload,indicatorOnly:normalizeIndicatorOnly(state.indicatorOnly),indicatorOnlyRuntime:state.indicatorOnlyRuntime||null});
    }
    return super.fetch(request);
  }

  async configureIndicatorOnly(state,value){
    const prior=normalizeIndicatorOnly(state.indicatorOnly),next=normalizeIndicatorOnly(value),priorFingerprint=indicatorOnlyFingerprint(prior),nextFingerprint=indicatorOnlyFingerprint(next);
    if(prior.enabled&&next.enabled&&priorFingerprint!==nextFingerprint)return response({ok:false,error:"Disengage Indicator Only before changing pair, timeframe, indicator, length, or filter.",indicatorOnly:prior},409);

    if(!prior.enabled&&next.enabled){
      const runtime={
        normalSelectedPairs:Array.isArray(state.selectedPairs)?[...state.selectedPairs]:[],
        normalManualSelectMode:state.manualSelectMode!==false,
        normalAutoRotateMode:Boolean(state.autoRotateMode),
        normalTradingMode:state.tradingMode||null,
        engagedAt:new Date().toISOString(),
        lastEventId:null,lastExecutionEventId:null,lastDirection:0,lastCandle:null,lastSignalAt:null,
      };
      state.indicatorOnly=next;state.indicatorOnlyRuntime=runtime;state.selectedPairs=[next.pair];state.manualSelectMode=true;state.autoRotateMode=false;state.tradingMode="INDICATOR_ONLY";state.pendingReversals={};state.ageLastPlan=null;state.lastNoOrderReason=null;
      await this.ctx.storage.put("state",state);await this.ctx.storage.setAlarm(Date.now()+250);
      await this.write({type:"INDICATOR_ONLY_ENGAGED",executionPolicy:INDICATOR_ONLY_VERSION,pair:next.pair,timeframe:next.timeframe,strategy:next.indicator,htlLength:next.length,filter:next.filter,decisionMode:"INDICATOR_ONLY",message:`Indicator Only engaged · ${next.pair} ${next.timeframe} ${next.indicator} L${next.length} F${next.filter}`},false);
      return response({ok:true,indicatorOnly:next,tradingMode:state.tradingMode});
    }

    if(prior.enabled&&!next.enabled){
      const runtime=state.indicatorOnlyRuntime||{};
      state.indicatorOnly=next;
      state.selectedPairs=Array.isArray(runtime.normalSelectedPairs)?runtime.normalSelectedPairs:state.selectedPairs;
      state.manualSelectMode=runtime.normalManualSelectMode!==undefined?runtime.normalManualSelectMode:state.manualSelectMode;
      state.autoRotateMode=runtime.normalAutoRotateMode!==undefined?runtime.normalAutoRotateMode:state.autoRotateMode;
      state.tradingMode=restoredTradingMode(runtime,state);
      state.indicatorOnlyRuntime={...runtime,disengagedAt:new Date().toISOString()};
      await this.ctx.storage.put("state",state);if(await this.ctx.storage.getAlarm()!==null)await this.ctx.storage.deleteAlarm();
      await this.write({type:"INDICATOR_ONLY_DISENGAGED",executionPolicy:INDICATOR_ONLY_VERSION,pair:prior.pair,timeframe:prior.timeframe,strategy:prior.indicator,htlLength:prior.length,filter:prior.filter,decisionMode:"INDICATOR_ONLY",message:`Indicator Only disengaged · normal certified automation restored; live position left unchanged for normal-engine reconciliation`},false);
      return response({ok:true,indicatorOnly:next,tradingMode:state.tradingMode});
    }

    state.indicatorOnly=next;
    if(!next.enabled)state.indicatorOnlyRuntime={...(state.indicatorOnlyRuntime||{}),configuredAt:new Date().toISOString()};
    await this.ctx.storage.put("state",state);
    return response({ok:true,indicatorOnly:next,tradingMode:state.tradingMode||"ALL_PAIRS"});
  }

  decisionContext(candidate,config){
    if(candidate?.IO){const io=candidate.IO;return{strategy:io.indicator,confirmationStrategy:"NONE",decisionMode:"INDICATOR_ONLY",timeframe:io.timeframe,htlLength:io.length,filter:io.filter,configurationSource:"INDICATOR_ONLY",optimizerScore:null,optimizerTrades:null,optimizerNet:null,optimizerDrawdown:null,optimizerWinRate:null,confirmationHtlLength:null,confirmationFilter:null,indicatorOnly:true,indicatorOnlyVersion:INDICATOR_ONLY_VERSION};}
    return super.decisionContext(candidate,config);
  }

  async reconcile(requirements,token,accountId,state,config,positionsSnapshot=null,excludedPairs=new Set()){
    if(normalizeIndicatorOnly(state?.indicatorOnly).enabled)return;
    return super.reconcile(requirements,token,accountId,state,config,positionsSnapshot,excludedPairs);
  }

  async status(){
    const status=await super.status(),state=(await this.ctx.storage.get("state"))||{};
    return{...status,indicatorOnly:normalizeIndicatorOnly(state.indicatorOnly),indicatorOnlyRuntime:state.indicatorOnlyRuntime||null,indicatorOnlyVersion:INDICATOR_ONLY_VERSION};
  }

  async alarm(){await this.tick();}

  async resolveIndicatorOnlyAccount(state){
    const{token,accountId:configured}=credentials(this.env);
    try{
      const accountId=await exactLiveAccount(token,configured,state,entry=>this.write(entry));
      if(state.accountResolveError){delete state.accountResolveError;delete state.backoffUntil;delete state.lastBackoffLogged;}
      return{token,accountId};
    }catch(error){
      const message=error?.message||"Failed to resolve live OANDA account",record=state.accountResolveError||{lastErrorAt:null,count:0,message:""};record.lastErrorAt=new Date().toISOString();record.count=Number(record.count||0)+1;record.message=message;
      const delays=[2,4,8,15,30],minutes=delays[Math.min(record.count-1,delays.length-1)];state.accountResolveError=record;state.backoffUntil=Date.now()+minutes*60*1000;
      throw new Error(`${message}. Indicator Only scheduled backoff for ${minutes} minutes.`);
    }
  }

  async tickIndicatorOnly(state,control){
    const{token,accountId}=await this.resolveIndicatorOnlyAccount(state);
    try{await this.syncTransactions(state,token,accountId);}catch(error){state.transactionSyncError=String(error?.message||error);}
    const count=Math.max(650,Math.min(1200,control.length*3+100)),data=await candles(control.pair,token,control.timeframe,count),lastCandle=data.at(-1)?.time;
    state.lastScanAt=new Date().toISOString();
    if(!lastCandle){state.lastNoOrderReason=`Indicator Only · no completed ${control.timeframe} candle for ${control.pair}`;return;}

    const settings=indicatorOnlySettings(control),event=currentEvent(data,control.pair,control.timeframe,control.indicator,settings),positions=await this.loadPositions(token,accountId),position=positions.find(item=>item.instrument===control.pair),existing=positionDirection(position),runtime=state.indicatorOnlyRuntime||{};
    state.openPositionsCount=positions.length;
    runtime.lastCandle=lastCandle;runtime.lastSignalAt=new Date().toISOString();runtime.lastDirection=Number(event?.direction||0);runtime.lastEventId=event?.id||null;runtime.lastSignal=event?.direction>0?"BUY":event?.direction<0?"SELL":null;state.indicatorOnlyRuntime=runtime;

    if(!event?.direction){state.lastNoOrderReason=`Indicator Only · ${control.pair} ${control.timeframe} ${control.indicator} has no registered BUY/SELL state`;return;}
    if(existing===event.direction){state.lastNoOrderReason=`Indicator Only HOLD · ${control.pair} already ${event.direction>0?"BUY":"SELL"} · waiting only for opposite ${control.indicator} signal`;return;}

    const executionEventId=`IO:${runtime.engagedAt||"session"}:${event.id}:${lastCandle}`,candidate={pair:control.pair,event:{...event,id:executionEventId},configuration:{primary:{length:control.length,filter:control.filter,score:null,trades:null,net:null,maxDrawdown:null,winRate:null},settings,strategyEngineVersion:STRATEGY_ENGINE_VERSION,performanceVersion:REGISTERED_PERFORMANCE_VERSION},IO:{...control,version:INDICATOR_ONLY_VERSION}};
    const context=this.decisionContext(candidate,{});
    await this.write({type:"INDICATOR_ONLY_SIGNAL",executionPolicy:INDICATOR_ONLY_VERSION,pair:control.pair,direction:event.direction>0?"BUY":"SELL",event:executionEventId,timeframe:control.timeframe,strategy:control.indicator,htlLength:control.length,filter:control.filter,existingDirection:existing>0?"BUY":existing<0?"SELL":null,message:`Indicator Only authoritative ${event.direction>0?"BUY":"SELL"} signal · ${control.pair} ${control.timeframe} ${control.indicator}`},false);

    if(existing){
      const longUnits=Number(position?.long?.units||0),shortUnits=Math.abs(Number(position?.short?.units||0)),fill=await this.closePosition(control.pair,existing,longUnits,shortUnits,token,accountId,executionEventId,"Indicator Only opposing indicator signal reversal",context);
      if(!fill){state.lastNoOrderReason=`Indicator Only reversal close failed for ${control.pair}`;return;}
    }
    await super.execute(candidate,token,accountId,state);
    runtime.lastExecutionEventId=executionEventId;runtime.lastExecutionAt=new Date().toISOString();state.indicatorOnlyRuntime=runtime;
  }

  async tick(){
    const initial=(await this.ctx.storage.get("state"))||{},control=normalizeIndicatorOnly(initial.indicatorOnly);
    if(!control.enabled)return super.tick();
    if(this.running)return;
    this.running=true;
    const state=initial;
    try{
      const now=Date.now();
      if(state.backoffUntil&&now<state.backoffUntil){state.lastRun=new Date().toISOString();state.lastNoOrderReason=`Indicator Only account backoff until ${new Date(state.backoffUntil).toISOString()}`;return;}
      await this.tickIndicatorOnly(state,control);state.lastRun=new Date().toISOString();state.lastError=null;
    }catch(error){state.lastRun=new Date().toISOString();state.lastError=String(error?.message||error);await this.write({type:"ERROR",executionPolicy:INDICATOR_ONLY_VERSION,pair:control.pair,timeframe:control.timeframe,strategy:control.indicator,message:state.lastError});}
    finally{
      await this.ctx.storage.put("state",state);
      const latest=normalizeIndicatorOnly(state.indicatorOnly);
      if(latest.enabled){const due=Number(state.backoffUntil)>Date.now()?Number(state.backoffUntil):Date.now()+indicatorOnlyCadenceMs(latest.timeframe);await this.ctx.storage.setAlarm(due);}else if(await this.ctx.storage.getAlarm()!==null)await this.ctx.storage.deleteAlarm();
      this.running=false;
    }
  }
}
