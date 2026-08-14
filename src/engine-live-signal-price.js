import {
  HtlEngine as SignalProvenanceEngine,
  buildSignalProvenance,
  registerSignalProvenance,
} from "./engine-signal-provenance.js";
import { credentials } from "./engine-base.js";
import { __indicatorOnlyTest } from "./engine-indicator-only.js";
import { __indicatorOnlyUnitsTest } from "./engine-indicator-only-units.js";
import { candles, currentEvent } from "./horizon-platform-engine.js";
import { STRATEGY_ENGINE_VERSION } from "./horizon-strategy-v1.js";
import { REGISTERED_PERFORMANCE_VERSION } from "./horizon-registered-performance.js";
import { executionOpportunity, SIGNAL_EXECUTION_WINDOW_VERSION } from "./signal-execution-window.js";
import {
  ACCOUNT_AUTHORITY_VERSION,
  accountAuthorityBackoff,
  clearAccountAuthorityBackoff,
  resolveExactAccountAuthority,
} from "./account-authority.js";

const API="https://api-fxtrade.oanda.com";
export const LIVE_SIGNAL_PRICE_VERSION="LIVE_EXECUTABLE_SIGNAL_PRICE@2.0.0";
const PRICE_BASIS="LIVE_OANDA_EXECUTABLE_SIDE_QUOTE_AT_REGISTRATION";
const IO_MARKET_SCAN_MAX_MS=60_000;

function finiteNumber(value){const number=Number(value);return Number.isFinite(number)?number:null;}
function ioTicketRuntime(state,slot){state.indicatorOnlyTicketRuntime=state.indicatorOnlyTicketRuntime||{};state.indicatorOnlyTicketRuntime[slot]=state.indicatorOnlyTicketRuntime[slot]||{engagedAt:new Date().toISOString(),lastEventId:null,lastExecutionEventId:null,lastDirection:0,lastCandle:null,lastSignalAt:null,nextDue:0};return state.indicatorOnlyTicketRuntime[slot];}
function ioMarketScanCadenceMs(ticket){return Math.min(Math.max(1000,Number(__indicatorOnlyTest.indicatorOnlyCadenceMs(ticket.timeframe))||60_000),IO_MARKET_SCAN_MAX_MS);}

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
  const side=Math.sign(Number(direction));
  const value=side>0?finiteNumber(price.closeoutAsk??price.asks?.[0]?.price):side<0?finiteNumber(price.closeoutBid??price.bids?.[0]?.price):null;
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
    if(!quote)throw quoteUnavailable(`Executable ${direction>0?"ASK":"BID"} signal quote is unavailable for ${pair}.`);
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
    return{...context,signalPrice:finiteNumber(event.signalPrice),sourceCandleClose:finiteNumber(event.sourceCandleClose??event.openPrice),sourceCrossingTime:event.sourceCrossingTime||event.startTime||event.crossingTime||context.signalTime||null,sourcePriceBasis:event.signalPriceBasis||context.sourcePriceBasis,signalQuoteTime:event.signalQuoteTime||null,marketSignalTime:event.marketSignalTime||event.signalQuoteTime||null,signalPriceSide:event.signalPriceSide||null,liveSignalPriceVersion:LIVE_SIGNAL_PRICE_VERSION,signalExecutionWindowVersion:SIGNAL_EXECUTION_WINDOW_VERSION};
  }

  async persistSignalRegistration(candidate,config,state){
    const event=candidate?.event||{},existing=Array.isArray(state.executionSignalRegistry)?state.executionSignalRegistry.find(record=>record?.executionEventId===event.id&&record?.complete&&record?.sourcePriceBasis===PRICE_BASIS):null;
    if(existing)return existing;
    const base=buildSignalProvenance(candidate,config),signalPrice=finiteNumber(event.signalPrice),signalQuoteTime=event.signalQuoteTime||null,complete=Boolean(base.pair&&base.timeframe&&base.indicator&&base.direction&&base.signalTime&&signalPrice!==null&&signalQuoteTime&&base.sourceEventId&&base.executionEventId),record=registerSignalProvenance(state,{...base,signalPrice,sourceCandleClose:finiteNumber(event.sourceCandleClose??base.signalPrice),sourceCrossingTime:event.sourceCrossingTime||base.signalTime,sourcePriceBasis:event.signalPriceBasis||null,signalQuoteTime,marketSignalTime:event.marketSignalTime||signalQuoteTime,signalPriceSide:event.signalPriceSide||null,signalQuoteError:null,liveSignalPriceVersion:LIVE_SIGNAL_PRICE_VERSION,signalExecutionWindowVersion:SIGNAL_EXECUTION_WINDOW_VERSION,complete});
    await this.ctx.storage.put("state",state);
    await this.write({type:"SIGNAL_PROVENANCE_REGISTERED",...record,message:record.complete?`${record.indicator} ${record.direction} executable ${record.signalPriceSide} signal price registered at ${record.signalPrice}`:"Signal provenance registration is incomplete"},false);
    return record;
  }

  async tickTicket(state,ticket,token,accountId){
    const runtime=ioTicketRuntime(state,ticket.slot),now=Date.now();if(Number(runtime.nextDue)>now)return;
    runtime.nextDue=now+ioMarketScanCadenceMs(ticket);
    const count=Math.max(650,Math.min(5000,ticket.length*3+100)),data=await candles(ticket.pair,token,ticket.timeframe,count),lastCandle=data.at(-1)?.time;state.lastScanAt=new Date().toISOString();
    if(!lastCandle){state.lastNoOrderReason=`IO Ticket ${ticket.slot} · no completed ${ticket.timeframe} candle for ${ticket.pair}`;return;}
    const settings=__indicatorOnlyTest.indicatorOnlySettings(ticket),event=currentEvent(data,ticket.pair,ticket.timeframe,ticket.indicator,settings),positions=await this.loadPositions(token,accountId),position=positions.find(item=>item.instrument===ticket.pair),existing=__indicatorOnlyTest.positionDirection(position),opportunity=executionOpportunity(event?.startTime||event?.crossingTime,ticket.timeframe,now);
    state.openPositionsCount=positions.length;runtime.lastCandle=lastCandle;runtime.lastSignalAt=new Date().toISOString();runtime.lastDirection=Number(event?.direction||0);runtime.lastEventId=event?.id||null;runtime.lastSignal=event?.direction>0?"BUY":event?.direction<0?"SELL":null;runtime.units=ticket.units;runtime.eventStartTime=event?.startTime||null;runtime.eventObservedAt=opportunity.observedAt;runtime.eventBars=Number(event?.bars)||null;runtime.executionOpportunity=opportunity;
    if(!event?.direction){state.lastNoOrderReason=`IO Ticket ${ticket.slot} · ${ticket.pair} ${ticket.timeframe} ${ticket.indicator} has no registered BUY/SELL state`;return;}
    if(existing===event.direction){state.lastNoOrderReason=`IO Ticket ${ticket.slot} HOLD · ${ticket.pair} already ${event.direction>0?"BUY":"SELL"}`;return;}
    if(!opportunity.open){
      state.lastNoOrderReason=`IO Ticket ${ticket.slot} EXECUTION_WINDOW_ELAPSED · ${ticket.pair} ${ticket.timeframe} ${ticket.indicator} ${event.direction>0?"BUY":"SELL"} signal remains recorded · order initiation closed ${opportunity.closesAt||"unknown"}`;
      if(runtime.lastMissedExecutionEventId!==event.id){runtime.lastMissedExecutionEventId=event.id;await this.write({type:"INDICATOR_ONLY_EXECUTION_WINDOW_MISSED",executionPolicy:"INDICATOR_ONLY_DUAL@1.1.0",signalExecutionWindowVersion:SIGNAL_EXECUTION_WINDOW_VERSION,pair:ticket.pair,direction:event.direction>0?"BUY":"SELL",timeframe:ticket.timeframe,strategy:ticket.indicator,htlLength:ticket.length,filter:ticket.filter,units:ticket.units,event:event.id,eventStartTime:event.startTime||null,eventObservedAt:opportunity.observedAt,eventBars:event.bars,indicatorOnlyTicket:ticket.slot,executionOpportunity:opportunity,message:state.lastNoOrderReason},false);}return;
    }
    const executionEventId=`IO${ticket.slot}:${runtime.engagedAt||"session"}:${event.id}`,candidate={pair:ticket.pair,event:{...event,id:executionEventId},configuration:{primary:{length:ticket.length,filter:ticket.filter,score:null,trades:null,net:null,maxDrawdown:null,winRate:null},settings,strategyEngineVersion:STRATEGY_ENGINE_VERSION,performanceVersion:REGISTERED_PERFORMANCE_VERSION},IO:{...ticket,version:"INDICATOR_ONLY_DUAL@1.1.0",ticket:ticket.slot}},pricedCandidate=await enrichCandidateSignalPrice(candidate,token,accountId),context=this.decisionContext(pricedCandidate,{});
    await this.persistSignalRegistration(pricedCandidate,{},state);
    await this.write({type:"INDICATOR_ONLY_SIGNAL",executionPolicy:"INDICATOR_ONLY_DUAL@1.1.0",signalExecutionWindowVersion:SIGNAL_EXECUTION_WINDOW_VERSION,pair:ticket.pair,direction:event.direction>0?"BUY":"SELL",event:executionEventId,eventStartTime:event.startTime||null,eventObservedAt:opportunity.observedAt,eventBars:event.bars,timeframe:ticket.timeframe,strategy:ticket.indicator,htlLength:ticket.length,filter:ticket.filter,units:ticket.units,indicatorOnlyTicket:ticket.slot,existingDirection:existing>0?"BUY":existing<0?"SELL":null,signalPrice:pricedCandidate.event.signalPrice,signalQuoteTime:pricedCandidate.event.signalQuoteTime,signalPriceSide:pricedCandidate.event.signalPriceSide,message:`IO Ticket ${ticket.slot} contemporaneous ${event.direction>0?"BUY":"SELL"} signal · ${ticket.pair} ${ticket.timeframe} ${ticket.indicator} · ${pricedCandidate.event.signalPriceSide} ${pricedCandidate.event.signalPrice}`},false);
    if(existing){const longUnits=Number(position?.long?.units||0),shortUnits=Math.abs(Number(position?.short?.units||0)),fill=await this.closePosition(ticket.pair,existing,longUnits,shortUnits,token,accountId,executionEventId,`IO Ticket ${ticket.slot} opposing contemporaneous indicator signal reversal`,context);if(!fill){state.lastNoOrderReason=`IO Ticket ${ticket.slot} reversal close failed for ${ticket.pair}`;return;}}
    const fill=await this.executeIndicatorOnlyUnits(pricedCandidate,token,accountId,state);if(fill){const executionAt=Date.now(),observedMs=Date.parse(opportunity.observedAt||"");runtime.lastExecutionEventId=executionEventId;runtime.lastExecutionAt=new Date(executionAt).toISOString();runtime.lastExecutionUnits=ticket.units;runtime.executionDelayMs=Number.isFinite(observedMs)?Math.max(0,executionAt-observedMs):null;await this.write({type:"INDICATOR_ONLY_EXECUTION_TIMING",executionPolicy:"INDICATOR_ONLY_DUAL@1.1.0",signalExecutionWindowVersion:SIGNAL_EXECUTION_WINDOW_VERSION,pair:ticket.pair,direction:event.direction>0?"BUY":"SELL",timeframe:ticket.timeframe,strategy:ticket.indicator,indicatorOnlyTicket:ticket.slot,event:executionEventId,eventStartTime:event.startTime||null,eventObservedAt:opportunity.observedAt,executionAt:runtime.lastExecutionAt,executionDelayMs:runtime.executionDelayMs,signalPrice:pricedCandidate.event.signalPrice,signalQuoteTime:pricedCandidate.event.signalQuoteTime,message:`IO Ticket ${ticket.slot} execution delay ${runtime.executionDelayMs??"unknown"} ms from signal observation · immutable signal price ${pricedCandidate.event.signalPrice}`},false);}
  }

  async execute(candidate,token,accountId,state){return super.execute(await enrichCandidateSignalPrice(candidate,token,accountId),token,accountId,state);}
  async executeIndicatorOnlyUnits(candidate,token,accountId,state){return super.executeIndicatorOnlyUnits(await enrichCandidateSignalPrice(candidate,token,accountId),token,accountId,state);}

  async status(){const status=await super.status(),state=(await this.ctx.storage.get("state"))||{},recent=Array.isArray(state.executionSignalRegistry)?state.executionSignalRegistry.filter(record=>record?.liveSignalPriceVersion===LIVE_SIGNAL_PRICE_VERSION&&record?.sourcePriceBasis===PRICE_BASIS).slice(-96):[];return{...status,liveSignalPriceVersion:LIVE_SIGNAL_PRICE_VERSION,liveSignalPriceBasis:PRICE_BASIS,signalExecutionWindowVersion:SIGNAL_EXECUTION_WINDOW_VERSION,accountAuthorityVersion:status.accountAuthorityVersion||ACCOUNT_AUTHORITY_VERSION,recentExecutableSignals:recent};}
}

export const __liveSignalPriceTest=Object.freeze({LIVE_SIGNAL_PRICE_VERSION,PRICE_BASIS,SIGNAL_EXECUTION_WINDOW_VERSION,IO_MARKET_SCAN_MAX_MS,executableSignalQuote,deduplicateLedgerPayload,quoteUnavailable,ioMarketScanCadenceMs});
