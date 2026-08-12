import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source=fs.readFileSync(new URL("../public/analytical-facilities.js",import.meta.url),"utf8"),worker=fs.readFileSync(new URL("../src/worker.js",import.meta.url),"utf8"),pkg=JSON.parse(fs.readFileSync(new URL("../package.json",import.meta.url),"utf8"));
assert.match(source,/CTE_ANALYTICAL_FACILITIES@1\.1\.0/);
assert.match(source,/record\?\.config\?\.ASSET/,"HTL Schedule must resolve pair × timeframe HTL Asset configuration from optimizer records");
assert.match(source,/loadEventRow=async function\(pair,timeframe,_length/,"HTL event-row loader must replace the detached global length with optimizer-backed row configuration");
assert.match(source,/if\(!config\.configured\)throw new Error\(`Optimizer configuration unavailable/,"HTL Schedule must not silently substitute a generic configuration when optimizer configuration is absent");
assert.match(source,/length:config\.length,filter:config\.filter,configurationSource:config\.source/,"HTL rows must retain optimizer length, filter, and configuration source");
assert.match(source,/data-event-sort="length"/,"HTL Schedule must expose a sortable Length column");
assert.match(source,/data-event-sort="filter"/,"HTL Schedule must expose a sortable Filter column");
assert.match(source,/id="eventFilter"/,"HTL selected-row controls must expose Filter beside Length");
assert.match(source,/preloadEvaluationTimeframe\(timeframe\)/,"Evaluation Table must retain an explicit preload path");
assert.match(source,/!scheduleCoverageReady\(\)\)return false/,"Automatic Evaluation preload must yield while the 28 × 11 schedule universe is incomplete or loading");
assert.match(source,/loadSchedule=async function\(mode="full"\)\{const result=await prior\(mode\);if\(scheduleCoverageReady\(\)\)void preloadEvaluationTable\(\);return result;\}/,"Every completed schedule mode, including progressive backfill, must be able to start Evaluation preload only after full schedule coverage");
assert.doesNotMatch(source,/if\(mode==="focused"\|\|mode==="full"\)void preloadEvaluationTable\(\)/,"Focused schedule completion must no longer launch a higher-priority Evaluation preload ahead of progressive schedule coverage");
for(const id of ["exportEvaluationJson","exportPlatformDiagnosticJson","exportMacroPerformanceJson","exportEventLedgerJson","exportHtlScheduleJson","exportTimeframeSignalScheduleJson","exportRateFluctuationJson"])assert.match(source,new RegExp(id),`${id} must be installed`);
for(const facility of ["Evaluation Table","Platform Diagnostic","Macro Performance","Event Ledger","HTL Schedule","Timeframe Signal Schedule","Rate Fluctuation Ranking"])assert.match(source,new RegExp(facility.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")),`${facility} must have an underlying JSON payload`);
assert.match(source,/state\.diagnosticLast/,"Platform Diagnostic JSON must export the underlying diagnostic result, not scrape the visible cards");
assert.match(source,/state\.evaluationTableData/,"Evaluation JSON must use the underlying evaluation records");
assert.match(source,/record\?\.grossPerformance/,"Macro JSON must use authoritative optimizer performance rows");
assert.match(source,/state\.eventRows/,"HTL Schedule and Event Ledger JSON must use event model records");
assert.match(source,/state\.scheduleEvaluations/,"Timeframe Schedule JSON must use analytical schedule records");
assert.match(source,/scheduleIntegrityVersion:integrityVersion/,"HTL Schedule JSON rows must retain the guard methodology version");
assert.match(source,/durationValidationRawN/,"HTL Schedule JSON must retain raw duration validation sample count");
assert.match(source,/durationOutliersExcluded/,"HTL Schedule JSON must retain robust duration outlier count");
assert.match(source,/durationOutlierThresholdBars/,"HTL Schedule JSON must retain the robust duration outlier threshold");
assert.match(source,/completionValidationN/,"HTL Schedule JSON must retain completion validation sample count");
assert.match(source,/integrity:\{[^]*duration:\{[^]*completion:\{[^]*record:sourceIntegrity/,"HTL Schedule JSON must group guard provenance into a nested integrity object while preserving the full source record");
assert.match(source,/id="eventLedgerPairSelect"/,"Event Ledger must expose a pair-selection dropdown");
assert.match(source,/Follow selected pair/,"Event Ledger pair selector must support a follow-selected toggle");
assert.match(source,/async function eventLedgerExportPayload/,"Event Ledger JSON export must resolve the active ledger pair before export");
assert.match(source,/eventLedgerPairSelection/,"Event Ledger JSON must preserve pair-selection provenance");
assert.match(source,/getElementById\(\"eventLedger\"\)\?\.closest\(\"details\.event-ledger\"\)/,"Event Ledger controls and export must resolve from the actual Result / Profit table");
assert.doesNotMatch(source,/document\.querySelector\(\"\.event-ledger\"\)/,"Generic .event-ledger selection must not confuse Historical Event Survival with Result / Profit");
assert.match(source,/rateFluctuationRows/,"Evaluation panel must derive the 28-pair rate fluctuation ranking from underlying data");
assert.match(source,/absolutePipsPerHour/,"Rate fluctuation ranking must use absolute Evaluation Table pips-per-hour");
assert.match(source,/supportingEventMagnitudePips/,"Rate fluctuation ranking must expose supporting event magnitude");
assert.match(source,/Median \|Event P\/L\|/,"Rate fluctuation table must visibly identify its supporting event magnitude");
assert.match(source,/median absolute FINAL Event Ledger P\/L breaks ties/,"Rate fluctuation ranking rule must be explicit and reconstructable");
assert.match(worker,/ioi-iom-performance\.js[^]*analytical-facilities\.js/,"analytical facilities extension must load after existing chart/performance extensions");
assert.ok(pkg.scripts.check.includes("node --check public/analytical-facilities.js"));
assert.ok(pkg.scripts.check.includes("node scripts/test-analytical-facilities.mjs"));

const INSTRUMENTS=Array.from({length:28},(_,index)=>`PAIR_${index}`),TIMEFRAMES=Array.from({length:11},(_,index)=>`TF_${index}`);
const state={autoConfigurations:new Map([["EUR_USD|M15",{source:"COMPUTE_CONFIGURATION",computedAt:"2026-08-10T20:00:00Z",stamp:"2026-08-10T19:45:00Z",version:7,settings:{assetLength:10},config:{ASSET:{length:30,filter:0}}}]]),scheduleEvaluations:new Map(),scheduleFailures:new Map(),scheduleCandles:new Map(),scheduleLoading:false,evaluationTableData:[],evaluationTableTimeframe:null,selectedInstrument:"PAIR_0",selectedTimeframe:"TF_0",selectedScheduleStrategy:"ASSET"};
const support={PAIR_0:[4,8],PAIR_1:[10,14],PAIR_2:[20]};const sandbox={console,Math,Number,Array,Object,String,Boolean,Date,Map,Set,AbortController,state,INSTRUMENTS,TIMEFRAMES,STRATEGY_CONFIG:{ASSET:{length:10,filter:0}},MAX_ANALYTICAL_LENGTH:500,scheduleKey:(pair,timeframe)=>`${pair}|${timeframe}`,buildEventRow:(pair)=>({eventList:(support[pair]||[]).map((profitPips,index)=>({status:"FINAL",profitPips:index%2?-profitPips:profitPips}))}),CTEHtlScheduleIntegrity:{VERSION:"CTE_HTL_SCHEDULE_INTEGRITY@1.1.0"}};sandbox.globalThis=sandbox;
vm.runInNewContext(source,sandbox,{filename:"analytical-facilities.js"});
const resolved=sandbox.CTEAnalyticalFacilities.optimizerAssetConfiguration("EUR_USD","M15");
assert.equal(resolved.length,30);assert.equal(resolved.filter,0);assert.equal(resolved.source,"COMPUTE_CONFIGURATION");assert.equal(resolved.configured,true);
const missing=sandbox.CTEAnalyticalFacilities.optimizerAssetConfiguration("GBP_USD","M15");assert.equal(missing.configured,false);assert.equal(missing.source,"OPTIMIZER_UNAVAILABLE");
assert.equal(sandbox.CTEAnalyticalFacilities.scheduleDatasetTotal(),308);
for(let index=0;index<64;index++)state.scheduleEvaluations.set(`FOCUSED_${index}`,{});
assert.equal(sandbox.CTEAnalyticalFacilities.scheduleCoverageReady(),false,"the exact 64-dataset focused universe shown by the diagnostic must not release Evaluation preload");
for(let index=64;index<308;index++)state.scheduleEvaluations.set(`FULL_${index}`,{});
assert.equal(sandbox.CTEAnalyticalFacilities.scheduleCoverageReady(),true,"308/308 with no failures and no active schedule load must release Evaluation preload");
state.scheduleLoading=true;assert.equal(sandbox.CTEAnalyticalFacilities.scheduleCoverageReady(),false,"Evaluation preload must not contend with an active schedule load");state.scheduleLoading=false;
state.scheduleFailures.set("PAIR_0|TF_0",{error:"test"});assert.equal(sandbox.CTEAnalyticalFacilities.scheduleCoverageReady(),false,"unresolved schedule failures must keep Evaluation preload deferred");state.scheduleFailures.clear();

const fullIntegrity={completedEvents:197,provisionalEvents:1,durationValidationN:86,durationValidationRawN:91,durationOutliersExcluded:5,durationOutlierThresholdBars:22.5,durationMae:11.57,completionValidationN:73,completionWithin5Bars:.41,completionWithin10Bars:.72,durationStatus:"SUFFICIENT",completionStatus:"SUFFICIENT",excludedDurationEvents:[{eventNumber:51,errorBars:31}]};
const clean=sandbox.CTEAnalyticalFacilities.cleanEventScheduleRow({pair:"AUD_NZD",length:20,filter:0,configurationSource:"COMPUTE_CONFIGURATION",price:1.1234,currentEvent:"BUY",eventOpen:1.122,currentEventOpen:1.122,location:"AA",p5:.41,p10:.72,events:197,durationMae:11.57,durationValidationN:86,durationValidationRawN:91,durationOutliersExcluded:5,durationOutlierThresholdBars:22.5,durationValidationStatus:"SUFFICIENT",completionValidationN:73,completionValidationStatus:"SUFFICIENT",scheduleIntegrityVersion:"CTE_HTL_SCHEDULE_INTEGRITY@1.1.0",forecast:{integrity:fullIntegrity},envelopeMae:2.1,brier:.08,historicalBrier:.1,nextEvent:"SELL",envelopeLow:1.12,envelopeHigh:1.13,historyBars:5000},"M15");
assert.equal(clean.durationMaeBars,11.57);assert.equal(clean.durationValidationN,86);assert.equal(clean.durationValidationRawN,91);assert.equal(clean.durationOutliersExcluded,5);assert.equal(clean.durationOutlierThresholdBars,22.5);assert.equal(clean.durationValidationStatus,"SUFFICIENT");assert.equal(clean.completionValidationN,73);assert.equal(clean.completionValidationStatus,"SUFFICIENT");assert.equal(clean.scheduleIntegrityVersion,"CTE_HTL_SCHEDULE_INTEGRITY@1.1.0");
assert.equal(clean.integrity.version,"CTE_HTL_SCHEDULE_INTEGRITY@1.1.0");assert.equal(clean.integrity.duration.maeBars,11.57);assert.equal(clean.integrity.duration.validationN,86);assert.equal(clean.integrity.duration.rawValidationN,91);assert.equal(clean.integrity.duration.outliersExcluded,5);assert.equal(clean.integrity.completion.validationN,73);assert.equal(clean.integrity.completion.within5Bars,.41);assert.equal(clean.integrity.completion.within10Bars,.72);assert.deepEqual(clean.integrity.record,fullIntegrity);
state.evaluationTableTimeframe="TF_0";
state.evaluationTableData=[
  {pair:"PAIR_0",timeframe:"TF_0",signal:-1,regime:"TREND_ALIGNED",pipsPerHour:-12,priceCache:{TF_0:[{time:"2026-08-12T20:00:00Z"}]}},
  {pair:"PAIR_1",timeframe:"TF_0",signal:1,regime:"REVERSAL",pipsPerHour:12,priceCache:{TF_0:[{time:"2026-08-12T20:00:00Z"}]}},
  {pair:"PAIR_2",timeframe:"TF_0",signal:1,regime:"TREND_ALIGNED",pipsPerHour:5,priceCache:{TF_0:[{time:"2026-08-12T20:00:00Z"}]}}
];
const fluctuation=sandbox.CTEAnalyticalFacilities.rateFluctuationRows("TF_0");
assert.equal(fluctuation.length,3);assert.equal(fluctuation[0].pair,"PAIR_1","equal absolute rates must be ordered by larger supporting event magnitude");assert.equal(fluctuation[0].absolutePipsPerHour,12);assert.equal(fluctuation[0].supportingEventMagnitudePips,12);assert.equal(fluctuation[1].pair,"PAIR_0");assert.equal(fluctuation[1].supportingEventMagnitudePips,6);assert.equal(fluctuation[2].pair,"PAIR_2");assert.deepEqual(fluctuation.map(row=>row.rank),[1,2,3]);
const rankingPayload=sandbox.CTEAnalyticalFacilities.rateFluctuationExportPayload();assert.equal(rankingPayload.facility,"Rate Fluctuation Ranking");assert.equal(rankingPayload.timeframe,"TF_0");assert.equal(rankingPayload.rows[0].pair,"PAIR_1");assert.match(rankingPayload.rankingRule,/absolute Evaluation Table pips-per-hour/);
state.eventLedgerPairSelection="PAIR_1";state.eventLedgerTimeframe="TF_0";state.eventLedgerSelectedRow={pair:"PAIR_1",length:10,filter:0,configurationSource:"COMPUTE_CONFIGURATION",eventList:[{status:"FINAL",profitPips:14}]};
const ledgerPayload=await sandbox.CTEAnalyticalFacilities.eventLedgerExportPayload();assert.equal(ledgerPayload.pair,"PAIR_1");assert.equal(ledgerPayload.timeframe,"TF_0");assert.equal(ledgerPayload.pairSelection,"PAIR_1");assert.equal(ledgerPayload.events.length,1);
console.log("Analytical facilities certification passed: optimizer-backed HTL rows, guarded JSON provenance, schedule-first 308/308 coverage, deferred Evaluation preload, and all requested analytical JSON exports are certified.");