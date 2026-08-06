import { HtlEngine as HorizonEngine } from "./engine-horizon-base.js";
import { __platformTest, computeConfiguration as computePlatformConfiguration, optimizeNext as optimizePlatformNext, scan as scanPlatform, currentOptimizer, OPTIMIZER_VERSION, PAIRS } from "./horizon-platform-engine.js";
import "../public/htl-horizon-contract.js";
import "../public/horizon-strategy-contract.js";

const H=globalThis.CTE_HORIZON_HTL,S=globalThis.CTE_HORIZON_STRATEGIES;
const AI_MODEL="@cf/nvidia/nemotron-3-120b-a12b";
const AI_ORCHESTRATION_VERSION="NEMOTRON_CANDIDATE_TOOL@2.0.0";
const response=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{"Content-Type":"application/json","Cache-Control":"no-store"}});
const normalizePair=value=>String(value||"").trim().toUpperCase().replace(/[\s\/-]+/g,"_");

function candidateTable(candidates){
  return candidates.map(row=>({
    pair:row.pair,
    direction:row.event.direction>0?"BUY":"SELL",
    eventId:row.event.id,
    bars:row.event.bars,
    openPrice:row.event.openPrice,
    confidence:Number.isFinite(row.confidence)?row.confidence:null,
    mtfCount:Number.isFinite(row.count)?row.count:null,
    optimizerScore:row.configuration?.primary?.score??null,
    optimizerTrades:row.configuration?.primary?.trades??null,
    optimizerNet:row.configuration?.primary?.net??null,
    optimizerDrawdown:row.configuration?.primary?.maxDrawdown??null,
    optimizerWinRate:row.configuration?.primary?.winRate??null,
    configuration:row.configuration||null,
  }));
}

function parseArguments(value){
  if(value&&typeof value==="object")return value;
  if(typeof value!=="string")return null;
  try{return JSON.parse(value);}catch{return null;}
}

function extractNemotronSelection(result){
  const directCall=Array.isArray(result?.tool_calls)?result.tool_calls[0]:null;
  const message=result?.choices?.[0]?.message||null;
  const messageCall=Array.isArray(message?.tool_calls)?message.tool_calls[0]:null;
  const legacyCall=message?.function_call||null;
  const call=directCall||messageCall||legacyCall;
  if(call){
    const name=call.name||call.function?.name||null;
    const args=parseArguments(call.arguments??call.function?.arguments);
    return{name,args,shape:directCall?"tool_calls":messageCall?"choices.tool_calls":"choices.function_call"};
  }
  const candidates=[result?.response,message?.parsed,message?.content,result?.result];
  for(const value of candidates){
    const args=parseArguments(value)||((value&&typeof value==="object")?value:null);
    if(args?.pair)return{name:"selectCandidate",args,shape:value===result?.response?"response":value===message?.parsed?"choices.parsed":value===message?.content?"choices.content":"result"};
  }
  return{name:null,args:null,shape:"unrecognized"};
}

export { __platformTest as __horizonTest };
export const __nemotronTest=Object.freeze({normalizePair,candidateTable,extractNemotronSelection,AI_ORCHESTRATION_VERSION});

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

  async ensureAiTelemetry(){
    const prior=(await this.ctx.storage.get("aiTelemetry"))||{};
    if(prior.integrationVersion===AI_ORCHESTRATION_VERSION)return prior;
    const now=new Date().toISOString(),telemetry={
      integrationVersion:AI_ORCHESTRATION_VERSION,
      totalInvocations:0,totalSelections:0,totalFallbacks:0,
      daily:{date:now.slice(0,10),invocations:0,selections:0,fallbacks:0},
      last:{status:"INTEGRATION_UPGRADED",userStatus:"Ready",time:now,latencyMs:0,candidateCount:0,candidates:[],selectedPair:null,reason:"Structured Nemotron candidate selection enabled"},
      archivedPrior:{integrationVersion:prior.integrationVersion||"LEGACY_FREEFORM_JSON",totalInvocations:Number(prior.totalInvocations||0),totalSelections:Number(prior.totalSelections||0),totalFallbacks:Number(prior.totalFallbacks||0),last:prior.last||null},
    };
    await this.ctx.storage.put("aiTelemetry",telemetry);
    return telemetry;
  }

  async recordAiDecision(decision){
    const now=new Date().toISOString(),day=now.slice(0,10),prior=await this.ensureAiTelemetry(),daily=prior.daily?.date===day?{...prior.daily}:{date:day,invocations:0,selections:0,fallbacks:0},invoked=Boolean(decision.invoked),selected=decision.status==="SELECTED",fallback=decision.status!=="SELECTED";
    if(invoked)daily.invocations++;
    if(selected)daily.selections++;
    else if(fallback)daily.fallbacks++;
    const telemetry={...prior,integrationVersion:AI_ORCHESTRATION_VERSION,totalInvocations:Number(prior.totalInvocations||0)+(invoked?1:0),totalSelections:Number(prior.totalSelections||0)+(selected?1:0),totalFallbacks:Number(prior.totalFallbacks||0)+(fallback?1:0),daily,last:{...decision,userStatus:selected?"Working":decision.status==="AI_BINDING_UNAVAILABLE"?"Unavailable":"Fallback used",time:now}};
    await this.ctx.storage.put("aiTelemetry",telemetry);
    await this.write({type:selected?"AI_DECISION":"AI_FALLBACK",pair:decision.selectedPair||null,aiStatus:decision.status,aiResponseShape:decision.responseShape||null,aiReturnedPair:decision.returnedPair||null,message:`Nemotron · ${selected?"selection accepted":"fallback used"} · ${decision.candidateCount} candidates · ${decision.latencyMs} ms${decision.reason?` · ${decision.reason}`:""}`},false);
    return telemetry;
  }

  async choose(candidates){
    if(candidates.length===1)return candidates[0];
    const table=candidateTable(candidates),fallback=candidates[0],pairs=table.map(item=>item.pair),started=Date.now();
    if(!this.env.AI){await this.recordAiDecision({invoked:false,status:"AI_BINDING_UNAVAILABLE",latencyMs:0,candidateCount:candidates.length,candidates:pairs,selectedPair:fallback.pair,reason:"Deterministic ranking used because the Workers AI binding is unavailable"}).catch(()=>{});return fallback;}
    try{
      const request={
        messages:[
          {role:"system",content:"Choose exactly one already-eligible trading candidate. Do not create a pair, alter direction, or reject all candidates. Use the selectCandidate tool exactly once. Rank by causal optimizer evidence, drawdown, sample size, multi-timeframe confidence, and event recency."},
          {role:"user",content:JSON.stringify(table)},
        ],
        tools:[{name:"selectCandidate",description:"Return the single eligible currency pair selected by Nemotron.",parameters:{type:"object",additionalProperties:false,properties:{pair:{type:"string",enum:pairs},reason:{type:"string",maxLength:240}},required:["pair","reason"]}}],
        tool_choice:"required",parallel_tool_calls:false,temperature:0,max_completion_tokens:220,
      };
      const result=await this.env.AI.run(AI_MODEL,request),extracted=extractNemotronSelection(result),returnedPair=normalizePair(extracted.args?.pair),selected=candidates.find(row=>normalizePair(row.pair)===returnedPair),latencyMs=Date.now()-started;
      if(!selected){await this.recordAiDecision({invoked:true,status:"INVALID_RESPONSE_FALLBACK",latencyMs,candidateCount:candidates.length,candidates:pairs,selectedPair:fallback.pair,returnedPair:returnedPair||null,responseShape:extracted.shape,reason:`Nemotron did not return one eligible pair${returnedPair?` (${returnedPair})`:""}; deterministic ranking used`}).catch(()=>{});return fallback;}
      await this.recordAiDecision({invoked:true,status:"SELECTED",latencyMs,candidateCount:candidates.length,candidates:pairs,selectedPair:selected.pair,returnedPair,responseShape:extracted.shape,reason:String(extracted.args?.reason||"Eligible candidate selected").slice(0,240)}).catch(()=>{});return selected;
    }catch(error){await this.recordAiDecision({invoked:true,status:"ERROR_FALLBACK",latencyMs:Date.now()-started,candidateCount:candidates.length,candidates:pairs,selectedPair:fallback.pair,responseShape:"exception",reason:String(error?.message||"Workers AI request failed").slice(0,240)}).catch(()=>{});return fallback;}
  }

  async tick(){const state=(await this.ctx.storage.get("state"))||{};if(state.qualificationVersion!==S.VERSION){Object.assign(state,{events:{},directions:null,requirements:null,lastCandle:null,mtf:{},mtfDecisionDirections:{},mtfRotation:0,initialized:false,calculationVersion:H.VERSION,qualificationVersion:S.VERSION});await this.ctx.storage.put("state",state);await this.write({type:"QUALIFICATION_MIGRATION",calculationVersion:H.VERSION,qualificationVersion:S.VERSION,message:"All strategies now qualify one canonical Asset/Inverse crossing clock"},false);}return super.tick();}
  async status(){const status=await super.status(),records=currentOptimizer(await this.ctx.storage.get("optimizer")),ai=await this.ensureAiTelemetry();return{...status,optimizerVersion:OPTIMIZER_VERSION,optimizerCoverage:Object.keys(records).length,optimizerTotal:PAIRS.length*10,calculationVersion:H.VERSION,qualificationVersion:S.VERSION,crossingContract:"ONE_RAW_ASSET_RECOVERED_INVERSE_CROSSING_CLOCK",strategyContract:"POST_CROSS_STRATEGY_QUALIFICATION",ai:{model:AI_MODEL,binding:Boolean(this.env.AI),...ai}};}
  async computeConfiguration(value){return computePlatformConfiguration(this,value);}
  async optimizeNext(state,token){return optimizePlatformNext(this,state,token);}
  async scan(token,config,timeframe=config.timeframe,optimizer={}){const rows=await scanPlatform(this,token,config,timeframe,optimizer);return rows.filter(row=>row.event?.qualified===true&&Boolean(row.event?.startTime));}
  mtfCandidates(state,rows,lastCandle,fingerprint){const byPair=new Map(rows.filter(row=>row.event?.qualified===true&&row.event?.startTime===lastCandle).map(row=>[row.pair,row])),timeframes=["W","D","H4","H1","M30","M15","M5","M1","S30","S5"];return[...byPair.values()].map(row=>{let score=0,count=0;for(const timeframe of timeframes){const snapshot=state.mtf?.[timeframe];if(snapshot?.fingerprint!==fingerprint)continue;const direction=Number(snapshot.directions?.[row.pair]||0);if(direction){score+=direction;count++;}}const consensus=Math.sign(score);return consensus&&count>=3&&consensus===row.event.direction?{...row,confidence:Math.abs(score)/count,count}:null;}).filter(Boolean).sort((left,right)=>right.confidence-left.confidence||right.count-left.count);}
}