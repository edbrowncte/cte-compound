import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const engine=await readFile(new URL("../src/engine-certified-execution.js",import.meta.url),"utf8");
const worker=await readFile(new URL("../src/worker-base.js",import.meta.url),"utf8");
const html=await readFile(new URL("../public/index.html",import.meta.url),"utf8");
const calculator=await readFile(new URL("../public/mas-im-calculator.js",import.meta.url),"utf8");

assert.doesNotMatch(engine,/evaluation\/history/,"certified engine must not expose obsolete slope-history API");
assert.doesNotMatch(engine,/slopeHistory/,"certified tick must not maintain obsolete raw slope histories");
assert.doesNotMatch(engine,/lastCandleTime/,"certified tick must not poll Evaluation timeframes per pair");
assert.doesNotMatch(worker,/api\/evaluation\/history/,"Worker must not proxy the retired evaluation history route");
assert.doesNotMatch(html,/api\/evaluation\/history/,"Evaluation UI must be self-contained on canonical live candle data");
assert.match(html,/\/mas-im-calculator\.js/,"Evaluation UI must load the canonical MAS\/IM calculator");
assert.match(html,/calculateMASIMPressure/,"Evaluation UI must use antagonist-pressure MAS\/IM v2");
assert.match(html,/evaluationPriceCache/,"Evaluation UI must assemble its live multitimeframe candle cache");
assert.match(html,/sort-masRoc/,"Evaluation table must expose MAS acceleration\/deterioration");
assert.match(html,/sort-imRoc/,"Evaluation table must expose IM acceleration\/deterioration");
assert.match(html,/sort-ratioRoc/,"Evaluation table must expose pressure-ratio momentum");
assert.match(html,/sort-eventAngleZ/,"Evaluation table must expose event power Z");
assert.match(html,/sort-convexity/,"Evaluation table must expose event convexity");
assert.match(html,/sort-requiredIm/,"Evaluation table must expose required IM");
assert.match(html,/sort-transitionProbability/,"Evaluation table must expose transition probability");
assert.match(html,/sort-regime/,"Evaluation table must expose the MAS\/IM regime");
assert.match(html,/<option value="S5">S5<\/option>/,"Evaluation must include S5");
assert.match(html,/<option value="S30">S30<\/option>/,"Evaluation must include S30");
assert.doesNotMatch(html,/id="sort-mas_z"/,"legacy MAS-Z table definition must not return");
assert.doesNotMatch(html,/id="evalMetricMasZ"/,"legacy MAS-Z summary card must not return");
assert.match(calculator,/MAS_ANTAGONIST_PRESSURE@2\.0\.0/,"canonical calculator must identify MAS v2");
assert.match(calculator,/TIMESTAMP_SYNCHRONIZED_HIERARCHICAL_PRESSURE/,"calculator must declare timestamp synchronization");
assert.match(calculator,/masWeight=index\+1,imWeight=n-index/,"calculator must retain exact reverse MAS\/IM cadence");
assert.match(calculator,/Required IM|REQUIRED_IM/,"calculator must expose transition-force requirement");

console.log("MAS antagonist-pressure Evaluation runtime, hierarchy, acceleration, event-power, and transition diagnostics verified.");
