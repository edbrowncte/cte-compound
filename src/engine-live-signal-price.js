import {
  HtlEngine as SignalProvenanceEngine,
  buildSignalProvenance,
  registerSignalProvenance,
} from "./engine-signal-provenance.js";
import { credentials } from "./engine-base.js";
import { __indicatorOnlyTest } from "./engine-indicator-only.js";
import { candles, currentEvent } from "./horizon-platform-engine.js";
import { STRATEGY_ENGINE_VERSION } from "./horizon-strategy-v1.js";
import { REGISTERED_PERFORMANCE_VERSION } from "./horizon-registered-performance.js";
import {
  ACCOUNT_AUTHORITY_VERSION,
  accountAuthorityBackoff,
  clearAccountAuthorityBackoff,
  resolveExactAccountAuthority,
} from "./account-authority.js";

const API="https://api-fxtrade.oanda.com";
export const LIVE_SIGNAL_PRICE_VERSION="LIVE_EXECUTABLE_SIGNAL_PRICE@2.1.1";
export const AUTOMATIC_SIGNAL_EXECUTION_VERSION="IMMEDIATE_ONE_ATTEMPT_SIGNAL_EXECUTION@1.0.0";
const PRICE_BASIS="LIVE_OANDA_EXECUTABLE_SIDE_QUOTE_AT_REGISTRATION";
const IO_MARKET_SCAN_MAX_MS=60_000;
const IO_STATE_HISTORY_BARS=5000;
const SIGNAL_ATTEMPT_LIMIT=512;

function finiteNumber(value){const number=Number(value);return Number.isFinite(number)?number:null;}
function ioTicketRuntime(state,slot){state.indicatorOnlyTicketRuntime=state.indicatorOnlyTicketRuntime||{};state.indicatorOnlyTicketRuntime[slot]=state.indicatorOnlyTicketRuntime[slot]||{engagedAt:new Date().toISOString(),lastEventId:null,lastExecutionEventId:null,lastDirection:0,lastCandle:null,lastSignalAt:null,nextDue:0};return state.indicatorOnlyTicketRuntime[slot];}
function ioMarketScanCadenceMs(ticket){return Math.min(Math.max(1000,Number(__indicatorOnlyTest.indicatorOnlyCadenceMs(ticket.timeframe))||60_000),IO_MARKET_SCAN_MAX_MS);}
function eventObservedAt(event,timeframe){const start=Date.parse(event?.startTime||event?.crossingTime||""),duration=Number(__indicatorOnlyTest.indicatorOnlyCadenceMs(timeframe))||0;return Number.isFinite(start)&&duration?new Date(start+duration).toISOString():null;}
function signalAttemptId(candidate){return candidate?.event?.id?String(candidate.event.id):null;}
function priorSignalAttempt(state,id){return id&&Array.isArray(state?.signalExecutionAttempts)?state.signalExecutionAttempts.find(item=>item?.executionEventId===id):null;}
function beginSignalAttempt(state,candidate,mode="AUTOMATIC"){
  const id=signalAttemptId(candidate);if(!id)return null;const prior=priorSignalAttempt(state,id);if(prior)return prior;
  const event=candidate?.event||{},record={version:AUTOMATIC_SIGNAL_EXECUTION_VERSION,executionEventId:id,sourceEventId:event.sourceEventId||event.id||null,pair:candidate?.pair||null,direction:Number(event.direction)>0?"BUY":Number(event.direction)<0?"SELL":null,mode,attemptedAt:new Date().toISOString(),status:"ATTEMPTING",signalPrice:null,signalQuoteTime:null,fillPrice:null,error:null};
  const rows=Array.isArray(state.signalExecutionAttempts)?state.signalExecutionAttempts:[];state.signalExecutionAttempts=[...rows.filter(item=>item?.executionEventId!==id),record].slice(-SIGNAL_ATTEMPT_LIMIT);state.lastSignalExecutionAttempt=record;return record;
}
function finishSignalAttempt(state,record,status,details={}){if(!record)return null;Object.assign(record,{status,completedAt:new Date().toISOString(),...details});state.lastSignalExecutionAttempt=record;return record;}

async function callPricing(token,accountId,pair){
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),15000);
  try{
    const response=await fetch(`${API}/v3/accounts/${encodeURIComponent(accountId)}/pricing?instruments=${encodeURIComponent(pair)}`,{method:"GET",headers:{Authorization:`Bearer ${token}`,Accept:"application/json"},redirect:"manual",cache:"no-store",signal:controller.signal});
    const payload=await response.json().catch(()=>({}));
    if(!response.ok)throw Object.assign(new Error(payload.errorMessage||payload.errorCode||`OANDA HTTP ${response.status}`),{status:response.status,payload});
    return payload.prices?.[0]||null;
  }catch(error){if(controller.signal.aborted)throw Object.assign(new Error("OANDA live signal quote timed out"),{status:504,code:"LIVE_SIGNAL_QUOTE_TIMEOUT"});throw error;}
  finally{clearTimeout(timeout);}
}

export function executableSignalQuote(price={},direction=0){
  if(price?.tradeable===false)return null;
  const side=Math.sign(Number(direction));
  const value=side>0?finiteNumber(price.asks?.[0]?.price):side<0?finiteNumber(price.bids?.[0]?.price):null;
  return value===null?null:{price:value,time:price.time||new Date().toISOString(),side:side>0?"ASK":"BID",basis:PRICE_BASIS};
}

function quoteUnavailable(message,cause=null){return Object.assign(new Error(message),{status:Number(cause?.status)||503,code:"LIVE_SIGNAL_QUOTE_UNAVAILABLE",stage:"SIGNAL_PRICE_AUTHORITY",cause});}

async function enrichCandidateSignalPrice(candidate,token,accountId){
  const pair=candidate?.pair,event=candidate?.event,direction=Number(event?.direction||0);
  if(!pair||!event||!direction)throw quoteUnavailable("Executable signal quote cannot be registered without pair, event, and direction.");
  if(finiteNumber(event.signalPrice)!==null&&event.signalPriceBasis===PRICE_BASIS&&event.signalQuoteTime)return candidate;
  const sourceCandleClose=finiteNumber(event.openPrice),sourceCrossingTime=event.startTime||event.crossingTime||null;
  try{
    const raw=await callPricing(token,accountId,pair),quote=executableSignalQuote(raw,direction);
    if(!quote)throw quoteUnavailable(`Executable tradeable ${direction>0?"ASK":"BID"} signal quote is unavailable for ${pair}.`);
    return{...candidate,event:{...event,sourceCandleClose,sourceCrossingTime,openPrice:quote.price,signalPrice:quote.price,signalQuoteTime:quote.time,marketSignalTime:quote.time,signalPriceSide:quote.side,signalPriceBasis:quote.basis}};
  }catch(error){
    if(error?.code==="LIVE_SIGNAL_QUOTE_UNAVAILABLE")throw error;
    throw quoteUnavailable(`Executable ${direction>0?"ASK":"BID"} signal quote could not be captured for ${pair}: ${String(error?.message||error)}`,error);
  }
}

function deduplicateLedgerPayload(payload={}){
  const rows=Array.isArray(payload?.ledger)?payload.ledger:[],seen=new Set(),ledger=[];let duplicateLedgerRows=0;
  for(const row of rows){const id=String(row?.ledgerId||"");if(id&&seen.has(id)){duplicateLedgerRows++;continue;}if(id)seen.add(id);ledger.push(row);}
  return{...payload,ledger,rawLedgerRows:rows.length,duplicateLedgerRows,uniqueLedgerRows:ledger.length,ledgerDeduplicationVersion:"LEDGER_ID_EXPORT_DEDUP@1.0.0"};
}

export class HtlEngine extends SignalProvenanceEngine{
  async fetch(request){
    const url=new URL(request.url),response=await super.fetch(request);
    if(url.pathname!=="/ledger"||!response.ok)return response;
    const payload=await response.json().catch(()=>null);if(!payload)return response;
    return new Response(JSON.stringify(deduplicateLedgerPayload(payload)),{status:response.status,headers:{"Content-Type":"application/json","Cache-Control":"no-store"}});
  }

  async resolveIndicatorOnlyAccount(state){
    const{token,accountId:configured}=credentials(this.env);
    try{
      const{accountId}=await resolveExactAccountAuthority({token,configuredAccountId:configured,state,writeLedger:entry=>this.write(entry,false)});clearAccountAuthorityBackoff(state);return{token,accountId};
    }catch(error){
      const backoff=accountAuthorityBackoff(error,state);throw Object.assign(new Error(`${String(error?.message||error)}. Indicator Only scheduled backoff for ${backoff.label}.`),{code:error?.code,stage:error?.stage,path:error?.path,status:error?.status});
    }
  }

  decisionContext(candidate,config){
    const context=super.decisionContext(candidate,config),event=candidate?.event||{};
    return{...context,signalPrice:finiteNumber(event.signalPrice),sourceCandleClose:finiteNumber(event.sourceCandleClose??event.openPrice),sourceCrossingTime:event.sourceCrossingTime||event.startTime||event.crossingTime||context.signalTime||null,sourcePriceBasis:event.signalPriceBasis||context.sourcePriceBasis,signalQuoteTime:event.signalQuoteTime||null,marketSignalTime:event.marketSignalTime||event.signalQuoteTime||null,signalPriceSide:event.signalPriceSide||null,liveSignalPriceVersion:LIVE_SIGNAL_PRICE_VERSION,automaticSignalExecutionVersion:AUTOMATIC_SIGNAL_EXECUTION_VERSION};
  }

  async persistSignalRegistration(candidate,config,state){
    const event=candidate?.event||{},existing=Array.isArray(state.executionSignalRegistry)?state.executionSignalRegistry.find(record=>record?.executionEventId===event.id&&record?.complete&&record?.sourcePriceBasis===PRICE_BASIS):null;
    if(existing)return existing;
    const base=buildSignalProvenance(candidate,config),signalPrice=finiteNumber(event.signalPrice),signalQuoteTime=event.signalQuoteTime||null,complete=Boolean(base.pair&&base.timeframe&&base.indicator&&base.direction&&base.signalTime&&signalPrice!==null&&signalQuoteTime&&base.sourceEventId&&base.executionEventId),record=registerSignalProvenance(state,{...base,signalPrice,sourceCandleClose:finiteNumber(event.sourceCandleClose??base.signalPrice),sourceCrossingTime:event.sourceCrossingTime||base.signalTime,sourcePriceBasis:event.signalPriceBasis||null,signalQuoteTime,marketSignalTime:event.marketSignalTime||signalQuoteTime,signalPriceSide:event.signalPriceSide||null,signalQuoteError:null,liveSignalPriceVersion:LIVE_SIGNAL_PRICE_VERSION,automaticSignalExecutionVersion:AUTOMATIC_SIGNAL_EXECUTION_VERSION,complete});
    await this.ctx.storage.put("state",state);
    await this.write({type:"SIGNAL_PROVENANCE_REGISTERED",...record,message:record.complete?`${record.indicator} ${record.direction} executable ${record.signalPriceSide} signal price registered at ${record.signalPrice}`:"Signal provenance registration is incomplete"},false);
    return record;
  }

  async executeImmediate(candidate,token,accountId,state,mode="AUTOMATIC"){
    const id=signalAttemptId(candidate),prior=priorSignalAttempt(state,id);
    if(prior){state.lastNoOrderReason=`${mode} signal ${id||"unknown"} was already attempted at ${prior.attemptedAt||"an earlier time"}; automatic replay is prohibited.`;return null;}
    const attempt=beginSignalAttempt(state,candidate,mode);await this.ctx.storage.put("state",state);
    try{
      const priced=await enrichCandidateSignalPrice(candidate,token,accountId);if(attempt){attempt.signalPrice=priced.event.signalPrice;attempt.signalQuoteTime=priced.event.signalQuoteTime;attempt.signalPriceSide=priced.event.signalPriceSide;}
      const fill=mode==="INDICATOR_ONLY"?await super.executeIndicatorOnlyUnits(priced,token,accountId,state):await super.execute(priced,token,accountId,state);
      if(fill){finishSignalAttempt(state,attempt,"EXECUTED",{fillPrice:finiteNumber(fill?.price??fill?.orderFillTransaction?.price)});}
      else{finishSignalAttempt(state,attempt,"EXECUTION_FAILED",{error:"Execution returned without an OANDA fill."});await this.write({type:"AUTOMATIC_SIGNAL_EXECUTION_FAILURE",automaticSignalExecutionVersion:AUTOMATIC_SIGNAL_EXECUTION_VERSION,pair:candidate?.pair||null,direction:Number(candidate?.event?.direction)>0?"BUY":"SELL",event:id,signalPrice:priced.event.signalPrice,signalQuoteTime:priced.event.signalQuoteTime,signalPriceSide:priced.event.signalPriceSide,message:`${mode} signal was recognized and priced but did not produce an OANDA fill; it will not be replayed.`},false);}
      await this.ctx.storage.put("state",state);return fill;
    }catch(error){
      finishSignalAttempt(state,attempt,"EXECUTION_FAILED",{error:String(error?.message||error),errorCode:error?.code||null,errorStage:error?.stage||null});
      await this.write({type:"AUTOMATIC_SIGNAL_EXECUTION_FAILURE",automaticSignalExecutionVersion:AUTOMATIC_SIGNAL_EXECUTION_VERSION,pair:candidate?.pair||null,direction:Number(candidate?.event?.direction)>0?"BUY":"SELL",event:id,errorCode:error?.code||null,errorStage:error?.stage||null,message:`${mode} signal execution failed at recognition time and will not be replayed: ${String(error?.message||error)}`},false);await this.ctx.storage.put("state",state);return null;
    }
  }

  async tickTicket(state,ticket,token,accountId){
    const runtime=ioTicketRuntime(state,ticket.slot),now=Date.now();if(Number(runtime.nextDue)>now)return;
    runtime.nextDue=now+ioMarketScanCadenceMs(ticket);
    const data=await candles(ticket.pair,token,ticket.timeframe,IO_STATE_HISTORY_BARS),lastCandle=data.at(-1)?.time;state.lastScanAt=new Date().toISOString();runtime.historyBars=data.length;runtime.historyTarget=IO_STATE_HISTORY_BARS;
    if(!lastCandle){state.lastNoOrderReason=`IO Ticket ${ticket.slot} · no completed ${ticket.timeframe} candle for ${ticket.pair}`;return;}
    const settings=__indicatorOnlyTest.indicatorOnlySettings(ticket),event=currentEvent(data,ticket.pair,ticket.timeframe,ticket.indicator,settings),positions=await this.loadPositions(token,accountId),position=positions.find(item=>item.instrument===ticket.pair),existing=__indicatorOnlyTest.positionDirection(position),observedAt=eventObservedAt(event,ticket.timeframe),priorEventId=runtime.lastEventId||null,engagedMs=Date.parse(runtime.engagedAt||""),observedMs=Date.parse(observedAt||"");
    state.openPositionsCount=positions.length;runtime.lastCandle=lastCandle;runtime.lastDirection=Number(event?.direction||0);runtime.lastSignal=event?.direction>0?"BUY":event?.direction<0?"SELL":null;runtime.units=ticket.units;runtime.eventStartTime=event?.startTime||null;runtime.eventObservedAt=observedAt;runtime.eventBars=Number(event?.bars)||null;
    if(!event?.direction){state.lastNoOrderReason=`IO Ticket ${ticket.slot} · no registered ${ticket.indicator} crossing found in ${data.length} completed ${ticket.timeframe} bars; no order fabricated.`;return;}
    if(!priorEventId&&Number.isFinite(observedMs)&&Number.isFinite(engagedMs)&&observedMs<=engagedMs){runtime.lastEventId=event.id;runtime.baselinedAt=new Date(now).toISOString();state.lastNoOrderReason=`IO Ticket ${ticket.slot} initialized on existing ${ticket.pair} ${ticket.timeframe} ${ticket.indicator} state; no pre-engagement order submitted.`;await this.write({type:"INDICATOR_ONLY_INITIALIZED",executionPolicy:"INDICATOR_ONLY_DUAL@1.2.0",pair:ticket.pair,timeframe:ticket.timeframe,strategy:ticket.indicator,indicatorOnlyTicket:ticket.slot,event:event.id,message:state.lastNoOrderReason},false);return;}
    if(priorEventId===event.id){state.lastNoOrderReason=`IO Ticket ${ticket.slot} HOLD · awaiting next ${ticket.pair} ${ticket.timeframe} ${ticket.indicator} crossing`;return;}
    runtime.lastEventId=event.id;runtime.lastSignalAt=new Date(now).toISOString();
    const executionEventId=`IO${ticket.slot}:${runtime.engagedAt||"session"}:${event.id}`,candidate={pair:ticket.pair,event:{...event,id:executionEventId,sourceEventId:event.id},configuration:{primary:{length:ticket.length,filter:ticket.filter,score:null,trades:null,net:null,maxDrawdown:null,winRate:null},settings,strategyEngineVersion:STRATEGY_ENGINE_VERSION,performanceVersion:REGISTERED_PERFORMANCE_VERSION},IO:{...ticket,version:"INDICATOR_ONLY_DUAL@1.2.0",ticket:ticket.slot}},priorAttempt=priorSignalAttempt(state,executionEventId);
    if(priorAttempt){state.lastNoOrderReason=`IO Ticket ${ticket.slot} signal ${executionEventId} was already attempted at ${priorAttempt.attemptedAt||"an earlier time"}; automatic replay is prohibited.`;await this.ctx.storage.put("state",state);return;}
    const attempt=beginSignalAttempt(state,candidate,"INDICATOR_ONLY");await this.ctx.storage.put("state",state);
    let pricedCandidate;
    try{
      pricedCandidate=await enrichCandidateSignalPrice(candidate,token,accountId);if(attempt){attempt.signalPrice=pricedCandidate.event.signalPrice;attempt.signalQuoteTime=pricedCandidate.event.signalQuoteTime;attempt.signalPriceSide=pricedCandidate.event.signalPriceSide;}await this.persistSignalRegistration(pricedCandidate,{},state);
      const context=this.decisionContext(pricedCandidate,{});await this.write({type:"INDICATOR_ONLY_SIGNAL",executionPolicy:"INDICATOR_ONLY_DUAL@1.2.0",automaticSignalExecutionVersion:AUTOMATIC_SIGNAL_EXECUTION_VERSION,pair:ticket.pair,direction:event.direction>0?"BUY":"SELL",event:executionEventId,eventStartTime:event.startTime||null,eventObservedAt:observedAt,eventBars:event.bars,timeframe:ticket.timeframe,strategy:ticket.indicator,htlLength:ticket.length,filter:ticket.filter,units:ticket.units,indicatorOnlyTicket:ticket.slot,existingDirection:existing>0?"BUY":existing<0?"SELL":null,signalPrice:pricedCandidate.event.signalPrice,signalQuoteTime:pricedCandidate.event.signalQuoteTime,signalPriceSide:pricedCandidate.event.signalPriceSide,message:`IO Ticket ${ticket.slot} ${event.direction>0?"BUY":"SELL"} signal · ${ticket.pair} ${ticket.timeframe} ${ticket.indicator} · executable ${pricedCandidate.event.signalPriceSide} ${pricedCandidate.event.signalPrice}`},false);
      if(existing===event.direction){finishSignalAttempt(state,attempt,"ALREADY_POSITIONED",{error:"Position already matched new signal direction."});state.lastNoOrderReason=`IO Ticket ${ticket.slot} invariant · ${ticket.pair} already ${event.direction>0?"BUY":"SELL"}; duplicate position prohibited.`;await this.ctx.storage.put("state",state);return;}
      if(existing){const longUnits=Number(position?.long?.units||0),shortUnits=Math.abs(Number(position?.short?.units||0)),fill=await this.closePosition(ticket.pair,existing,longUnits,shortUnits,token,accountId,executionEventId,`IO Ticket ${ticket.slot} opposing immediate indicator signal reversal`,context);if(!fill)throw Object.assign(new Error(`IO Ticket ${ticket.slot} reversal close failed for ${ticket.pair}`),{code:"REVERSAL_CLOSE_FAILED"});}
      const fill=await super.executeIndicatorOnlyUnits(pricedCandidate,token,accountId,state);if(!fill)throw Object.assign(new Error("Indicator Only execution returned without an OANDA fill."),{code:"ORDER_FILL_MISSING"});
      const executionAt=Date.now(),observedTime=Date.parse(observedAt||"");runtime.lastExecutionEventId=executionEventId;runtime.lastExecutionAt=new Date(executionAt).toISOString();runtime.lastExecutionUnits=ticket.units;runtime.executionDelayMs=Number.isFinite(observedTime)?Math.max(0,executionAt-observedTime):null;finishSignalAttempt(state,attempt,"EXECUTED",{fillPrice:finiteNumber(fill?.price??fill?.orderFillTransaction?.price)});await this.write({type:"INDICATOR_ONLY_EXECUTION_TIMING",executionPolicy:"INDICATOR_ONLY_DUAL@1.2.0",automaticSignalExecutionVersion:AUTOMATIC_SIGNAL_EXECUTION_VERSION,pair:ticket.pair,direction:event.direction>0?"BUY":"SELL",timeframe:ticket.timeframe,strategy:ticket.indicator,indicatorOnlyTicket:ticket.slot,event:executionEventId,eventStartTime:event.startTime||null,eventObservedAt:observedAt,executionAt:runtime.lastExecutionAt,executionDelayMs:runtime.executionDelayMs,signalPrice:pricedCandidate.event.signalPrice,signalQuoteTime:pricedCandidate.event.signalQuoteTime,message:`IO Ticket ${ticket.slot} immediate execution completed · signal ${pricedCandidate.event.signalPrice} · delay ${runtime.executionDelayMs??"unknown"} ms`},false);await this.ctx.storage.put("state",state);
    }catch(error){finishSignalAttempt(state,attempt,"EXECUTION_FAILED",{error:String(error?.message||error),errorCode:error?.code||null,errorStage:error?.stage||null});runtime.lastError=String(error?.message||error);runtime.lastErrorAt=new Date().toISOString();state.lastNoOrderReason=`IO Ticket ${ticket.slot} execution failure at signal recognition · ${runtime.lastError}`;await this.write({type:"AUTOMATIC_SIGNAL_EXECUTION_FAILURE",executionPolicy:"INDICATOR_ONLY_DUAL@1.2.0",automaticSignalExecutionVersion:AUTOMATIC_SIGNAL_EXECUTION_VERSION,pair:ticket.pair,direction:event.direction>0?"BUY":"SELL",timeframe:ticket.timeframe,strategy:ticket.indicator,indicatorOnlyTicket:ticket.slot,event:executionEventId,signalPrice:pricedCandidate?.event?.signalPrice??null,signalQuoteTime:pricedCandidate?.event?.signalQuoteTime??null,errorCode:error?.code||null,errorStage:error?.stage||null,message:`IO Ticket ${ticket.slot} signal execution failed immediately and will not be replayed: ${runtime.lastError}`},false);await this.ctx.storage.put("state",state);}
  }

  async execute(candidate,token,accountId,state){return this.executeImmediate(candidate,token,accountId,state,"AUTOMATIC");}
  async executeIndicatorOnlyUnits(candidate,token,accountId,state){return this.executeImmediate(candidate,token,accountId,state,"INDICATOR_ONLY");}

  async status(){const status=await super.status(),state=(await this.ctx.storage.get("state"))||{},recent=Array.isArray(state.executionSignalRegistry)?state.executionSignalRegistry.filter(record=>record?.liveSignalPriceVersion===LIVE_SIGNAL_PRICE_VERSION&&record?.sourcePriceBasis===PRICE_BASIS).slice(-96):[];return{...status,liveSignalPriceVersion:LIVE_SIGNAL_PRICE_VERSION,liveSignalPriceBasis:PRICE_BASIS,automaticSignalExecutionVersion:AUTOMATIC_SIGNAL_EXECUTION_VERSION,signalExecutionAttemptCount:Array.isArray(state.signalExecutionAttempts)?state.signalExecutionAttempts.length:0,lastSignalExecutionAttempt:state.lastSignalExecutionAttempt||null,accountAuthorityVersion:status.accountAuthorityVersion||ACCOUNT_AUTHORITY_VERSION,recentExecutableSignals:recent,indicatorOnlyStateHistoryBars:status.indicatorOnlyStateHistoryBars||IO_STATE_HISTORY_BARS};}
}

export const __liveSignalPriceTest=Object.freeze({LIVE_SIGNAL_PRICE_VERSION,AUTOMATIC_SIGNAL_EXECUTION_VERSION,PRICE_BASIS,IO_MARKET_SCAN_MAX_MS,IO_STATE_HISTORY_BARS,SIGNAL_ATTEMPT_LIMIT,executableSignalQuote,deduplicateLedgerPayload,quoteUnavailable,ioMarketScanCadenceMs,eventObservedAt,signalAttemptId,priorSignalAttempt,beginSignalAttempt,finishSignalAttempt});
