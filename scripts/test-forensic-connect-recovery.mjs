import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import worker from "../src/worker.js";

const origin="https://cte.example",token="x".repeat(40),liveAccount="001-001-1111111-001",mt4Account="001-001-1111111-002";
const browser=path=>new Request(origin+path,{headers:{Origin:origin,"Sec-Fetch-Site":"same-origin","User-Agent":"forensic-test"}});
const originalFetch=globalThis.fetch;
let mode="success",calls=[];
const candles=Array.from({length:60},(_,index)=>{const base=1.1+index*.00001;return{time:new Date(Date.UTC(2026,7,8,0,index*15)).toISOString(),complete:true,mid:{o:String(base),h:String(base+.001),l:String(base-.001),c:String(base+.0002)},volume:10};});

globalThis.fetch=async(url)=>{
  const value=String(url);calls.push(value);
  if(value.endsWith("/v3/accounts")){
    if(mode==="list-network")throw new TypeError("account list fetch failed");
    return new Response(JSON.stringify({accounts:[{id:liveAccount,tags:[]},{id:mt4Account,tags:["MT4"]}]}),{status:200,headers:{"Content-Type":"application/json"}});
  }
  if(value.endsWith(`/v3/accounts/${liveAccount}/summary`)){
    if(mode==="summary-network")throw new TypeError("summary fetch failed");
    if(mode==="summary-nonjson500")return new Response("upstream unavailable",{status:500,headers:{"Content-Type":"text/html"}});
    return new Response(JSON.stringify({account:{id:liveAccount,currency:"USD",balance:"1000",NAV:"1001",marginAvailable:"900",openPositionCount:0},lastTransactionID:"1"}),{status:200,headers:{"Content-Type":"application/json"}});
  }
  if(value.includes("/v3/instruments/EUR_USD/candles?"))return new Response(JSON.stringify({candles}),{status:200,headers:{"Content-Type":"application/json"}});
  throw new Error(`Unexpected upstream fetch ${value}`);
};

let engineStatus={armed:true,running:false,lastRun:null,lastError:null,optimizerCoverage:280,optimizerTotal:280,optimizerLastError:null,optimizerStorageMode:"SHARDED_PER_DATASET",optimizerPersistenceHealthy:true,mtfCoverage:280,pendingOrders:0};
const engineBinding={getByName(){return{fetch:async()=>new Response(JSON.stringify(engineStatus),{status:200,headers:{"Content-Type":"application/json"}})}}};
const envFor=accountId=>({OANDA_API_KEY:token,OANDA_ACCOUNT_ID:accountId,HTL_ENGINE:engineBinding,CF_VERSION_METADATA:{id:"v-test",tag:"sha-test",timestamp:"2026-08-08T18:00:00Z"}});

try{
  const configuredAlias="001-001-9999999-001";

  // Before the resolver cache is warm, account inventory failure remains a staged production bootstrap failure.
  mode="list-network";calls=[];let response=await worker.fetch(browser("/api/oanda/connect"),envFor(configuredAlias));assert.equal(response.status,502);let payload=await response.json();assert.equal(payload.code,"OANDA_NETWORK_FAILURE");assert.equal(payload.stage,"ACCOUNT_LIST");assert.equal(payload.attempts,3);

  // One OANDA REST token can expose both accounts. Production resolves the unique non-MT4 -001 returned by OANDA and blocks -002.
  mode="success";calls=[];
  response=await worker.fetch(browser("/api/oanda/connect"),envFor(configuredAlias));assert.equal(response.status,200);payload=await response.json();assert.equal(payload.account.id,liveAccount);assert.equal(payload.connection.stage,"CONNECTED");assert.equal(payload.connection.mt4Blocked,true);assert.ok(calls.some(value=>value.endsWith("/v3/accounts")),"Production bootstrap must inventory the token accounts before selecting the live lane.");assert.ok(calls.some(value=>value.endsWith(`/v3/accounts/${liveAccount}/summary`)),"The unique non-MT4 -001 returned by OANDA must drive the account summary request.");assert.equal(calls.some(value=>value.includes(mt4Account)&&value.endsWith("/summary")),false,"The -002 MT4 account must never be queried for trading summary.");

  // The known -002 MT4 account is blocked locally before any OANDA account request.
  calls=[];response=await worker.fetch(browser("/api/oanda/connect"),envFor(mt4Account));assert.equal(response.status,403);payload=await response.json();assert.equal(payload.code,"OANDA_MT4_ACCOUNT_BLOCKED");assert.equal(payload.stage,"ACCOUNT_POLICY");assert.equal(calls.length,0);

  // Statusless summary fetch exceptions remain retryable/attributable after successful live-lane selection.
  mode="summary-network";calls=[];response=await worker.fetch(browser("/api/oanda/connect"),envFor(configuredAlias));assert.equal(response.status,502);payload=await response.json();assert.equal(payload.code,"OANDA_NETWORK_FAILURE");assert.equal(payload.stage,"ACCOUNT_SUMMARY");assert.equal(payload.retryable,true);assert.equal(payload.attempts,3);assert.ok(payload.diagnosticId);assert.equal(calls.filter(value=>value.endsWith(`/v3/accounts/${liveAccount}/summary`)).length,3);

  // Non-JSON summary 5xx remains structured.
  mode="summary-nonjson500";calls=[];response=await worker.fetch(browser("/api/oanda/connect"),envFor(configuredAlias));assert.equal(response.status,500);payload=await response.json();assert.equal(payload.code,"OANDA_HTTP_500");assert.equal(payload.stage,"ACCOUNT_SUMMARY");assert.ok(payload.error.includes("non-JSON"));

  // Diagnostics mirror production selection and disclose both token accounts while marking -002 blocked.
  mode="success";calls=[];response=await worker.fetch(browser("/api/platform/diagnostic?instrument=EUR_USD&granularity=M15"),envFor(configuredAlias));assert.equal(response.status,200);payload=await response.json();assert.equal(payload.verdict,"PASS");assert.deepEqual(payload.checks.accountList.value.authorizedSuffixes,["001","002"]);assert.equal(payload.checks.accountList.value.selectedSuffix,"001");assert.equal(payload.checks.accountList.value.blockedMt4Present,true);assert.equal(payload.checks.summary.value.accountSuffix,"001");assert.equal(payload.checks.engine.ok,true);

  // Successful authentication cannot conceal a failed optimizer persistence layer.
  engineStatus={...engineStatus,optimizerPersistenceHealthy:false,optimizerLastError:"string or blob too big: SQLITE_TOOBIG"};
  calls=[];response=await worker.fetch(browser("/api/platform/diagnostic?instrument=EUR_USD&granularity=M15"),envFor(configuredAlias));assert.equal(response.status,200);payload=await response.json();assert.equal(payload.verdict,"DEGRADED");assert.equal(payload.checks.credentials.ok,true);assert.equal(payload.checks.optimizer.ok,false);assert.equal(payload.failure.stage,"OPTIMIZER_PERSISTENCE");assert.equal(payload.failure.code,"OPTIMIZER_PERSISTENCE_FAILURE");assert.match(payload.failure.error,/SQLITE_TOOBIG/);
  engineStatus={...engineStatus,optimizerPersistenceHealthy:true,optimizerLastError:null};

  const html=await readFile(new URL("../public/index.html",import.meta.url),"utf8");assert.doesNotMatch(html,/id="connectButton"|>TEST<\/button>|TESTING…|Testing live OANDA connection/);assert.match(html,/connectionRuntime/);assert.match(html,/void connect()/);
  assert.ok(html.includes('function marketDataReady(){return ["ready","degraded"]'));assert.ok(html.includes("Promise.allSettled([loadChart(state.selectedInstrument,state.selectedTimeframe,true),verifyAccount(),probeEngine()])"));assert.ok(html.includes("Market data ready · account verification degraded"));assert.ok(html.includes("function scheduleAccountRecovery()"));assert.ok(html.includes("if(!bootstrap&&!marketDataReady())return false"));const workerSource=await readFile(new URL("../src/worker-base.js",import.meta.url),"utf8");assert.match(workerSource,/function selectLiveAccount/);assert.ok(workerSource.includes('id.endsWith("-001")'));assert.ok(workerSource.includes('id.endsWith("-002")'));assert.match(workerSource,/async function resolveAccount/);assert.match(workerSource,/OANDA_MT4_ACCOUNT_BLOCKED/);assert.ok(workerSource.includes("tradingCritical=[credentialCheck,accountList,summary,candles]"));
  console.log("Automatic production session, one-token account inventory, unique non-MT4 -001 selection, and explicit -002 MT4 exclusion verified.");
}finally{globalThis.fetch=originalFetch;}
