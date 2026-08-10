import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const html=await readFile(new URL("../public/index.html",import.meta.url),"utf8");
const renderer=await readFile(new URL("../public/unified-chart.js",import.meta.url),"utf8");
const worker=await readFile(new URL("../src/worker.js",import.meta.url),"utf8");
const certificationManifests=(await Promise.all(["registered-horizon.manifest.json","registered-horizon-implementation.manifest.json"].map(name=>readFile(new URL(`../source-code/${name}`,import.meta.url),"utf8")))).join(String.fromCharCode(10));
const between=(start,end,label)=>{const from=html.indexOf(start),to=html.indexOf(end,from);assert.ok(from>=0,`${label}: start missing`);assert.ok(to>from,`${label}: end missing`);return html.slice(from,to);};

assert.doesNotMatch(html,/<script src="\/unified-chart\.js"><\/script>/,"static HTML retains its embedded fail-safe renderer");
assert.match(html,/CTE_UNIFIED_EVALUATION_CHART@1\.0\.0/,"embedded fail-safe renderer must remain available");
assert.match(html,/global\.CTEUnifiedChart=Object\.freeze\(\{VERSION,render\}\)/);
assert.match(renderer,/CTE_UNIFIED_EVALUATION_CHART@1\.1\.0/);
assert.match(renderer,/const MAX_VISIBLE_BARS=5000/,"runtime renderer must expose the full 5,000-candle analytical viewport");
assert.match(renderer,/maxVisibleBars=Math\.max\(30,Math\.min\(MAX_VISIBLE_BARS,candles\.length\)\)/,"runtime renderer maximum must be bounded by available candles, not 300");
assert.doesNotMatch(renderer,/visibleBars=clamp\([^\n]*,30,300\)/,"runtime renderer must not retain the legacy 300-bar ceiling");
assert.match(renderer,/global\.CTEUnifiedChart=Object\.freeze\(\{VERSION,MAX_VISIBLE_BARS,render\}\)/);
assert.match(worker,/<script src=\"\/unified-chart\.js\"><\/script>\\n  <script src=\"\/chart-indicator-ownership\.js\"><\/script>/,"Worker must load the 5,000-bar renderer immediately before chart ownership");
assert.match(renderer,/indicatorSet\.price/);
assert.match(renderer,/indicatorSet\.z/);
assert.match(renderer,/indicatorSet\.osc/);
assert.match(renderer,/Intl\.DateTimeFormat/);
assert.match(renderer,/livePrice/);
assert.match(renderer,/value!==null&&value!==undefined&&value!==""/);
assert.match(renderer,/plausiblePrice/);
assert.match(renderer,/function drawSignals\(/);
assert.match(renderer,/options\.signals/);
assert.match(renderer,/\?"BUY":"SELL"/);
assert.match(renderer,/signal\.current\?" ACTIVE":""/);

for(const id of ["chartStage","chartPanel","chart","oscillatorCanvas","weeklyCognitionCanvas"]){
  assert.match(html,new RegExp(`id="${id}"`),`${id} must exist in the canonical chart`);
}
for(const id of ["evalChartStage","eventChartPanel","evalChartPanel","eventChart","evalChart"]){
  assert.doesNotMatch(html,new RegExp(`id="${id}"`),`${id} must remain deleted`);
}
assert.equal((html.match(/data-chart-model="canonical-single"/g)||[]).length,1,"one canonical chart component is required");
assert.match(html,/id="evalIndicatorLegend"/);
assert.match(html,/id="evaluationRuntimeState"[^>]*hidden/);
assert.match(html,/unifiedIndicatorCache:new Map\(\)/);
assert.match(html,/maximumHistoryKeys:new Set\(\)/);
assert.match(html,/function unifiedIndicatorSet\(pair,timeframe,candles,length\)/);
assert.match(html,/causalIndicatorSetFast\(candles,resolvedLength\)/);
assert.match(html,/function loadUnifiedChartCandles\(instrument,timeframe,controller=null,priority=100,force=false\)/);
assert.match(html,/count=\$\{MAX_ANALYTICAL_HISTORY\}/);

const analytical=between("function drawChart()","// Canonical HTL series construction.","analytical draw");
assert.match(analytical,/drawCapitalizationChartSurface\(/,"canonical chart must delegate to the unified renderer");
assert.doesNotMatch(analytical,/getContext\(/,"canonical chart must not maintain a private price renderer");
assert.match(analytical,/signals/,"canonical chart must provide causal BUY and SELL markers");
assert.match(analytical,/unifiedIndicatorSet\(pair,timeframe,state\.chartCandles,length\)/);
assert.match(html,/function indicatorSignalSeries\(candles,indicators,strategy,filter=0\)/);
assert.match(analytical,/indicatorSignalSeries\(state\.chartCandles,indicators,strategy,filter\)/);
assert.doesNotMatch(analytical,/signals:state\.chartCausalSeries/);
assert.match(html,/current:true/);
assert.doesNotMatch(certificationManifests,/public\/(?:index\.html|unified-chart\.js)/);

const evalLoad=between("async function loadEvalChartData(pair,timeframe)","function drawEvalCharts()","evaluation load");
assert.match(evalLoad,/bestCachedCandles\(key\)/);
assert.match(evalLoad,/loadUnifiedChartCandles\(pair,timeframe,null,95,false\)/);
assert.match(evalLoad,/priceCache\[timeframe\]=candlesList/);
assert.match(evalLoad,/unified 5,000-candle chart/);
const eventLoad=between("async function loadEventRow","async function refreshSelectedEventChart","event load");
assert.match(eventLoad,/desired===MAX_ANALYTICAL_HISTORY\?await loadUnifiedChartCandles/);
const analyticalLoad=between("async function loadChart","function updateChartSummary","analytical load");
assert.match(analyticalLoad,/loadUnifiedChartCandles\(instrument,timeframe,controller,100,force\)/);
assert.match(html,/refreshChart"\)\.addEventListener\("click",\(\)=>loadChart\(state\.selectedInstrument,state\.selectedTimeframe,false,true\)\)/);
const appliedDataset=between("function applyChartDataset","async function loadUnifiedChartCandles","applied chart dataset");
assert.match(appliedDataset,/setReadiness\("marketData","ready"/);
assert.match(appliedDataset,/state\.scheduleEvaluations\.set\(key,analyzeWithConfiguration/);
assert.match(appliedDataset,/queueProgressiveSchedule\(0\)/);

assert.match(html,/state\.unifiedIndicatorCache\.clear\(\)/);
assert.match(html,/function normalizeUnifiedIndicators\(candles,indicators=\{\}\)/);
assert.match(html,/function drawCapitalizationChartSurface\(options\)/);
assert.match(html,/state\.maximumHistoryKeys\.clear\(\)/);
assert.match(html,/function chartDataIntegrity\(\)/);
assert.match(html,/function browserDiagnosticAssessment\(server\)/);
assert.match(html,/SCHEDULE_COVERAGE_INCOMPLETE/);
assert.match(html,/setInterval\(\(\)=>\{if\(marketDataReady\(\)&&!document\.hidden&&!state\.scheduleLoading&&state\.scheduleEvaluations\.size<INSTRUMENTS\.length\*TIMEFRAMES\.length\)void loadSchedule\("progressive"\);\},5000\)/);

assert.match(renderer,/leftIndent/);
assert.match(renderer,/priceLabel/);
assert.match(renderer,/timeLabel/);
assert.match(html,/function canonicalChartDefinition\(strategy\)/);
console.log("Canonical chart runtime verified with a 5,000-bar runtime renderer override, attached crosshair labels, signals, and synchronized analytical surfaces.");
