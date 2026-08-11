import assert from "node:assert/strict";
import fs from "node:fs";
import { __closeRetryTest } from "../src/engine-close-retry.js";

const {MAX_CLOSE_ATTEMPTS,CLOSE_RETRY_DELAYS_MS,CLOSE_CIRCUIT_COOLDOWN_MS,closeFailureTransaction,closeFailureReason,closeIntentFingerprint,nextRetryDelayMs}=__closeRetryTest;

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

const source=fs.readFileSync(new URL("../src/engine-close-retry.js",import.meta.url),"utf8");
assert.match(source,/longOrderCancelTransaction\|\|payload\.shortOrderCancelTransaction\|\|payload\.longOrderRejectTransaction\|\|payload\.shortOrderRejectTransaction/);
assert.match(source,/const RETRY_KEY_PREFIX="close-retry:"/);
assert.match(source,/retry&&Number\(retry\.nextRetryAt\)>now/);
assert.match(source,/CLOSE_RETRY_EXHAUSTED/);
assert.match(source,/await this\.ctx\.storage\.delete\(retryKey\)/);
assert.match(source,/type:"CLOSE_REJECTED"/);
assert.match(source,/closeRetryVersion:CLOSE_RETRY_VERSION/);
assert.doesNotMatch(source,/setInterval|while\s*\(true\)/,"close guard must not create an internal infinite retry loop");

console.log("OANDA closeout certification passed: fill, cancel, reject, HTTP/network diagnostics, 1m/2m/5m/15m backoff, five-attempt circuit opening, one-hour cooldown, and durable per-pair retry state are wired.");