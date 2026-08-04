import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { JSDOM } from "jsdom";
import "../public/htl-horizon-contract.js";
import { __horizonTest } from "../src/engine.js";
import finalWorker from "../src/worker.js";
import tradeWorker, { __workerTest } from "../src/worker-horizon-base.js";

const H=globalThis.CTE_HORIZON_HTL;
const candles=Array.from({length:220},(_,index)=>{const close=1.1+Math.sin(index/8)*.003+Math.sin(index/21)*.0015+index*.00001,open=close-Math.sin(index/3)*.0002;return{time:new Date(Date.UTC(2026,0,1,0,index)).toISOString(),open,high:Math.max(open,close)+.00035,low:Math.min(open,close)-.00035,close,complete:true};});
const oandaCandles=candles.map(candle=>({time:candle.time,complete:true,mid:{o:String(candle.open),h:String(candle.high),l:String(candle.low),c:String(candle.close)},volume:100}));
const canonical=H.build(candles,10),engine=__horizonTest.buildIndicators(candles,10);
assert.equal(__horizonTest.calculationVersion,H.VERSION);
assert.equal(__horizonTest.OPTIMIZER_VERSION,5);
assert.equal(__horizonTest.VALIDATION,"HORIZON_RETROSPECTIVE_PLATFORM_PARITY");
assert.deepEqual(engine.horizon.asset,canonical.asset);
assert.deepEqual(engine.horizon.inverse,canonical.inverse);
assert.deepEqual(engine.horizon.crossings,canonical.crossings);
assert.ok(canonical.crossings.length>2);
const raw=__horizonTest.strategyEvents(candles,10,"ASSET",0),qualified=__horizonTest.strategyEvents(candles,10,"ASSET",1);
assert.deepEqual(qualified.map(event=>[event.index,event.direction]),raw.map(event=>[event.index,event.direction]),"filter must not move raw crossings");
assert.ok(qualified.some(event=>event.qualified===false),"fixture must exercise post-cross qualification");
const current=__horizonTest.currentEvent(candles,"EUR_USD","M15",10,"ASSET",0);
assert.match(current.id,/^CTE_HORIZON_HTL_ASSET_CROSSING@1\.0\.0:[0-9a-f]{8}$/);
assert.equal(current.crossingTime,canonical.crossings.at(-1).time);

const dom=new JSDOM(`<!doctype html><html><head></head><body><div id="automationPanel"><div id="decisionCandidateStrip"></div></div><div class="chart-summary"></div><div class="event-chart-toolbar"></div><div id="strategyConfiguration"></div><div id="platformDiagnosticGrid"></div><button id="runPlatformDiagnostic"></button><select id="eventPair"><option value="EUR_USD">EUR_USD</option></select><select id="eventTimeframe"><option value="M15">M15</option></select><select id="eventStrategy"><option value="ASSET">ASSET</option></select><input id="eventLength" value="10"><button id="downloadTradingLedger"></button><div id="automationStatus"></div></body></html>`,{url:"https://cte.test/",runScripts:"outside-only"});
const w=dom.window;Object.assign(w,{Response:globalThis.Response,Request:globalThis.Request,Headers:globalThis.Headers,Blob:globalThis.Blob,structuredClone:globalThis.structuredClone,CTE_HORIZON_HTL:H,STRATEGIES:[{id:"ASSET",label:"HTL Asset"}],STRATEGY_CONFIG:{ASSET:{length:10,filter:0}},TIMEFRAMES:["M15","H1"],state:{selectedInstrument:"EUR_USD",selectedTimeframe:"M15",selectedStrategy:"ASSET",connected:true,autoConfigurations:new Map(),scheduleCandles:new Map([["EUR_USD|M15",candles]]),decisionCandidates:{A:{pair:"EUR_USD",direction:canonical.crossings.at(-1).direction}},selectedDecisionCandidate:null,engineConfig:{timeframe:"M15",strategy:"COMBO"},nemotronRecommendedPair:"EUR_USD"},resolvedConfiguration:()=>({ASSET:{length:10,filter:0}}),htlBuild:()=>({legacy:true}),htlCausal:()=>({legacy:true}),causalDirection:()=>0,eventFeatures:()=>[],updateDecisionDisplays:()=>{},oandaPost:async(_path,body)=>body,refreshOpenPositions:async()=>{},loadTradingLedger:async()=>{}});
w.URL.createObjectURL=()=>"blob:test";w.URL.revokeObjectURL=()=>{};
const browserCalls=[];w.fetch=async(url,init={})=>{browserCalls.push({url:String(url),init});if(String(url).includes("open-trades"))return new w.Response(JSON.stringify({trades:[{id:"77",instrument:"EUR_USD",currentUnits:"1000",state:"OPEN",stopLossOrder:{price:"1.0900"},takeProfitOrder:{price:"1.1200"}}]}),{status:200,headers:{"Content-Type":"application/json"}});if(String(url).includes("/api/oanda/trade"))return new w.Response(JSON.stringify({transactionId:"9001"}),{status:200,headers:{"Content-Type":"application/json"}});return new w.Response(JSON.stringify({ledger:[]}),{status:200,headers:{"Content-Type":"application/json"}});};
w.eval(await readFile(new URL("../public/platform-horizon-runtime.js",import.meta.url),"utf8"));
w.eval(await readFile(new URL("../public/platform-horizon-fixup.js",import.meta.url),"utf8"));
assert.equal(w.htlBuild(candles,10).version,H.VERSION);
assert.equal(w.document.querySelectorAll("#chartConfigurationIdentity .identity-field").length,5);
assert.equal(w.document.querySelectorAll("#eventConfigurationIdentity .identity-field").length,5);
assert.ok(w.document.getElementById("horizonCompoundParity"));
assert.ok(w.document.getElementById("platformTradeManagement"));
w.CTE_HORIZON_PLATFORM.enrichDecisionCandidates();w.state.selectedDecisionCandidate="A";
const signed=1000*canonical.crossings.at(-1).direction,enriched=await w.oandaPost("/v3/accounts/test/orders",{order:{instrument:"EUR_USD",units:String(signed),type:"MARKET",timeInForce:"FOK",positionFill:"DEFAULT"}});
assert.match(enriched.cteContext.crossingIdentity,/^CTE_HORIZON_HTL_ASSET_CROSSING@1\.0\.0:/);
assert.equal(enriched.cteContext.crossingStrategy,"ASSET");
await w.CTE_HORIZON_PLATFORM.loadOpenTrades();w.document.getElementById("managedStopLoss").value="1.0910";await w.CTE_HORIZON_PLATFORM.submitTradeAction("MODIFY");
assert.equal(JSON.parse(browserCalls.find(call=>call.url.includes("/api/oanda/trade")).init.body).action,"MODIFY");dom.window.close();

assert.equal(__workerTest.CALCULATION_VERSION,H.VERSION);
const transformed=__workerTest.transformHtml('<html><body><script>"use strict";</script></body></html>');assert.match(transformed,/htl-horizon-contract\.js/);assert.match(transformed,/platform-horizon-runtime\.js/);

const originalFetch=globalThis.fetch;
const makeResponse=(payload,status=200)=>new Response(JSON.stringify(payload),{status,headers:{"Content-Type":"application/json"}});
const makeEnv=()=>({OANDA_API_KEY:"x".repeat(40),OANDA_ACCOUNT_ID:"101-001-12345678-001",HTL_ENGINE:{getByName(){return{async fetch(request){const url=typeof request==="string"?request:request.url;if(url.includes("preferences"))return makeResponse({minimumUnits:1000});return makeResponse({ok:true});}};}}});
const crossing=canonical.crossings.at(-1),identity=H.crossingIdentity({pair:"EUR_USD",timeframe:"M15",strategy:"ASSET",length:10,filter:0,crossing}),candidateBody={order:{instrument:"EUR_USD",units:String(1000*crossing.direction),type:"MARKET",timeInForce:"FOK",positionFill:"DEFAULT"},cteContext:{candidate:"A",pair:"EUR_USD",timeframe:"M15",strategy:"COMBO",crossingStrategy:"ASSET",length:10,filter:0,crossingIdentity:identity,crossingTime:crossing.time,calculationVersion:H.VERSION,rawDirection:crossing.direction,nemotronRecommendedPair:"EUR_USD",nemotronSelected:true}};
let calls=[];globalThis.fetch=async(url,init={})=>{calls.push({url:String(url),init});if(String(url).endsWith("/v3/accounts"))return makeResponse({accounts:[{id:"101-001-12345678-001",tags:[]}]});if(String(url).includes("/candles?"))return makeResponse({candles:oandaCandles});if(String(url).includes("/positions/EUR_USD"))return makeResponse({position:{instrument:"EUR_USD",long:{units:"0"},short:{units:"0"}}});if(String(url).includes("/pricing?"))return makeResponse({prices:[{unitsAvailable:{default:{long:"5000",short:"5000"}}}]});if(String(url).includes("/orders/@"))return makeResponse({errorMessage:"not found"},404);if(String(url).endsWith("/orders")&&init.method==="POST")return makeResponse({orderFillTransaction:{id:"501",units:candidateBody.order.units,price:"1.1010"},lastTransactionID:"501"});throw new Error(`Unexpected candidate fetch ${url}`);};
let result=await finalWorker.fetch(new Request("https://cte.test/api/oanda/order",{method:"POST",headers:{Origin:"https://cte.test","Content-Type":"application/json"},body:JSON.stringify(candidateBody)}),makeEnv(),{}),payload=await result.json();assert.equal(result.status,200,JSON.stringify(payload));assert.equal(payload.crossingIdentity,identity);const posted=JSON.parse(calls.find(call=>call.url.endsWith("/orders")&&call.init.method==="POST").init.body);assert.match(posted.order.clientExtensions.id,/^cte-hz-/);assert.ok(calls.some(call=>call.url.includes("/orders/@")));

calls=[];const stale=structuredClone(candidateBody);stale.cteContext.crossingTime="2020-01-01T00:00:00.000Z";result=await finalWorker.fetch(new Request("https://cte.test/api/oanda/order",{method:"POST",headers:{Origin:"https://cte.test","Content-Type":"application/json"},body:JSON.stringify(stale)}),makeEnv(),{});assert.equal(result.status,409);assert.equal(calls.some(call=>call.url.endsWith("/orders")&&call.init.method==="POST"),false);

async function trade(action,state="OPEN"){calls=[];globalThis.fetch=async(url,init={})=>{calls.push({url:String(url),init});if(String(url).endsWith("/v3/accounts"))return makeResponse({accounts:[{id:"101-001-12345678-001",tags:[]}]});if(String(url).includes("/trades/77")&&!String(url).endsWith("/orders")&&!String(url).endsWith("/close"))return makeResponse({trade:{id:"77",instrument:"EUR_USD",currentUnits:"1000",state}});if(String(url).endsWith("/orders")&&init.method==="PUT")return makeResponse({stopLossOrderTransaction:{id:"701"},lastTransactionID:"701"});if(String(url).endsWith("/close")&&init.method==="PUT")return makeResponse({orderFillTransaction:{id:"702"},lastTransactionID:"702"});throw new Error(`Unexpected trade fetch ${url}`);};const body=action==="MODIFY"?{action,tradeId:"77",instrument:"EUR_USD",stopLoss:"1.0900",takeProfit:"1.1200"}:{action,tradeId:"77",instrument:"EUR_USD"};return tradeWorker.fetch(new Request("https://cte.test/api/oanda/trade",{method:"PUT",headers:{Origin:"https://cte.test","Content-Type":"application/json"},body:JSON.stringify(body)}),makeEnv(),{});}
result=await trade("MODIFY");assert.equal(result.status,200);let body=JSON.parse(calls.find(call=>call.url.endsWith("/orders")&&call.init.method==="PUT").init.body);assert.equal(body.stopLoss.timeInForce,"GTC");assert.equal(body.takeProfit.timeInForce,"GTC");
result=await trade("CLOSE");assert.equal(result.status,200);body=JSON.parse(calls.find(call=>call.url.endsWith("/close")&&call.init.method==="PUT").init.body);assert.deepEqual(body,{units:"ALL"});
result=await trade("CLOSE","CLOSED");assert.equal(result.status,409);assert.equal(calls.some(call=>call.url.endsWith("/close")&&call.init.method==="PUT"),false);
globalThis.fetch=originalFetch;
console.log("Platform-wide Horizon formula, DOM, candidate, and trade-management behavior verified.");
