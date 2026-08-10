import assert from "node:assert/strict";
import fs from "node:fs";
import { __indicatorOnlyTest } from "../src/engine-indicator-only.js";

const {normalizeIndicatorOnly,indicatorOnlyFingerprint,indicatorOnlyCadenceMs,indicatorOnlySettings}=__indicatorOnlyTest;

const normalized=normalizeIndicatorOnly({enabled:true,pair:"EUR_NZD",timeframe:"S5",indicator:"DARE_N",length:27,filter:1.5});
assert.deepEqual(normalized,{enabled:true,pair:"EUR_NZD",timeframe:"S5",indicator:"DARE_N",length:27,filter:1.5});
assert.equal(indicatorOnlyCadenceMs("S5"),5000);
assert.equal(indicatorOnlyCadenceMs("S30"),30000);
assert.equal(indicatorOnlyCadenceMs("M1"),60000);
assert.equal(indicatorOnlyCadenceMs("H1"),60000);
assert.notEqual(indicatorOnlyFingerprint(normalized),indicatorOnlyFingerprint({...normalized,pair:"EUR_USD"}));

const dareN=indicatorOnlySettings(normalized);
assert.equal(dareN.dareNLength,27);
assert.equal(dareN.dareNFilter,1.5);
const asset=indicatorOnlySettings({enabled:true,pair:"EUR_NZD",timeframe:"M1",indicator:"ASSET",length:31,filter:2});
assert.equal(asset.assetLength,31);
const nai=indicatorOnlySettings({enabled:true,pair:"EUR_NZD",timeframe:"M1",indicator:"NAI",length:19,filter:.5});
assert.equal(nai.naiLength,19);
assert.equal(nai.naiFilter,.5);
const apex=indicatorOnlySettings({enabled:true,pair:"EUR_NZD",timeframe:"M1",indicator:"APEX",length:13,filter:3});
assert.equal(apex.apexLength,13);
assert.equal(apex.apexFilter,3);

const engine=fs.readFileSync(new URL("../src/engine-indicator-only.js",import.meta.url),"utf8");
assert.match(engine,/if\(!control\.enabled\)return super\.tick\(\)/,"normal certified tick must remain the exact fall-through when IO is off");
assert.match(engine,/await this\.tickIndicatorOnly\(state,control\)/,"IO must own the tick while engaged");
assert.match(engine,/if\(normalizeIndicatorOnly\(state\?\.indicatorOnly\)\.enabled\)return;/,"normal reconciliation must be suppressed while IO is engaged");
assert.match(engine,/state\.pendingReversals=\{\}/,"pre-existing normal reversal claims must be cleared on IO engagement");
assert.match(engine,/"Indicator Only opposing indicator signal reversal"/,"only the opposing selected indicator signal may reverse the IO position");
assert.match(engine,/await this\.ctx\.storage\.setAlarm\(due\)/,"IO must reschedule its dedicated sub-minute-capable Durable Object alarm");
assert.match(engine,/path==="\/control\/indicatorOnly"&&request\.method==="GET"/,"Worker order authority must have a lightweight Durable Object IO state source");
assert.doesNotMatch(engine,/ageMarketWindow|reallocationDecision|continuationExpectation|this\.choose\(/,"IO wrapper must not invoke AGE, MTF candidate selection, or normal capital reallocation");

const ui=fs.readFileSync(new URL("../public/indicator-only.js",import.meta.url),"utf8");
for(const id of ["indicatorOnlyToggle","indicatorOnlyPair","indicatorOnlyTimeframe","indicatorOnlyIndicator","indicatorOnlyLength","indicatorOnlyFilter"])assert.match(ui,new RegExp(id));
assert.match(ui,/Disengage|disabled=enabled\|\|busy|lockNormal\(enabled\)/,"active IO controls must lock competing automated controls");
assert.match(ui,/\/api\/control\/selectedPairs/,"IO UI must persist through the existing authenticated control route");

const worker=fs.readFileSync(new URL("../src/worker.js",import.meta.url),"utf8");
assert.match(worker,/export \{ HtlEngine \} from "\.\/engine-indicator-only\.js"/);
assert.match(worker,/indicator-only\.js/);
assert.match(worker,/indicatorOnlyAuthority\(env\)/,"all browser order submissions must query server-side IO authority");
assert.match(worker,/Disengage IO before submitting any manual or candidate order/,"manual and candidate orders must be rejected while IO is active");
assert.match(worker,/Order route authority unavailable; order withheld/,"order route must fail closed when IO authority cannot be verified");

console.log("Indicator Only certification passed: exclusive selected-indicator authority, server-side order lock, protected reversal path, and 5s\/30s\/60s cadence are wired without modifying the certified normal engine.");
