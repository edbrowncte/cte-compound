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
    if(path==="/chat"&&request.method==="GET"){
      const history=(await this.ctx.storage.get("chat_history"))||[];
      return response({history});
    }
    if(path==="/chat"&&request.method==="DELETE"){
      await this.ctx.storage.delete("chat_history");
      return response({ok:true});
    }
    if(path==="/chat"&&request.method==="POST"){
      try{
        const body=await request.json().catch(()=>({})),userMessage=String(body.message||"").trim(),playVoice=Boolean(body.voice);
        if(!userMessage)return response({error:"Empty message"},400);
        const history=(await this.ctx.storage.get("chat_history"))||[];
        history.push({role:"user",content:userMessage});
        const maxHistoryWindow=12,historyWindow=history.slice(-maxHistoryWindow);
        const systemPrompt={
          role:"system",
          content:"You are Nemotron 3 Super, an advanced Personal Copilot, Trading Assistant, and Personal Agent for Criterion Echelon HTL Asset Analytical Compound (cte-compound). You help the user optimize their platform's performance and Oanda Account's bottom line. You have direct agentic access to system status, live account details, ledger logs, and optimizer configurations. Be concise, highly professional, analytical, and supportive of the user's entrepreneurial goals. Do not invent pair directions, status values, or configurations. If you perform an action (like updateEngineConfig), explain your choice clearly to the user."
        };
        const messages=[systemPrompt,...historyWindow];
        if(!this.env.AI){
          const reply="I am currently running in fallback mode because the Workers AI binding is unavailable.";
          history.push({role:"assistant",content:reply});
          await this.ctx.storage.put("chat_history",history);
          return response({content:reply,audio:null});
        }
        const loopResult=await this.runChatLoop(messages);
        history.push({role:"assistant",content:loopResult.content});
        await this.ctx.storage.put("chat_history",history);
        let audioBase64=null;
        if(playVoice){audioBase64=await this.synthesizeSpeech(loopResult.content);}
        return response({content:loopResult.content,audio:audioBase64});
      }catch(err){
        return response({error:String(err?.message||err)},500);
      }
    }
    if(path==="/optimizer"&&request.method==="GET")return response({version:OPTIMIZER_VERSION,calculationVersion:H.VERSION,qualificationVersion:S.VERSION,records:currentOptimizer(await this.ctx.storage.get("optimizer"))});
    if(path==="/compute"&&request.method==="POST"){try{return response(await this.computeConfiguration(await request.json()));}catch(error){return response({error:String(error?.message||error),stage:error?.stage||"compute"},Number(error?.status)||500);}}
    if(path==="/manual-trade-action"&&request.method==="POST"){
      const entry=await request.json().catch(()=>null),allowed=new Set(["MANUAL_TRADE_CLOSE","MANUAL_TRADE_MODIFY","MANUAL_CANDIDATE_ORDER"]);
      if(!entry||!allowed.has(entry.type))return response({error:"Invalid manual trade action."},400);
      await this.write({...entry,calculationVersion:entry.calculationVersion||H.VERSION,qualificationVersion:entry.qualificationVersion||S.VERSION},false);return response({ok:true});
    }
    return super.fetch(request);
  }

  async runChatLoop(messages){
    const maxIterations=5,tools=[
      {
        type:"function",
        function:{
          name:"getSystemStatus",
          description:"Fetch positions, configurations, pending reversals, and last completed candle status.",
          parameters:{type:"object",properties:{}}
        }
      },
      {
        type:"function",
        function:{
          name:"getTradingLedger",
          description:"Pull recent trade rows and ledger records.",
          parameters:{
            type:"object",
            properties:{
              limit:{type:"integer",description:"Number of ledger records to pull (between 1 and 100, defaults to 20)."}
            }
          }
        }
      },
      {
        type:"function",
        function:{
          name:"getOptimizerRecords",
          description:"Load server-managed causal optimizer records for pair/timeframe configurations.",
          parameters:{type:"object",properties:{}}
        }
      },
      {
        type:"function",
        function:{
          name:"getAccountSummary",
          description:"Retrieve Oanda live account summary details (NAV, balance, margin, available units).",
          parameters:{type:"object",properties:{}}
        }
      },
      {
        type:"function",
        function:{
          name:"updateEngineConfig",
          description:"Directly adjust strategy configurations (timeframe, strategy, length, filters, decisionMode).",
          parameters:{
            type:"object",
            properties:{
              strategy:{type:"string",enum:["ASSET","DARE_N","DARE","COMBO","NAI","APEX"]},
              timeframe:{type:"string",enum:["W","D","H4","H1","M30","M15","M5","M1","S30","S5"]},
              htlLength:{type:"integer",description:"HTL period length, between 3 and 200."},
              filter:{type:"number",description:"Filter size, between 0 and 10."},
              decisionMode:{type:"string",enum:["EVENT","MTF","COMBINED"]}
            },
            required:["strategy","timeframe","htlLength","filter","decisionMode"]
          }
        }
      }
    ];
    const currentMessages=[...messages];
    for(let iter=0;iter<maxIterations;iter++){
      const options={messages:currentMessages,tools,tool_choice:"auto",parallel_tool_calls:false,temperature:0.2};
      let result;
      if(this.env.AI_GATEWAY_URL){
        const response=await fetch(this.env.AI_GATEWAY_URL,{method:"POST",headers:{"Content-Type":"application/json","x-session-affinity":"cte-compound-session"},body:JSON.stringify(options)});
        result=await response.json();
      }else{
        result=await this.env.AI.run(AI_MODEL,options);
      }
      const message=result?.choices?.[0]?.message||result?.message||{};
      const content=message.content||result?.result||"";
      currentMessages.push({role:"assistant",content:content||null,tool_calls:message.tool_calls||result?.tool_calls||null});
      const toolCalls=message.tool_calls||result?.tool_calls||[];
      if(toolCalls.length===0)return{content,messages:currentMessages};
      for(const call of toolCalls){
        const name=call.name||call.function?.name;
        let args=call.arguments||call.function?.arguments||{};
        if(typeof args==="string"){try{args=JSON.parse(args);}catch{args={};}}
        let toolResult;
        try{
          if(name==="getSystemStatus"){
            toolResult=await this.status();
          }else if(name==="getTradingLedger"){
            const limit=Math.min(100,Math.max(1,Number(args.limit)||20)),index=(await this.ctx.storage.get("ledgerIndex"))||[],keys=index.slice(0,limit),records=keys.length?await this.ctx.storage.get(keys):new Map();
            toolResult=keys.map(k=>records.get(k)).filter(Boolean);
            if(!toolResult.length){toolResult=((await this.ctx.storage.get("ledger"))||[]).slice(0,limit);}
          }else if(name==="getOptimizerRecords"){
            const records=(await this.ctx.storage.get("optimizer"))||{},active=currentOptimizer(records);
            toolResult=Object.entries(active).map(([key,item])=>({dataset:key,stamp:item.stamp,computedAt:item.computedAt,config:item.config}));
          }else if(name==="getAccountSummary"){
            const token=String(this.env.OANDA_API_KEY||"").trim(),configured=String(this.env.OANDA_ACCOUNT_ID||"").trim();
            if(token&&configured){
              const accountsPayload=await fetch("https://api-fxtrade.oanda.com/v3/accounts",{headers:{Authorization:`Bearer ${token}`}}).then(r=>r.json());
              const accountId=(accountsPayload.accounts||[]).find(a=>a.id===configured)?.id||configured;
              const summaryPayload=await fetch(`https://api-fxtrade.oanda.com/v3/accounts/${accountId}/summary`,{headers:{Authorization:`Bearer ${token}`}}).then(r=>r.json());
              toolResult=summaryPayload.account||summaryPayload;
            }else{
              toolResult={error:"Oanda credentials unavailable"};
            }
          }else if(name==="updateEngineConfig"){
            const normalized={strategy:args.strategy,timeframe:args.timeframe,htlLength:args.htlLength,filter:args.filter,decisionMode:args.decisionMode};
            const updated=await this.configure(normalized);
            toolResult={ok:true,message:"Engine configuration updated successfully",updated};
          }else{
            toolResult={error:`Unknown tool: ${name}`};
          }
        }catch(err){
          toolResult={error:String(err?.message||err)};
        }
        currentMessages.push({role:"tool",name,tool_call_id:call.id||"call_local",content:JSON.stringify(toolResult)});
      }
    }
    const lastMsg=currentMessages.at(-1);
    return{content:lastMsg?.content||"Maximum tool-execution limit reached.",messages:currentMessages};
  }

  async synthesizeSpeech(text){
    if(!this.env.AI)return null;
    try{
      const maxTextLength=200;
      let cleanText=text.replace(/[*#`_]/g,"").trim();
      if(cleanText.length>maxTextLength){cleanText=`${cleanText.slice(0,maxTextLength)}...`;}
      const response=await this.env.AI.run("@cf/myshell-ai/melotts",{text:cleanText,speaker:"stella"});
      if(response instanceof Response){const buffer=await response.arrayBuffer();return btoa(String.fromCharCode(...new Uint8Array(buffer)));}
      if(response instanceof ArrayBuffer){return btoa(String.fromCharCode(...new Uint8Array(response)));}
      if(response&&typeof response==="object"){const buffer=response.audio||response;if(buffer instanceof ArrayBuffer||ArrayBuffer.isView(buffer)){const view=ArrayBuffer.isView(buffer)?buffer:new Uint8Array(buffer);return btoa(String.fromCharCode(...view));}}
      return null;
    }catch(err){
      console.error("Speech synthesis failed:",err);
      return null;
    }
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
        tools:[{
          type:"function",
          function:{
            name:"selectCandidate",
            description:"Return the single eligible currency pair selected by Nemotron.",
            parameters:{
              type:"object",
              properties:{
                pair:{type:"string",enum:pairs},
                reason:{type:"string",description:"Short textual reason (max 240 chars)."}
              },
              required:["pair","reason"]
            }
          }
        }],
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