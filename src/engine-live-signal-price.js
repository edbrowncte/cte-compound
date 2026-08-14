import {
  HtlEngine as SignalProvenanceEngine,
  buildSignalProvenance,
  registerSignalProvenance,
} from "./engine-signal-provenance.js";

const API="https://api-fxtrade.oanda.com";
export const LIVE_SIGNAL_PRICE_VERSION="LIVE_EXECUTABLE_SIGNAL_PRICE@1.0.0";
const PRICE_BASIS="LIVE_OANDA_EXECUTABLE_SIDE_QUOTE_AT_REGISTRATION";

function finiteNumber(value){const number=Number(value);return Number.isFinite(number)?number:null;}

async function callPricing(token,accountId,pair){
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),15000);
  try{
    const response=await fetch(`${API}/v3/accounts/${encodeURIComponent(accountId)}/pricing?instruments=${encodeURIComponent(pair)}`,{method:"GET",headers:{Authorization:`Bearer ${token}`,Accept:"application/json"},redirect:"manual",cache:"no-store",signal:controller.signal});
    const payload=await response.json().catch(()=>({}));
    if(!response.ok)throw Object.assign(new Error(payload.errorMessage||payload.errorCode||`OANDA HTTP ${response.status}`),{status:response.status,payload});
    return payload.prices?.[0]||null;
  }catch(error){if(controller.signal.aborted)throw Object.assign(new Error("OANDA live signal quote timed out"),{status:504});throw error;}
  finally{clearTimeout(timeout);}
}

export function executableSignalQuote(price={},direction=0){
  const side=Math.sign(Number(direction));
  const value=side>0?finiteNumber(price.closeoutAsk??price.asks?.[0]?.price):side<0?finiteNumber(price.closeoutBid??price.bids?.[0]?.price):null;
  return value===null?null:{price:value,time:price.time||null,side:side>0?"ASK":"BID",basis:PRICE_BASIS};
}

async function enrichCandidateSignalPrice(candidate,token,accountId){
  const pair=candidate?.pair,event=candidate?.event,direction=Number(event?.direction||0);
  if(!pair||!event||!direction)return candidate;
  const sourceCandleClose=finiteNumber(event.openPrice);
  try{
    const raw=await callPricing(token,accountId,pair),quote=executableSignalQuote(raw,direction);
    if(!quote)return{...candidate,event:{...event,sourceCandleClose,signalPriceBasis:"COMPLETED_SOURCE_CANDLE_CLOSE_FALLBACK",signalQuoteError:"EXECUTABLE_SIDE_QUOTE_UNAVAILABLE"}};
    return{...candidate,event:{...event,sourceCandleClose,openPrice:quote.price,signalPrice:quote.price,signalQuoteTime:quote.time,signalPriceSide:quote.side,signalPriceBasis:quote.basis}};
  }catch(error){
    return{...candidate,event:{...event,sourceCandleClose,signalPriceBasis:"COMPLETED_SOURCE_CANDLE_CLOSE_FALLBACK",signalQuoteError:String(error?.message||error)}};
  }
}

export class HtlEngine extends SignalProvenanceEngine{
  decisionContext(candidate,config){
    const context=super.decisionContext(candidate,config),event=candidate?.event||{};
    return{...context,signalPrice:finiteNumber(event.signalPrice??event.openPrice),sourceCandleClose:finiteNumber(event.sourceCandleClose),sourcePriceBasis:event.signalPriceBasis||context.sourcePriceBasis,signalQuoteTime:event.signalQuoteTime||null,signalPriceSide:event.signalPriceSide||null,liveSignalPriceVersion:LIVE_SIGNAL_PRICE_VERSION};
  }

  async persistSignalRegistration(candidate,config,state){
    const base=buildSignalProvenance(candidate,config),event=candidate?.event||{},record=registerSignalProvenance(state,{...base,signalPrice:finiteNumber(event.signalPrice??event.openPrice),sourceCandleClose:finiteNumber(event.sourceCandleClose),sourcePriceBasis:event.signalPriceBasis||base.sourcePriceBasis,signalQuoteTime:event.signalQuoteTime||null,signalPriceSide:event.signalPriceSide||null,signalQuoteError:event.signalQuoteError||null,liveSignalPriceVersion:LIVE_SIGNAL_PRICE_VERSION});
    await this.ctx.storage.put("state",state);
    await this.write({type:"SIGNAL_PROVENANCE_REGISTERED",...record,message:record.complete?`${record.indicator} ${record.direction} executable-side signal price registered independently from OANDA fill price`:"Signal provenance registration is incomplete"},false);
    return record;
  }

  async execute(candidate,token,accountId,state){return super.execute(await enrichCandidateSignalPrice(candidate,token,accountId),token,accountId,state);}
  async executeIndicatorOnlyUnits(candidate,token,accountId,state){return super.executeIndicatorOnlyUnits(await enrichCandidateSignalPrice(candidate,token,accountId),token,accountId,state);}

  async status(){const status=await super.status();return{...status,liveSignalPriceVersion:LIVE_SIGNAL_PRICE_VERSION,liveSignalPriceBasis:PRICE_BASIS};}
}

export const __liveSignalPriceTest=Object.freeze({LIVE_SIGNAL_PRICE_VERSION,PRICE_BASIS,executableSignalQuote});
