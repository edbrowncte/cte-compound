import assert from "node:assert/strict";
import { __workerExactAccountTest } from "../src/worker-exact-account.js";

const actual="001-001-1791077-001",typo="001-001-1719077-001",token="x".repeat(40),originalFetch=globalThis.fetch;
const env=accountId=>({OANDA_API_KEY:token,OANDA_ACCOUNT_ID:accountId});
let calls=[];
globalThis.fetch=async url=>{
  const value=String(url);calls.push(value);
  if(value.endsWith("/v3/accounts"))return new Response(JSON.stringify({accounts:[{id:actual,tags:[]},{id:"001-001-1791077-002",tags:["MT4"]}]}),{status:200,headers:{"Content-Type":"application/json"}});
  if(value.endsWith(`/v3/accounts/${actual}/summary`))return new Response(JSON.stringify({account:{id:actual,state:"OPEN"}}),{status:200,headers:{"Content-Type":"application/json"}});
  throw new Error(`Unexpected OANDA authority request ${value}`);
};

try{
  assert.equal(__workerExactAccountTest.accountScopedPath("/api/oanda/connect"),true);
  assert.equal(__workerExactAccountTest.accountScopedPath("/api/oanda/candles"),true);
  assert.equal(__workerExactAccountTest.diagnosticPath("/api/platform/diagnostic"),true);

  calls=[];
  let mismatch;
  await assert.rejects(()=>__workerExactAccountTest.verifyFullAccountIdentity(env(typo),{}),error=>{
    mismatch=error;
    assert.equal(error.code,"ACCOUNT_IDENTITY_MISMATCH");
    assert.equal(error.stage,"ACCOUNT_IDENTITY");
    return true;
  });
  const snapshot=__workerExactAccountTest.authoritySnapshot(mismatch);
  assert.equal(snapshot.exactAccountRequired,true);
  assert.equal(snapshot.code,"ACCOUNT_IDENTITY_MISMATCH");
  assert.deepEqual(calls.filter(value=>value.endsWith("/v3/accounts")).length,1);
  assert.equal(calls.some(value=>value.includes(typo)&&value.endsWith("/summary")),false,"A suffix match must never be substituted for a mismatched full configured account ID.");

  calls=[];
  const resolved=await __workerExactAccountTest.verifyFullAccountIdentity(env(actual),{});
  assert.equal(resolved.accountId,actual);
  assert.ok(calls.some(value=>value.endsWith("/v3/accounts")));
  assert.ok(calls.some(value=>value.endsWith(`/v3/accounts/${actual}/summary`)),"The exact configured full account ID must drive the summary request.");
  console.log("Worker boundary and server diagnostic require full OANDA account-string equality; -001 suffix fallback is impossible.");
}finally{globalThis.fetch=originalFetch;}
