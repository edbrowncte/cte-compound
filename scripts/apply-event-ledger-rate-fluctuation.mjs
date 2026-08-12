import fs from "node:fs";

const analyticalPath="public/analytical-facilities.js";
const testPath="scripts/test-analytical-facilities.mjs";

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

let source=fs.readFileSync(analyticalPath,"utf8");
source=replaceOnce(source,
  'const VERSION="CTE_ANALYTICAL_FACILITIES@1.0.2";',
  'const VERSION="CTE_ANALYTICAL_FACILITIES@1.1.0",RATE_FLUCTUATION_VERSION="CTE_RATE_FLUCTUATION_RANKING@1.0.0",EVENT_LEDGER_FOLLOW="__FOLLOW_SELECTED__";',
  "analytical facility version");

const facilities=String.raw`
  function eventLedgerSelectedPair(){
    const selection=String(state.eventLedgerPairSelection||EVENT_LEDGER_FOLLOW);
    return typeof INSTRUMENTS!=="undefined"&&INSTRUMENTS.includes(selection)?selection:state.selectedInstrument;
  }

  function ensureEventLedgerPairControl(){
    if(typeof document==="undefined")return null;
    const ledger=document.querySelector(".event-ledger");if(!ledger)return null;
    let controls=ledger.querySelector(":scope > .head-controls");
    if(!controls){controls=document.createElement("div");controls.className="head-controls";controls.style.padding="7px 10px";ledger.querySelector("summary")?.insertAdjacentElement("afterend",controls);}
    let select=document.getElementById("eventLedgerPairSelect");
    if(!select){
      const label=document.createElement("label");label.className="field";label.dataset.eventLedgerPairControl="true";
      label.innerHTML='<span>Ledger Pair</span><select id="eventLedgerPairSelect" aria-label="Event Ledger currency pair"></select>';controls.prepend(label);select=label.querySelector("select");
      select.innerHTML='<option value="'+EVENT_LEDGER_FOLLOW+'">Follow selected pair</option>'+INSTRUMENTS.map(pair=>'<option value="'+pair+'">'+formatPair(pair)+'</option>').join("");
      select.addEventListener("change",()=>{state.eventLedgerPairSelection=select.value;state.eventLedgerSelectedRow=null;void loadSelectedEventLedger();});
    }
    if(!state.eventLedgerPairSelection)state.eventLedgerPairSelection=EVENT_LEDGER_FOLLOW;
    select.value=INSTRUMENTS.includes(state.eventLedgerPairSelection)?state.eventLedgerPairSelection:EVENT_LEDGER_FOLLOW;
    return select;
  }

  async function loadSelectedEventLedger(){
    if(typeof marketDataReady==="function"&&!marketDataReady())return null;
    const pair=eventLedgerSelectedPair(),timeframe=state.selectedTimeframe||currentEventTimeframe(),config=optimizerAssetConfiguration(pair,timeframe),node=typeof document!=="undefined"?document.getElementById("optimizerEventLedgerScope"):null;
    ensureEventLedgerPairControl();
    if(!config.configured){state.eventLedgerSelectedRow=null;if(node)node.textContent=`Event outcomes unavailable · optimizer configuration unavailable · ${formatPair(pair)} ${timeframe}`;const ledger=typeof document!=="undefined"?document.getElementById("eventLedger"):null;if(ledger)ledger.innerHTML='<tr><td colspan="13">Optimizer configuration unavailable for selected ledger pair/timeframe.</td></tr>';return null;}
    const controller=new AbortController(),scope=`Optimizer v${state.optimizerRuntimeVersion||7} · ${timeframe} · HTL Asset length ${config.length}`;if(node)node.textContent=`Loading ${formatPair(pair)} ${timeframe} optimizer event outcomes…`;
    try{
      const requested=typeof MAX_ANALYTICAL_HISTORY==="number"?MAX_ANALYTICAL_HISTORY:null,row=await loadEventRow(pair,timeframe,config.length,controller,70,requested);
      state.eventLedgerPair=pair;state.eventLedgerTimeframe=timeframe;state.eventLedgerSelectedRow=row;renderEventLedgerRows(row,scope);return row;
    }catch(error){state.eventLedgerSelectedRow=null;if(node)node.textContent=`Event outcomes unavailable · ${error.message||error}`;const ledger=typeof document!=="undefined"?document.getElementById("eventLedger"):null;if(ledger)ledger.innerHTML=`<tr><td colspan="13">${error.message||"Event outcomes unavailable"}</td></tr>`;return null;}
  }

  function finiteMedian(values){
    const ordered=(values||[]).map(Number).filter(Number.isFinite).sort((a,b)=>a-b);if(!ordered.length)return null;const middle=Math.floor(ordered.length/2);return ordered.length%2?ordered[middle]:(ordered[middle-1]+ordered[middle])/2;
  }

  function rateFluctuationEventSupport(row,timeframe){
    const pair=row?.pair;if(!pair)return{supportingEventMagnitudePips:null,supportingFinalEvents:0,eventLength:null,configurationSource:null};
    const key=typeof scheduleKey==="function"?scheduleKey(pair,timeframe):`${pair}|${timeframe}`,candles=row?.priceCache?.[timeframe]||state.scheduleCandles?.get?.(key)||[],config=optimizerAssetConfiguration(pair,timeframe),lastTime=candles.at?.(-1)?.time||"",cacheKey=`${key}|${config.length}|${candles.length}|${lastTime}`;
    if(!(state.rateFluctuationEventCache instanceof Map))state.rateFluctuationEventCache=new Map();if(state.rateFluctuationEventCache.has(cacheKey))return state.rateFluctuationEventCache.get(cacheKey);
    let result={supportingEventMagnitudePips:null,supportingFinalEvents:0,eventLength:config.length,configurationSource:config.source};
    if(typeof buildEventRow==="function"&&candles.length){
      try{const eventRow=buildEventRow(pair,candles,config.length),finals=(eventRow?.eventList||[]).filter(event=>event.status==="FINAL"&&Number.isFinite(Number(event.profitPips))),magnitudes=finals.map(event=>Math.abs(Number(event.profitPips)));result={...result,supportingEventMagnitudePips:finiteMedian(magnitudes),supportingFinalEvents:finals.length};}catch{}
    }
    state.rateFluctuationEventCache.set(cacheKey,result);return result;
  }

  function rateFluctuationRows(explicitTimeframe=null){
    const select=typeof document!=="undefined"?document.getElementById("evalTableTfFilter"):null,timeframe=explicitTimeframe||state.evaluationTableTimeframe||select?.value||null;
    const rows=(state.evaluationTableData||[]).filter(row=>!timeframe||row.timeframe===timeframe).map(row=>{
      const signed=Number(row.pipsPerHour),pipsPerHour=Number.isFinite(signed)?signed:null,support=rateFluctuationEventSupport(row,timeframe||row.timeframe);
      return{pair:row.pair,timeframe:row.timeframe,signal:Number(row.signal)||0,regime:row.regime||"NEUTRAL",pipsPerHour,absolutePipsPerHour:pipsPerHour===null?null:Math.abs(pipsPerHour),supportingEventMagnitudePips:support.supportingEventMagnitudePips,supportingFinalEvents:support.supportingFinalEvents,eventLength:support.eventLength,configurationSource:support.configurationSource};
    });
    rows.sort((a,b)=>{const ar=Number.isFinite(a.absolutePipsPerHour)?a.absolutePipsPerHour:-Infinity,br=Number.isFinite(b.absolutePipsPerHour)?b.absolutePipsPerHour:-Infinity;if(br!==ar)return br-ar;const am=Number.isFinite(a.supportingEventMagnitudePips)?a.supportingEventMagnitudePips:-Infinity,bm=Number.isFinite(b.supportingEventMagnitudePips)?b.supportingEventMagnitudePips:-Infinity;if(bm!==am)return bm-am;return String(a.pair).localeCompare(String(b.pair));});
    return rows.map((row,index)=>({...row,rank:index+1}));
  }

  function rateFluctuationExportPayload(){
    const rows=rateFluctuationRows(),select=typeof document!=="undefined"?document.getElementById("evalTableTfFilter"):null,timeframe=rows[0]?.timeframe||state.evaluationTableTimeframe||select?.value||null;
    return{facility:"Rate Fluctuation Ranking",version:RATE_FLUCTUATION_VERSION,analyticalFacilitiesVersion:VERSION,exportedAt:new Date().toISOString(),timeframe,indicator:state.selectedScheduleStrategy||null,pairCount:typeof INSTRUMENTS!=="undefined"?INSTRUMENTS.length:rows.length,rowCount:rows.length,rankingRule:"Descending absolute Evaluation Table pips-per-hour; median absolute FINAL Event Ledger P/L breaks ties.",supportingEventMagnitudeDefinition:"Median absolute profitPips across FINAL HTL Asset events for the same pair/timeframe using the optimizer-backed HTL length.",rows};
  }

  function ensureRateFluctuationFacility(){
    if(typeof document==="undefined")return null;
    const container=document.getElementById("evaluationTableContainer");if(!container)return null;let facility=document.getElementById("rateFluctuationRanking");
    if(!facility){facility=document.createElement("details");facility.id="rateFluctuationRanking";facility.className="data-details";facility.open=true;facility.innerHTML='<summary>Rate Fluctuation Ranking · 28 Currency Pairs</summary><div class="panel-head"><div class="panel-title"><h2>Rate Fluctuation Ranking</h2><p id="rateFluctuationScope">Awaiting Evaluation Table data.</p></div><div class="head-controls" id="rateFluctuationControls"></div></div><div class="performance-wrap"><table class="performance-table"><thead><tr><th>Rank</th><th>Pair</th><th>TF</th><th>Signal</th><th>Pips/Hr</th><th>|Pips/Hr|</th><th>Median |Event P/L|</th><th>FINAL events</th><th>HTL length</th><th>Regime</th></tr></thead><tbody id="rateFluctuationBody"><tr><td colspan="10">Awaiting Evaluation Table data.</td></tr></tbody></table></div>';container.appendChild(facility);}
    addExportButton(document.getElementById("rateFluctuationControls"),"exportRateFluctuationJson","rate-fluctuation-ranking",rateFluctuationExportPayload);return facility;
  }

  function renderRateFluctuationRanking(){
    ensureRateFluctuationFacility();if(typeof document==="undefined")return;const body=document.getElementById("rateFluctuationBody"),scope=document.getElementById("rateFluctuationScope");if(!body)return;
    const rows=rateFluctuationRows(),expected=typeof INSTRUMENTS!=="undefined"?INSTRUMENTS.length:rows.length,timeframe=rows[0]?.timeframe||state.evaluationTableTimeframe||document.getElementById("evalTableTfFilter")?.value||"—",fmt=(value,digits=1)=>Number.isFinite(value)?Number(value).toFixed(digits):"—";
    if(scope)scope.textContent=`${timeframe} · ${rows.length} / ${expected} pairs · rank by |Pips/Hr| · supporting magnitude = median |FINAL Event P/L|`;
    body.innerHTML=rows.map(row=>`<tr><td><b>${row.rank}</b></td><td><b>${formatPair(row.pair)}</b></td><td>${row.timeframe}</td><td class="${typeof directionClass==="function"?directionClass(row.signal):""}">${typeof signalWord==="function"?signalWord(row.signal):(row.signal>0?"BUY":row.signal<0?"SELL":"HOLD")}</td><td>${fmt(row.pipsPerHour)}</td><td><b>${fmt(row.absolutePipsPerHour)}</b></td><td>${fmt(row.supportingEventMagnitudePips)}</td><td>${row.supportingFinalEvents}</td><td>${row.eventLength??"—"}</td><td>${String(row.regime||"NEUTRAL").replaceAll("_"," ")}</td></tr>`).join("")||'<tr><td colspan="10">Awaiting synchronized Evaluation Table data.</td></tr>';
  }

`;
source=insertBeforeOnce(source,'  function evaluationExportPayload(){',facilities,"evaluation export anchor");

const oldLedgerExport=String.raw`  function eventLedgerExportPayload(){
    const pair=currentEventPair(),timeframe=currentEventTimeframe(),row=(state.eventRows||[]).find(item=>item.pair===pair)||null,events=row?.eventList||state.eventEvents||[];
    return{facility:"Event Ledger",version:VERSION,exportedAt:new Date().toISOString(),pair,timeframe,length:row?.length??(Number(document.getElementById("eventLength")?.value)||null),filter:row?.filter??(Number(document.getElementById("eventFilter")?.value)||0),configurationSource:row?.configurationSource||null,events};
  }
`;
const newLedgerExport=String.raw`  async function eventLedgerExportPayload(){
    const pair=eventLedgerSelectedPair(),timeframe=state.selectedTimeframe||currentEventTimeframe();let row=state.eventLedgerSelectedRow||null;
    if(!row||row.pair!==pair||state.eventLedgerTimeframe!==timeframe)row=await loadSelectedEventLedger();
    const config=optimizerAssetConfiguration(pair,timeframe),events=row?.eventList||[];
    return{facility:"Event Ledger",version:VERSION,exportedAt:new Date().toISOString(),pair,timeframe,pairSelection:state.eventLedgerPairSelection||EVENT_LEDGER_FOLLOW,length:row?.length??config.length,filter:row?.filter??config.filter,configurationSource:row?.configurationSource||config.source,configurationComputedAt:row?.configurationComputedAt||config.computedAt||null,events};
  }
`;
source=replaceOnce(source,oldLedgerExport,newLedgerExport,"event ledger export payload");

source=replaceOnce(source,
'  function installExportButtons(){\n    addExportButton(document.querySelector("#evaluationTableContainer .head-controls"),"exportEvaluationJson","evaluation-table",evaluationExportPayload);',
'  function installExportButtons(){\n    ensureEventLedgerPairControl();ensureRateFluctuationFacility();\n    addExportButton(document.querySelector("#evaluationTableContainer .head-controls"),"exportEvaluationJson","evaluation-table",evaluationExportPayload);',
"export installer opening");

source=replaceOnce(source,
'  function installRuntime(){\n    if(typeof renderEventSchedule==="function"){',
'  function installRuntime(){\n    if(typeof loadOptimizerEventLedger==="function"){loadOptimizerEventLedger=async function(){return loadSelectedEventLedger();};}\n    if(typeof renderEvaluationTable==="function"){const prior=renderEvaluationTable;renderEvaluationTable=function(){const result=prior();renderRateFluctuationRanking();return result;};}\n    if(typeof renderEventSchedule==="function"){',
"runtime installer opening");

source=replaceOnce(source,
'  function install(){ensureEventFilterControl();ensureEventScheduleHeaders();syncSelectedEventConfiguration();installRuntime();installExportButtons();if(typeof marketDataReady==="function"&&marketDataReady()&&scheduleCoverageReady())void preloadEvaluationTable();}',
'  function install(){ensureEventFilterControl();ensureEventScheduleHeaders();ensureEventLedgerPairControl();ensureRateFluctuationFacility();syncSelectedEventConfiguration();installRuntime();installExportButtons();renderRateFluctuationRanking();if(typeof marketDataReady==="function"&&marketDataReady()&&scheduleCoverageReady())void preloadEvaluationTable();}',
"install function");

source=replaceOnce(source,
'  const api=Object.freeze({VERSION,optimizerAssetConfiguration,cleanEventScheduleRow,evaluationExportPayload,diagnosticExportPayload,macroExportPayload,eventLedgerExportPayload,htlScheduleExportPayload,timeframeSignalScheduleExportPayload,scheduleDatasetTotal,scheduleCoverageReady,preloadEvaluationTable});',
'  const api=Object.freeze({VERSION,RATE_FLUCTUATION_VERSION,optimizerAssetConfiguration,cleanEventScheduleRow,evaluationExportPayload,diagnosticExportPayload,macroExportPayload,eventLedgerExportPayload,htlScheduleExportPayload,timeframeSignalScheduleExportPayload,eventLedgerSelectedPair,rateFluctuationRows,rateFluctuationExportPayload,scheduleDatasetTotal,scheduleCoverageReady,preloadEvaluationTable});',
"public API");

fs.writeFileSync(analyticalPath,source);

let test=fs.readFileSync(testPath,"utf8");
test=replaceOnce(test,'assert.match(source,/CTE_ANALYTICAL_FACILITIES@1\\.0\\.2/);','assert.match(source,/CTE_ANALYTICAL_FACILITIES@1\\.1\\.0/);',"test version");
test=replaceOnce(test,
'for(const id of ["exportEvaluationJson","exportPlatformDiagnosticJson","exportMacroPerformanceJson","exportEventLedgerJson","exportHtlScheduleJson","exportTimeframeSignalScheduleJson"])',
'for(const id of ["exportEvaluationJson","exportPlatformDiagnosticJson","exportMacroPerformanceJson","exportEventLedgerJson","exportHtlScheduleJson","exportTimeframeSignalScheduleJson","exportRateFluctuationJson"])',
"export button certification list");
test=replaceOnce(test,
'for(const facility of ["Evaluation Table","Platform Diagnostic","Macro Performance","Event Ledger","HTL Schedule","Timeframe Signal Schedule"])',
'for(const facility of ["Evaluation Table","Platform Diagnostic","Macro Performance","Event Ledger","HTL Schedule","Timeframe Signal Schedule","Rate Fluctuation Ranking"])',
"facility certification list");
const staticTests=String.raw`assert.match(source,/id="eventLedgerPairSelect"/,"Event Ledger must expose a pair-selection dropdown");
assert.match(source,/Follow selected pair/,"Event Ledger pair selector must support a follow-selected toggle");
assert.match(source,/async function eventLedgerExportPayload/,"Event Ledger JSON export must resolve the active ledger pair before export");
assert.match(source,/eventLedgerPairSelection/,"Event Ledger JSON must preserve pair-selection provenance");
assert.match(source,/rateFluctuationRows/,"Evaluation panel must derive the 28-pair rate fluctuation ranking from underlying data");
assert.match(source,/absolutePipsPerHour/,"Rate fluctuation ranking must use absolute Evaluation Table pips-per-hour");
assert.match(source,/supportingEventMagnitudePips/,"Rate fluctuation ranking must expose supporting event magnitude");
assert.match(source,/Median \|Event P\/L\|/,"Rate fluctuation table must visibly identify its supporting event magnitude");
assert.match(source,/median absolute FINAL Event Ledger P\/L breaks ties/,"Rate fluctuation ranking rule must be explicit and reconstructable");
`;
test=insertBeforeOnce(test,'assert.match(worker,/ioi-iom-performance\\.js[^]*analytical-facilities\\.js/,',staticTests,"worker load assertion");

const sandboxNeedle='const state={autoConfigurations:new Map([["EUR_USD|M15",{source:"COMPUTE_CONFIGURATION",computedAt:"2026-08-10T20:00:00Z",stamp:"2026-08-10T19:45:00Z",version:7,settings:{assetLength:10},config:{ASSET:{length:30,filter:0}}}]]),scheduleEvaluations:new Map(),scheduleFailures:new Map(),scheduleLoading:false};';
const sandboxReplacement='const state={autoConfigurations:new Map([["EUR_USD|M15",{source:"COMPUTE_CONFIGURATION",computedAt:"2026-08-10T20:00:00Z",stamp:"2026-08-10T19:45:00Z",version:7,settings:{assetLength:10},config:{ASSET:{length:30,filter:0}}}]]),scheduleEvaluations:new Map(),scheduleFailures:new Map(),scheduleCandles:new Map(),scheduleLoading:false,evaluationTableData:[],evaluationTableTimeframe:null,selectedInstrument:"PAIR_0",selectedTimeframe:"TF_0",selectedScheduleStrategy:"ASSET"};';
test=replaceOnce(test,sandboxNeedle,sandboxReplacement,"sandbox state");
const sandboxOld='const sandbox={console,Math,Number,Array,Object,String,Boolean,Date,Map,Set,state,INSTRUMENTS,TIMEFRAMES,STRATEGY_CONFIG:{ASSET:{length:10,filter:0}},MAX_ANALYTICAL_LENGTH:500,scheduleKey:(pair,timeframe)=>`${pair}|${timeframe}`,CTEHtlScheduleIntegrity:{VERSION:"CTE_HTL_SCHEDULE_INTEGRITY@1.1.0"}};';
const sandboxNew='const support={PAIR_0:[4,8],PAIR_1:[10,14],PAIR_2:[20]};const sandbox={console,Math,Number,Array,Object,String,Boolean,Date,Map,Set,AbortController,state,INSTRUMENTS,TIMEFRAMES,STRATEGY_CONFIG:{ASSET:{length:10,filter:0}},MAX_ANALYTICAL_LENGTH:500,scheduleKey:(pair,timeframe)=>`${pair}|${timeframe}`,buildEventRow:(pair)=>({eventList:(support[pair]||[]).map((profitPips,index)=>({status:"FINAL",profitPips:index%2?-profitPips:profitPips}))}),CTEHtlScheduleIntegrity:{VERSION:"CTE_HTL_SCHEDULE_INTEGRITY@1.1.0"}};';
test=replaceOnce(test,sandboxOld,sandboxNew,"sandbox globals");
const dynamicTests=String.raw`
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
`;
test=insertBeforeOnce(test,'console.log("Analytical facilities certification passed:',dynamicTests,"final analytical facilities certification message");
fs.writeFileSync(testPath,test);

console.log("Applied Event Ledger pair selector/JSON export and 28-pair rate fluctuation ranking with JSON export.");
