import assert from "node:assert/strict";
import worker from "../src/worker.js";
import {HtlEngine} from "../src/engine.js";
import {readFile} from "node:fs/promises";

const accountId="001-001-1234567-001",token="x".repeat(32),origin="https://cte.example";
const browser=(path,init={})=>new Request(origin+path,{...init,headers:{Origin:origin,"Sec-Fetch-Site":"same-origin",...(init.headers||{})}});
let capturedOrder=null,closed=[];
const originalFetch=globalThis.fetch;
globalThis.fetch=async(url,init={})=>{
  const value=String(url);
  if(value.endsWith("/v3/accounts"))return new Response(JSON.stringify({accounts:[{id:accountId,tags:[]}]}),{status:200});
  if(value.endsWith(`/v3/accounts/${accountId}/summary`))return new Response(JSON.stringify({account:{id:accountId,balance:"1000",NAV:"1000",marginAvailable:"900"},lastTransactionID:"1"}),{status:200});
  if(value.endsWith(`/v3/accounts/${accountId}/orders`)&&init.method==="POST"){capturedOrder=JSON.parse(init.body);return new Response(JSON.stringify({orderFillTransaction:{id:"2",price:"1.1",units:capturedOrder.order.units},lastTransactionID:"2"}),{status:200});}
  if(value.includes("/candles?"))return new Response(JSON.stringify({candles:[{time:"2026-08-04T00:00:00Z",complete:true,mid:{o:"1",h:"1.2",l:".9",c:"1.1"},volume:10}]}),{status:200});
  if(value.endsWith(`/v3/accounts/${accountId}/positions`))return new Response(JSON.stringify({positions:[{instrument:"EUR_USD",long:{units:"10"},short:{units:"0"}}]}),{status:200});
  if(value.endsWith(`/v3/accounts/${accountId}/positions/EUR_USD/close`)){closed.push(JSON.parse(init.body));return new Response(JSON.stringify({longOrderFillTransaction:{id:"3",units:"-10",price:"1.09",pl:"1"}}),{status:200});}
  throw new Error(`Unexpected fetch: ${value}`);
};
const env={OANDA_API_KEY:token,OANDA_ACCOUNT_ID:accountId};
let response=await worker.fetch(browser("/api/oanda/order",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({order:{instrument:"EUR_USD",units:"25",type:"MARKET",timeInForce:"FOK",positionFill:"DEFAULT",unsafe:"removed"}})}),env);
assert.equal(response.status,200);assert.deepEqual(capturedOrder,{order:{instrument:"EUR_USD",units:"25",type:"MARKET",timeInForce:"FOK",positionFill:"DEFAULT"}});
response=await worker.fetch(browser("/api/oanda/order",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({order:{instrument:"BAD",units:"1",type:"MARKET",timeInForce:"FOK",positionFill:"DEFAULT"}})}),env);assert.equal(response.status,400);
response=await worker.fetch(browser("/api/oanda/proxy?path=x",{method:"POST"}),env);assert.equal(response.status,405);
response=await worker.fetch(browser("/api/engine/optimizer",{method:"PUT"}),env);assert.equal(response.status,405);
response=await worker.fetch(browser("/api/oanda/candles?instrument=EUR_USD&granularity=M15&count=60"),env);const candlePayload=await response.json();assert.equal(candlePayload.candles[0].mid.c,"1.1");assert.equal(candlePayload.candles[0].close,1.1);

class Storage{constructor(){this.map=new Map();}async get(key){if(Array.isArray(key))return new Map(key.map(item=>[item,this.map.get(item)]));return this.map.get(key);}async put(key,value){this.map.set(key,value);}async delete(key){if(Array.isArray(key))for(const item of key)this.map.delete(item);else this.map.delete(key);}async getAlarm(){return null;}async deleteAlarm(){}}
const ctx={storage:new Storage()},engine=new HtlEngine(ctx,env),config=await engine.config();
assert.equal(config.strategy,"ASSET");assert.equal(config.configurationSource,"OPTIMIZED");
engine.write=async entry=>{engine.lastWrite=entry;};
await engine.reconcile({EUR_USD:{pair:"EUR_USD",event:{direction:-1,id:"-1:t"},configuration:{primary:{length:20,filter:1,score:3,trades:8,net:12,maxDrawdown:2,winRate:.625},confirmation:null}}},token,accountId,{events:{}},config);
assert.equal(closed.length,1);assert.equal(engine.lastWrite.type,"POSITION_CLOSED");assert.equal(engine.lastWrite.htlLength,20);assert.equal(engine.lastWrite.optimizerScore,3);
response=await engine.fetch(new Request("https://engine/optimizer",{method:"PUT",headers:{"Content-Type":"application/json"},body:"{}"}));assert.equal(response.status,405);

const html=await readFile(new URL("../public/index.html",import.meta.url),"utf8");
assert.match(html,/id="connectButton"[^>]*>TEST<\/button>/);assert.match(html,/selectedStrategy:"ASSET"/);assert.match(html,/configurationSource:"OPTIMIZED"/);assert.match(html,/selectChart\(event\.target\.value,state\.selectedTimeframe\)/);assert.doesNotMatch(html,/\/api\/engine\/optimizer[^\n]+method:"PUT"/);
globalThis.fetch=originalFetch;
console.log("Runtime route, reconciliation, optimizer, forensic context, chart, and connection contracts verified.");
