import assert from "node:assert/strict";
import fs from "node:fs";

await import("../public/htl-schedule-integrity.js");
await import("../public/analytical-table-sorting.js");
const api=globalThis.CTEHtlScheduleIntegrity,tableApi=globalThis.CTEAnalyticalTableSorting;
assert.ok(api,"HTL schedule integrity API must load headlessly");
assert.ok(tableApi,"analytical table sorting API must load headlessly");
assert.equal(api.VERSION,"CTE_HTL_SCHEDULE_INTEGRITY@1.2.0");
assert.equal(api.SURVIVAL_VERSION,"CTE_HTL_EVENT_SURVIVAL@1.1.0");
assert.equal(tableApi.VERSION,"CTE_ANALYTICAL_TABLE_SORTING@1.0.0");
assert.equal(api.MIN_DURATION_VALIDATION_SAMPLES,8);
assert.equal(api.MIN_COMPLETION_VALIDATION_SAMPLES,8);
assert.equal(api.SURVIVAL_COLUMNS.length,14,"every Historical Event Survival column must participate in the sort contract");
assert.equal(tableApi.RATE_COLUMNS[2][0],"Timeframe","Rate Fluctuation must expose the full Timeframe column label");
assert.equal(tableApi.EVENT_LEDGER_COLUMNS[1][0],"Timeframe","Event Ledger must expose Timeframe immediately after Event");
assert.equal(tableApi.RATE_COLUMNS.length,13,"every Rate Fluctuation column must participate in the sort contract");
assert.equal(tableApi.EVENT_LEDGER_COLUMNS.length,14,"every expanded Event Ledger column must participate in the sort contract");
assert.ok(tableApi.compareValues("2.5","10.2","number",1)<0,"numeric table sorting must compare values numerically");
assert.ok(tableApi.compareValues("SELL 9","BUY 12","event",-1)>0,"event-number sorting must use the event number rather than the BUY/SELL prefix");

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

const survivalHistory=[
  {number:1,status:"FINAL",direction:-1,bars:10,upBps:1,downBps:-10,openPrice:1.1},
  {number:2,status:"FINAL",direction:-1,bars:11,upBps:5,downBps:-20,openPrice:1.1},
  {number:3,status:"FINAL",direction:-1,bars:15,upBps:3,downBps:-30,openPrice:1.1},
  {number:4,status:"FINAL",direction:-1,bars:20,upBps:7,downBps:-40,openPrice:1.1},
  {number:5,status:"FINAL",direction:1,bars:30,upBps:50,downBps:-2,openPrice:1.1},
  {number:6,status:"PROVISIONAL",direction:-1,bars:50,upBps:20,downBps:-80,openPrice:1.1},
];
const currentSell={number:7,status:"PROVISIONAL",direction:-1,bars:11,upBps:4,downBps:-25,openPrice:1.1};
const survival=api.survivalStatistics([...survivalHistory,currentSell],currentSell,5);
assert.equal(survival.n,3,"survival sample must contain FINAL same-direction events that reached the current event age");
assert.equal(survival.historicalSurvival,1/3,"+5 survival requires total historical duration >= current age + 5 bars");
assert.equal(survival.meanBars,46/3);
assert.equal(survival.medianBars,15);
assert.equal(survival.meanFavorableMoveBps,30,"SELL favorable excursion is the magnitude of downside from event open");
assert.equal(survival.meanAdverseMoveBps,5,"SELL adverse excursion is upside from event open");
assert.equal(survival.medianUltimateUpsideBps,5);
assert.equal(survival.medianUltimateDownsideBps,-30);
assert.equal(survival.p25UltimateUpsideBps,4);
assert.equal(survival.p25UltimateDownsideBps,-35);
assert.deepEqual(survival.survivalCurve.map(item=>item.additionalLifeBars),[1,5,10,18]);

const twentyEightRows=Array.from({length:28},(_,index)=>({pair:`PAIR_${index+1}`,price:1,eventOpen:1,eventList:[...survivalHistory,currentSell]}));
assert.equal(api.buildSurvivalRows(twentyEightRows,5).length,28,"a single selected horizon must preserve one row for each of the 28 schedule pairs");
const fullSurvivalRows=api.buildSurvivalRows(twentyEightRows);
assert.equal(fullSurvivalRows.length,112,"the default HTL survival table must publish 28 pairs × four additional-life horizons");
assert.equal(new Set(fullSurvivalRows.map(item=>item.pair)).size,28);
assert.deepEqual([...new Set(fullSurvivalRows.map(item=>item.additionalEventLifeBars))],[1,5,10,18]);
const survivalSorted=api.sortRows([{pair:"B",meanBars:2},{pair:"A",meanBars:8}],{key:"pair",direction:1});assert.deepEqual(survivalSorted.map(item=>item.pair),["A","B"]);
const survivalNumeric=api.sortRows([{pair:"A",meanBars:2},{pair:"B",meanBars:8}],{key:"meanBars",direction:-1});assert.deepEqual(survivalNumeric.map(item=>item.meanBars),[8,2]);

const worker=fs.readFileSync(new URL("../src/worker.js",import.meta.url),"utf8"),source=fs.readFileSync(new URL("../public/htl-schedule-integrity.js",import.meta.url),"utf8"),tableSource=fs.readFileSync(new URL("../public/analytical-table-sorting.js",import.meta.url),"utf8"),index=fs.readFileSync(new URL("../public/index.html",import.meta.url),"utf8");
assert.match(index,/completed=events\.filter\(event=>event\.status==="FINAL"\)/,"base HTL forecast must continue to exclude PROVISIONAL events");
assert.match(source,/MIN_DURATION_VALIDATION_SAMPLES=8/);assert.match(source,/MIN_COMPLETION_VALIDATION_SAMPLES=8/);assert.match(source,/event\?\.status==="FINAL"/);assert.match(source,/MAD_LIMIT=4\.5/);assert.match(source,/INSUFFICIENT_SAMPLE/);assert.match(source,/Duration validation/);assert.match(source,/FINAL events only/);
assert.match(source,/Historical Event Survival · Current Event Maturity/);assert.match(source,/data-survival-sort/);assert.match(source,/aria-sort/);assert.match(source,/Additional event life/);assert.match(source,/Historical survival/);assert.match(source,/Mean favorable move/);assert.match(source,/Mean adverse move/);assert.match(source,/Median ultimate upside/);assert.match(source,/25th-pctl downside/);assert.match(source,/exportEventSurvivalJson/);assert.match(source,/cte-compound-htl-event-survival-/);
assert.match(tableSource,/RATE_COLUMNS/);assert.match(tableSource,/EVENT_LEDGER_COLUMNS/);assert.match(tableSource,/\["Timeframe","text"\]/);assert.match(tableSource,/data-rate-table-sort/);assert.match(tableSource,/data-event-ledger-table-sort/);assert.match(tableSource,/data\.eventLedgerTimeframe|eventLedgerTimeframe/);assert.match(tableSource,/colSpan=14/);
assert.match(worker,/htl-schedule-integrity\.js[^]*analytical-facilities\.js/,"HTL schedule integrity must install before the analytical-facilities wrapper so all event rows inherit guarded validation");
assert.match(worker,/htl-signal-panel\.js[^]*analytical-table-sorting\.js[^]*runtime-integrity\.js/,"sortable analytical table controls must load after analytical facilities and before final runtime integrity");
console.log("HTL Schedule integrity and analytical table certification passed: FINAL-only history, guarded validation, sortable 28×4 survival coverage, sortable Rate Fluctuation with Timeframe, sortable Result / Profit ledger with Timeframe, and JSON export are wired.");