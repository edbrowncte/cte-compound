import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
await import("../public/schedule-dataset-accounting.js");

const api=globalThis.CTEScheduleDatasetAccounting;
assert.equal(api.VERSION,"CTE_SCHEDULE_DATASET_ACCOUNTING@1.0.0");
const failures=new Map([
  ["EUR_USD|M5",{instrument:"EUR_USD",timeframe:"M5",error:"refresh failed",attempts:2}],
  ["EUR_CAD|S30",{instrument:"EUR_CAD",timeframe:"S30",error:"analysis failed",attempts:1}],
  ["GBP_JPY|H2",{instrument:"GBP_JPY",timeframe:"H2",error:"load failed",attempts:2}],
]);
const evaluations=new Map([["EUR_USD|M5",{latest:{}}],["AUD_USD|M1",{latest:{}}]]);
const accounting=api.scheduleFailureAccounting(failures,evaluations);
assert.equal(accounting.rawFailureCount,3);
assert.equal(accounting.unresolvedFailureCount,2);
assert.equal(accounting.refreshFailureCount,1);
assert.deepEqual(accounting.unresolved.map(item=>item.key),["EUR_CAD|S30","GBP_JPY|H2"]);
assert.deepEqual(accounting.refreshWarnings.map(item=>item.key),["EUR_USD|M5"]);

const map=new api.ScheduleFailureMap(failures,()=>evaluations);
assert.equal(map.size,2,"ScheduleFailureMap.size must mean unresolved datasets, not raw refresh failures");
assert.equal(map.rawSize,3);
evaluations.set("GBP_JPY|H2",{latest:{}});
assert.equal(map.size,1,"A newly available dataset must immediately stop counting as unresolved while retaining its refresh failure record");
assert.equal(map.rawSize,3,"Failure history must remain available for retry/forensics");

const worker=await readFile(new URL("../src/worker.js",import.meta.url),"utf8");
assert.match(worker,/schedule-dataset-accounting\.js/);
const runtime=await readFile(new URL("../public/schedule-dataset-accounting.js",import.meta.url),"utf8");
assert.match(runtime,/Schedule failure identities/);
assert.match(runtime,/unresolvedFailures/);
assert.match(runtime,/refreshWarnings/);
console.log("Schedule dataset accounting verified: unresolved availability is separated from refresh warnings while full failure identities remain retryable and exportable.");
