import { HtlEngine as HorizonEngine } from "./engine-horizon-base.js";
import { __platformTest, computeConfiguration as computePlatformConfiguration, optimizeNext as optimizePlatformNext, scan as scanPlatform, loadOptimizerRecords, OPTIMIZER_VERSION, PAIRS } from "./horizon-platform-engine.js";
import "../public/htl-horizon-contract.js";
import "../public/horizon-strategy-contract.js";
import { AGE_EXPECTATION_VERSION, greatExpectation } from "./age-expectation.js";

const H=globalThis.CTE_HORIZON_HTL,S=globalThis.CTE_HORIZON_STRATEGIES;
const response=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{"Content-Type":"application/json","Cache-Control":"no-store"}});
const AI_MODEL="@cf/nvidia/nemotron-3-120b-a12b";
const AI_TIMEOUT_MS=7000;
const AI_POLICY="AGE_CAPITAL_REALLOCATION_DISCRETION";
const AI_TASK_NAME="AGE";
const AI_TASK="ADMINISTRATING_GREAT_EXPECTATIONS";
const AGE_MANDATE=AI_TASK;
const MODEL_CONTEXT_MAX_AGE_MS=10*60*1000;

function modelContextMatchesConfig(context,config){if(!context?.controls||!config)return false;const controls=context.controls,sameNumber=(left,right)=>Math.abs(Number(left)-Number(right))<1e-9;return controls.timeframe===config.timeframe&&controls.strategy===config.strategy&&controls.confirmationStrategy===config.confirmationStrategy&&sameNumber(controls.htlLength,config.htlLength)&&sameNumber(controls.filter,config.filter)&&controls.decisionMode===config.decisionMode&&controls.configurationSource===config.configurationSource;}
function modelContextFresh(context,config=null){const time=Date.parse(context?.receivedAt||0);if(!Number.isFinite(time)||Date.now()-time>MODEL_CONTEXT_MAX_AGE_MS)return null;return config&&!modelContextMatchesConfig(context,config)?null:context;}
function modelReportForPair(context,pair){return context?.pairReports?.find(item=>item?.pair===pair)||context?.slots?.find(item=>item?.pair===pair)||null;}
function capitalizationScore(candidate,context=null){const explicit=Number(candidate?.AGE?.greatExpectation?.index);if(Number.isFinite(explicit))return explicit;return greatExpectation(candidate,context).index;}
function deterministicCandidate(candidates,context=null){
  return [...candidates].sort((left,right)=>capitalizationScore(right,context)-capitalizationScore(left,context)||String(left?.pair||"").localeCompare(String(right?.pair||"")))[0]||null;
}

function compactCandidate(candidate,context=null){
  const primary=candidate?.configuration?.primary||{},confirmation=candidate?.configuration?.confirmation||null,report=modelReportForPair(context,candidate?.pair);
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
    capitalizationReport:report?{type:report.type||null,regime:report.regime||null,strength:Number.isFinite(Number(report.strength))?Number(report.strength):null,mas:Number.isFinite(Number(report.mas))?Number(report.mas):null,im:Number.isFinite(Number(report.im))?Number(report.im):null,ratio:Number.isFinite(Number(report.ratio))?Number(report.ratio):null,ratioRoc:Number.isFinite(Number(report.ratioRoc))?Number(report.ratioRoc):null,eventAngleZ:Number.isFinite(Number(report.eventAngleZ))?Number(report.eventAngleZ):null,convexity:Number.isFinite(Number(report.convexity))?Number(report.convexity):null,r2:Number.isFinite(Number(report.r2))?Number(report.r2):null,pipsPerHour:Number.isFinite(Number(report.pipsPerHour))?Number(report.pipsPerHour):null,transitionProbability:Number.isFinite(Number(report.transitionProbability))?Number(report.transitionProbability):null}:null,
    greatExpectation:candidate?.AGE?.greatExpectation||greatExpectation(candidate,context),
    candidateType:candidate?.AGE?.candidateType||"NEW_ENTRY",
    capitalizationRank:capitalizationScore(candidate,context),
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
      taskName:AI_TASK_NAME,
      task:AI_TASK,
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
export const __nemotronTest=Object.freeze({AI_MODEL,AI_TIMEOUT_MS,AI_POLICY,AI_TASK_NAME,AI_TASK,AGE_MANDATE,MODEL_CONTEXT_MAX_AGE_MS,modelContextMatchesConfig,capitalizationScore,deterministicCandidate,compactCandidate,parseAiResponse});

export class HtlEngine extends HorizonEngine {
  async fetch(request) {
    const path=new URL(request.url).pathname;
    if(path==="/optimizer"&&request.method==="GET")return response({version:OPTIMIZER_VERSION,calculationVersion:H.VERSION,qualificationVersion:S.VERSION,records:await loadOptimizerRecords(this.ctx.storage)});
    if(path==="/compute"&&request.method==="POST"){try{return response(await this.computeConfiguration(await request.json()));}catch(error){return response({error:String(error?.message||error),stage:error?.stage||"compute"},Number(error?.status)||500);}}
    if(path==="/manual-trade-action"&&request.method==="POST"){
      const entry=await request.json().catch(()=>null),allowed=new Set(["MANUAL_TRADE_CLOSE","MANUAL_TRADE_MODIFY","MANUAL_CANDIDATE_ORDER","MANUAL_ORDER"]);
      if(!entry||!allowed.has(entry.type))return response({error:"Invalid manual trade action."},400);
      await this.write({...entry,calculationVersion:entry.calculationVersion||H.VERSION,qualificationVersion:entry.qualificationVersion||S.VERSION},false);return response({ok:true});
    }
    return super.fetch(request);
  }

  async choose(candidates){
    if(!Array.isArray(candidates)||!candidates.length)return null;
    if(candidates.length===1)return candidates[0];

    const engineState=(await this.ctx.storage.get("state"))||{},modelContext=modelContextFresh(engineState.modelContext,engineState.config||null),fallback=deterministicCandidate(candidates,modelContext),table=candidates.map(candidate=>compactCandidate(candidate,modelContext)),candidatePairs=table.map(item=>item.pair),started=Date.now();
    if(!this.env.AI){
      const reason="Workers AI binding unavailable; deterministic candidate ranking used";
      await this.recordAiDecision({invoked:false,status:"AI_BINDING_UNAVAILABLE",model:AI_MODEL,policy:AI_POLICY,taskName:AI_TASK_NAME,task:AI_TASK,latencyMs:0,candidateCount:candidates.length,candidates:candidatePairs,selectedPair:fallback.pair,reason}).catch(()=>{});
      return attachNemotron(fallback,{status:"AI_BINDING_UNAVAILABLE",reason,latencyMs:0,recommendedPair:fallback.pair,invoked:false});
    }

    const schema={type:"object",additionalProperties:false,properties:{selectedPair:{type:"string",enum:candidatePairs},reason:{type:"string",maxLength:240}},required:["selectedPair","reason"]};
    const prompt={
      messages:[
        {role:"system",content:"You are Nemotron AGE — Administrating Great Expectations — inside the CTE Capitalization Model. Your mandate is Capitalization and Account Value Proliferation. Capital is not strategically held idle while FX markets are open. Existing positions are occupied capital and must continuously justify their expected productivity. Qualified same-pair reversals do not inherit capital automatically; reversals and qualified alternative-pair deployments compete on the same Great Expectation scale. III remains signal-qualification authority. Use the supplied AGE Great Expectation index and expected-pips-per-hour estimate together with MTF, optimizer, MAS/IM, regime, Event Angle, fit, drawdown, account margin and open-position opportunity cost. Operate strictly from active saved trading controls. Select exactly one supplied qualified deployment candidate. The certified engine—not you—performs any close, reversal, reallocation, sizing, risk control or order submission. Never invent a signal or pair. Friday weekend policy is flat from 3:57 PM America/Chicago until Sunday market reopening. Return only the requested structured result."},
        {role:"user",content:JSON.stringify({task:"AGE_SELECT_BEST_QUALIFIED_DEPLOYMENT",expectationVersion:AGE_EXPECTATION_VERSION,taskName:AI_TASK_NAME,taskDefinition:AI_TASK,ageMandate:AGE_MANDATE,mandate:"CAPITALIZATION_AND_ACCOUNT_VALUE_PROLIFERATION",capitalPolicy:"DEPLOYED_IN_QUALIFIED_POSITIVE_EXPECTATION_OR_WEEKEND_FLAT",controls:modelContext?.controls||null,selectedPairs:modelContext?.selectedPairs||[],account:modelContext?.account||null,openPositions:modelContext?.openPositions||[],forecasts:modelContext?.forecasts||[],mtfForecasts:modelContext?.mtfForecasts||[],candidates:table})}
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
        await this.recordAiDecision({invoked:true,status:"AI_INVALID_SELECTION",model:AI_MODEL,policy:AI_POLICY,taskName:AI_TASK_NAME,task:AI_TASK,latencyMs,candidateCount:candidates.length,candidates:candidatePairs,selectedPair:fallback.pair,reason}).catch(()=>{});
        return attachNemotron(fallback,{status:"AI_INVALID_SELECTION",reason,latencyMs,recommendedPair:selectedPair||fallback.pair,invoked:true});
      }
      const reason=String(parsed?.reason||"Nemotron selected the candidate from the eligible new-entry set").slice(0,240);
      await this.recordAiDecision({invoked:true,status:"SELECTED",model:AI_MODEL,policy:AI_POLICY,taskName:AI_TASK_NAME,task:AI_TASK,latencyMs,candidateCount:candidates.length,candidates:candidatePairs,selectedPair,reason}).catch(()=>{});
      return attachNemotron(selected,{status:"SELECTED",reason,latencyMs,recommendedPair:selectedPair,invoked:true});
    }catch(error){
      const latencyMs=Date.now()-started,status=error?.code==="AI_TIMEOUT"?"AI_TIMEOUT":"AI_ERROR",reason=`${status}: ${String(error?.message||error).slice(0,180)}; deterministic ranking used`;
      await this.recordAiDecision({invoked:true,status,model:AI_MODEL,policy:AI_POLICY,taskName:AI_TASK_NAME,task:AI_TASK,latencyMs,candidateCount:candidates.length,candidates:candidatePairs,selectedPair:fallback.pair,reason}).catch(()=>{});
      return attachNemotron(fallback,{status,reason,latencyMs,recommendedPair:fallback.pair,invoked:true});
    }
  }

  async tick(){const state=(await this.ctx.storage.get("state"))||{};if(state.qualificationVersion!==S.VERSION){Object.assign(state,{events:{},directions:null,requirements:null,lastCandle:null,mtf:{},mtfDecisionDirections:{},mtfRotation:0,initialized:false,calculationVersion:H.VERSION,qualificationVersion:S.VERSION});await this.ctx.storage.put("state",state);await this.write({type:"QUALIFICATION_MIGRATION",calculationVersion:H.VERSION,qualificationVersion:S.VERSION,message:"All strategies now qualify one canonical Asset/Inverse crossing clock"},false);}return super.tick();}
  async status(){const status=await super.status(),records=await loadOptimizerRecords(this.ctx.storage),telemetry=(await this.ctx.storage.get("aiTelemetry"))||{},engineState=(await this.ctx.storage.get("state"))||{};return{...status,optimizerVersion:OPTIMIZER_VERSION,optimizerCoverage:Object.keys(records).length,optimizerTotal:PAIRS.length*10,calculationVersion:H.VERSION,qualificationVersion:S.VERSION,crossingContract:"ONE_RAW_ASSET_RECOVERED_INVERSE_CROSSING_CLOCK",strategyContract:"POST_CROSS_STRATEGY_QUALIFICATION",ai:{model:AI_MODEL,binding:Boolean(this.env.AI),policy:AI_POLICY,taskName:AI_TASK_NAME,task:AI_TASK,ageMandate:AGE_MANDATE,expectationVersion:AGE_EXPECTATION_VERSION,mandate:"CAPITALIZATION_AND_ACCOUNT_VALUE_PROLIFERATION",capitalPolicy:"DEPLOYED_IN_QUALIFIED_POSITIVE_EXPECTATION_OR_WEEKEND_FLAT",modelContextAt:engineState.modelContext?.receivedAt||null,...telemetry}};}
  async computeConfiguration(value){return computePlatformConfiguration(this,value);}
  async optimizeNext(state,token){return optimizePlatformNext(this,state,token);}
  async scan(token,config,timeframe=config.timeframe,optimizer={}){const rows=await scanPlatform(this,token,config,timeframe,optimizer);return rows.filter(row=>row.event?.qualified===true&&Boolean(row.event?.startTime));}
  mtfCandidates(state,rows,lastCandle,fingerprint){const byPair=new Map(rows.filter(row=>row.event?.qualified===true&&row.event?.startTime===lastCandle).map(row=>[row.pair,row])),timeframes=["W","D","H4","H1","M30","M15","M5","M1","S30","S5"];return[...byPair.values()].map(row=>{let score=0,count=0;for(const timeframe of timeframes){const snapshot=state.mtf?.[timeframe];if(snapshot?.fingerprint!==fingerprint)continue;const direction=Number(snapshot.directions?.[row.pair]||0);if(direction){score+=direction;count++;}}const consensus=Math.sign(score);return consensus&&count>=3&&consensus===row.event.direction?{...row,confidence:Math.abs(score)/count,count}:null;}).filter(Boolean).sort((left,right)=>right.confidence-left.confidence||right.count-left.count);}
}
