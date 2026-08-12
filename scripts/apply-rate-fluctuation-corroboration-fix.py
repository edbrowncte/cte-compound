from pathlib import Path

SOURCE = Path('public/analytical-facilities.js')
TEST = Path('scripts/test-analytical-facilities.mjs')


def replace_once(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected exactly one match, found {count}')
    return text.replace(old, new, 1)


def replace_between(text, start, end, replacement, label):
    first = text.find(start)
    if first < 0:
        raise SystemExit(f'{label}: start marker missing')
    second = text.find(end, first)
    if second < 0:
        raise SystemExit(f'{label}: end marker missing')
    if text.find(start, first + 1) >= 0:
        raise SystemExit(f'{label}: start marker is not unique')
    return text[:first] + replacement + text[second:]


source = SOURCE.read_text()
source = replace_once(
    source,
    '  const VERSION="CTE_ANALYTICAL_FACILITIES@1.1.0",RATE_FLUCTUATION_VERSION="CTE_RATE_FLUCTUATION_RANKING@1.0.0",EVENT_LEDGER_FOLLOW="__FOLLOW_SELECTED__";',
    '  const VERSION="CTE_ANALYTICAL_FACILITIES@1.2.0",RATE_FLUCTUATION_VERSION="CTE_RATE_FLUCTUATION_RANKING@1.1.0",EVENT_LEDGER_FOLLOW="__FOLLOW_SELECTED__",RATE_FLUCTUATION_HISTORY_TARGET=5000,RATE_FLUCTUATION_SUPPORT_CONCURRENCY=2;',
    'version contract',
)

replacement = '''  function rateFluctuationHistoryTarget(){
    return typeof MAX_ANALYTICAL_HISTORY==="number"&&Number.isFinite(MAX_ANALYTICAL_HISTORY)?Math.max(1,Math.trunc(MAX_ANALYTICAL_HISTORY)):RATE_FLUCTUATION_HISTORY_TARGET;
  }

  function rateFluctuationSupportCache(){
    if(!(state.rateFluctuationEventCache instanceof Map))state.rateFluctuationEventCache=new Map();
    return state.rateFluctuationEventCache;
  }

  function rateFluctuationSupportKey(pair,timeframe,config=optimizerAssetConfiguration(pair,timeframe)){
    const key=typeof scheduleKey==="function"?scheduleKey(pair,timeframe):`${pair}|${timeframe}`,lineage=config.stamp||config.computedAt||config.source||"UNAVAILABLE";
    return `${key}|${config.length}|${config.filter}|${lineage}`;
  }

  function emptyRateFluctuationSupport(pair,timeframe,config=optimizerAssetConfiguration(pair,timeframe)){
    return{supportingSource:"EVENT_OUTCOME_LEDGER_MAX_HISTORY",supportingEventMagnitudePips:null,supportingFinalEvents:null,supportingMagnitudeEvents:null,supportingHistoryBars:null,supportingHistoryTarget:rateFluctuationHistoryTarget(),eventLength:config.length,configurationSource:config.source,supportingConfigurationSource:config.source,supportingStatus:config.configured?"PENDING":"CONFIGURATION_UNAVAILABLE",supportingError:null,corroborated:false,pair,timeframe};
  }

  function rateFluctuationEventSupport(row,timeframe){
    const pair=row?.pair;if(!pair)return emptyRateFluctuationSupport(null,timeframe,{length:null,filter:null,source:"PAIR_UNAVAILABLE",configured:false});
    const config=optimizerAssetConfiguration(pair,timeframe),cache=rateFluctuationSupportCache(),cacheKey=rateFluctuationSupportKey(pair,timeframe,config);
    if(cache.has(cacheKey))return cache.get(cacheKey);
    const initial=emptyRateFluctuationSupport(pair,timeframe,config);cache.set(cacheKey,initial);return initial;
  }

  async function rateFluctuationSupportPool(items,worker){
    let cursor=0;const count=Math.min(RATE_FLUCTUATION_SUPPORT_CONCURRENCY,items.length);
    await Promise.all(Array.from({length:count},async()=>{while(cursor<items.length){const item=items[cursor++];await worker(item);}}));
  }

  async function hydrateRateFluctuationEventSupport(explicitTimeframe=null,{retryErrors=false}={}){
    const select=typeof document!=="undefined"?document.getElementById("evalTableTfFilter"):null,timeframe=explicitTimeframe||state.evaluationTableTimeframe||select?.value||null;
    if(!timeframe||typeof loadEventRow!=="function")return false;
    if(typeof marketDataReady==="function"&&!marketDataReady())return false;
    const evaluationRows=(state.evaluationTableData||[]).filter(row=>row.timeframe===timeframe&&row.pair);
    if(!evaluationRows.length)return false;
    if(!(state.rateFluctuationSupportPromises instanceof Map))state.rateFluctuationSupportPromises=new Map();
    const existing=state.rateFluctuationSupportPromises.get(timeframe);if(existing)return existing;
    const jobs=[];
    for(const row of evaluationRows){
      const config=optimizerAssetConfiguration(row.pair,timeframe),cache=rateFluctuationSupportCache(),cacheKey=rateFluctuationSupportKey(row.pair,timeframe,config),support=cache.get(cacheKey)||emptyRateFluctuationSupport(row.pair,timeframe,config);
      if(!config.configured){cache.set(cacheKey,{...support,supportingStatus:"CONFIGURATION_UNAVAILABLE",supportingError:"Optimizer configuration unavailable",supportingFinalEvents:null,supportingMagnitudeEvents:null,corroborated:false});continue;}
      if(support.supportingStatus==="PENDING"||(retryErrors&&support.supportingStatus==="ERROR"))jobs.push({row,config,cacheKey});
    }
    if(!jobs.length)return true;
    const promise=(async()=>{
      const target=rateFluctuationHistoryTarget();
      await rateFluctuationSupportPool(jobs,async({row,config,cacheKey})=>{
        const cache=rateFluctuationSupportCache(),base=cache.get(cacheKey)||emptyRateFluctuationSupport(row.pair,timeframe,config);cache.set(cacheKey,{...base,supportingStatus:"LOADING",supportingError:null});
        renderRateFluctuationRanking(false);
        try{
          const controller=new AbortController(),eventRow=await loadEventRow(row.pair,timeframe,config.length,controller,35,target),events=Array.isArray(eventRow?.eventList)?eventRow.eventList:[],finals=events.filter(event=>event?.status==="FINAL"),pnlFinals=finals.filter(event=>Number.isFinite(Number(event?.profitPips))),magnitudes=pnlFinals.map(event=>Math.abs(Number(event.profitPips))),historyBars=Number(eventRow?.data?.length??eventRow?.historyBars),degraded=Boolean(eventRow?.degradedHistory)||(Number.isFinite(historyBars)&&historyBars<target);
          const status=degraded?"DEGRADED_HISTORY":!finals.length?"NO_FINAL_EVENTS":!pnlFinals.length?"NO_FINITE_EVENT_PNL":"READY";
          cache.set(cacheKey,{...base,supportingSource:"EVENT_OUTCOME_LEDGER_MAX_HISTORY",supportingEventMagnitudePips:finiteMedian(magnitudes),supportingFinalEvents:finals.length,supportingMagnitudeEvents:pnlFinals.length,supportingHistoryBars:Number.isFinite(historyBars)?historyBars:null,supportingHistoryTarget:target,eventLength:config.length,configurationSource:config.source,supportingConfigurationSource:config.source,supportingStatus:status,supportingError:null,corroborated:status==="READY"&&pnlFinals.length>0,pair:row.pair,timeframe});
        }catch(error){
          cache.set(cacheKey,{...base,supportingStatus:"ERROR",supportingError:error?.message||String(error),supportingFinalEvents:null,supportingMagnitudeEvents:null,supportingHistoryBars:null,supportingHistoryTarget:target,corroborated:false,pair:row.pair,timeframe});
        }
        renderRateFluctuationRanking(false);
      });
      return true;
    })().finally(()=>{state.rateFluctuationSupportPromises.delete(timeframe);});
    state.rateFluctuationSupportPromises.set(timeframe,promise);return promise;
  }

  function rateFluctuationRows(explicitTimeframe=null){
    const select=typeof document!=="undefined"?document.getElementById("evalTableTfFilter"):null,timeframe=explicitTimeframe||state.evaluationTableTimeframe||select?.value||null;
    const rows=(state.evaluationTableData||[]).filter(row=>!timeframe||row.timeframe===timeframe).map(row=>{
      const signed=Number(row.pipsPerHour),pipsPerHour=Number.isFinite(signed)?signed:null,support=rateFluctuationEventSupport(row,timeframe||row.timeframe);
      return{pair:row.pair,timeframe:row.timeframe,signal:Number(row.signal)||0,regime:row.regime||"NEUTRAL",pipsPerHour,absolutePipsPerHour:pipsPerHour===null?null:Math.abs(pipsPerHour),supportingSource:support.supportingSource,supportingEventMagnitudePips:support.supportingEventMagnitudePips,supportingFinalEvents:support.supportingFinalEvents,supportingMagnitudeEvents:support.supportingMagnitudeEvents,supportingHistoryBars:support.supportingHistoryBars,supportingHistoryTarget:support.supportingHistoryTarget,eventLength:support.eventLength,configurationSource:support.configurationSource,supportingConfigurationSource:support.supportingConfigurationSource,supportingStatus:support.supportingStatus,supportingError:support.supportingError,corroborated:Boolean(support.corroborated)};
    });
    rows.sort((a,b)=>{const ar=Number.isFinite(a.absolutePipsPerHour)?a.absolutePipsPerHour:-Infinity,br=Number.isFinite(b.absolutePipsPerHour)?b.absolutePipsPerHour:-Infinity;if(br!==ar)return br-ar;const am=Number.isFinite(a.supportingEventMagnitudePips)?a.supportingEventMagnitudePips:-Infinity,bm=Number.isFinite(b.supportingEventMagnitudePips)?b.supportingEventMagnitudePips:-Infinity;if(bm!==am)return bm-am;return String(a.pair).localeCompare(String(b.pair));});
    return rows.map((row,index)=>({...row,rank:index+1}));
  }

  async function rateFluctuationExportPayload(){
    const select=typeof document!=="undefined"?document.getElementById("evalTableTfFilter"):null,timeframe=state.evaluationTableTimeframe||select?.value||null;
    await hydrateRateFluctuationEventSupport(timeframe,{retryErrors:true});
    const rows=rateFluctuationRows(timeframe),statusCounts={};for(const row of rows)statusCounts[row.supportingStatus]=(statusCounts[row.supportingStatus]||0)+1;
    return{facility:"Rate Fluctuation Ranking",version:RATE_FLUCTUATION_VERSION,analyticalFacilitiesVersion:VERSION,exportedAt:new Date().toISOString(),timeframe:rows[0]?.timeframe||timeframe,indicator:state.selectedScheduleStrategy||null,pairCount:typeof INSTRUMENTS!=="undefined"?INSTRUMENTS.length:rows.length,rowCount:rows.length,rankingRule:"Descending absolute Evaluation Table pips-per-hour; median absolute FINAL Event Outcome Ledger P/L breaks exact rate ties when available.",supportingEventMagnitudeDefinition:"Median absolute profitPips across FINAL HTL Asset Event Outcome Ledger records for the same pair/timeframe using the optimizer-backed HTL length and the maximum 5,000-candle analytical history path.",supportingHistoryContract:"Same loadEventRow path as Event Ledger · Result / Profit, requested at MAX_ANALYTICAL_HISTORY; shallow Evaluation priceCache is not used for corroboration.",corroboratedPairCount:rows.filter(row=>row.corroborated).length,supportStatusCounts:statusCounts,rows};
  }

  function ensureRateFluctuationFacility(){
    if(typeof document==="undefined")return null;
    const container=document.getElementById("evaluationTableContainer");if(!container)return null;let facility=document.getElementById("rateFluctuationRanking");
    if(!facility){facility=document.createElement("details");facility.id="rateFluctuationRanking";facility.className="data-details";facility.open=true;facility.innerHTML='<summary>Rate Fluctuation Ranking · 28 Currency Pairs</summary><div class="panel-head"><div class="panel-title"><h2>Rate Fluctuation Ranking</h2><p id="rateFluctuationScope">Awaiting Evaluation Table data.</p></div><div class="head-controls" id="rateFluctuationControls"></div></div><div class="performance-wrap"><table class="performance-table"><thead><tr><th>Rank</th><th>Pair</th><th>TF</th><th>Signal</th><th>Pips/Hr</th><th>|Pips/Hr|</th><th>Median |Event P/L|</th><th>FINAL events</th><th>P/L n</th><th>History</th><th>HTL length</th><th>Support</th><th>Regime</th></tr></thead><tbody id="rateFluctuationBody"><tr><td colspan="13">Awaiting Evaluation Table data.</td></tr></tbody></table></div>';container.appendChild(facility);}
    addExportButton(document.getElementById("rateFluctuationControls"),"exportRateFluctuationJson","rate-fluctuation-ranking",rateFluctuationExportPayload);return facility;
  }

  function renderRateFluctuationRanking(startHydration=true){
    ensureRateFluctuationFacility();if(typeof document==="undefined")return;const body=document.getElementById("rateFluctuationBody"),scope=document.getElementById("rateFluctuationScope");if(!body)return;
    const rows=rateFluctuationRows(),expected=typeof INSTRUMENTS!=="undefined"?INSTRUMENTS.length:rows.length,timeframe=rows[0]?.timeframe||state.evaluationTableTimeframe||document.getElementById("evalTableTfFilter")?.value||"—",fmt=(value,digits=1)=>Number.isFinite(value)?Number(value).toFixed(digits):"—",count=value=>Number.isFinite(Number(value))?String(Number(value)):"—",supportLabel=status=>String(status||"PENDING").replaceAll("_"," "),corroborated=rows.filter(row=>row.corroborated).length;
    if(scope)scope.textContent=`${timeframe} · ${rows.length} / ${expected} pairs · rank by |Pips/Hr| · ${corroborated} corroborated by maximum-history FINAL event outcomes`;
    body.innerHTML=rows.map(row=>{const waiting=row.supportingStatus==="PENDING"||row.supportingStatus==="LOADING",magnitude=waiting?"…":fmt(row.supportingEventMagnitudePips),history=Number.isFinite(row.supportingHistoryBars)?`${row.supportingHistoryBars}/${row.supportingHistoryTarget}`:`—/${row.supportingHistoryTarget}`;return `<tr><td><b>${row.rank}</b></td><td><b>${formatPair(row.pair)}</b></td><td>${row.timeframe}</td><td class="${typeof directionClass==="function"?directionClass(row.signal):""}">${typeof signalWord==="function"?signalWord(row.signal):(row.signal>0?"BUY":row.signal<0?"SELL":"HOLD")}</td><td>${fmt(row.pipsPerHour)}</td><td><b>${fmt(row.absolutePipsPerHour)}</b></td><td>${magnitude}</td><td>${count(row.supportingFinalEvents)}</td><td>${count(row.supportingMagnitudeEvents)}</td><td>${history}</td><td>${row.eventLength??"—"}</td><td title="${String(row.supportingError||"").replaceAll('"','&quot;')}">${supportLabel(row.supportingStatus)}</td><td>${String(row.regime||"NEUTRAL").replaceAll("_"," ")}</td></tr>`;}).join("")||'<tr><td colspan="13">Awaiting synchronized Evaluation Table data.</td></tr>';
    if(startHydration&&rows.some(row=>row.supportingStatus==="PENDING")&&typeof marketDataReady==="function"&&marketDataReady()&&scheduleCoverageReady())queueMicrotask(()=>void hydrateRateFluctuationEventSupport(timeframe));
  }

'''
source = replace_between(
    source,
    '  function rateFluctuationEventSupport(row,timeframe){',
    '  function evaluationExportPayload(){',
    replacement,
    'rate fluctuation implementation',
)

source = replace_once(
    source,
    '  const api=Object.freeze({VERSION,RATE_FLUCTUATION_VERSION,optimizerAssetConfiguration,cleanEventScheduleRow,evaluationExportPayload,diagnosticExportPayload,macroExportPayload,eventLedgerExportPayload,htlScheduleExportPayload,timeframeSignalScheduleExportPayload,eventLedgerSelectedPair,rateFluctuationRows,rateFluctuationExportPayload,scheduleDatasetTotal,scheduleCoverageReady,preloadEvaluationTable});',
    '  const api=Object.freeze({VERSION,RATE_FLUCTUATION_VERSION,optimizerAssetConfiguration,cleanEventScheduleRow,evaluationExportPayload,diagnosticExportPayload,macroExportPayload,eventLedgerExportPayload,htlScheduleExportPayload,timeframeSignalScheduleExportPayload,eventLedgerSelectedPair,rateFluctuationRows,rateFluctuationExportPayload,hydrateRateFluctuationEventSupport,scheduleDatasetTotal,scheduleCoverageReady,preloadEvaluationTable});',
    'public analytical API',
)

if 'buildEventRow(pair,candles,config.length)' in source:
    raise SystemExit('shallow Evaluation-cache event reconstruction remains in source')
SOURCE.write_text(source)


test = TEST.read_text()
test = replace_once(test, 'assert.match(source,/CTE_ANALYTICAL_FACILITIES@1\\.1\\.0/);', 'assert.match(source,/CTE_ANALYTICAL_FACILITIES@1\\.2\\.0/);', 'test version')
test = replace_once(
    test,
    'assert.match(source,/supportingEventMagnitudePips/,"Rate fluctuation ranking must expose supporting event magnitude");\nassert.match(source,/Median \\|Event P\\/L\\|/,"Rate fluctuation table must visibly identify its supporting event magnitude");\nassert.match(source,/median absolute FINAL Event Ledger P\\/L breaks ties/,"Rate fluctuation ranking rule must be explicit and reconstructable");',
    'assert.match(source,/supportingEventMagnitudePips/,"Rate fluctuation ranking must expose supporting event magnitude");\nassert.match(source,/supportingHistoryTarget/,"Rate fluctuation ranking must expose maximum-history corroboration provenance");\nassert.match(source,/supportingStatus/,"Rate fluctuation ranking must distinguish loading, genuine zero-event samples, degraded history and errors");\nassert.match(source,/hydrateRateFluctuationEventSupport/,"Rate fluctuation corroboration must hydrate through an explicit asynchronous Event Outcome Ledger path");\nassert.match(source,/loadEventRow\\(row\\.pair,timeframe,config\\.length,controller,35,target\\)/,"Rate fluctuation corroboration must use the same loadEventRow path as Event Ledger");\nassert.doesNotMatch(source,/buildEventRow\\(pair,candles,config\\.length\\)/,"Rate fluctuation corroboration must not rebuild events from the shallow Evaluation candle cache");\nassert.match(source,/Median \\|Event P\\/L\\|/,"Rate fluctuation table must visibly identify its supporting event magnitude");\nassert.match(source,/maximum 5,000-candle analytical history path/,"Rate fluctuation export must state its Event Outcome Ledger maximum-history contract");',
    'rate fluctuation source assertions',
)

old_sandbox = 'const support={PAIR_0:[4,8],PAIR_1:[10,14],PAIR_2:[20]};const sandbox={console,Math,Number,Array,Object,String,Boolean,Date,Map,Set,AbortController,state,INSTRUMENTS,TIMEFRAMES,STRATEGY_CONFIG:{ASSET:{length:10,filter:0}},MAX_ANALYTICAL_LENGTH:500,scheduleKey:(pair,timeframe)=>`${pair}|${timeframe}`,buildEventRow:(pair)=>({eventList:(support[pair]||[]).map((profitPips,index)=>({status:"FINAL",profitPips:index%2?-profitPips:profitPips}))}),CTEHtlScheduleIntegrity:{VERSION:"CTE_HTL_SCHEDULE_INTEGRITY@1.1.0"}};sandbox.globalThis=sandbox;'
new_sandbox = 'const support={PAIR_0:[4,8],PAIR_1:[10,14],PAIR_2:[]};let buildEventRowCalls=0;const eventLoadCalls=[];const sandbox={console,Math,Number,Array,Object,String,Boolean,Date,Map,Set,AbortController,state,INSTRUMENTS,TIMEFRAMES,STRATEGY_CONFIG:{ASSET:{length:10,filter:0}},MAX_ANALYTICAL_LENGTH:500,MAX_ANALYTICAL_HISTORY:5000,scheduleKey:(pair,timeframe)=>`${pair}|${timeframe}`,marketDataReady:()=>true,buildEventRow:()=>{buildEventRowCalls++;throw new Error("shallow buildEventRow path must not be used");},loadEventRow:async(pair,timeframe,length,_controller,priority,requestedCount)=>{eventLoadCalls.push({pair,timeframe,length,priority,requestedCount});return{pair,length,data:{length:requestedCount||5000},eventList:(support[pair]||[]).map((profitPips,index)=>({status:"FINAL",profitPips:index%2?-profitPips:profitPips}))};},CTEHtlScheduleIntegrity:{VERSION:"CTE_HTL_SCHEDULE_INTEGRITY@1.1.0"}};sandbox.globalThis=sandbox;'
test = replace_once(test, old_sandbox, new_sandbox, 'sandbox Event Ledger support mock')

ranking_replacement = '''state.evaluationTableTimeframe="TF_0";
for(const [pair,length] of [["PAIR_0",10],["PAIR_1",12],["PAIR_2",14]])state.autoConfigurations.set(`${pair}|TF_0`,{source:"COMPUTE_CONFIGURATION",computedAt:"2026-08-12T20:00:00Z",stamp:`STAMP_${pair}`,version:7,config:{ASSET:{length,filter:0}}});
state.evaluationTableData=[
  {pair:"PAIR_0",timeframe:"TF_0",signal:-1,regime:"TREND_ALIGNED",pipsPerHour:-12,priceCache:{TF_0:[{time:"2026-08-12T20:00:00Z"}]}},
  {pair:"PAIR_1",timeframe:"TF_0",signal:1,regime:"REVERSAL",pipsPerHour:12,priceCache:{TF_0:[{time:"2026-08-12T20:00:00Z"}]}},
  {pair:"PAIR_2",timeframe:"TF_0",signal:1,regime:"TREND_ALIGNED",pipsPerHour:5,priceCache:{TF_0:[{time:"2026-08-12T20:00:00Z"}]}}
];
await sandbox.CTEAnalyticalFacilities.hydrateRateFluctuationEventSupport("TF_0");
assert.equal(eventLoadCalls.length,3,"each Evaluation pair must hydrate corroboration through Event Ledger loadEventRow");
assert.ok(eventLoadCalls.every(call=>call.requestedCount===5000),"every corroboration load must request MAX_ANALYTICAL_HISTORY");
assert.ok(eventLoadCalls.every(call=>call.priority===35),"corroboration hydration must remain lower priority than interactive Event Ledger work");
assert.equal(buildEventRowCalls,0,"shallow Evaluation-cache buildEventRow reconstruction must never supply corroboration");
const fluctuation=sandbox.CTEAnalyticalFacilities.rateFluctuationRows("TF_0");
assert.equal(fluctuation.length,3);assert.equal(fluctuation[0].pair,"PAIR_1","equal absolute rates must be ordered by larger supporting event magnitude");assert.equal(fluctuation[0].absolutePipsPerHour,12);assert.equal(fluctuation[0].supportingEventMagnitudePips,12);assert.equal(fluctuation[0].supportingFinalEvents,2);assert.equal(fluctuation[0].supportingMagnitudeEvents,2);assert.equal(fluctuation[0].supportingHistoryBars,5000);assert.equal(fluctuation[0].supportingHistoryTarget,5000);assert.equal(fluctuation[0].supportingStatus,"READY");assert.equal(fluctuation[0].corroborated,true);assert.equal(fluctuation[1].pair,"PAIR_0");assert.equal(fluctuation[1].supportingEventMagnitudePips,6);assert.equal(fluctuation[2].pair,"PAIR_2");assert.equal(fluctuation[2].supportingFinalEvents,0);assert.equal(fluctuation[2].supportingEventMagnitudePips,null);assert.equal(fluctuation[2].supportingStatus,"NO_FINAL_EVENTS");assert.equal(fluctuation[2].corroborated,false);assert.deepEqual(fluctuation.map(row=>row.rank),[1,2,3]);
const rankingPayload=await sandbox.CTEAnalyticalFacilities.rateFluctuationExportPayload();assert.equal(rankingPayload.facility,"Rate Fluctuation Ranking");assert.equal(rankingPayload.timeframe,"TF_0");assert.equal(rankingPayload.rows[0].pair,"PAIR_1");assert.equal(rankingPayload.corroboratedPairCount,2);assert.equal(rankingPayload.supportStatusCounts.READY,2);assert.equal(rankingPayload.supportStatusCounts.NO_FINAL_EVENTS,1);assert.match(rankingPayload.rankingRule,/absolute Evaluation Table pips-per-hour/);assert.match(rankingPayload.supportingHistoryContract,/loadEventRow/);
'''
test = replace_between(test, 'state.evaluationTableTimeframe="TF_0";', 'state.eventLedgerPairSelection="PAIR_1";', ranking_replacement, 'ranking behavior test')
TEST.write_text(test)

print('Applied maximum-history Event Outcome Ledger corroboration repair and regression certification.')
