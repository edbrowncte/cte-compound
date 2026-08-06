import assert from "node:assert/strict";
import { HtlEngine, __nemotronTest } from "../src/engine.js";

class Storage {
  constructor(seed={}){this.values=new Map(Object.entries(seed));}
  async get(key){return this.values.get(key);}
  async put(key,value){this.values.set(key,value);}
  async delete(key){if(Array.isArray(key))key.forEach(item=>this.values.delete(item));else this.values.delete(key);}
  async getAlarm(){return null;}
  async deleteAlarm(){}
}

const candidates=[
  {pair:"AUD_CAD",event:{direction:1,id:"aud-event",bars:1,openPrice:0.91},confidence:.84,count:5,configuration:{primary:{score:12,trades:41,net:72,maxDrawdown:9,winRate:.61}}},
  {pair:"NZD_CAD",event:{direction:-1,id:"nzd-event",bars:1,openPrice:.81},confidence:.78,count:4,configuration:{primary:{score:9,trades:37,net:60,maxDrawdown:11,winRate:.57}}},
];

assert.equal(__nemotronTest.normalizePair("AUD/CAD"),"AUD_CAD");
assert.equal(__nemotronTest.normalizePair("nzd-cad"),"NZD_CAD");
assert.equal(__nemotronTest.extractNemotronSelection({tool_calls:[{name:"selectCandidate",arguments:{pair:"AUD/CAD",reason:"Best evidence"}}]}).args.pair,"AUD/CAD");
assert.equal(__nemotronTest.extractNemotronSelection({choices:[{message:{tool_calls:[{function:{name:"selectCandidate",arguments:'{"pair":"NZD_CAD","reason":"Lower drawdown"}'}}]}}]}).args.pair,"NZD_CAD");

let requestPayload=null;
const storage=new Storage({aiTelemetry:{totalInvocations:66,totalSelections:0,totalFallbacks:66,daily:{date:"2026-08-04",invocations:66,selections:0,fallbacks:66},last:{status:"INVALID_RESPONSE_FALLBACK"}}});
const engine=new HtlEngine({storage},{AI:{async run(_model,payload){requestPayload=payload;return{tool_calls:[{name:"selectCandidate",arguments:{pair:"AUD/CAD",reason:"Higher confidence and lower drawdown"}}]};}}});
const selected=await engine.choose(candidates);
assert.equal(selected.pair,"AUD_CAD");
assert.equal(requestPayload.tool_choice,"required");
assert.equal(requestPayload.parallel_tool_calls,false);
assert.equal("response_format" in requestPayload,false,"unsupported free-form JSON mode must not be used");
assert.deepEqual(requestPayload.tools[0].function.parameters.properties.pair.enum,["AUD_CAD","NZD_CAD"]);
let telemetry=await storage.get("aiTelemetry");
assert.equal(telemetry.integrationVersion,__nemotronTest.AI_ORCHESTRATION_VERSION);
assert.equal(telemetry.totalInvocations,1);
assert.equal(telemetry.totalSelections,1);
assert.equal(telemetry.totalFallbacks,0);
assert.equal(telemetry.archivedPrior.totalInvocations,66);
assert.equal(telemetry.last.userStatus,"Working");
assert.equal(telemetry.last.returnedPair,"AUD_CAD");

const choicesStorage=new Storage();
const choicesEngine=new HtlEngine({storage:choicesStorage},{AI:{async run(){return{choices:[{message:{tool_calls:[{function:{name:"selectCandidate",arguments:'{"pair":"NZD_CAD","reason":"Best net result"}'}}]}}]};}}});
assert.equal((await choicesEngine.choose(candidates)).pair,"NZD_CAD");
assert.equal((await choicesStorage.get("aiTelemetry")).last.responseShape,"choices.tool_calls");

const invalidStorage=new Storage();
const invalidEngine=new HtlEngine({storage:invalidStorage},{AI:{async run(){return{tool_calls:[{name:"selectCandidate",arguments:{pair:"EUR_USD",reason:"Not eligible"}}]};}}});
assert.equal((await invalidEngine.choose(candidates)).pair,"AUD_CAD","invalid model output must use deterministic first-ranked fallback");
telemetry=await invalidStorage.get("aiTelemetry");
assert.equal(telemetry.totalInvocations,1);
assert.equal(telemetry.totalSelections,0);
assert.equal(telemetry.totalFallbacks,1);
assert.equal(telemetry.last.userStatus,"Fallback used");
assert.equal(telemetry.last.returnedPair,"EUR_USD");

console.log("Structured Nemotron candidate selection and telemetry verified.");
