import assert from "node:assert/strict";
import baseWorker from "../src/worker-base.js";
import { HtlEngine as BaseEngine } from "../src/engine-base.js";

class Storage {
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

const storage=new Storage();
const engine=new BaseEngine({storage},{});
const writes=[];
engine.write=async (entry,sendNotification=true)=>{writes.push({entry,sendNotification});};

const callerHeaders={"CF-Connecting-IP":"203.0.113.42","User-Agent":"cte-diagnostic-test/1.0"};
const firstRequest=new Request("https://engine/config",{method:"PUT",headers:callerHeaders});
await engine.configure({timeframe:"H1",strategy:"DARE",confirmationStrategy:"NONE",htlLength:20,filter:.5,decisionMode:"EVENT",configurationSource:"OPTIMIZED"},firstRequest);
let state=await storage.get("state");
assert.equal(state.configChurnCount,1);
assert.ok(state.lastConfigChangeAt);
assert.equal(writes.length,1);
assert.equal(writes[0].entry.type,"CONFIGURATION");
assert.equal(writes[0].entry.callerIp,"203.0.113.42");
assert.equal(writes[0].entry.callerAgent,"cte-diagnostic-test/1.0");
assert.equal(writes[0].entry.fingerprintChanged,true);

writes.length=0;
const secondRequest=new Request("https://engine/config",{method:"PUT",headers:{"CF-Connecting-IP":"198.51.100.7","User-Agent":"dashboard-test/2.0"}});
await engine.configure({timeframe:"H4",strategy:"NAI",confirmationStrategy:"NONE",htlLength:30,filter:1,decisionMode:"COMBINED",configurationSource:"OPTIMIZED"},secondRequest);
state=await storage.get("state");
assert.equal(state.configChurnCount,2);
assert.equal(writes.length,2);
assert.equal(writes[0].entry.type,"CONFIGURATION");
assert.equal(writes[1].entry.type,"CONFIGURATION_CHURN_WARNING");
assert.equal(writes[1].entry.callerIp,"198.51.100.7");
assert.equal(writes[1].entry.callerAgent,"dashboard-test/2.0");
assert.equal(writes[1].entry.configChurnCount,2);
assert.equal(writes[1].entry.sendNotification,true);
assert.equal(writes[1].sendNotification,true);
assert.match(writes[1].entry.message,/2 changes within the 15-minute window/);

writes.length=0;
await engine.configure({timeframe:"H4",strategy:"NAI",confirmationStrategy:"NONE",htlLength:30,filter:1,decisionMode:"COMBINED",configurationSource:"OPTIMIZED"},secondRequest);
state=await storage.get("state");
assert.equal(state.configChurnCount,2,"same-fingerprint PUT must not increment churn count");
assert.equal(writes.filter(item=>item.entry.type==="CONFIGURATION_CHURN_WARNING").length,0);
assert.equal(writes[0].entry.fingerprintChanged,false);

const oldTime=new Date(Date.now()-20*60*1000).toISOString();
state.lastConfigChangeAt=oldTime;
state.configChangeTimes=[oldTime];
await storage.put("state",state);
writes.length=0;
await engine.configure({timeframe:"D",strategy:"APEX",confirmationStrategy:"NONE",htlLength:40,filter:2,decisionMode:"MTF",configurationSource:"OPTIMIZED"},firstRequest);
state=await storage.get("state");
assert.equal(state.configChurnCount,1,"expired churn window must restart at one change");
assert.equal(writes.filter(item=>item.entry.type==="CONFIGURATION_CHURN_WARNING").length,0);

const originalFetch=globalThis.fetch;
let oandaUrl="";
globalThis.fetch=async url=>{
  oandaUrl=String(url);
  return new Response(JSON.stringify({positions:[]}),{status:200,headers:{"Content-Type":"application/json"}});
};
await engine.reconcile({},"token","101-001",{events:{}},{timeframe:"M15",strategy:"ASSET",confirmationStrategy:"NONE",htlLength:10,filter:0,decisionMode:"EVENT",configurationSource:"OPTIMIZED"});
assert.match(oandaUrl,/\/v3\/accounts\/101-001\/openPositions$/);
globalThis.fetch=originalFetch;

let forwardedRequest=null;
const env={
  HTL_ENGINE:{
    getByName(){
      return {
        async fetch(request){
          forwardedRequest=request;
          return new Response(JSON.stringify({ok:true}),{status:200,headers:{"Content-Type":"application/json"}});
        }
      };
    }
  },
  ASSETS:{async fetch(){return new Response("not used");}}
};
const edgeRequest=new Request("https://cte-compound.example/api/engine/config",{
  method:"PUT",
  headers:{
    Origin:"https://cte-compound.example",
    "Sec-Fetch-Site":"same-origin",
    "Content-Type":"application/json",
    "CF-Connecting-IP":"192.0.2.15",
    "User-Agent":"production-diagnostic/3.0"
  },
  body:JSON.stringify({timeframe:"M15"})
});
const edgeResponse=await baseWorker.fetch(edgeRequest,env);
assert.equal(edgeResponse.status,200);
assert.ok(forwardedRequest);
assert.equal(forwardedRequest.headers.get("CF-Connecting-IP"),"192.0.2.15");
assert.equal(forwardedRequest.headers.get("User-Agent"),"production-diagnostic/3.0");

console.log("Production configuration attribution, churn warning, caller forwarding, and open-position endpoint remediation verified.");
