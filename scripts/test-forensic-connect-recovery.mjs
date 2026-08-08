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

const engineBinding={getByName(){return{fetch:async()=>new Response(JSON.stringify({armed:true,running:false,lastRun:null,lastError:null,optimizerCoverage:280,optimizerTotal:280,optimizerLastError:null,mtfCoverage:280,pendingOrders:0}),{status:200,headers:{"Content-Type":"application/json"}})}}};
const envFor=accountId=>({OANDA_API_KEY:token,OANDA_ACCOUNT_ID:accountId,HTL_ENGINE:engineBinding,CF_VERSION_METADATA:{id:"v-test",tag:"sha-test",timestamp:"2026-08-08T18:00:00Z"}});

try{
  // OANDA supplies one REST token for both accounts. CTE Compound binds directly to configured -001 and never selects from /v3/accounts.
  mode="success";calls=[];
  let response=await worker.fetch(browser("/api/oanda/connect"),envFor(liveAccount));assert.equal(response.status,200);let payload=await response.json();assert.equal(payload.account.id,liveAccount);assert.equal(payload.connection.stage,"CONNECTED");assert.equal(calls.some(value=>value.endsWith("/v3/accounts")),false,"TEST must not enumerate accounts to select the configured live account");assert.ok(calls.some(value=>value.endsWith(`/v3/accounts/${liveAccount}/summary`)),"TEST must verify the configured -001 directly through its summary endpoint");

  // The known -002 MT4 account is blocked locally before any OANDA account request.
  calls=[];response=await worker.fetch(browser("/api/oanda/connect"),envFor(mt4Account));assert.equal(response.status,403);payload=await response.json();assert.equal(payload.code,"OANDA_MT4_ACCOUNT_BLOCKED");assert.equal(payload.stage,"ACCOUNT_POLICY");assert.equal(calls.length,0);

  // Statusless summary fetch exceptions remain retryable/attributable and must not collapse to anonymous HTTP 500.
  mode="summary-network";calls=[];response=await worker.fetch(browser("/api/oanda/connect"),envFor(liveAccount));assert.equal(response.status,502);payload=await response.json();assert.equal(payload.code,"OANDA_NETWORK_FAILURE");assert.equal(payload.stage,"ACCOUNT_SUMMARY");assert.equal(payload.retryable,true);assert.equal(payload.attempts,3);assert.ok(payload.diagnosticId);assert.equal(calls.filter(value=>value.endsWith(`/v3/accounts/${liveAccount}/summary`)).length,3);

  // Non-JSON upstream 5xx responses from the configured account summary remain structured and attributable.
  mode="summary-nonjson500";calls=[];response=await worker.fetch(browser("/api/oanda/connect"),envFor(liveAccount));assert.equal(response.status,500);payload=await response.json();assert.equal(payload.code,"OANDA_HTTP_500");assert.equal(payload.stage,"ACCOUNT_SUMMARY");assert.equal(payload.attempts,3);assert.ok(payload.error.includes("non-JSON"));

  // Account-list enumeration is informational only. If it fails while configured -001 summary/candles/engine pass, trading readiness remains PASS.
  mode="list-network";calls=[];response=await worker.fetch(browser("/api/platform/diagnostic?instrument=EUR_USD&granularity=M15"),envFor(liveAccount));assert.equal(response.status,200);payload=await response.json();assert.equal(payload.verdict,"PASS");assert.equal(payload.checks.credentials.ok,true);assert.equal(payload.checks.accountList.ok,false);assert.equal(payload.checks.summary.ok,true);assert.equal(payload.checks.summary.value.accountSuffix,"001");assert.equal(payload.checks.engine.ok,true);assert.equal(payload.failure?.stage,"DIAGNOSTIC_ACCOUNT_LIST");

  // With a healthy list, diagnostics disclose the two token accounts but explicitly mark -002 as the blocked MT4 lane.
  mode="success";calls=[];response=await worker.fetch(browser("/api/platform/diagnostic?instrument=EUR_USD&granularity=M15"),envFor(liveAccount));assert.equal(response.status,200);payload=await response.json();assert.equal(payload.verdict,"PASS");assert.deepEqual(payload.checks.accountList.value.authorizedSuffixes,["001","002"]);assert.equal(payload.checks.accountList.value.blockedMt4Present,true);assert.equal(payload.checks.accountList.value.mt4BlockedSuffix,"002");assert.equal(payload.checks.summary.value.accountSuffix,"001");

  const html=await readFile(new URL("../public/index.html",import.meta.url),"utf8");assert.match(html,/Configured account/);assert.match(html,/token accounts/);assert.match(html,/checks\.summary\?\.ok/);assert.doesNotMatch(html,/Not found · authorized/);
  const workerSource=await readFile(new URL("../src/worker-base.js",import.meta.url),"utf8");assert.match(workerSource,/accountId\.endsWith\("-002"\)/);assert.match(workerSource,/OANDA_MT4_ACCOUNT_BLOCKED/);assert.doesNotMatch(workerSource,/async function resolveAccount/);assert.doesNotMatch(workerSource,/accountCache/);assert.match(workerSource,/const \{token,accountId\}=credentials\(env\),payload=await oandaRequest\(`\/v3\/accounts\/\$\{encodeURIComponent\(accountId\)\}\/summary`/);assert.match(workerSource,/tradingCritical=\[credentialCheck,summary,candles\]/);
  console.log("Single-token direct -001 binding, explicit -002 MT4 block, direct summary verification, and informational account enumeration verified.");
}finally{globalThis.fetch=originalFetch;}
