import { HtlEngine as DualIndicatorOnlyEngine } from "./engine-execution-observability.js";

const API="https://api-fxtrade.oanda.com";
const CLOSE_RETRY_VERSION="OANDA_CLOSE_RETRY_GUARD@1.0.0";
const MAX_CLOSE_ATTEMPTS=5;
const CLOSE_RETRY_DELAYS_MS=Object.freeze([60_000,120_000,300_000,900_000]);
const CLOSE_CIRCUIT_COOLDOWN_MS=3_600_000;
const RETRY_KEY_PREFIX="close-retry:";

function closeFailureTransaction(payload={}){
  return payload.longOrderCancelTransaction||payload.shortOrderCancelTransaction||payload.longOrderRejectTransaction||payload.shortOrderRejectTransaction||null;
}
function closeFailureReason(payload={},status=0,fallback=null){
  const transaction=closeFailureTransaction(payload);
  return transaction?.reason||transaction?.rejectReason||payload.errorCode||payload.errorMessage||fallback||`OANDA close HTTP ${status||"unknown"} returned no fill`;
}
function closeIntentFingerprint(pair,existing,event,message){return JSON.stringify({pair,direction:existing>0?"LONG":"SHORT",event:event||null,message:String(message||"")});}
function nextRetryDelayMs(attempt){return Number(attempt)>=MAX_CLOSE_ATTEMPTS?CLOSE_CIRCUIT_COOLDOWN_MS:CLOSE_RETRY_DELAYS_MS[Math.max(0,Math.min(CLOSE_RETRY_DELAYS_MS.length-1,Number(attempt)-1))];}

async function callOandaClose(path,token,init={}){
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),15_000);
  try{
    const response=await fetch(API+path,{method:init.method||"GET",headers:{Authorization:`Bearer ${token}`,Accept:"application/json",...(init.body?{"Content-Type":"application/json"}:{})},body:init.body,redirect:"manual",cache:"no-store",signal:controller.signal});
    const payload=await response.json().catch(()=>({}));
    return{ok:response.ok,status:response.status,payload};
  }catch(error){
    if(controller.signal.aborted)throw Object.assign(new Error("OANDA close request timed out"),{status:504});
    throw error;
  }finally{clearTimeout(timeout);}
}

export const __closeRetryTest=Object.freeze({CLOSE_RETRY_VERSION,MAX_CLOSE_ATTEMPTS,CLOSE_RETRY_DELAYS_MS,CLOSE_CIRCUIT_COOLDOWN_MS,closeFailureTransaction,closeFailureReason,closeIntentFingerprint,nextRetryDelayMs});

export class HtlEngine extends DualIndicatorOnlyEngine{
  async closePosition(pair,existing,longUnits,shortUnits,token,accountId,event,message,context={}){
    const retryKey=`${RETRY_KEY_PREFIX}${pair}`,fingerprint=closeIntentFingerprint(pair,existing,event,message),now=Date.now();
    let retry=(await this.ctx.storage.get(retryKey))||null;
    if(retry?.fingerprint!==fingerprint)retry=null;
    if(retry&&Number(retry.nextRetryAt)>now)return null;
    if(retry&&Number(retry.attempts)>=MAX_CLOSE_ATTEMPTS){retry={...retry,attempts:0,cycle:Number(retry.cycle||0)+1,nextRetryAt:0,circuitReopenedAt:new Date(now).toISOString()};await this.ctx.storage.put(retryKey,retry);}

    const body=existing>0?{longUnits:"ALL"}:{shortUnits:"ALL"},direction=existing>0?"BUY":"SELL",units=existing>0?longUnits:shortUnits;
    let status=0,payload={},networkError=null;
    try{const result=await callOandaClose(`/v3/accounts/${accountId}/positions/${pair}/close`,token,{method:"PUT",body:JSON.stringify(body)});status=result.status;payload=result.payload||{};}
    catch(error){networkError=error;status=Number(error?.status)||0;payload=error?.payload||{};}

    const fill=payload.longOrderFillTransaction||payload.shortOrderFillTransaction;
    if(fill){
      await this.ctx.storage.delete(retryKey);
      if(retry)await this.write({type:"CLOSE_RETRY_RECOVERED",pair,direction,event,closeRetryVersion:CLOSE_RETRY_VERSION,attempts:Number(retry.attempts||0),cycles:Number(retry.cycle||0),transaction:fill.id||payload.lastTransactionID||null,message:"OANDA position close recovered after prior failed attempts"},false);
      await this.write(this.closeRecord(fill,{pair,direction,event,message,context}));return fill;
    }

    const transaction=closeFailureTransaction(payload),attempt=Number(retry?.attempts||0)+1,delayMs=nextRetryDelayMs(attempt),nextRetryAt=now+delayMs,exhausted=attempt>=MAX_CLOSE_ATTEMPTS,reason=closeFailureReason(payload,status,networkError?.message||null),record={fingerprint,pair,direction,event:event||null,message:String(message||""),attempts:attempt,cycle:Number(retry?.cycle||0),lastAttemptAt:new Date(now).toISOString(),lastReason:reason,lastStatus:status,lastTransaction:transaction?.id||payload.lastTransactionID||null,nextRetryAt};
    await this.ctx.storage.put(retryKey,record);
    await this.write({type:"CLOSE_REJECTED",pair,direction,units,transaction:record.lastTransaction,event,message:reason,oandaHttpStatus:status||null,oandaTransactionType:transaction?.type||null,oandaReason:transaction?.reason||null,oandaRejectReason:transaction?.rejectReason||null,retryAttempt:attempt,retryMaxAttempts:MAX_CLOSE_ATTEMPTS,retryCycle:record.cycle,retryStatus:exhausted?"CIRCUIT_OPEN":"BACKOFF",nextRetryAt:new Date(nextRetryAt).toISOString(),closeRetryVersion:CLOSE_RETRY_VERSION,...context});
    if(exhausted)await this.write({type:"CLOSE_RETRY_EXHAUSTED",pair,direction,event,closeRetryVersion:CLOSE_RETRY_VERSION,attempts:attempt,retryCycle:record.cycle,nextRetryAt:new Date(nextRetryAt).toISOString(),message:`Close retry circuit opened after ${attempt} failed attempts; next close attempt allowed after ${new Date(nextRetryAt).toISOString()}`});
    return null;
  }
}
