import assert from "node:assert/strict";
import fs from "node:fs";

await import("../public/htl-schedule-integrity.js");
const api=globalThis.CTEHtlScheduleIntegrity;
assert.ok(api,"HTL schedule integrity API must load headlessly");
assert.equal(api.VERSION,"CTE_HTL_SCHEDULE_INTEGRITY@1.0.3");
assert.equal(api.MIN_DURATION_VALIDATION_SAMPLES,8);
assert.equal(api.MIN_COMPLETION_VALIDATION_SAMPLES,8);

const completed=Array.from({length:20},(_,index)=>({
  number:index+1,
  status:"FINAL",
  direction:index%2===0?1:-1,
  bars:index===14?80:(index%2===0?6:8),
}));
const provisional={number:21,status:"PROVISIONAL",direction:1,bars:2};
const validation=api.scheduleValidation([...completed,provisional]);
assert.equal(validation.completedEvents,20,"only FINAL events may enter historical validation");
assert.equal(validation.provisionalEvents,1,"the live PROVISIONAL event must remain outside historical duration validation");
assert.equal(validation.durationValidationRawN,15);
assert.equal(validation.durationOutliersExcluded,1,"one implausible historical duration error must be isolated by the robust trim");
assert.equal(validation.durationValidationN,14);
assert.equal(validation.durationMae,0);
assert.equal(validation.durationStatus,"SUFFICIENT");
assert.equal(validation.completionValidationN,10);
assert.equal(validation.completionWithin5Bars,0.9);
assert.equal(validation.completionWithin10Bars,0.9);
assert.equal(validation.completionStatus,"SUFFICIENT");
assert.equal(validation.excludedDurationEvents[0].eventNumber,15);

const thin=[...completed.slice(0,7),{number:8,status:"PROVISIONAL",direction:-1,bars:2}],thinValidation=api.scheduleValidation(thin);
assert.equal(thinValidation.durationStatus,"INSUFFICIENT_SAMPLE");
assert.equal(thinValidation.durationMae,null,"Duration MAE must be withheld instead of publishing a tiny-n estimate");
assert.equal(thinValidation.completionStatus,"INSUFFICIENT_SAMPLE");
assert.equal(thinValidation.completionWithin5Bars,null,"Completion probability must be withheld when the eligible same-direction sample is too small");
assert.equal(thinValidation.completionWithin10Bars,null);

const row=api.applyIntegrity({eventList:[...completed,provisional],forecast:{durationMae:99,validationN:1,prob5:1,prob10:1},durationMae:99,p5:1,p10:1});
assert.equal(row.durationMae,0);assert.equal(row.p5,0.9);assert.equal(row.p10,0.9);assert.equal(row.durationValidationN,14);assert.equal(row.durationOutliersExcluded,1);assert.equal(row.scheduleIntegrityVersion,api.VERSION);assert.equal(row.forecast.integrity.durationValidationN,14);

const worker=fs.readFileSync(new URL("../src/worker.js",import.meta.url),"utf8"),source=fs.readFileSync(new URL("../public/htl-schedule-integrity.js",import.meta.url),"utf8"),index=fs.readFileSync(new URL("../public/index.html",import.meta.url),"utf8");
assert.match(index,/completed=events\.filter\(event=>event\.status==="FINAL"\)/,"base HTL forecast must continue to exclude PROVISIONAL events");
assert.match(source,/MIN_DURATION_VALIDATION_SAMPLES=8/);assert.match(source,/MIN_COMPLETION_VALIDATION_SAMPLES=8/);assert.match(source,/event\?\.status==="FINAL"/);assert.match(source,/MAD_LIMIT=4\.5/);assert.match(source,/INSUFFICIENT_SAMPLE/);assert.match(source,/Duration validation/);assert.match(source,/FINAL events only/);
assert.match(worker,/htl-schedule-integrity\.js[^]*analytical-facilities\.js/,"HTL schedule integrity must install before the analytical-facilities wrapper so all event rows inherit guarded validation");
console.log("HTL Schedule integrity certification passed: FINAL-only history, minimum validation floors, robust duration-outlier isolation, completion-sample guards, and visible validation diagnostics are wired.");
