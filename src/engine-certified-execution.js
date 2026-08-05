import { HtlEngine as CertifiedAnalyticsEngine } from "./engine.js";
import { PAIRS, TIMEFRAMES, OPTIMIZER_VERSION, currentOptimizer, candles } from "./horizon-platform-engine.js";

const API="https://api-fxtrade.oanda.com";
const EXECUTION_POLICY_VERSION="CERTIFIED_MULTI_REVERSAL@1.0.0";

function credentials(env){
  const token=String(env.OANDA_API_KEY||"").trim();
  const accountId=String(env.OANDA_ACCOUNT_ID||"").trim();
  if(token.length<20||!accountId)throw new Error("OANDA secrets unavailable");
  return{token,accountId};
}

async function callOanda(path,token,init={}){
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),15000);
  try{
    const response=await fetch(API+path,{
      method:init.method||"GET",
      headers:{Authorization:`Bearer ${token}`,Accept:"application/json",...(init.body?{"Content-Type":"application/json"}:{})},
      body:init.body,
      redirect:"manual",
      cache:"no-store",
      signal:controller.signal,
    });
    const payload=await response.json().catch(()=>({}));
    if(!response.ok)throw Object.assign(new Error(payload.errorMessage||payload.errorCode||`OANDA HTTP ${response.status}`),{status:response.status,payload});
    return payload;
  }catch(error){
    if(controller.signal.aborted)throw Object.assign(new Error("OANDA request timed out"),{status:504});
    throw error;
  }finally{
    clearTimeout(timeout);
  }
}

async function exactLiveAccount(token,configured){
  const payload=await callOanda("/v3/accounts",token);
  const account=(payload.accounts||[]).find(item=>item.id===configured&&!item.tags?.includes("MT4"));
  if(!account)throw new Error(`Configured OANDA account ${configured} is not authorized or is an MT4-linked account`);
  return account.id;
}

function configFingerprint(config){
  return JSON.stringify({
    timeframe:config.timeframe,
    decisionMode:config.decisionMode,
    strategy:config.strategy,
    confirmationStrategy:config.confirmationStrategy,
    htlLength:config.htlLength,
    filter:config.filter,
    configurationSource:config.configurationSource,
    optimizerVersion:OPTIMIZER_VERSION,
  });
}

function positionDirection(position){
  const longUnits=Number(position?.long?.units||0);
  const shortUnits=Math.abs(Number(position?.short?.units||0));
  return longUnits>0?1:shortUnits>0?-1:0;
}

function requirementDirection(requirement){
  return Number(requirement?.event?.direction??requirement??0);
}

function compactCandidate(candidate){
  return{
    pair:candidate.pair,
    event:candidate.event,
    confidence:Number.isFinite(candidate.confidence)?candidate.confidence:null,
    count:Number.isFinite(candidate.count)?candidate.count:null,
    configuration:candidate.configuration||null,
    nemotron:candidate.nemotron||null,
  };
}

export const __executionTest=Object.freeze({
  EXECUTION_POLICY_VERSION,
  positionDirection,
  requirementDirection,
  configFingerprint,
});

export class HtlEngine extends CertifiedAnalyticsEngine{
  async status(){
    const status=await super.status();
    const state=(await this.ctx.storage.get("state"))||{};
    return{
      ...status,
      armed:true,
      executionCertification:"ARMED_PRIVATE_USER",
      executionPolicy:EXECUTION_POLICY_VERSION,
      pendingReversals:Object.keys(state.pendingReversals||{}).length,
      reversalPolicy:"ALL_OPPOSING_EVENTS_INDEPENDENT_NEW_ENTRIES_NEMOTRON_RANKED",
      reconciliationCadence:"EVERY_CRON_HEARTBEAT",
    };
  }

  async loadPositions(token,accountId){
    const payload=await callOanda(`/v3/accounts/${accountId}/positions`,token);
    return payload.positions||[];
  }

  async reconcile(requirements,token,accountId,state,config,positionsSnapshot=null,excludedPairs=new Set()){
    const positions=positionsSnapshot||await this.loadPositions(token,accountId);
    for(const position of positions){
      if(!PAIRS.includes(position.instrument)||excludedPairs.has(position.instrument))continue;
      const longUnits=Number(position.long?.units||0);
      const shortUnits=Math.abs(Number(position.short?.units||0));
      const existing=positionDirection(position);
      const requirement=requirements?.[position.instrument];
      const required=requirementDirection(requirement);
      if(!existing||!required||existing===required)continue;
      const context=this.decisionContext(requirement&&typeof requirement==="object"?requirement:null,config);
      const event=requirement?.event?.id||state.events?.[position.instrument]||null;
      await this.closePosition(position.instrument,existing,longUnits,shortUnits,token,accountId,event,"Position opposed current strategy direction",context);
    }
  }

  classifyCandidates(candidates,positions){
    const map=new Map((positions||[]).map(position=>[position.instrument,positionDirection(position)]));
    const reversals=[];
    const newEntries=[];
    const matching=[];
    for(const candidate of candidates||[]){
      const existing=map.get(candidate.pair)||0;
      if(existing&&existing!==candidate.event.direction)reversals.push(candidate);
      else if(!existing)newEntries.push(candidate);
      else matching.push(candidate);
    }
    return{reversals,newEntries,matching};
  }

  async claimReversals(candidates,state){
    state.pendingReversals=state.pendingReversals||{};
    const now=new Date().toISOString();
    for(const candidate of candidates){
      const current=state.pendingReversals[candidate.pair];
      if(current?.eventId===candidate.event.id)continue;
      state.pendingReversals[candidate.pair]={
        candidate:compactCandidate(candidate),
        eventId:candidate.event.id,
        direction:candidate.event.direction,
        claimedAt:now,
        attempts:0,
        lastError:null,
      };
    }
    await this.ctx.storage.put("state",state);
  }

  async processPendingReversals(state,token,accountId){
    state.pendingReversals=state.pendingReversals||{};
    for(const[pair,claim]of Object.entries({...state.pendingReversals})){
      const candidate=claim?.candidate;
      if(!candidate?.event?.id||candidate.pair!==pair){
        delete state.pendingReversals[pair];
        continue;
      }
      claim.attempts=Number(claim.attempts||0)+1;
      claim.lastAttemptAt=new Date().toISOString();
      await this.ctx.storage.put("state",state);
      try{
        await this.execute(candidate,token,accountId,state);
        delete state.pendingReversals[pair];
        await this.ctx.storage.put("state",state);
        await this.write({
          type:"REVERSAL_CLAIM_RESOLVED",
          pair,
          direction:candidate.event.direction>0?"BUY":"SELL",
          event:candidate.event.id,
          executionPolicy:EXECUTION_POLICY_VERSION,
          attempts:claim.attempts,
          message:"Durable reversal claim completed or reconciled against the live OANDA position",
        },false);
      }catch(error){
        claim.lastError=String(error?.message||error);
        claim.updatedAt=new Date().toISOString();
        state.pendingReversals[pair]=claim;
        await this.ctx.storage.put("state",state);
        await this.write({
          type:"REVERSAL_RETRY_PENDING",
          pair,
          direction:candidate.event.direction>0?"BUY":"SELL",
          event:candidate.event.id,
          executionPolicy:EXECUTION_POLICY_VERSION,
          attempts:claim.attempts,
          message:claim.lastError,
        },false);
      }
    }
  }

  async tick(){
    if(this.running)return;
    this.running=true;
    let state=(await this.ctx.storage.get("state"))||{events:{},initialized:false};
    try{
      const config=await this.config();
      const fingerprint=configFingerprint(config);
      state.config=config;
      if(state.mtfFingerprint!==fingerprint){
        state.mtf={};
        state.mtfRotation=0;
        state.mtfFingerprint=fingerprint;
      }

      const{token,accountId:configured}=credentials(this.env);
      const accountId=await exactLiveAccount(token,configured);
      try{await this.syncTransactions(state,token,accountId);}catch(error){state.transactionSyncError=String(error?.message||error);}

      await this.processPendingReversals(state,token,accountId);

      let optimizer=currentOptimizer((await this.ctx.storage.get("optimizer"))||{});
      try{optimizer=(await this.optimizeNext(state,token)).records;}catch(error){state.optimizerLastError=String(error?.message||error);}

      const rotationIndex=Number(state.mtfRotation||0)%TIMEFRAMES.length;
      const rotationTimeframe=TIMEFRAMES[rotationIndex];
      const rotationRows=await this.scan(token,config,rotationTimeframe,optimizer);
      state.mtf=state.mtf||{};
      state.mtf[rotationTimeframe]={
        fingerprint,
        directions:Object.fromEntries(rotationRows.map(row=>[row.pair,row.event.direction])),
        updated:new Date().toISOString(),
      };
      state.mtfRotation=(rotationIndex+1)%TIMEFRAMES.length;

      const probe=await candles("EUR_USD",token,config.timeframe,2);
      const lastCandle=probe.at(-1)?.time;
      if(!lastCandle)return;

      if(lastCandle===state.lastCandle&&state.initialized){
        if(!state.requirements){
          const rows=rotationTimeframe===config.timeframe?rotationRows:await this.scan(token,config,config.timeframe,optimizer);
          state.directions=Object.fromEntries(rows.map(row=>[row.pair,row.event.direction]));
          state.requirements=Object.fromEntries(rows.map(row=>[row.pair,row]));
          state.events=Object.fromEntries(rows.map(row=>[row.pair,row.event.id]));
        }
        const positions=await this.loadPositions(token,accountId);
        await this.reconcile(state.requirements,token,accountId,state,config,positions);
        state.lastRun=new Date().toISOString();
        state.lastError=null;
        return;
      }

      const rows=rotationTimeframe===config.timeframe?rotationRows:await this.scan(token,config,config.timeframe,optimizer);
      state.directions=Object.fromEntries(rows.map(row=>[row.pair,row.event.direction]));
      const requirements=Object.fromEntries(rows.map(row=>[row.pair,row]));
      state.requirements=requirements;
      const mtfNow=this.mtfCandidates(state,rows,lastCandle,fingerprint);
      const positions=await this.loadPositions(token,accountId);

      if(!state.initialized){
        await this.reconcile(requirements,token,accountId,state,config,positions);
        state.events=Object.fromEntries(rows.map(row=>[row.pair,row.event.id]));
        state.mtfDecisionDirections=Object.fromEntries(mtfNow.map(row=>[row.pair,row.event.direction]));
        state.initialized=true;
        await this.write({type:"INITIALIZED",message:`${rows.length} registered Horizon events baselined; no pre-existing event entry submitted`});
      }else{
        const eventCandidates=rows
          .filter(row=>state.events[row.pair]!==row.event.id&&row.event.startTime===lastCandle)
          .sort((left,right)=>right.event.bars-left.event.bars);
        const priorMtf=state.mtfDecisionDirections||{};
        const mtfCandidates=mtfNow.filter(row=>Number(priorMtf[row.pair]||0)!==row.event.direction);
        const combined=eventCandidates.map(event=>{
          const mtf=mtfNow.find(item=>item.pair===event.pair&&item.event.direction===event.event.direction);
          return mtf?{...event,confidence:mtf.confidence,count:mtf.count}:null;
        }).filter(Boolean).sort((left,right)=>right.confidence-left.confidence);
        const decisionCandidates=config.decisionMode==="EVENT"?eventCandidates:config.decisionMode==="MTF"?mtfCandidates:combined;
        const{reversals,newEntries}=this.classifyCandidates(decisionCandidates,positions);
        const reversalPairs=new Set(reversals.map(candidate=>candidate.pair));

        await this.reconcile(requirements,token,accountId,state,config,positions,reversalPairs);

        if(reversals.length){
          await this.claimReversals(reversals,state);
          await this.processPendingReversals(state,token,accountId);
        }

        if(newEntries.length){
          const selected=await this.choose(newEntries);
          if(selected)await this.execute(selected,token,accountId,state);
        }

        for(const row of rows)state.events[row.pair]=row.event.id;
        state.mtfDecisionDirections=Object.fromEntries(mtfNow.map(row=>[row.pair,row.event.direction]));
      }

      state.lastCandle=lastCandle;
      state.lastRun=new Date().toISOString();
      state.lastError=null;
    }catch(error){
      state.lastRun=new Date().toISOString();
      state.lastError=String(error?.message||error);
      await this.write({type:"ERROR",executionPolicy:EXECUTION_POLICY_VERSION,message:state.lastError});
    }finally{
      await this.ctx.storage.put("state",state);
      if(await this.ctx.storage.getAlarm()!==null)await this.ctx.storage.deleteAlarm();
      this.running=false;
    }
  }
}
