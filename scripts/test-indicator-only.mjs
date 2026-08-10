import assert from "node:assert/strict";
import fs from "node:fs";
import { __indicatorOnlyTest } from "../src/engine-indicator-only.js";
import { __indicatorOnlyUnitsTest } from "../src/engine-indicator-only-units.js";

const {normalizeIndicatorOnly,indicatorOnlyFingerprint,indicatorOnlyCadenceMs,indicatorOnlySettings}=__indicatorOnlyTest;
const {normalizeIndicatorOnlyUnits,ioClientOrderId}=__indicatorOnlyUnitsTest;

const normalized=normalizeIndicatorOnly({enabled:true,pair:"EUR_NZD",timeframe:"S5",indicator:"DARE_N",length:27,filter:1.5});
assert.deepEqual(normalized,{enabled:true,pair:"EUR_NZD",timeframe:"S5",indicator:"DARE_N",length:27,filter:1.5});
assert.equal(normalizeIndicatorOnlyUnits(undefined),100);
assert.equal(normalizeIndicatorOnlyUnits(2500),2500);
assert.equal(normalizeIndicatorOnlyUnits(0),100);
assert.equal(normalizeIndicatorOnlyUnits(200000000),100000000);
assert.equal(ioClientOrderId("EUR_USD","event-a"),ioClientOrderId("EUR_USD","event-a"));
assert.notEqual(ioClientOrderId("EUR_USD","event-a"),ioClientOrderId("EUR_USD","event-b"));
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

const unitsEngine=fs.readFileSync(new URL("../src/engine-indicator-only-units.js",import.meta.url),"utf8");
assert.match(unitsEngine,/class HtlEngine extends IndicatorOnlyEngine/,"UNITS must wrap the existing exclusive IO engine rather than replace normal trading logic");
assert.match(unitsEngine,/state\.indicatorOnlyUnits=units/,"IO units must persist independently of signal-definition controls");
assert.match(unitsEngine,/ioControl=\{\.\.\.control,units\}/,"IO execution must receive the persisted units value");
assert.match(unitsEngine,/executeIndicatorOnlyUnits\(candidate,token,accountId,state\)/,"IO must have its own unit-aware entry path");
assert.match(unitsEngine,/requested>available/,"IO must compare the requested amount directly with OANDA directional unitsAvailable");
assert.doesNotMatch(unitsEngine,/safeCapacity|\.8\)/,"IO must not impose an invented directional-capacity haircut");
assert.doesNotMatch(unitsEngine,/marginAvailable/,"IO sizing authority must come from OANDA directional unitsAvailable rather than an additional margin gate");
assert.match(unitsEngine,/units:String\(signed\)/,"OANDA IO order must use the configured signed unit amount");
assert.match(unitsEngine,/indicatorOnlyUnits:normalizeIndicatorOnlyUnits\(candidate\.IO\.units\)/,"ledger decision context must disclose IO units");

const ui=fs.readFileSync(new URL("../public/indicator-only.js",import.meta.url),"utf8");
for(const id of ["indicatorOnlyToggle","indicatorOnlyPair","indicatorOnlyTimeframe","indicatorOnlyIndicator","indicatorOnlyLength","indicatorOnlyFilter","indicatorOnlyUnits"])assert.match(ui,new RegExp(id));
assert.match(ui,/CTE_INDICATOR_ONLY_UI@1\.2\.1/,"IO persistence repair version must be active");
assert.match(ui,/const panel=el\("chartPanel"\),anchor=panel\?\.querySelector\("\.panel-head"\)/,"IO control surface must mount in the Forensic Capitalization Chart header");
assert.match(ui,/anchor\.appendChild\(root\)/,"IO control must remain visibly inside the chart header");
assert.match(ui,/STRUCTURAL_IDS/,"IO signal-definition controls must remain a separate locked structural set");
assert.match(ui,/unitsNode\.disabled=busy/,"UNITS must remain editable while IO is engaged except during persistence");
assert.match(ui,/unitsDirty&&!unitsFocused/,"status polling must not overwrite a dirty or actively edited UNITS value");
assert.match(ui,/if\(busy\)return;\s*try\{/s,"status polling must not race an in-flight IO persistence request");
assert.match(ui,/function scheduleUnitsSave\(\)/,"UNITS must have an immediate debounced persistence path");
assert.match(ui,/setTimeout\(\(\)=>\{unitsSaveTimer=null;void save\(\{unitsEdit:true\}\);\},450\)/,"UNITS edits must persist without waiting for focus loss");
assert.match(ui,/unitsNode\.addEventListener\("input",scheduleUnitsSave\)/,"UNITS input edits must mark the local value authoritative while typing");
assert.match(ui,/if\(unitsEdit\)unitsDirty=false/,"a successful UNITS save must release the local dirty guard only after persistence");
assert.match(ui,/· U\$\{io\.units\}/,"IO active status must display the configured units");
assert.doesNotMatch(ui,/chartPair|chartTimeframe|chartStrategy|chartLength|chartFilter/,"Forensic chart parameter values and IO parameter values must remain independent");
assert.match(ui,/Disengage|disabled=enabled\|\|busy|lockNormal\(enabled\)/,"active IO structural controls must lock competing automated controls");
assert.match(ui,/\/api\/control\/selectedPairs/,"IO UI must persist through the existing authenticated control route");

const worker=fs.readFileSync(new URL("../src/worker.js",import.meta.url),"utf8");
assert.match(worker,/export \{ HtlEngine \} from "\.\/engine-indicator-only-units\.js"/);
assert.match(worker,/indicator-only\.js/);
assert.match(worker,/indicatorOnlyAuthority\(env\)/,"all browser order submissions must query server-side IO authority");
assert.match(worker,/Disengage IO before submitting any manual or candidate order/,"manual and candidate orders must be rejected while IO is active");
assert.match(worker,/Order route authority unavailable; order withheld/,"order route must fail closed when IO authority cannot be verified");

console.log("Indicator Only certification passed: independent IO controls, persistent editable units protected from status-poll overwrite, exact OANDA directional unitsAvailable sizing, exclusive selected-indicator authority, server-side order lock, protected reversal path, and 5s/30s/60s cadence are wired.");