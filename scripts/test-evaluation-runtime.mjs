import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const engine=await readFile(new URL("../src/engine-certified-execution.js",import.meta.url),"utf8");
const worker=await readFile(new URL("../src/worker-base.js",import.meta.url),"utf8");
const html=await readFile(new URL("../public/index.html",import.meta.url),"utf8");

assert.doesNotMatch(engine,/evaluation\/history/,"certified engine must not expose obsolete slope-history API");
assert.doesNotMatch(engine,/slopeHistory/,"certified tick must not maintain obsolete raw slope histories");
assert.doesNotMatch(engine,/lastCandleTime/,"certified tick must not poll eight evaluation timeframes per pair");
assert.doesNotMatch(worker,/api\/evaluation\/history/,"Worker must not proxy the retired evaluation history route");
assert.doesNotMatch(html,/api\/evaluation\/history/,"Evaluation UI must be self-contained on canonical live candle data");
assert.match(html,/\/mas-im-calculator\.js/,"Evaluation UI must load the canonical MAS\/IM calculator");
assert.match(html,/evaluationPriceCache/,"Evaluation UI must assemble its live multitimeframe candle cache");

console.log("Canonical Evaluation runtime verified without obsolete slope-history polling or API routes.");
