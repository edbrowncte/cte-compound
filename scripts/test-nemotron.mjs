import assert from "node:assert/strict";
import {HtlEngine,__nemotronTest} from "../src/engine-nemotron-base.js";

class Storage{
  constructor(){this.map=new Map();}
  async get(key){
    if(Array.isArray(key))return new Map(key.map(item=>[item,this.map.get(item)]));
    return this.map.get(key);
  }
  async put(key,value){this.map.set(key,value);}
  async delete(key){
    if(Array.isArray(key)){for(const item of key)this.map.delete(item);return;}
    this.map.delete(key);
  }
  async getAlarm(){return null;}
  async deleteAlarm(){}
}

const candidate=(pair,confidence,count,score=1)=>({
  pair,
  confidence,
  count,
  event:{id:`${pair}-event`,direction:pair==="GBP_USD"?-1:1,bars:4,openPrice:1.1},
  configuration:{primary:{length:20,filter:.5,score,trades:12,net:8,maxDrawdown:2,winRate:.58},confirmation:null}
});
const candidates=[candidate("EUR_USD",.71,5,.8),candidate("GBP_USD",.74,6,1.4),candidate("AUD_USD",.63,4,.6)];

assert.equal(__nemotronTest.AI_MODEL,"@cf/nvidia/nemotron-3-120b-a12b");
assert.equal(__nemotronTest.AI_POLICY,"CAPITALIZATION_NEW_ENTRY_DISCRETION");
assert.equal(__nemotronTest.deterministicCandidate(candidates).pair,"GBP_USD");
assert.deepEqual(__nemotronTest.parseAiResponse({response:{selectedPair:"EUR_USD",reason:"ok"}}),{selectedPair:"EUR_USD",reason:"ok"});
assert.deepEqual(__nemotronTest.parseAiResponse({response:'{"selectedPair":"AUD_USD","reason":"json"}'}),{selectedPair:"AUD_USD",reason:"json"});

{
  const storage=new Storage();
  let aiCalls=0;
  const engine=new HtlEngine({storage},{AI:{run:async()=>{aiCalls++;return{response:{selectedPair:"GBP_USD",reason:"stronger MTF and optimizer evidence"}};}}});
  const ledger=[];engine.write=async(entry,sendNotification=true)=>ledger.push({entry,sendNotification});
  const selected=await engine.choose([candidates[0]]);
  assert.equal(selected.pair,"EUR_USD");
  assert.equal(aiCalls,0,"single eligible candidate must not invoke Workers AI");
  assert.equal(await storage.get("aiTelemetry"),undefined,"single candidate needs no adjudication telemetry");
}

{
  const storage=new Storage();
  await storage.put("state",{modelContext:{receivedAt:new Date().toISOString(),mandate:"CAPITALIZATION_AND_ACCOUNT_VALUE_PROLIFERATION",account:{nav:10000,marginAvailable:8000},openPositions:[{pair:"USD_JPY",direction:"BUY",units:1000,unrealizedPL:-4}],forecasts:[{key:"A",pair:"EUR_USD",direction:"BUY",confidence:.71}],slots:[{pair:"EUR_USD",type:"TREND_FOLLOWING",regime:"TREND_ALIGNED",strength:.91,mas:.05,im:.55,ratio:11,eventAngleZ:2.1,convexity:.4,r2:.72,pipsPerHour:3.2}]}});
  let aiCalls=0,modelSeen=null,inputSeen=null;
  const engine=new HtlEngine({storage},{AI:{run:async(model,input)=>{aiCalls++;modelSeen=model;inputSeen=input;return{response:{selectedPair:"EUR_USD",reason:"best risk-adjusted optimizer profile"}};}}});
  const ledger=[];engine.write=async(entry,sendNotification=true)=>ledger.push({entry,sendNotification});
  const selected=await engine.choose(candidates);
  assert.equal(aiCalls,1,"multiple new-entry candidates must invoke Nemotron exactly once");
  assert.equal(modelSeen,__nemotronTest.AI_MODEL);
  assert.equal(inputSeen.temperature,0);
  assert.equal(inputSeen.response_format.type,"json_schema");
  const modelPayload=JSON.parse(inputSeen.messages[1].content);
  assert.equal(modelPayload.mandate,"CAPITALIZATION_AND_ACCOUNT_VALUE_PROLIFERATION");
  assert.equal(modelPayload.account.nav,10000);
  assert.equal(modelPayload.candidates[0].capitalizationReport.regime,"TREND_ALIGNED");
  assert.deepEqual(inputSeen.response_format.json_schema.properties.selectedPair.enum,["EUR_USD","GBP_USD","AUD_USD"]);
  assert.equal(selected.pair,"EUR_USD");
  assert.equal(selected.Nemotron.selected,true);
  assert.equal(selected.Nemotron.status,"SELECTED");
  assert.equal(selected.Nemotron.policy,__nemotronTest.AI_POLICY);
  const telemetry=await storage.get("aiTelemetry");
  assert.equal(telemetry.totalInvocations,1);
  assert.equal(telemetry.totalSelections,1);
  assert.equal(telemetry.totalFallbacks,0);
  assert.equal(telemetry.last.selectedPair,"EUR_USD");
  assert.equal(ledger.at(-1).entry.type,"AI_DECISION");
  assert.equal(ledger.at(-1).sendNotification,false);
  const status=await engine.status();
  assert.equal(status.ai.model,__nemotronTest.AI_MODEL);
  assert.equal(status.ai.binding,true);
  assert.equal(status.ai.policy,__nemotronTest.AI_POLICY);
  assert.equal(status.ai.totalInvocations,1);
}

{
  const storage=new Storage();
  const engine=new HtlEngine({storage},{AI:{run:async()=>({response:{selectedPair:"NZD_CAD",reason:"not eligible"}})}});
  const ledger=[];engine.write=async(entry,sendNotification=true)=>ledger.push({entry,sendNotification});
  const selected=await engine.choose(candidates);
  assert.equal(selected.pair,"GBP_USD","invalid model selection must fall back deterministically");
  assert.equal(selected.Nemotron.status,"AI_INVALID_SELECTION");
  assert.equal(selected.Nemotron.selected,false);
  const telemetry=await storage.get("aiTelemetry");
  assert.equal(telemetry.totalInvocations,1);
  assert.equal(telemetry.totalSelections,0);
  assert.equal(telemetry.totalFallbacks,1);
  assert.equal(telemetry.last.status,"AI_INVALID_SELECTION");
}

{
  const storage=new Storage();
  const engine=new HtlEngine({storage},{AI:{run:async()=>{throw new Error("simulated Workers AI outage");}}});
  const ledger=[];engine.write=async(entry,sendNotification=true)=>ledger.push({entry,sendNotification});
  const selected=await engine.choose(candidates);
  assert.equal(selected.pair,"GBP_USD");
  assert.equal(selected.Nemotron.status,"AI_ERROR");
  assert.equal((await storage.get("aiTelemetry")).last.status,"AI_ERROR");
}

{
  const storage=new Storage();
  const engine=new HtlEngine({storage},{});
  const ledger=[];engine.write=async(entry,sendNotification=true)=>ledger.push({entry,sendNotification});
  const selected=await engine.choose(candidates);
  assert.equal(selected.pair,"GBP_USD");
  assert.equal(selected.Nemotron.status,"AI_BINDING_UNAVAILABLE");
  assert.equal(selected.Nemotron.invoked,false);
  const telemetry=await storage.get("aiTelemetry");
  assert.equal(telemetry.totalInvocations,0);
  assert.equal(telemetry.totalFallbacks,1);
  assert.equal(telemetry.last.status,"AI_BINDING_UNAVAILABLE");
  const status=await engine.status();
  assert.equal(status.ai.binding,false);
}

console.log("Observable Nemotron capitalization-model pair discretion, structured selection, unified context, telemetry, and deterministic fallback verified.");
