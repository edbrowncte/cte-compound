import assert from "node:assert/strict";
import { ACCOUNT_AUTHORITY_VERSION, accountAuthorityBackoff, cachedAccountAuthority, clearAccountAuthorityBackoff, resolveExactAccountAuthority } from "../src/account-authority.js";
import { __liveSignalPriceTest } from "../src/engine-live-signal-price.js";

const configured="001-001-1791077-001",wrong="001-001-1719077-001",originalFetch=globalThis.fetch;
function response(value,status=200){return new Response(JSON.stringify(value),{status,headers:{"Content-Type":"application/json"}});}

let calls=[];
globalThis.fetch=async input=>{const url=String(input);calls.push(url);if(url.endsWith("/v3/accounts"))return response({accounts:[{id:"001-001-9999999-002",tags:["MT4"]},{id:configured}]});if(url.endsWith(`/v3/accounts/${configured}/summary`))return response({account:{id:configured,state:"OPEN"}});throw new Error(`Unexpected URL ${url}`);};
const state={},writes=[];const resolved=await resolveExactAccountAuthority({token:"x".repeat(40),configuredAccountId:configured,state,writeLedger:entry=>writes.push(entry),now:1_000_000});
assert.equal(resolved.accountId,configured);assert.equal(resolved.cached,false);assert.equal(state.resolvedAccountId,configured);assert.equal(state.accountAuthority.version,ACCOUNT_AUTHORITY_VERSION);assert.equal(state.accountAuthority.source,"EXACT_CONFIGURED_ACCOUNT");assert.equal(writes.length,1);assert.equal(writes[0].type,"ACCOUNT_AUTHORITY_VERIFIED");assert.equal(calls.length,2,"first exact verification must list authorized accounts and verify the configured account summary");

calls=[];const cached=await resolveExactAccountAuthority({token:"x".repeat(40),configuredAccountId:configured,state,now:1_000_100});assert.equal(cached.cached,true);assert.equal(cached.accountId,configured);assert.equal(calls.length,0,"verified authority must be cached instead of rediscovered on every tick");assert.ok(cachedAccountAuthority(state,configured,1_000_100));

calls=[];globalThis.fetch=async input=>{const url=String(input);calls.push(url);if(url.endsWith("/v3/accounts"))return response({accounts:[{id:configured}]});throw new Error(`Unexpected URL ${url}`);};
await assert.rejects(()=>resolveExactAccountAuthority({token:"x".repeat(40),configuredAccountId:wrong,state:{},now:2_000_000}),error=>error?.code==="ACCOUNT_IDENTITY_MISMATCH"&&error?.stage==="ACCOUNT_IDENTITY");assert.equal(calls.length,1,"mismatched configured identity must not fall through to another -001 account summary");

calls=[];globalThis.fetch=async input=>{const url=String(input);calls.push(url);if(url.endsWith("/v3/accounts"))return response({accounts:[{id:configured}]});if(url.endsWith(`/v3/accounts/${configured}/summary`))return response({errorCode:"TEMPORARY_FAILURE",errorMessage:"simulated summary outage"},503);throw new Error(`Unexpected URL ${url}`);};
await assert.rejects(()=>resolveExactAccountAuthority({token:"x".repeat(40),configuredAccountId:configured,state:{},now:3_000_000}),error=>error?.status===503&&error?.path===`/v3/accounts/${configured}/summary`&&/503/.test(error.message)&&!/MT4-linked/.test(error.message));

const hardState={},hard=accountAuthorityBackoff(Object.assign(new Error("identity mismatch"),{code:"ACCOUNT_IDENTITY_MISMATCH",stage:"ACCOUNT_IDENTITY"}),hardState,4_000_000);assert.equal(hard.hard,true);assert.equal(hard.delayMs,120000);assert.equal(hardState.accountResolveError.code,"ACCOUNT_IDENTITY_MISMATCH");
const softState={},soft=accountAuthorityBackoff(Object.assign(new Error("transport"),{code:"OANDA_TIMEOUT",status:504,path:"/v3/accounts"}),softState,5_000_000);assert.equal(soft.hard,false);assert.equal(soft.delayMs,5000);assert.equal(softState.accountTransportError.path,"/v3/accounts");clearAccountAuthorityBackoff(softState);assert.equal(softState.backoffUntil,undefined);

const deduped=__liveSignalPriceTest.deduplicateLedgerPayload({ledger:[{ledgerId:"a",type:"ERROR"},{ledgerId:"a",type:"ERROR"},{ledgerId:"b",type:"ORDER_FILLED"},{type:"INFO"},{type:"INFO"}]});assert.equal(deduped.rawLedgerRows,5);assert.equal(deduped.uniqueLedgerRows,4);assert.equal(deduped.duplicateLedgerRows,1);assert.deepEqual(deduped.ledger.map(row=>row.ledgerId||null),["a","b",null,null],"only records with the same durable ledgerId are deduplicated");

globalThis.fetch=originalFetch;
console.log("Exact configured-account identity, cached authority, route-preserving broker errors, transport-vs-identity backoff, and ledger-ID export deduplication verified.");
