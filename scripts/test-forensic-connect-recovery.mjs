import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import worker from "../src/worker.js";

const origin="https://cte.example",token="x".repeat(40),accountA="001-001-1111111-001",accountB="001-001-2222222-001";
const browser=path=>new Request(origin+path,{headers:{Origin:origin,"Sec-Fetch-Site":"same-origin","User-Agent":"forensic-test"}});
const originalFetch=globalThis.fetch;
let mode="success",calls=[];
const candles=Array.from({length:60},(_,index)=>{const base=1.1+index*.00001;return{time:new Date(Date.UTC(2026,7,8,0,index*15)).toISOString(),complete:true,mid:{o:String(base),h:String(base+.001),l:String(base-.001),c:String(base+.0002)},volume:10};});

globalThis.fetch=async(url)=>{
  const value=String(url);calls.push(value);
  if(value.endsWith("/v3/accounts")){
    if(mode==="network")throw new TypeError("fetch failed");
    if(mode==="nonjson500")return new Response("upstream unavailable",{status:500,headers:{"Content-Type":"text/html"}});
    const accounts=mode==="onlyA"?[{id:accountA,tags:[]}]:[{id:accountA,tags:[]},{id:accountB,tags:[]}];return new Response(JSON.stringify({accounts}),{status:200,headers:{"Content-Type":"application/json"}});
  }
  if(value.endsWith(`/v3/accounts/${accountA}/summary`))return new Response(JSON.stringify({account:{id:accountA,currency:"USD",balance:"1000",NAV:"1001",marginAvailable:"900",openPositionCount:0},lastTransactionID:"1"}),{status:200});
  if(value.endsWith(`/v3/accounts/${accountB}/summary`))return new Response(JSON.stringify({account:{id:accountB,currency:"USD",balance:"2000",NAV:"2002",marginAvailable:"1800",openPositionCount:1},lastTransactionID:"2"}),{status:200});
  if(value.includes("/v3/instruments/EUR_USD/candles?"))return new Response(JSON.stringify({candles}),{status:200,headers:{"Content-Type":"application/json"}});
  throw new Error(`Unexpected upstream fetch ${value}`);
};

const engineBinding={getByName(){return{fetch:async()=>new Response(JSON.stringify({armed:true,running:false,lastRun:null,lastError:null,optimizerCoverage:280,optimizerTotal:280,optimizerLastError:null,mtfCoverage:280,pendingOrders:0}),{status:200,headers:{"Content-Type":"application/json"}})}}};
const envFor=accountId=>({OANDA_API_KEY:token,OANDA_ACCOUNT_ID:accountId,HTL_ENGINE:engineBinding,CF_VERSION_METADATA:{id:"v-test",tag:"sha-test",timestamp:"2026-08-08T18:00:00Z"}});

try{
  // Exact configured account must be used, and the account cache must be keyed by configured account ID.
  mode="success";calls=[];
  let response=await worker.fetch(browser("/api/oanda/connect"),envFor(accountA));assert.equal(response.status,200);let payload=await response.json();assert.equal(payload.account.id,accountA);assert.equal(payload.connection.stage,"CONNECTED");
  response=await worker.fetch(browser("/api/oanda/connect"),envFor(accountB));assert.equal(response.status,200);payload=await response.json();assert.equal(payload.account.id,accountB);assert.ok(calls.some(value=>value.endsWith("/v3/accounts")),"Changing configured account must revalidate the account list instead of reusing a stale account cache entry.");

  // A configured account that is not authorized must fail explicitly rather than falling back to any -001 account.
  mode="onlyA";calls=[];
  response=await worker.fetch(browser("/api/oanda/connect"),envFor("001-001-3333333-001"));assert.equal(response.status,401);payload=await response.json();assert.equal(payload.code,"OANDA_ACCOUNT_ID_NOT_AUTHORIZED");assert.equal(payload.stage,"ACCOUNT_SELECT");assert.ok(payload.diagnosticId);assert.equal(response.headers.get("X-CTE-Diagnostic-ID"),payload.diagnosticId);

  // A statusless outbound fetch exception is a retryable OANDA network failure and must never collapse to anonymous HTTP 500.
  mode="network";calls=[];
  response=await worker.fetch(browser("/api/oanda/connect"),envFor("001-001-4444444-001"));assert.equal(response.status,502);payload=await response.json();assert.equal(payload.code,"OANDA_NETWORK_FAILURE");assert.equal(payload.stage,"ACCOUNT_LIST");assert.equal(payload.retryable,true);assert.equal(payload.attempts,3);assert.ok(payload.diagnosticId);assert.equal(calls.filter(value=>value.endsWith("/v3/accounts")).length,3);

  // Non-JSON upstream 5xx responses must also remain structured and attributable.
  mode="nonjson500";calls=[];
  response=await worker.fetch(browser("/api/oanda/connect"),envFor("001-001-5555555-001"));assert.equal(response.status,500);payload=await response.json();assert.equal(payload.code,"OANDA_HTTP_500");assert.equal(payload.stage,"ACCOUNT_LIST");assert.equal(payload.attempts,3);assert.ok(payload.error.includes("non-JSON"));

  // The forensic diagnostic itself must survive OANDA failure and still report engine/candle-independent evidence as a JSON 200 surface.
  mode="network";calls=[];
  response=await worker.fetch(browser("/api/platform/diagnostic?instrument=EUR_USD&granularity=M15"),envFor(accountA));assert.equal(response.status,200);payload=await response.json();assert.equal(payload.verdict,"FAIL");assert.equal(payload.checks.credentials.ok,true);assert.equal(payload.checks.accountList.ok,false);assert.equal(payload.checks.accountList.code,"OANDA_NETWORK_FAILURE");assert.equal(payload.checks.summary.skipped,true);assert.equal(payload.checks.engine.ok,true);assert.ok(payload.failure?.diagnosticId);assert.ok(payload.worker.telemetry.networkFailures>=1);

  const html=await readFile(new URL("../public/index.html",import.meta.url),"utf8");
  assert.match(html,/async function readApiResponse\(response\)/);
  assert.match(html,/NON_JSON_RESPONSE/);
  assert.match(html,/apiFailureMessage\(response,payload,diagnosticId\)/);
  assert.match(html,/setTimeout\(\(\)=>\{if\(!state\.connected\)void runPlatformDiagnostic\(true\);\},250\)/);
  assert.match(html,/Forensic verdict/);
  assert.match(html,/Authorized account/);
  assert.match(html,/Failure stage/);
  assert.match(html,/Diagnostic ID/);
  assert.match(html,/grid\.replaceChildren\(\)/);
  assert.doesNotMatch(html,/function diagnosticCards\(entries\)\{el\("platformDiagnosticGrid"\)\.innerHTML=/);

  const workerSource=await readFile(new URL("../src/worker-base.js",import.meta.url),"utf8");
  assert.match(workerSource,/OANDA_NETWORK_FAILURE/);assert.match(workerSource,/OANDA_INVALID_RESPONSE/);assert.match(workerSource,/configuredAccountId===configuredAccountId/);assert.doesNotMatch(workerSource,/\|\|accounts\.find\(account=>String\(account\.id\|\|""\)\.endsWith\("-001"\)/);assert.match(workerSource,/return errorResponse\(error\)/);assert.match(workerSource,/maxAttempts:1/);
  console.log("Forensic OANDA staged errors, exact account binding, retry recovery, partial diagnostics, browser attribution, and safe diagnostic rendering verified.");
}finally{globalThis.fetch=originalFetch;}
