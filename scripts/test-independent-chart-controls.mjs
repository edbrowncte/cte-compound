import fs from "node:fs";
import assert from "node:assert/strict";

const html=fs.readFileSync("public/index.html","utf8");
for(const id of ["chartPanel","chartStage","chart","oscillatorCanvas","weeklyCognitionCanvas","chartPair","chartTimeframe","chartStrategy","zoomIn","zoomOut","leftIndentOut","leftIndentIn","indentOut","indentIn","crosshairToggle","maximizeChart"]){
  assert.ok(html.includes(`id="${id}"`),`canonical chart element missing: ${id}`);
}
for(const id of ["evalChartPanel","eventChartPanel","evalChart","eventChart"]){
  assert.ok(!html.includes(`id="${id}"`),`legacy chart element returned: ${id}`);
}
assert.equal((html.match(/data-chart-model="canonical-single"/g)||[]).length,1,"exactly one canonical chart component is required");
assert.equal((html.match(/<canvas\b/g)||[]).length,3,"one chart, one MAS/IM oscillator, and one weekly cognition rail are required");
for(const id of ["signalMatrix","mtfBody","evaluationTableContainer","evalTableBody","eventScheduleTable","eventScheduleBody","eventLedger","optimizerRegistryBody","analysisPanel","decisionCandidateStrip","platformDiagnosticGrid"]){
  assert.ok(html.includes(`id="${id}"`),`non-chart facility must remain: ${id}`);
}
assert.match(html,/function canonicalChartDefinition\(strategy\)/);
assert.match(html,/fan=CHART_INDICATORS\.ASSET\.price/);
assert.match(html,/function refreshMainPressure\(pair,timeframe\)/);
assert.match(html,/drawOscillatorChart\(\);drawWeeklyCognition/);
console.log("One canonical synchronized chart and all non-chart operating facilities verified.");
