import assert from "node:assert/strict";
import fs from "node:fs";
import { PAIRS, TIMEFRAMES, TIMEFRAME_SECONDS } from "../src/horizon-platform-engine.js";
import { STRATEGY_ENGINE_VERSION } from "../src/horizon-strategy-v1.js";
import { bootstrapH2OptimizerCoverage, H2_BOOTSTRAP_SOURCE, RUNTIME_OPTIMIZER_VERSION } from "../src/optimized-optimizer.js";

await import("../public/mas-im-calculator.js");
const masIm=globalThis.CTEMASIM;

assert.equal(PAIRS.length,28);
assert.equal(TIMEFRAMES.length,11,"system-wide platform registry must expose eleven timeframes");
assert.deepEqual(TIMEFRAMES,["W","D","H4","H2","H1","M30","M15","M5","M1","S30","S5"]);
assert.equal(TIMEFRAME_SECONDS.H2,7200,"H2 must be represented as 7,200 seconds for range sizing");
assert.equal(PAIRS.length*TIMEFRAMES.length,308,"optimizer coverage target must expand from 280 to 308 datasets");

assert.ok(masIm,"MAS/IM calculator must initialize");
assert.ok(masIm.MAS_IM_TIMEFRAMES.includes("H2"),"MAS/IM hierarchy must include H2");
assert.equal(masIm.TF_MS.H2,7_200_000);
assert.deepEqual(masIm.timeframeHierarchy("H2"),["H2","H4","D","W"],"H2 pressure must use H2 and higher macro frames");
assert.deepEqual(masIm.timeframeHierarchy("H1"),["H1","H2","H4","D","W"],"H1 pressure must incorporate the newly available H2 layer");

const now=new Date().toISOString();
const h1={version:RUNTIME_OPTIMIZER_VERSION,strategyEngineVersion:STRATEGY_ENGINE_VERSION,computedAt:now,stamp:now,source:"SERVER",settings:{assetLength:10},config:{ASSET:{length:10,filter:0}},range:{bars:5000}};
const seeded=bootstrapH2OptimizerCoverage({"EUR_USD|H1":h1});
assert.equal(seeded["EUR_USD|H1"],h1,"existing H1 optimizer record must remain untouched");
assert.equal(seeded["EUR_USD|H2"].source,H2_BOOTSTRAP_SOURCE);
assert.equal(seeded["EUR_USD|H2"].bootstrapFrom,"EUR_USD|H1");
assert.equal(seeded["EUR_USD|H2"].settings,h1.settings,"H2 bootstrap must reuse only the already-certified configuration object until H2 optimization replaces it");
const nativeH2={...h1,source:"SERVER",computedAt:new Date(Date.now()+1000).toISOString()};
const preserved=bootstrapH2OptimizerCoverage({"EUR_USD|H1":h1,"EUR_USD|H2":nativeH2});
assert.equal(preserved["EUR_USD|H2"],nativeH2,"a genuine H2 optimizer record must never be overwritten by bootstrap coverage");

const index=fs.readFileSync(new URL("../public/index.html",import.meta.url),"utf8");
assert.match(index,/const TIMEFRAMES = Object\.freeze\(\["W","D","H4","H2","H1","M30","M15","M5","M1","S30","S5"\]\)/,"browser registry must expose H2 in chronological hierarchy order");
assert.match(index,/28 currency pairs by eleven timeframes with buy and sell signals/);
assert.match(index,/<option value="H2">H2<\/option>/,"Evaluation timeframe filter must expose H2");
assert.match(index,/el\("eventTimeframe"\)\.innerHTML=el\("chartTimeframe"\)\.innerHTML/,"HTL Schedule must inherit the shared chart timeframe selector including H2");

console.log("H2 timeframe certification passed: 28×11 registry, OANDA 7,200-second range sizing, MAS/IM hierarchy, browser surfaces, HTL selector inheritance, and non-destructive H1-to-H2 optimizer bootstrap are wired.");
