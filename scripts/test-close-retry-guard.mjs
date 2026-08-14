import assert from "node:assert/strict";
import fs from "node:fs";
import { __closeRetryTest } from "../src/engine-close-retry.js";

const {MAX_CLOSE_ATTEMPTS,CLOSE_RETRY_DELAYS_MS,CLOSE_CIRCUIT_COOLDOWN_MS,OPTIMIZER_PENDING_CODE,closeFailureTransaction,closeFailureReason,closeIntentFingerprint,nextRetryDelayMs,indicatorOnlyActive,inheritedIndicatorOnlyBackoff,selectedExecutionPairs,missingOptimizedPairs}=__closeRetryTest;

const cancel={longOrderCancelTransaction:{id:"100",type:"ORDER_CANCEL",reason:"MARKET_HALTED"},lastTransactionID:"100"};
assert.equal(closeFailureTransaction(cancel)?.id,"100");
assert.equal(closeFailureReason(cancel,200),"MARKET_HALTED");
const reject={shortOrderRejectTransaction:{id:"101",type:"MARKET_ORDER_REJECT",rejectReason:"INSUFFICIENT_MARGIN"},errorCode:"ORDER_REJECTED"};
assert.equal(closeFailureTransaction(reject)?.id,"101");
assert.equal(closeFailureReason(reject,400),"INSUFFICIENT_MARGIN");
assert.equal(closeFailureReason({errorCode:"ACCOUNT_LOCKED"},403),"ACCOUNT_LOCKED");
assert.equal(closeFailureReason({errorMessage:"position unavailable"},404),"position unavailable");
assert.notEqual(closeIntentFingerprint("EUR_USD",1,"event-a","reason"),closeIntentFingerprint("EUR_USD",-1,"event-a","reason"));
assert.equal(MAX_CLOSE_ATTEMPTS,5);
assert.deepEqual(CLOSE_RETRY_DELAYS_MS,[60_000,120_000,300_000,900_000]);
assert.equal(nextRetryDelayMs(1),60_000);
assert.equal(nextRetryDelayMs(2),120_000);
assert.equal(nextRetryDelayMs(3),300_000);
assert.equal(nextRetryDelayMs(4),900_000);
assert.equal(nextRetryDelayMs(5),CLOSE_CIRCUIT_COOLDOWN_MS);

const leaked={indicatorOnly:{enabled:false},indicatorOnlyTickets:[{enabled:false},{enabled:false}],lastError:"Configured OANDA account ... Indicator Only scheduled backoff for 2 minutes.",lastNoOrderReason:"Indicator Only account backoff until 2026-08-14T02:42:00.000Z",selectedPairs:["EUR_USD","EUR_CAD"]};
assert.equal(indicatorOnlyActive(leaked),false);
assert.equal(inheritedIndicatorOnlyBackoff(leaked),true,"normal engine must recognize the stale Indicator Only backoff leak");
assert.equal(inheritedIndicatorOnlyBackoff({...leaked,indicatorOnlyTickets:[{enabled:true}]}),false,"active Indicator Only must retain its own backoff");
assert.deepEqual(selectedExecutionPairs(leaked),["EUR_USD","EUR_CAD"]);
assert.deepEqual(missingOptimizedPairs(leaked,{configurationSource:"OPTIMIZED",timeframe:"M5"},"M5",{"EUR_USD|M5":{settings:{assetLength:15}}}),["EUR_CAD"],"missing v8 configuration must be identified for selected execution pairs");
assert.deepEqual(missingOptimizedPairs(leaked,{configurationSource:"OPTIMIZED",timeframe:"M5"},"M1",{}),[],"non-active MTF rotation must not be blocked by the active-timeframe migration guard");
assert.equal(OPTIMIZER_PENDING_CODE,"OPTIMIZER_CONFIGURATION_PENDING");

const source=fs.readFileSync(new URL("../src/engine-close-retry.js",import.meta.url),"utf8");
assert.match(source,/longOrderCancelTransaction\|\|payload\.shortOrderCancelTransaction\|\|payload\.longOrderRejectTransaction\|\|payload\.shortOrderRejectTransaction/);
assert.match(source,/const RETRY_KEY_PREFIX="close-retry:"/);
assert.match(source,/retry&&Number\(retry\.nextRetryAt\)>now/);
assert.match(source,/CLOSE_RETRY_EXHAUSTED/);
assert.match(source,/await this\.ctx\.storage\.delete\(retryKey\)/);
assert.match(source,/type:"CLOSE_REJECTED"/);
assert.match(source,/closeRetryVersion:CLOSE_RETRY_VERSION/);
assert.match(source,/delete state\.accountResolveError;delete state\.backoffUntil;delete state\.lastBackoffLogged;state\.lastError=null/,"normal tick must clear only inherited Indicator Only account backoff state");
assert.match(source,/OPTIMIZER_CONFIGURATION_PENDING/,"active optimized execution must fail closed while selected pair configurations are missing");
assert.doesNotMatch(source,/setInterval|while\s*\(true\)/,"close guard must not create an internal infinite retry loop");

console.log("OANDA closeout certification passed with inherited Indicator Only backoff recovery and fail-closed active-timeframe optimizer migration guard.");
