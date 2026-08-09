import fs from "node:fs";

const path="public/index.html";
let source=fs.readFileSync(path,"utf8"),changes=0;
const B=(...lines)=>lines.join("\n");
const replaceOnce=(from,to,label)=>{if(!source.includes(from))throw new Error(`Missing unified-chart anchor: ${label}`);source=source.replace(from,to);changes++;};
const replaceRegex=(pattern,to,label)=>{if(!pattern.test(source))throw new Error(`Missing unified-chart regex anchor: ${label}`);source=source.replace(pattern,to);changes++;};

replaceOnce('<script src="/mas-im-calculator.js"></script>','<script src="/unified-chart.js"></script>\n  <script src="/mas-im-calculator.js"></script>',"unified chart script");
replaceOnce('.chart-stage { position:relative; height:520px; min-height:360px; background:#080c12; overflow:hidden; user-select:none; touch-action:none; }','.chart-stage { position:relative; height:520px; min-height:360px; background:#080c12; overflow:hidden; user-select:none; touch-action:none; }\n    .unified-chart-stage { height:400px; min-height:300px; }',"unified chart stage style");
replaceOnce('<div class="chart-stage" id="chartStage">','<div class="chart-stage unified-chart-stage" id="chartStage">',"analytical unified stage");
replaceOnce('<input id="evalChartLength" type="number" min="3" max="200" value="10"','<input id="evalChartLength" type="number" min="3" max="500" value="10"',"evaluation length ceiling");
replaceOnce('<div class="chart-stage" id="evalChartStage" style="height:400px;">','<div class="indicator-legend" id="evalIndicatorLegend" aria-label="Displayed indicators"></div>\n              <div class="chart-stage unified-chart-stage" id="evalChartStage">',"evaluation legend and stage");
replaceOnce('<div class="event-chart-stage"><canvas id="eventChart"','<div class="event-chart-stage unified-chart-stage"><canvas id="eventChart"',"event unified stage");
replaceOnce('    eventIndicatorCache:new Map(),','    eventIndicatorCache:new Map(),\n    unifiedIndicatorCache:new Map(),\n    maximumHistoryKeys:new Set(),',"unified chart caches");
replaceOnce('    state.eventLoadedKey="";state.eventFailures.clear();state.eventIndicatorCache.clear();','    state.eventLoadedKey="";state.eventFailures.clear();state.eventIndicatorCache.clear();state.unifiedIndicatorCache.clear();state.maximumHistoryKeys.clear();',"unified cache hygiene");

const drawChart=B(
'  function drawChart() {',
'    const pair=state.selectedInstrument,timeframe=state.selectedTimeframe,strategy=state.selectedStrategy,length=clamp(Math.round(Number(el("chartLength")?.value)||10),3,MAX_ANALYTICAL_LENGTH);',
'    const indicators=state.chartCausalIndicators||unifiedIndicatorSet(pair,timeframe,state.chartCandles,length);',
'    renderUnifiedChartSurface({canvasId:"chart",candles:state.chartCandles,pair,timeframe,strategy,length,visibleBars:state.visibleBars,offsetBars:state.offsetBars,rightIndent:state.rightIndent,crosshairEnabled:state.crosshairEnabled,crosshair:state.crosshair,legendId:"indicatorLegend",indicators});',
'  }',
'',
'  // Canonical HTL series construction.'
);
replaceRegex(/  function drawChart\(\) \{[\s\S]*?\n  \}\n\n  \/\/ Canonical HTL series construction\./,drawChart,"analytical renderer delegation");

const cacheHelper=B(
'  function unifiedIndicatorSet(pair,timeframe,candles,length){',
'    const resolvedLength=clamp(Math.round(Number(length)||10),3,MAX_ANALYTICAL_LENGTH),last=candles?.at(-1)?.time||"",key=`${pair}|${timeframe}|${resolvedLength}|${candles?.length||0}|${last}`;',
'    let indicators=state.unifiedIndicatorCache.get(key);if(!indicators&&candles?.length){indicators=causalIndicatorSetFast(candles,resolvedLength);state.unifiedIndicatorCache.set(key,indicators);while(state.unifiedIndicatorCache.size>12)state.unifiedIndicatorCache.delete(state.unifiedIndicatorCache.keys().next().value);}return indicators||{};',
'  }',
'  function renderUnifiedIndicatorLegend(id,strategy,indicators,latestIndex){const node=el(id);if(!node)return;const definition=CHART_INDICATORS[strategy]||CHART_INDICATORS.ASSET;node.innerHTML=[...(definition.price||[]),...(definition.z||[]),...(definition.osc||[])].map(([key,label,color])=>`<span><i style="background:${color}"></i>${label} ${Number.isFinite(indicators?.[key]?.[latestIndex])?Number(indicators[key][latestIndex]).toFixed(5):"—"}</span>`).join("");}',
'  function renderUnifiedChartSurface({canvasId,candles,pair,timeframe,strategy,length,visibleBars,offsetBars,rightIndent,crosshairEnabled,crosshair,legendId,indicators=null}){',
'    const canvas=el(canvasId);if(!canvas||!globalThis.CTEUnifiedChart)return null;const definition=CHART_INDICATORS[strategy]||CHART_INDICATORS.ASSET,resolved=indicators||unifiedIndicatorSet(pair,timeframe,candles,length),live=offsetBars===0?liveMid(pair):NaN,result=CTEUnifiedChart.render({canvas,candles,indicators:resolved,indicatorSet:definition,visibleBars,offsetBars,rightIndent,crosshairEnabled,crosshair,livePrice:live,formatPrice:value=>formatPrice(value,pair)});renderUnifiedIndicatorLegend(legendId,strategy,resolved,result?.latestIndex??-1);return result;',
'  }',
'  async function causalIndicatorSet(data,length,token)'
);
replaceOnce('  async function causalIndicatorSet(data,length,token)',cacheHelper,"shared causal indicator cache");

const loader=B(
'  async function loadUnifiedChartCandles(instrument,timeframe,controller=null,priority=100,force=false){',
'    const key=scheduleKey(instrument,timeframe),cached=state.chartCache.get(key);if(!force&&cached?.length&&state.maximumHistoryKeys.has(key))return cached;',
'    const payload=await oanda(`/v3/instruments/${encodeURIComponent(instrument)}/candles?price=M&granularity=${encodeURIComponent(timeframe)}&count=${MAX_ANALYTICAL_HISTORY}`,controller,priority),candles=completedCandles(payload,instrument,timeframe);if(!candles.length)throw new Error(`No completed candles · ${formatPair(instrument)} ${timeframe}`);',
'    cacheChartCandles(key,candles);state.maximumHistoryKeys.add(key);const scheduleView=candles.slice(-Math.min(650,candles.length));if(scheduleView.length>=(state.scheduleCandles.get(key)?.length||0))state.scheduleCandles.set(key,scheduleView);return candles;',
'  }',
'',
'  function chartRequestCount(instrument,timeframe){return MAX_ANALYTICAL_HISTORY;}'
);
replaceOnce('  function chartRequestCount(instrument,timeframe){return MAX_ANALYTICAL_HISTORY;}',loader,"canonical maximum-history loader");

const loadChart=B(
'  async function loadChart(instrument=state.selectedInstrument,timeframe=state.selectedTimeframe) {',
'    if(!state.connected)return;',
'    clearTimeout(state.progressiveScheduleTimer);state.progressiveScheduleTimer=null;state.chartLoading=true;state.scheduleController?.abort();state.chartController?.abort();await new Promise(resolve=>setTimeout(resolve,0));',
'    const controller=new AbortController(),count=chartRequestCount(instrument,timeframe);state.chartController=controller;',
'    el("refreshChart").disabled=true;el("chartMessage").hidden=false;el("chartMessage").textContent=`Loading ${count} completed OANDA candles…`;',
'    try {const candles=await loadUnifiedChartCandles(instrument,timeframe,controller,100,true);applyChartDataset(instrument,timeframe,candles);}',
'    catch (error) {if(error.name!=="AbortError"&&instrument===state.selectedInstrument&&timeframe===state.selectedTimeframe){const cached=state.chartCache.get(scheduleKey(instrument,timeframe))||state.scheduleCandles.get(scheduleKey(instrument,timeframe));if(cached?.length){applyChartDataset(instrument,timeframe,cached);el("chartMessage").hidden=false;el("chartMessage").textContent=`Showing cached completed candles · ${error.message||"full refresh unavailable"}`;}else{el("chartMessage").hidden=false;el("chartMessage").textContent=error.message||"Chart load failed.";state.chartCandles=[];state.chartAnalysis=null;state.chartCausalIndicators=null;state.chartCausalSeries=[];updateChartSummary();updateCompartments();drawChart();}}}',
'    finally {const current=state.chartController===controller;if(current){state.chartController=null;state.chartLoading=false;el("refreshChart").disabled=!state.connected;if(state.connected)queueProgressiveSchedule(1200);}pumpCandleQueue();}',
'  }',
'',
'  function updateChartSummary()'
);
replaceRegex(/  async function loadChart\(instrument=state\.selectedInstrument,timeframe=state\.selectedTimeframe\) \{[\s\S]*?\n  \}\n\n  function updateChartSummary\(\)/,loadChart,"analytical canonical loader");

const eventDraw=B(
'  function eventDraw(data,htl,events){',
'    if(!data?.length)return;const pair=el("eventChartPair")?.value||el("eventPair")?.value||state.selectedInstrument,timeframe=el("eventChartTimeframe")?.value||el("eventTimeframe")?.value||state.selectedTimeframe,strategy=el("eventStrategy")?.value||state.eventSelectedStrategy||"ASSET",length=clamp(Math.round(Number(el("eventChartLength")?.value)||10),3,MAX_ANALYTICAL_LENGTH),indicators=unifiedIndicatorSet(pair,timeframe,data,length);',
'    renderUnifiedChartSurface({canvasId:"eventChart",candles:data,pair,timeframe,strategy,length,visibleBars:state.eventVisibleBars,offsetBars:state.eventOffsetBars,rightIndent:state.eventRightIndent,crosshairEnabled:state.eventCrosshairEnabled,crosshair:state.eventCrosshair,legendId:"eventIndicatorLegend",indicators});',
'  }',
'  function eventHistoryCount'
);
replaceRegex(/  function eventDraw\(data,htl,events\)\{[\s\S]*?\n  \}\n  function eventHistoryCount/,eventDraw,"event renderer delegation");

replaceOnce('      const payload=await oanda(`/v3/instruments/${encodeURIComponent(pair)}/candles?price=M&granularity=${encodeURIComponent(timeframe)}&count=${desired}`,controller,priority),data=completedCandles(payload,pair,timeframe);\n      if(!data.length)throw new Error(`No completed candles · ${formatPair(pair)} ${timeframe}`);\n      const key=scheduleKey(pair,timeframe);cacheChartCandles(key,data);','      const data=desired===MAX_ANALYTICAL_HISTORY?await loadUnifiedChartCandles(pair,timeframe,controller,priority,priority>=100):completedCandles(await oanda(`/v3/instruments/${encodeURIComponent(pair)}/candles?price=M&granularity=${encodeURIComponent(timeframe)}&count=${desired}`,controller,priority),pair,timeframe);\n      if(!data.length)throw new Error(`No completed candles · ${formatPair(pair)} ${timeframe}`);\n      const key=scheduleKey(pair,timeframe);if(desired!==MAX_ANALYTICAL_HISTORY)cacheChartCandles(key,data);',"event chart canonical loader");

const loadEval=B(
'  async function loadEvalChartData(pair,timeframe){',
'    if(!state.connected)return;',
'    try{',
'      const priceCache=await ensureEvaluationPairFrames(pair,timeframe),candlesList=await loadUnifiedChartCandles(pair,timeframe,null,95,true),key=`${pair}|${timeframe}`,strategy=el("evalChartStrategy")?.value||state.evaluationSelectedStrategy||state.selectedScheduleStrategy;priceCache[timeframe]=candlesList;state.evalCandles=candlesList;',
'      const chartConfig=chartControlConfiguration(pair,timeframe,strategy,"evalChartLength","evalChartFilter"),analysis=candlesList.length?analyzeWithConfiguration(candlesList,chartConfig,true):null,activeSignal=analysis?.latest?.[strategy],events=analysis?.series?.[strategy]||[],direction=Number(activeSignal?.direction)||0,metrics=evaluationFramesReady(priceCache,timeframe)?calculateMASIMPressure(pair,timeframe,priceCache,{direction,events}):null;state.evalMasImMetrics=metrics;',
'      const fmt=(value,digits=3)=>Number.isFinite(value)?value.toFixed(digits):value===Infinity?"∞":"—";el("evalMetricSignal").textContent=signalWord(direction);el("evalMetricSignal").className=directionClass(direction);el("evalMetricMas").textContent=fmt(metrics?.MAS);el("evalMetricIm").textContent=fmt(metrics?.IM);el("evalMetricRatio").textContent=fmt(metrics?.IM_OVER_MAS,2);el("evalMetricRequiredIm").textContent=metrics?.REGIME==="TREND_ALIGNED"?"—":fmt(metrics?.REQUIRED_IM);el("evalMetricTransition").textContent=metrics?.REGIME==="TREND_ALIGNED"?"ALIGNED":Number.isFinite(metrics?.TRANSITION_PROBABILITY)?`${(metrics.TRANSITION_PROBABILITY*100).toFixed(1)}%`:"—";el("evalMetricRegime").textContent=String(metrics?.REGIME||"—").replaceAll("_"," ");el("evalMetricPipsHour").textContent=fmt(metrics?.PIPS_PER_HOUR,1);',
'      if(metrics?.hierarchy?.length)el("evalChartSubtitle").textContent=`${metrics.hierarchy.join(" → ")} · timestamp-synchronized · MAS top-down / IM reverse cadence · unified 5,000-candle chart`;el("evalChartMessage").hidden=candlesList.length>0;drawEvalCharts();drawWeeklyCognition(pair,metrics);',
'    }catch(error){console.error("Failed to load evaluation chart data:",error);el("evalChartMessage").hidden=false;el("evalChartMessage").textContent=error.message||"Evaluation chart load failed";}',
'  }',
'',
'  function drawEvalCharts() {',
'    const pair=el("evalChartPair")?.value||state.selectedInstrument,timeframe=el("evalChartTimeframe")?.value||state.selectedTimeframe,strategy=el("evalChartStrategy")?.value||state.evaluationSelectedStrategy||"ASSET",length=clamp(Math.round(Number(el("evalChartLength")?.value)||10),3,MAX_ANALYTICAL_LENGTH),indicators=unifiedIndicatorSet(pair,timeframe,state.evalCandles,length);',
'    renderUnifiedChartSurface({canvasId:"evalChart",candles:state.evalCandles,pair,timeframe,strategy,length,visibleBars:state.evalVisibleBars,offsetBars:state.evalOffsetBars,rightIndent:state.evalRightIndent,crosshairEnabled:state.evalCrosshairEnabled,crosshair:state.evalCrosshair,legendId:"evalIndicatorLegend",indicators});drawOscillatorChart();',
'  }',
'',
'  function drawOscillatorChart'
);
replaceRegex(/  async function loadEvalChartData\(pair,timeframe\)\{[\s\S]*?\n  \}\n\n  function drawEvalCharts\(\) \{[\s\S]*?\n  \}\n\n  function drawOscillatorChart/,loadEval,"evaluation canonical loader and renderer");

fs.writeFileSync(path,source);console.log(`Applied unified evaluation chart migration (${changes} transformations).`);
