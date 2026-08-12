import fs from "node:fs";

const analyticalPath="public/analytical-facilities.js";
const testPath="scripts/test-analytical-facilities.mjs";
const fragmentPath="scripts/event-ledger-rate-fluctuation.fragment";

function replaceOnce(source,needle,replacement,label){
  const first=source.indexOf(needle);
  if(first<0)throw new Error(`Missing ${label}`);
  if(source.indexOf(needle,first+needle.length)>=0)throw new Error(`Ambiguous ${label}`);
  return source.slice(0,first)+replacement+source.slice(first+needle.length);
}
function insertBeforeOnce(source,needle,insertion,label){
  const first=source.indexOf(needle);
  if(first<0)throw new Error(`Missing ${label}`);
  if(source.indexOf(needle,first+needle.length)>=0)throw new Error(`Ambiguous ${label}`);
  return source.slice(0,first)+insertion+source.slice(first);
}
function replaceRange(source,start,end,replacement,label){
  const first=source.indexOf(start);if(first<0)throw new Error(`Missing ${label} start`);
  const last=source.indexOf(end,first+start.length);if(last<0)throw new Error(`Missing ${label} end`);
  if(source.indexOf(start,first+start.length)>=0)throw new Error(`Ambiguous ${label} start`);
  return source.slice(0,first)+replacement+source.slice(last);
}

const fragment=fs.readFileSync(fragmentPath,"utf8");
function section(name,next){
  const marker=`@@${name}@@`,from=fragment.indexOf(marker);if(from<0)throw new Error(`Missing fragment ${name}`);
  const start=from+marker.length,end=next?fragment.indexOf(`@@${next}@@`,start):fragment.length;if(end<0)throw new Error(`Missing fragment boundary ${next}`);
  return fragment.slice(start,end).replace(/^\n/,"").replace(/\n$/,"\n");
}
const facilities=section("FACILITIES","LEDGER_EXPORT"),ledgerExport=section("LEDGER_EXPORT","STATIC_TESTS"),staticTests=section("STATIC_TESTS","DYNAMIC_TESTS"),dynamicTests=section("DYNAMIC_TESTS",null);

let source=fs.readFileSync(analyticalPath,"utf8");
source=replaceOnce(source,'const VERSION="CTE_ANALYTICAL_FACILITIES@1.0.2";','const VERSION="CTE_ANALYTICAL_FACILITIES@1.1.0",RATE_FLUCTUATION_VERSION="CTE_RATE_FLUCTUATION_RANKING@1.0.0",EVENT_LEDGER_FOLLOW="__FOLLOW_SELECTED__";',"analytical facility version");
source=insertBeforeOnce(source,'  function evaluationExportPayload(){',facilities,"evaluation export anchor");
source=replaceRange(source,'  function eventLedgerExportPayload(){','  function htlScheduleExportPayload(){',ledgerExport+"\n","event ledger export payload");
source=replaceOnce(source,'  function installExportButtons(){\n    addExportButton(document.querySelector("#evaluationTableContainer .head-controls"),"exportEvaluationJson","evaluation-table",evaluationExportPayload);','  function installExportButtons(){\n    ensureEventLedgerPairControl();ensureRateFluctuationFacility();\n    addExportButton(document.querySelector("#evaluationTableContainer .head-controls"),"exportEvaluationJson","evaluation-table",evaluationExportPayload);',"export installer opening");
source=replaceOnce(source,'  function installRuntime(){\n    if(typeof renderEventSchedule==="function"){','  function installRuntime(){\n    if(typeof loadOptimizerEventLedger==="function"){loadOptimizerEventLedger=async function(){return loadSelectedEventLedger();};}\n    if(typeof renderEvaluationTable==="function"){const prior=renderEvaluationTable;renderEvaluationTable=function(){const result=prior();renderRateFluctuationRanking();return result;};}\n    if(typeof renderEventSchedule==="function"){',"runtime installer opening");
source=replaceOnce(source,'  function install(){ensureEventFilterControl();ensureEventScheduleHeaders();syncSelectedEventConfiguration();installRuntime();installExportButtons();if(typeof marketDataReady==="function"&&marketDataReady()&&scheduleCoverageReady())void preloadEvaluationTable();}','  function install(){ensureEventFilterControl();ensureEventScheduleHeaders();ensureEventLedgerPairControl();ensureRateFluctuationFacility();syncSelectedEventConfiguration();installRuntime();installExportButtons();renderRateFluctuationRanking();if(typeof marketDataReady==="function"&&marketDataReady()&&scheduleCoverageReady())void preloadEvaluationTable();}',"install function");
source=replaceOnce(source,'  const api=Object.freeze({VERSION,optimizerAssetConfiguration,cleanEventScheduleRow,evaluationExportPayload,diagnosticExportPayload,macroExportPayload,eventLedgerExportPayload,htlScheduleExportPayload,timeframeSignalScheduleExportPayload,scheduleDatasetTotal,scheduleCoverageReady,preloadEvaluationTable});','  const api=Object.freeze({VERSION,RATE_FLUCTUATION_VERSION,optimizerAssetConfiguration,cleanEventScheduleRow,evaluationExportPayload,diagnosticExportPayload,macroExportPayload,eventLedgerExportPayload,htlScheduleExportPayload,timeframeSignalScheduleExportPayload,eventLedgerSelectedPair,rateFluctuationRows,rateFluctuationExportPayload,scheduleDatasetTotal,scheduleCoverageReady,preloadEvaluationTable});',"public API");
fs.writeFileSync(analyticalPath,source);

let test=fs.readFileSync(testPath,"utf8");
test=replaceOnce(test,'assert.match(source,/CTE_ANALYTICAL_FACILITIES@1\\.0\\.2/);','assert.match(source,/CTE_ANALYTICAL_FACILITIES@1\\.1\\.0/);',"test version");
test=replaceOnce(test,'for(const id of ["exportEvaluationJson","exportPlatformDiagnosticJson","exportMacroPerformanceJson","exportEventLedgerJson","exportHtlScheduleJson","exportTimeframeSignalScheduleJson"])','for(const id of ["exportEvaluationJson","exportPlatformDiagnosticJson","exportMacroPerformanceJson","exportEventLedgerJson","exportHtlScheduleJson","exportTimeframeSignalScheduleJson","exportRateFluctuationJson"])',"export button certification list");
test=replaceOnce(test,'for(const facility of ["Evaluation Table","Platform Diagnostic","Macro Performance","Event Ledger","HTL Schedule","Timeframe Signal Schedule"])','for(const facility of ["Evaluation Table","Platform Diagnostic","Macro Performance","Event Ledger","HTL Schedule","Timeframe Signal Schedule","Rate Fluctuation Ranking"])',"facility certification list");
test=insertBeforeOnce(test,'assert.match(worker,/ioi-iom-performance',staticTests,"static facility tests");
const stateOld='const state={autoConfigurations:new Map([["EUR_USD|M15",{source:"COMPUTE_CONFIGURATION",computedAt:"2026-08-10T20:00:00Z",stamp:"2026-08-10T19:45:00Z",version:7,settings:{assetLength:10},config:{ASSET:{length:30,filter:0}}}]]),scheduleEvaluations:new Map(),scheduleFailures:new Map(),scheduleLoading:false};';
const stateNew='const state={autoConfigurations:new Map([["EUR_USD|M15",{source:"COMPUTE_CONFIGURATION",computedAt:"2026-08-10T20:00:00Z",stamp:"2026-08-10T19:45:00Z",version:7,settings:{assetLength:10},config:{ASSET:{length:30,filter:0}}}]]),scheduleEvaluations:new Map(),scheduleFailures:new Map(),scheduleCandles:new Map(),scheduleLoading:false,evaluationTableData:[],evaluationTableTimeframe:null,selectedInstrument:"PAIR_0",selectedTimeframe:"TF_0",selectedScheduleStrategy:"ASSET"};';
test=replaceOnce(test,stateOld,stateNew,"sandbox state");
const sandboxOld='const sandbox={console,Math,Number,Array,Object,String,Boolean,Date,Map,Set,state,INSTRUMENTS,TIMEFRAMES,STRATEGY_CONFIG:{ASSET:{length:10,filter:0}},MAX_ANALYTICAL_LENGTH:500,scheduleKey:(pair,timeframe)=>`${pair}|${timeframe}`,CTEHtlScheduleIntegrity:{VERSION:"CTE_HTL_SCHEDULE_INTEGRITY@1.1.0"}};';
const sandboxNew='const support={PAIR_0:[4,8],PAIR_1:[10,14],PAIR_2:[20]};const sandbox={console,Math,Number,Array,Object,String,Boolean,Date,Map,Set,AbortController,state,INSTRUMENTS,TIMEFRAMES,STRATEGY_CONFIG:{ASSET:{length:10,filter:0}},MAX_ANALYTICAL_LENGTH:500,scheduleKey:(pair,timeframe)=>`${pair}|${timeframe}`,buildEventRow:(pair)=>({eventList:(support[pair]||[]).map((profitPips,index)=>({status:"FINAL",profitPips:index%2?-profitPips:profitPips}))}),CTEHtlScheduleIntegrity:{VERSION:"CTE_HTL_SCHEDULE_INTEGRITY@1.1.0"}};';
test=replaceOnce(test,sandboxOld,sandboxNew,"sandbox globals");
test=insertBeforeOnce(test,'console.log("Analytical facilities certification passed:',dynamicTests,"dynamic ranking tests");
fs.writeFileSync(testPath,test);

console.log("Applied Event Ledger pair selector/JSON export and 28-pair rate fluctuation ranking with JSON export.");
