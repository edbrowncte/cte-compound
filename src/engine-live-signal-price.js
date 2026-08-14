import {
  HtlEngine as SignalProvenanceEngine,
  buildSignalProvenance,
  registerSignalProvenance,
} from "./engine-signal-provenance.js";
import { credentials } from "./engine-base.js";
import {
  ACCOUNT_AUTHORITY_VERSION,
  accountAuthorityBackoff,
  clearAccountAuthorityBackoff,
  resolveExactAccountAuthority,
} from "./account-authority.js";

const API="https://api-fxtrade.oanda.com";
export const LIVE_SIGNAL_PRICE_VERSION="LIVE_EXECUTABLE_SIGNAL_PRICE@2.0.0";
const PRICE_BASIS="LIVE_OANDA_EXECUTABLE_SIDE_QUOTE_AT_REGISTRATION";

function finiteNumber(value){const number=Number(value);return Number.isFinite(number)?number:null;}

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
    return{...context,signalPrice:finiteNumber(event.signalPrice),sourceCandleClose:finiteNumber(event.sourceCandleClose??event.openPrice),sourceCrossingTime:event.sourceCrossingTime||event.startTime||event.crossingTime||context.signalTime||null,sourcePriceBasis:event.signalPriceBasis||context.sourcePriceBasis,signalQuoteTime:event.signalQuoteTime||null,marketSignalTime:event.marketSignalTime||event.signalQuoteTime||null,signalPriceSide:event.signalPriceSide||null,liveSignalPriceVersion:LIVE_SIGNAL_PRICE_VERSION};
  }

  async persistSignalRegistration(candidate,config,state){
    const base=buildSignalProvenance(candidate,config),event=candidate?.event||{},signalPrice=finiteNumber(event.signalPrice),signalQuoteTime=event.signalQuoteTime||null,complete=Boolean(base.pair&&base.timeframe&&base.indicator&&base.direction&&base.signalTime&&signalPrice!==null&&signalQuoteTime&&base.sourceEventId&&base.executionEventId),record=registerSignalProvenance(state,{...base,signalPrice,sourceCandleClose:finiteNumber(event.sourceCandleClose??base.signalPrice),sourceCrossingTime:event.sourceCrossingTime||base.signalTime,sourcePriceBasis:event.signalPriceBasis||null,signalQuoteTime,marketSignalTime:event.marketSignalTime||signalQuoteTime,signalPriceSide:event.signalPriceSide||null,signalQuoteError:null,liveSignalPriceVersion:LIVE_SIGNAL_PRICE_VERSION,complete});
    await this.ctx.storage.put("state",state);
    await this.write({type:"SIGNAL_PROVENANCE_REGISTERED",...record,message:record.complete?`${record.indicator} ${record.direction} executable ${record.signalPriceSide} signal price registered at ${record.signalPrice}`:"Signal provenance registration is incomplete"},false);
    return record;
  }

  async execute(candidate,token,accountId,state){return super.execute(await enrichCandidateSignalPrice(candidate,token,accountId),token,accountId,state);}
  async executeIndicatorOnlyUnits(candidate,token,accountId,state){return super.executeIndicatorOnlyUnits(await enrichCandidateSignalPrice(candidate,token,accountId),token,accountId,state);}

  async status(){const status=await super.status(),state=(await this.ctx.storage.get("state"))||{},recent=Array.isArray(state.executionSignalRegistry)?state.executionSignalRegistry.filter(record=>record?.liveSignalPriceVersion===LIVE_SIGNAL_PRICE_VERSION&&record?.sourcePriceBasis===PRICE_BASIS).slice(-96):[];return{...status,liveSignalPriceVersion:LIVE_SIGNAL_PRICE_VERSION,liveSignalPriceBasis:PRICE_BASIS,accountAuthorityVersion:status.accountAuthorityVersion||ACCOUNT_AUTHORITY_VERSION,recentExecutableSignals:recent};}
}

export const __liveSignalPriceTest=Object.freeze({LIVE_SIGNAL_PRICE_VERSION,PRICE_BASIS,executableSignalQuote,deduplicateLedgerPayload,quoteUnavailable});
