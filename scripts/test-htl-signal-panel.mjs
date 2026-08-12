import assert from "node:assert/strict";
import fs from "node:fs";

await import("../public/htl-signal-panel.js");
const api=globalThis.CTEHtlSignalPanel;
assert.ok(api,"HTL signal panel API must load headlessly");
assert.equal(api.VERSION,"CTE_HTL_SIGNAL_PANEL@1.0.0");
assert.equal(api.directionalGain("EUR_USD",1.1050,1.1000,1),50);
assert.equal(api.directionalGain("EUR_USD",1.0950,1.1000,-1),50);
assert.ok(Math.abs(api.directionalGain("USD_JPY",149.25,150,-1)-75)<1e-9);
assert.equal(api.directionalGain("EUR_USD",1.1,null,1),null);

const htl={facility:"HTL Schedule",timeframe:"M15",rows:[
  {pair:"EUR_USD",timeframe:"M15",length:20,filter:0,currentPrice:1.105,currentEvent:"BUY",currentEventOpen:1.1,completionWithin5Bars:.4,completionWithin10Bars:.7,durationMaeBars:3.25,durationValidationN:12,nextHtlEvent:"SELL",configurationSource:"COMPUTE_CONFIGURATION"},
  {pair:"GBP_USD",timeframe:"M15",length:30,filter:0,currentPrice:1.300,currentEvent:"SELL",currentEventOpen:1.305,completionWithin5Bars:.5,completionWithin10Bars:.8,durationMaeBars:4,durationValidationN:14,nextHtlEvent:"BUY",configurationSource:"COMPUTE_CONFIGURATION"}
]};
const signals={facility:"Timeframe Signal Schedule",indicator:"NAI",rows:[
  {pair:"EUR_USD",timeframe:"M15",indicator:"NAI",direction:1,signal:"BUY",confidence:.82,regime:"ADVANCE",length:20,filter:.5,completedCandle:"2026-08-12T15:15:00Z"},
  {pair:"GBP_USD",timeframe:"M15",indicator:"NAI",direction:1,signal:"BUY",confidence:.61,regime:"TRANSITION",length:30,filter:.5,completedCandle:"2026-08-12T15:15:00Z"},
  {pair:"EUR_USD",timeframe:"H1",indicator:"NAI",direction:-1,signal:"SELL",confidence:.9}
]};
const rows=api.normalizeFromTwoExports(htl,signals);
assert.equal(rows.length,2);assert.equal(rows[0].indicator,"NAI");assert.equal(rows[0].agreement,"MATCH");assert.ok(Math.abs(rows[0].gainPips-50)<1e-9);assert.equal(rows[0].durationValidationN,12);assert.equal(rows[1].agreement,"OPPOSED");assert.ok(Math.abs(rows[1].gainPips-50)<1e-9);assert.equal(rows[1].signal,"BUY");

const source=fs.readFileSync(new URL("../public/htl-signal-panel.js",import.meta.url),"utf8"),worker=fs.readFileSync(new URL("../src/worker.js",import.meta.url),"utf8"),pkg=JSON.parse(fs.readFileSync(new URL("../package.json",import.meta.url),"utf8"));
assert.match(source,/function normalizeFromTwoExports/);assert.match(source,/state\.scheduleEvaluations/);assert.match(source,/state\.eventRows|s\.eventRows/);assert.doesNotMatch(source,/fetch\(["']\/api\/engine\/status/,"panel must not depend on engine status for analytical rows");assert.match(source,/document\.getElementById\("analysisPanel"\)/,"panel must live in the Analytical Compound tab");assert.match(source,/firstFacility\?\.insertAdjacentElement\("afterend",root\)/,"panel must sit below Timeframe Signal Schedule and above the chart");assert.match(source,/data-hsap-sort/);assert.match(source,/sortDirection>0\?" ↑":" ↓"/);assert.match(source,/hsap-positive/);assert.match(source,/hsap-negative/);assert.match(source,/hsap-flat/);assert.match(source,/htlSignalPanelExport/);assert.match(source,/facility:"HTL \/ Signal Alignment"/);
assert.match(worker,/analytical-facilities\.js[^]*htl-signal-panel\.js[^]*runtime-integrity\.js/,"panel must load after analytical facilities and before runtime integrity");
assert.ok(pkg.scripts.check.includes("node --check public/htl-signal-panel.js"));assert.ok(pkg.scripts.check.includes("node scripts/test-htl-signal-panel.mjs"));
console.log("HTL signal alignment panel certification passed: frontend state/export join, directional gain, sortable headers/arrows, gain coloring, Analytical Compound placement, and JSON export are wired without a new backend endpoint.");
