import assert from "node:assert/strict";
import { HtlEngine, __nemotronTest } from "../src/engine.js";

class Storage {
  constructor(seed={}){this.values=new Map(Object.entries(seed));}
  async get(key){return this.values.get(key);}
  async put(key,value){this.values.set(key,value);}
  async delete(key){if(Array.isArray(key))key.forEach(item=>this.values.delete(item));else this.values.delete(key);}
  async list(){return new Map();}
  async getAlarm(){return null;}
  async deleteAlarm(){}
}

const candidates=[
  {pair:"AUD_CAD",event:{direction:1,id:"aud-event",bars:1,openPrice:0.91},confidence:.84,count:5,configuration:{primary:{score:12,trades:41,net:72,maxDrawdown:9,winRate:.61}},AGE:{candidateType:"NEW_ENTRY",greatExpectation:{index:82,expectedPipsPerHour:4}}},
  {pair:"NZD_CAD",event:{direction:-1,id:"nzd-event",bars:1,openPrice:.81},confidence:.78,count:4,configuration:{primary:{score:9,trades:37,net:60,maxDrawdown:11,winRate:.57}},AGE:{candidateType:"NEW_ENTRY",greatExpectation:{index:74,expectedPipsPerHour:3}}},
];

assert.equal(__nemotronTest.normalizePair("AUD/CAD"),"AUD_CAD");
assert.equal(__nemotronTest.normalizePair("nzd-cad"),"NZD_CAD");
assert.equal(__nemotronTest.extractNemotronSelection({tool_calls:[{name:"selectCandidate",arguments:{pair:"AUD/CAD",reason:"Best evidence"}}]}).args.pair,"AUD/CAD");
assert.equal(__nemotronTest.extractNemotronSelection({choices:[{message:{tool_calls:[{function:{name:"selectCandidate",arguments:'{"pair":"NZD_CAD","reason":"Lower drawdown"}'}}]}}]}).args.pair,"NZD_CAD");

let requestPayload=null;
const storage=new Storage();
const engine=new HtlEngine({storage},{AI:{async run(_model,payload){requestPayload=payload;return{tool_calls:[{name:"selectCandidate",arguments:{pair:"AUD/CAD",reason:"Higher Great Expectation"}}]};}}});
engine.write=async()=>{};
const selected=await engine.choose(candidates);
assert.equal(selected.pair,"AUD_CAD");
assert.equal(requestPayload.tool_choice,"required");
assert.equal(requestPayload.parallel_tool_calls,false);
assert.equal("response_format" in requestPayload,false,"Nemotron candidate selection must not regress to response_format JSON mode");
assert.deepEqual(requestPayload.tools[0].function.parameters.properties.pair.enum,["AUD_CAD","NZD_CAD"]);
let telemetry=await storage.get("aiTelemetry");
assert.equal(telemetry.totalInvocations,1);
assert.equal(telemetry.totalSelections,1);
assert.equal(telemetry.totalFallbacks,0);
assert.equal(telemetry.last.orchestrationVersion,__nemotronTest.AI_ORCHESTRATION_VERSION);
assert.equal(telemetry.last.responseShape,"tool_calls");
assert.equal(telemetry.last.returnedPair,"AUD_CAD");

const choicesStorage=new Storage();
const choicesEngine=new HtlEngine({storage:choicesStorage},{AI:{async run(){return{choices:[{message:{tool_calls:[{function:{name:"selectCandidate",arguments:'{"pair":"NZD_CAD","reason":"Best net result"}'}}]}}]};}}});
choicesEngine.write=async()=>{};
assert.equal((await choicesEngine.choose(candidates)).pair,"NZD_CAD");
assert.equal((await choicesStorage.get("aiTelemetry")).last.responseShape,"choices.tool_calls");

const invalidStorage=new Storage();
const invalidEngine=new HtlEngine({storage:invalidStorage},{AI:{async run(){return{tool_calls:[{name:"selectCandidate",arguments:{pair:"EUR_USD",reason:"Not eligible"}}]};}}});
invalidEngine.write=async()=>{};
assert.equal((await invalidEngine.choose(candidates)).pair,"AUD_CAD","invalid model output must use deterministic Great Expectation fallback");
telemetry=await invalidStorage.get("aiTelemetry");
assert.equal(telemetry.totalInvocations,1);
assert.equal(telemetry.totalSelections,0);
assert.equal(telemetry.totalFallbacks,1);
assert.equal(telemetry.last.returnedPair,"EUR_USD");

console.log("Focused structured Nemotron candidate selection, normalization, and telemetry regression verified.");
