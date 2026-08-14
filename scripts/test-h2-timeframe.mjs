import assert from "node:assert/strict";
import fs from "node:fs";
import { PAIRS, TIMEFRAMES, TIMEFRAME_SECONDS } from "../src/horizon-platform-engine.js";
import { STRATEGY_ENGINE_VERSION } from "../src/horizon-strategy-v1.js";
import { bootstrapH2OptimizerCoverage, RUNTIME_OPTIMIZER_VERSION } from "../src/optimized-optimizer.js";

await import("../public/mas-im-calculator.js");
const masIm=globalThis.CTEMASIM;

assert.equal(PAIRS.length,28);
assert.equal(TIMEFRAMES.length,11,"system-wide platform registry must expose eleven timeframes");
assert.deepEqual(TIMEFRAMES,["W","D","H4","H2","H1","M30","M15","M5","M1","S30","S5"]);
assert.equal(TIMEFRAME_SECONDS.H2,7200,"H2 must be represented as 7,200 seconds for range sizing");
assert.equal(PAIRS.length*TIMEFRAMES.length,308,"optimizer coverage target must remain 308 independently optimized datasets");

assert.ok(masIm,"MAS/IM calculator must initialize");
assert.ok(masIm.MAS_IM_TIMEFRAMES.includes("H2"),"MAS/IM hierarchy must include H2");
assert.equal(masIm.TF_MS.H2,7_200_000);
assert.deepEqual(masIm.timeframeHierarchy("H2"),["H2","H4","D","W"],"H2 pressure must use H2 and higher macro frames");
assert.deepEqual(masIm.timeframeHierarchy("H1"),["H1","H2","H4","D","W"],"H1 pressure must incorporate the newly available H2 layer");

const now=new Date().toISOString();
const h1={version:RUNTIME_OPTIMIZER_VERSION,strategyEngineVersion:STRATEGY_ENGINE_VERSION,computedAt:now,stamp:now,source:"SERVER",settings:{assetLength:10},config:{ASSET:{length:10,filter:0}},range:{bars:5000}};
const independent=bootstrapH2OptimizerCoverage({"EUR_USD|H1":h1});
assert.equal(independent["EUR_USD|H1"],h1,"existing H1 optimizer record must remain untouched");
assert.equal(independent["EUR_USD|H2"],undefined,"H2 must not be fabricated from H1; it remains missing until native H2 optimization completes");
const nativeH2={...h1,source:"SERVER",computedAt:new Date(Date.now()+1000).toISOString(),settings:{assetLength:20}};
const preserved=bootstrapH2OptimizerCoverage({"EUR_USD|H1":h1,"EUR_USD|H2":nativeH2});
assert.equal(preserved["EUR_USD|H2"],nativeH2,"a genuine H2 optimizer record must remain untouched");
assert.notEqual(preserved["EUR_USD|H2"].settings,h1.settings,"H2 must be free to retain geometry distinct from H1");

const index=fs.readFileSync(new URL("../public/index.html",import.meta.url),"utf8");
const worker=fs.readFileSync(new URL("../src/worker-base.js",import.meta.url),"utf8");
const optimizer=fs.readFileSync(new URL("../src/optimized-optimizer.js",import.meta.url),"utf8");
assert.match(index,/const TIMEFRAMES = Object\.freeze\(\["W","D","H4","H2","H1","M30","M15","M5","M1","S30","S5"\]\)/,"browser registry must expose H2 in chronological hierarchy order");
assert.match(index,/28 currency pairs by eleven timeframes with buy and sell signals/);
assert.match(index,/<option value="H2">H2<\/option>/,"Evaluation timeframe filter must expose H2");
assert.match(index,/el\("eventTimeframe"\)\.innerHTML=el\("chartTimeframe"\)\.innerHTML/,"HTL Schedule must inherit the shared chart timeframe selector including H2");
assert.match(worker,/const GRANULARITIES = new Set\(\["W","D","H4","H2","H1","M30","M15","M5","M1","S30","S5"\]\)/,"Worker candle gateway must accept H2 between H4 and H1");
assert.match(worker,/H1:1200000,H2:2400000,H4:3600000/,"Worker candle cache must define an explicit H2 TTL between H1 and H4");
assert.match(worker,/!GRANULARITIES\.has\(granularity\)/,"Worker candle route must validate requests against the H2-capable shared gateway registry");
assert.doesNotMatch(worker,/28 × 10 schedule universe/,"Worker cache contract must not retain the pre-H2 28×10 assumption");
assert.doesNotMatch(index,/id="optimizerServerStatus">0 \/ 280 datasets/,"browser optimizer registry must not initialize to the pre-H2 280-dataset total");
assert.doesNotMatch(optimizer,/output\[h2Key\]=\{\.\.\.h1/,"runtime optimizer must not synthesize H2 records from H1");

console.log("H2 timeframe certification passed: 28×11 registry, OANDA 7,200-second range sizing, MAS/IM hierarchy, browser surfaces, HTL selector inheritance, and native per-timeframe H2 optimizer independence are wired.");
