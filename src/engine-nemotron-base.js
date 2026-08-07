import { HtlEngine as HorizonEngine } from "./engine-horizon-base.js";
import { __platformTest, computeConfiguration as computePlatformConfiguration, optimizeNext as optimizePlatformNext, scan as scanPlatform, currentOptimizer, OPTIMIZER_VERSION, PAIRS } from "./horizon-platform-engine.js";
import "../public/htl-horizon-contract.js";
import "../public/horizon-strategy-contract.js";

const H=globalThis.CTE_HORIZON_HTL,S=globalThis.CTE_HORIZON_STRATEGIES;
const response=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{"Content-Type":"application/json","Cache-Control":"no-store"}});
const AI_MODEL="@cf/nvidia/nemotron-3-120b-a12b";
const AI_TIMEOUT_MS=7000;
const AI_POLICY="MULTI_NEW_ENTRY_CANDIDATES_ONLY";

function deterministicCandidate(candidates){
  return [...candidates].sort((left,right)=>{
    const leftConfidence=Number(left?.confidence)||0,rightConfidence=Number(right?.confidence)||0;
    const leftCount=Number(left?.count)||0,rightCount=Number(right?.count)||0;
    return rightConfidence-leftConfidence||rightCount-leftCount||String(left?.pair||"").localeCompare(String(right?.pair||""));
  })[0]||null;
}

function compactCandidate(candidate){
  const primary=candidate?.configuration?.primary||{},confirmation=candidate?.configuration?.confirmation||null;
  return{
    pair:String(candidate?.pair||""),
    direction:Number(candidate?.event?.direction)>0?"BUY":"SELL",
    eventId:String(candidate?.event?.id||""),
    bars:Number.isFinite(Number(candidate?.event?.bars))?Number(candidate.event.bars):null,
    openPrice:Number.isFinite(Number(candidate?.event?.openPrice))?Number(candidate.event.openPrice):null,
    confidence:Number.isFinite(Number(candidate?.confidence))?Number(candidate.confidence):null,
    mtfCount:Number.isFinite(Number(candidate?.count))?Number(candidate.count):null,
    primary:{
      length:Number.isFinite(Number(primary.length))?Number(primary.length):null,
      filter:Number.isFinite(Number(primary.filter))?Number(primary.filter):null,
      score:Number.isFinite(Number(primary.score))?Number(primary.score):null,
      trades:Number.isFinite(Number(primary.trades))?Number(primary.trades):null,
      net:Number.isFinite(Number(primary.net))?Number(primary.net):null,
      maxDrawdown:Number.isFinite(Number(primary.maxDrawdown))?Number(primary.maxDrawdown):null,
      winRate:Number.isFinite(Number(primary.winRate))?Number(primary.winRate):null,
    },
    confirmation:confirmation?{
      length:Number.isFinite(Number(confirmation.length))?Number(confirmation.length):null,
      filter:Number.isFinite(Number(confirmation.filter))?Number(confirmation.filter):null,
      score:Number.isFinite(Number(confirmation.score))?Number(confirmation.score):null,
    }:null,
  };
}

function parseAiResponse(result){
  const direct=result?.response;
  if(direct&&typeof direct==="object"&&!Array.isArray(direct))return direct;
  const values=[direct,result?.choices?.[0]?.message?.parsed,result?.choices?.[0]?.message?.content,result?.result?.response];
  for(const value of values){
    if(value&&typeof value==="object"&&!Array.isArray(value))return value;
    if(typeof value!=="string"||!value.trim())continue;
    try{return JSON.parse(value);}catch{}
  }
  return null;
}

function timeoutAfter(ms){
  return new Promise((_,reject)=>setTimeout(()=>reject(Object.assign(new Error(`Nemotron adjudication timed out after ${ms} ms`),{code:"AI_TIMEOUT"})),ms));
}

function attachNemotron(candidate,{status,reason,latencyMs,recommendedPair,invoked}){
  if(!candidate)return candidate;
  return{
    ...candidate,
    Nemotron:{
      model:AI_MODEL,
      policy:AI_POLICY,
      invoked:Boolean(invoked),
      selected:status==="SELECTED",
      recommendedPair:recommendedPair||candidate.pair,
      status,
      reason:reason||null,
      latencyMs,
    }
  };
}

// NEMOTRON_CANDIDATE_TOOL@3.0.0
export { __platformTest as __horizonTest };
export const __nemotronTest=Object.freeze({AI_MODEL,AI_TIMEOUT_MS,AI_POLICY,deterministicCandidate,compactCandidate,parseAiResponse});

export class HtlEngine extends HorizonEngine {
  async fetch(request) {
    const path=new URL(request.url).pathname;
    if(path==="/optimizer"&&request.method==="GET")return response({version:OPTIMIZER_VERSION,calculationVersion:H.VERSION,qualificationVersion:S.VERSION,records:currentOptimizer(await this.ctx.storage.get("optimizer"))});
    if(path==="/compute"&&request.method==="POST"){try{return response(await this.computeConfiguration(await request.json()));}catch(error){return response({error:String(error?.message||error),stage:error?.stage||"compute"},Number(error?.status)||500);}}
    if(path==="/manual-trade-action"&&request.method==="POST"){
      const entry=await request.json().catch(()=>null),allowed=new Set(["MANUAL_TRADE_CLOSE","MANUAL_TRADE_MODIFY","MANUAL_CANDIDATE_ORDER"]);
      if(!entry||!allowed.has(entry.type))return response({error:"Invalid manual trade action."},400);
      await this.write({...entry,calculationVersion:entry.calculationVersion||H.VERSION,qualificationVersion:entry.qualificationVersion||S.VERSION},false);return response({ok:true});
    }
    return super.fetch(request);
  }

  async choose(candidates){
    if(!Array.isArray(candidates)||!candidates.length)return null;
    if(candidates.length===1)return candidates[0];

    const fallback=deterministicCandidate(candidates),table=candidates.map(compactCandidate),candidatePairs=table.map(item=>item.pair),started=Date.now();
    if(!this.env.AI){
      const reason="Workers AI binding unavailable; deterministic candidate ranking used";
      await this.recordAiDecision({invoked:false,status:"AI_BINDING_UNAVAILABLE",model:AI_MODEL,policy:AI_POLICY,latencyMs:0,candidateCount:candidates.length,candidates:candidatePairs,selectedPair:fallback.pair,reason}).catch(()=>{});
      return attachNemotron(fallback,{status:"AI_BINDING_UNAVAILABLE",reason,latencyMs:0,recommendedPair:fallback.pair,invoked:false});
    }

    const schema={type:"object",additionalProperties:false,properties:{selectedPair:{type:"string",enum:candidatePairs},reason:{type:"string",maxLength:240}},required:["selectedPair","reason"]};
    const prompt={
      messages:[
        {role:"system",content:"You are the internal CTE Compound new-entry adjudicator. Select exactly one candidate from the supplied candidate set. You may rank only these candidates; do not create a new pair, change direction, alter units, modify risk controls, close or reverse positions, or change configuration. Prefer stronger multi-timeframe confirmation and statistically superior optimizer evidence while penalizing drawdown and weak sample support. Return only the requested structured result."},
        {role:"user",content:JSON.stringify({task:"select_one_new_entry_candidate",candidates:table})}
      ],
      response_format:{type:"json_schema",json_schema:schema},
      temperature:0,
      max_tokens:256,
    };

    try{
      const result=await Promise.race([this.env.AI.run(AI_MODEL,prompt),timeoutAfter(AI_TIMEOUT_MS)]),latencyMs=Date.now()-started,parsed=parseAiResponse(result),selectedPair=String(parsed?.selectedPair||"");
      const selected=candidates.find(candidate=>candidate.pair===selectedPair);
      if(!selected){
        const reason=`Nemotron returned an invalid candidate selection${selectedPair?`: ${selectedPair}`:""}; deterministic ranking used`;
        await this.recordAiDecision({invoked:true,status:"AI_INVALID_SELECTION",model:AI_MODEL,policy:AI_POLICY,latencyMs,candidateCount:candidates.length,candidates:candidatePairs,selectedPair:fallback.pair,reason}).catch(()=>{});
        return attachNemotron(fallback,{status:"AI_INVALID_SELECTION",reason,latencyMs,recommendedPair:selectedPair||fallback.pair,invoked:true});
      }
      const reason=String(parsed?.reason||"Nemotron selected the candidate from the eligible new-entry set").slice(0,240);
      await this.recordAiDecision({invoked:true,status:"SELECTED",model:AI_MODEL,policy:AI_POLICY,latencyMs,candidateCount:candidates.length,candidates:candidatePairs,selectedPair,reason}).catch(()=>{});
      return attachNemotron(selected,{status:"SELECTED",reason,latencyMs,recommendedPair:selectedPair,invoked:true});
    }catch(error){
      const latencyMs=Date.now()-started,status=error?.code==="AI_TIMEOUT"?"AI_TIMEOUT":"AI_ERROR",reason=`${status}: ${String(error?.message||error).slice(0,180)}; deterministic ranking used`;
      await this.recordAiDecision({invoked:true,status,model:AI_MODEL,policy:AI_POLICY,latencyMs,candidateCount:candidates.length,candidates:candidatePairs,selectedPair:fallback.pair,reason}).catch(()=>{});
      return attachNemotron(fallback,{status,reason,latencyMs,recommendedPair:fallback.pair,invoked:true});
    }
  }

  async tick(){const state=(await this.ctx.storage.get("state"))||{};if(state.qualificationVersion!==S.VERSION){Object.assign(state,{events:{},directions:null,requirements:null,lastCandle:null,mtf:{},mtfDecisionDirections:{},mtfRotation:0,initialized:false,calculationVersion:H.VERSION,qualificationVersion:S.VERSION});await this.ctx.storage.put("state",state);await this.write({type:"QUALIFICATION_MIGRATION",calculationVersion:H.VERSION,qualificationVersion:S.VERSION,message:"All strategies now qualify one canonical Asset/Inverse crossing clock"},false);}return super.tick();}
  async status(){const status=await super.status(),records=currentOptimizer(await this.ctx.storage.get("optimizer")),telemetry=(await this.ctx.storage.get("aiTelemetry"))||{};return{...status,optimizerVersion:OPTIMIZER_VERSION,optimizerCoverage:Object.keys(records).length,optimizerTotal:PAIRS.length*10,calculationVersion:H.VERSION,qualificationVersion:S.VERSION,crossingContract:"ONE_RAW_ASSET_RECOVERED_INVERSE_CROSSING_CLOCK",strategyContract:"POST_CROSS_STRATEGY_QUALIFICATION",ai:{model:AI_MODEL,binding:Boolean(this.env.AI),policy:AI_POLICY,...telemetry}};}
  async computeConfiguration(value){return computePlatformConfiguration(this,value);}
  async optimizeNext(state,token){return optimizePlatformNext(this,state,token);}
  async scan(token,config,timeframe=config.timeframe,optimizer={}){const rows=await scanPlatform(this,token,config,timeframe,optimizer);return rows.filter(row=>row.event?.qualified===true&&Boolean(row.event?.startTime));}
  mtfCandidates(state,rows,lastCandle,fingerprint){const byPair=new Map(rows.filter(row=>row.event?.qualified===true&&row.event?.startTime===lastCandle).map(row=>[row.pair,row])),timeframes=["W","D","H4","H1","M30","M15","M5","M1","S30","S5"];return[...byPair.values()].map(row=>{let score=0,count=0;for(const timeframe of timeframes){const snapshot=state.mtf?.[timeframe];if(snapshot?.fingerprint!==fingerprint)continue;const direction=Number(snapshot.directions?.[row.pair]||0);if(direction){score+=direction;count++;}}const consensus=Math.sign(score);return consensus&&count>=3&&consensus===row.event.direction?{...row,confidence:Math.abs(score)/count,count}:null;}).filter(Boolean).sort((left,right)=>right.confidence-left.confidence||right.count-left.count);}
}