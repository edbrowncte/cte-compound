import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const html=await readFile(new URL("../public/index.html",import.meta.url),"utf8");
const renderer=await readFile(new URL("../public/unified-chart.js",import.meta.url),"utf8");
const certificationManifests=(await Promise.all(["registered-horizon.manifest.json","registered-horizon-implementation.manifest.json"].map(name=>readFile(new URL(`../source-code/${name}`,import.meta.url),"utf8")))).join(String.fromCharCode(10));
const between=(start,end,label)=>{const from=html.indexOf(start),to=html.indexOf(end,from);assert.ok(from>=0,`${label}: start missing`);assert.ok(to>from,`${label}: end missing`);return html.slice(from,to);};

assert.match(html,/<script src="\/unified-chart\.js"><\/script>/);
assert.match(renderer,/CTE_UNIFIED_EVALUATION_CHART@1\.0\.0/);
assert.match(renderer,/global\.CTEUnifiedChart=Object\.freeze\(\{VERSION,render\}\)/);
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

assert.match(html,/id="chartStage"[^>]*unified-chart-stage|class="chart-stage unified-chart-stage" id="chartStage"/);
assert.match(html,/id="evalChartStage"[^>]*unified-chart-stage|class="chart-stage unified-chart-stage" id="evalChartStage"/);
assert.match(html,/class="event-chart-stage unified-chart-stage"/);
assert.match(html,/id="evalIndicatorLegend"/);
assert.match(html,/id="evalChartLength"[^>]*max="500"/);
assert.match(html,/unifiedIndicatorCache:new Map\(\)/);
assert.match(html,/maximumHistoryKeys:new Set\(\)/);
assert.match(html,/function unifiedIndicatorSet\(pair,timeframe,candles,length\)/);
assert.match(html,/causalIndicatorSetFast\(candles,resolvedLength\)/);
assert.match(html,/function loadUnifiedChartCandles\(instrument,timeframe,controller=null,priority=100,force=false\)/);
assert.match(html,/count=\$\{MAX_ANALYTICAL_HISTORY\}/);

const analytical=between("function drawChart()","// Canonical HTL series construction.","analytical draw");
const event=between("function eventDraw(data,htl,events)","function eventHistoryCount","event draw");
const evaluation=between("function drawEvalCharts()","function drawOscillatorChart","evaluation draw");
for(const [name,segment] of [["Analytical",analytical],["Event",event],["Evaluation",evaluation]]){
  assert.match(segment,/drawCapitalizationChartSurface\(/,`${name} must delegate to the Capitalization chart surface`);
  assert.doesNotMatch(segment,/getContext\(/,`${name} must not maintain a private canvas renderer`);
  assert.match(segment,/signals/,`${name} must provide causal BUY and SELL markers`);
}
assert.match(analytical,/unifiedIndicatorSet\(pair,timeframe,state\.chartCandles,length\)/);
assert.match(event,/unifiedIndicatorSet\(pair,timeframe,data,length\)/);
assert.match(evaluation,/unifiedIndicatorSet\(pair,timeframe,state\.evalCandles,length\)/);
assert.match(html,/function indicatorSignalSeries\(candles,indicators,strategy,filter=0\)/);
assert.match(analytical,/indicatorSignalSeries\(state\.chartCandles,indicators,strategy,filter\)/);
assert.doesNotMatch(analytical,/signals:state\.chartCausalSeries/);
assert.match(event,/asset:Array\.isArray\(htl\?\.asset\)/);
assert.match(event,/Array\.isArray\(events\)/);
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

console.log("One canonical Evaluation-style 5,000-candle causal chart is shared by Analytical, HTL Event, and Evaluation facilities.");
