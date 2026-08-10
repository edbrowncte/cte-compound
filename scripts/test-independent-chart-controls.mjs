import fs from "node:fs";
import assert from "node:assert/strict";

const html=fs.readFileSync("public/index.html","utf8");
for(const id of ["chartPanel","evalChartPanel","eventChartPanel","chart","evalChart","eventChart","oscillatorCanvas","weeklyCognitionCanvas"]){
  assert.ok(!html.includes(`id="${id}"`),`deleted chart element returned: ${id}`);
}
assert.equal((html.match(/data-chart-model="capitalization"/g)||[]).length,0,"no visual chart component may remain");
assert.equal((html.match(/<canvas\b/g)||[]).length,0,"no chart canvas may remain");
for(const id of ["signalMatrix","mtfBody","evaluationTableContainer","evalTableBody","eventScheduleTable","eventScheduleBody","eventLedger","optimizerRegistryBody","analysisPanel","decisionCandidateStrip","platformDiagnosticGrid"]){
  assert.ok(html.includes(`id="${id}"`),`non-chart facility must remain: ${id}`);
}
for(const id of ["analyticalRuntimeState","evaluationRuntimeState","eventRuntimeState"]){
  assert.match(html,new RegExp(`id="${id}"[^>]*hidden`),`headless analytical state must remain safe: ${id}`);
}
console.log("All three chart surfaces are deleted while non-chart operating facilities remain.");
