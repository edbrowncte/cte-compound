import assert from "node:assert/strict";
import {HtlEngine,__nemotronTest} from "../src/engine-nemotron-base.js";

class Storage{
  constructor(){this.map=new Map();}
  async get(key){if(Array.isArray(key))return new Map(key.map(item=>[item,this.map.get(item)]));return this.map.get(key);}
  async put(key,value){this.map.set(key,value);}
  async delete(key){if(Array.isArray(key)){for(const item of key)this.map.delete(item);return;}this.map.delete(key);}
  async list(){return new Map();}
  async getAlarm(){return null;}
  async deleteAlarm(){}
}

const candidate=(pair,confidence,count,score=1,type="NEW_ENTRY")=>({pair,confidence,count,event:{id:`${pair}-event`,direction:pair==="GBP_USD"?-1:1,bars:4,openPrice:1.1},configuration:{primary:{length:20,filter:.5,score,trades:12,net:8,maxDrawdown:2,winRate:.58},confirmation:null},AGE:{candidateType:type,greatExpectation:{pair,direction:pair==="GBP_USD"?-1:1,index:pair==="GBP_USD"?78:pair==="EUR_USD"?72:61,expectedPipsPerHour:pair==="GBP_USD"?12:8}}});
const candidates=[candidate("EUR_USD",.71,5,.8),candidate("GBP_USD",.74,6,1.4,"REVERSAL"),candidate("AUD_USD",.63,4,.6)];

assert.equal(__nemotronTest.AI_MODEL,"@cf/nvidia/nemotron-3-120b-a12b");
assert.equal(__nemotronTest.AI_POLICY,"AGE_CAPITAL_REALLOCATION_DISCRETION");
assert.equal(__nemotronTest.AI_ORCHESTRATION_VERSION,"NEMOTRON_CANDIDATE_TOOL@4.0.0");
assert.equal(__nemotronTest.deterministicCandidate(candidates).pair,"GBP_USD");
assert.equal(__nemotronTest.normalizePair("eur/usd"),"EUR_USD");
assert.equal(__nemotronTest.extractNemotronSelection({tool_calls:[{name:"selectCandidate",arguments:{pair:"EUR/USD",reason:"best"}}]}).shape,"tool_calls");
assert.equal(__nemotronTest.extractNemotronSelection({choices:[{message:{tool_calls:[{function:{name:"selectCandidate",arguments:'{"pair":"GBP_USD","reason":"best GE"}'}}]}}]}).shape,"choices.tool_calls");
assert.deepEqual(__nemotronTest.parseAiResponse({response:{selectedPair:"AUD_USD",reason:"compat"}}),{selectedPair:"AUD_USD",reason:"compat"});

{
  const storage=new Storage();let aiCalls=0;const engine=new HtlEngine({storage},{AI:{run:async()=>{aiCalls++;return{tool_calls:[{name:"selectCandidate",arguments:{pair:"EUR_USD",reason:"unused"}}]};}}});engine.write=async()=>{};const selected=await engine.choose([candidates[0]]);assert.equal(selected.pair,"EUR_USD");assert.equal(aiCalls,0,"single qualified deployment candidate must not invoke Workers AI");assert.equal(await storage.get("aiTelemetry"),undefined);
}

{
  const storage=new Storage();await storage.put("state",{modelContext:{receivedAt:new Date().toISOString(),mandate:"CAPITALIZATION_AND_ACCOUNT_VALUE_PROLIFERATION",account:{nav:10000,marginAvailable:8000},openPositions:[{pair:"USD_JPY",direction:"BUY",units:1000,unrealizedPL:-4}],forecasts:[{key:"A",pair:"EUR_USD",direction:"BUY",confidence:.71}],slots:[{pair:"EUR_USD",type:"TREND_FOLLOWING",regime:"TREND_ALIGNED",strength:.91,mas:.05,im:.55,ratio:11,eventAngleZ:2.1,convexity:.4,r2:.72,pipsPerHour:3.2}]}});let aiCalls=0,modelSeen=null,inputSeen=null;const engine=new HtlEngine({storage},{AI:{run:async(model,input)=>{aiCalls++;modelSeen=model;inputSeen=input;return{tool_calls:[{name:"selectCandidate",arguments:{pair:"eur/usd",reason:"best qualified deployment after AGE comparison"}}]};}}});const ledger=[];engine.write=async(entry,sendNotification=true)=>ledger.push({entry,sendNotification});const selected=await engine.choose(candidates);assert.equal(aiCalls,1,"multiple qualified deployment candidates must invoke Nemotron exactly once");assert.equal(modelSeen,__nemotronTest.AI_MODEL);assert.equal(inputSeen.temperature,0);assert.equal(inputSeen.tool_choice,"required");assert.equal(inputSeen.parallel_tool_calls,false);assert.equal("response_format" in inputSeen,false,"Nemotron selection must use the supported required function tool, not response_format JSON mode");assert.equal(inputSeen.tools[0].type,"function");assert.equal(inputSeen.tools[0].function.name,"selectCandidate");assert.deepEqual(inputSeen.tools[0].function.parameters.properties.pair.enum,["EUR_USD","GBP_USD","AUD_USD"]);const modelPayload=JSON.parse(inputSeen.messages[1].content);assert.equal(modelPayload.task,"AGE_SELECT_BEST_QUALIFIED_DEPLOYMENT");assert.equal(modelPayload.mandate,"CAPITALIZATION_AND_ACCOUNT_VALUE_PROLIFERATION");assert.equal(modelPayload.account.nav,10000);assert.equal(modelPayload.candidates[1].candidateType,"REVERSAL");assert.equal(modelPayload.candidates[1].greatExpectation.index,78);assert.equal(selected.pair,"EUR_USD");assert.equal(selected.Nemotron.selected,true);assert.equal(selected.Nemotron.status,"SELECTED");assert.equal(selected.Nemotron.responseShape,"tool_calls");assert.equal(selected.Nemotron.returnedPair,"EUR_USD");const telemetry=await storage.get("aiTelemetry");assert.equal(telemetry.totalInvocations,1);assert.equal(telemetry.totalSelections,1);assert.equal(telemetry.totalFallbacks,0);assert.equal(telemetry.last.selectedPair,"EUR_USD");assert.equal(telemetry.last.returnedPair,"EUR_USD");assert.equal(telemetry.last.responseShape,"tool_calls");assert.equal(ledger.at(-1).entry.type,"AI_DECISION");assert.equal(ledger.at(-1).sendNotification,false);
}

{
  const storage=new Storage();const engine=new HtlEngine({storage},{AI:{run:async()=>({choices:[{message:{tool_calls:[{function:{name:"selectCandidate",arguments:'{"pair":"GBP-USD","reason":"highest expectation"}'}}]}}]})}});engine.write=async()=>{};const selected=await engine.choose(candidates);assert.equal(selected.pair,"GBP_USD");assert.equal(selected.Nemotron.responseShape,"choices.tool_calls");assert.equal(selected.Nemotron.returnedPair,"GBP_USD");
}

{
  const storage=new Storage();const engine=new HtlEngine({storage},{AI:{run:async()=>({tool_calls:[{name:"selectCandidate",arguments:{pair:"NZD_CAD",reason:"not eligible"}}]})}});engine.write=async()=>{};const selected=await engine.choose(candidates);assert.equal(selected.pair,"GBP_USD","invalid model selection must fall back to highest Great Expectation");assert.equal(selected.Nemotron.status,"AI_INVALID_SELECTION");assert.equal(selected.Nemotron.selected,false);const telemetry=await storage.get("aiTelemetry");assert.equal(telemetry.totalFallbacks,1);assert.equal(telemetry.last.returnedPair,"NZD_CAD");assert.equal(telemetry.last.responseShape,"tool_calls");
}

{
  const storage=new Storage();const engine=new HtlEngine({storage},{AI:{run:async()=>{throw new Error("simulated Workers AI outage");}}});engine.write=async()=>{};const selected=await engine.choose(candidates);assert.equal(selected.pair,"GBP_USD");assert.equal(selected.Nemotron.status,"AI_ERROR");assert.equal((await storage.get("aiTelemetry")).last.status,"AI_ERROR");
}

{
  const storage=new Storage();const engine=new HtlEngine({storage},{});engine.write=async()=>{};const selected=await engine.choose(candidates);assert.equal(selected.pair,"GBP_USD");assert.equal(selected.Nemotron.status,"AI_BINDING_UNAVAILABLE");assert.equal(selected.Nemotron.invoked,false);const telemetry=await storage.get("aiTelemetry");assert.equal(telemetry.totalInvocations,0);assert.equal(telemetry.totalFallbacks,1);assert.equal(telemetry.last.status,"AI_BINDING_UNAVAILABLE");const status=await engine.status();assert.equal(status.ai.binding,false);
}

console.log("Nemotron AGE required function-tool selection, response-shape parsing, normalization, telemetry, and deterministic fallback verified.");
