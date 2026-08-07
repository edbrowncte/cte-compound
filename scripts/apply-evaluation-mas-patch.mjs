import {readFile,writeFile} from "node:fs/promises";

const path=new URL("../public/index.html",import.meta.url);
let html=await readFile(path,"utf8");

function replaceOnce(label,before,after){
  const first=html.indexOf(before);
  if(first<0)throw new Error(`${label}: start text not found`);
  if(html.indexOf(before,first+before.length)>=0)throw new Error(`${label}: start text is not unique`);
  html=html.slice(0,first)+after+html.slice(first+before.length);
}

function replaceRange(label,startMarker,endMarker,replacement){
  const start=html.indexOf(startMarker);
  if(start<0)throw new Error(`${label}: start marker not found`);
  const end=html.indexOf(endMarker,start+startMarker.length);
  if(end<0)throw new Error(`${label}: end marker not found`);
  html=html.slice(0,start)+replacement+html.slice(end);
}

replaceOnce(
  "canonical calculator script",
  '  <script>\n  "use strict";',
  '  <script src="/mas-im-calculator.js"></script>\n  <script>\n  "use strict";'
);

replaceOnce(
  "weekly cognition explanatory note",
  "Stacked ticks show daily closes composing the weekly bar. recovered_MAS and recovered_IM boundaries overlaid.",
  "Weekly closes are price-space context only. MAS and IM are scale-free log-slope composites; their z-scores are not projected back into price space."
);

replaceRange(
  "legacy evaluation calculator",
  "  // --- TASK 3/4/5 EVALUATION & PAIR SELECTION TAB IMPLEMENTATION ---",
  "  async function loadEvaluationData() {",
`  // --- EVALUATION & PAIR SELECTION TAB IMPLEMENTATION ---
  // MAS/IM mathematics are canonicalized in /mas-im-calculator.js and shared with the engine.
  const { MAS_IM_TIMEFRAMES, calculateSlopeStats, calculateMAS_IM_ZScores, calculateEventAngle, classifyType } = CTEMASIM;

`
);

replaceRange(
  "evaluation data loader",
  "  async function loadEvaluationData() {",
  "  async function preloadEvaluationTimeframe(activeTf) {",
`  async function loadEvaluationData() {
    if (!state.connected) return;
    await preloadEvaluationTimeframe(el("evalTableTfFilter").value);
  }

  function evaluationPriceCache(pair) {
    const cache = {};
    for (const tf of MAS_IM_TIMEFRAMES) {
      const candlesList = state.scheduleCandles.get(\`${pair}|${tf}\`) || [];
      if (candlesList.length) cache[tf] = candlesList;
    }
    return cache;
  }

  function evaluationFramesReady(priceCache) {
    return MAS_IM_TIMEFRAMES.every(tf => Array.isArray(priceCache[tf]) && priceCache[tf].length >= 70);
  }

  async function ensureEvaluationPairFrames(pair) {
    const missing = MAS_IM_TIMEFRAMES.filter(tf => (state.scheduleCandles.get(\`${pair}|${tf}\`) || []).length < 180);
    if (!missing.length) return evaluationPriceCache(pair);
    await runPool(missing.map(tf => ({ pair, tf })), 3, async item => {
      try {
        const q = new URLSearchParams({ price: "M", granularity: item.tf, count: "180", smooth: "false" });
        const payload = await oanda(\`/v3/instruments/${item.pair}/candles?${q}\`, null, 10);
        const candlesList = completedCandles(payload, item.pair, item.tf);
        if (candlesList.length) {
          const key = \`${item.pair}|${item.tf}\`;
          state.scheduleCandles.set(key, candlesList);
          const optimized = state.autoConfigurations.get(key)?.config;
          state.scheduleEvaluations.set(key, analyzeWithConfiguration(candlesList, optimized || STRATEGY_CONFIG, false));
        }
      } catch (error) {
        console.error(\`Evaluation frame load failed for ${item.pair} ${item.tf}:\`, error);
      }
    });
    return evaluationPriceCache(pair);
  }

`
);

replaceRange(
  "evaluation preloader",
  "  async function preloadEvaluationTimeframe(activeTf) {",
  "  async function computeEvaluationResults() {",
`  async function preloadEvaluationTimeframe(activeTf) {
    if (!state.connected) return;
    const jobs = [];
    for (const pair of INSTRUMENTS) {
      for (const tf of MAS_IM_TIMEFRAMES) {
        if ((state.scheduleCandles.get(\`${pair}|${tf}\`) || []).length < 180) jobs.push({ pair, tf });
      }
    }
    if (jobs.length) {
      await runPool(jobs, 3, async item => {
        try {
          const q = new URLSearchParams({ price: "M", granularity: item.tf, count: "180", smooth: "false" });
          const payload = await oanda(\`/v3/instruments/${item.pair}/candles?${q}\`, null, 10);
          const candlesList = completedCandles(payload, item.pair, item.tf);
          if (candlesList.length) {
            const key = \`${item.pair}|${item.tf}\`;
            state.scheduleCandles.set(key, candlesList);
            const optimized = state.autoConfigurations.get(key)?.config;
            state.scheduleEvaluations.set(key, analyzeWithConfiguration(candlesList, optimized || STRATEGY_CONFIG, false));
          }
        } catch (error) {
          console.error(\`Evaluation preload failed for ${item.pair} ${item.tf}:\`, error);
        }
      });
    }
    await computeEvaluationResults();
  }

`
);

replaceRange(
  "evaluation computation",
  "  async function computeEvaluationResults() {",
  "  function renderFourSlotRotator() {",
`  async function computeEvaluationResults() {
    const results = [];
    const activeTf = el("evalTableTfFilter").value;

    for (const pair of INSTRUMENTS) {
      const priceCache = evaluationPriceCache(pair);
      if (!evaluationFramesReady(priceCache)) {
        results.push({pair,timeframe:activeTf,signal:0,mas_z:NaN,im_z:NaN,mas:NaN,im:NaN,ratio:NaN,eventAngle:NaN,weeklySlope:NaN,roc:NaN,r2:NaN,pValue:NaN,pipsPerHour:NaN,strength:NaN,type:"NEUTRAL",priceCache});
        continue;
      }

      const metrics = calculateMAS_IM_ZScores(pair, activeTf, priceCache);
      const activeCandles = priceCache[activeTf] || [];
      const closes = activeCandles.map(candle => candle.close);
      const activeScheduleKey = \`${pair}|${activeTf}\`;
      const evalAnalysis = state.scheduleEvaluations.get(activeScheduleKey);
      const activeSignal = evalAnalysis?.latest?.[state.selectedScheduleStrategy];
      const dir = activeSignal?.direction || (Number.isFinite(metrics.MAS_Z) ? Math.sign(metrics.MAS_Z) : 0);
      const prevP = closes.at(-2), currP = closes.at(-1);
      const angle = Number.isFinite(prevP) && Number.isFinite(currP) ? calculateEventAngle(prevP, currP, 1) : NaN;
      const stats = closes.length >= 50 ? calculateSlopeStats(closes.slice(-50)) : {r2:NaN,pValue:NaN,roc:NaN};
      const pipsPerHour = metrics.perTF?.[activeTf]?.pipsPerHour;
      const strength = Number.isFinite(metrics.MAS_Z) && Number.isFinite(metrics.IM_Z) && Number.isFinite(stats.r2) ? .5 * (Math.abs(metrics.MAS_Z) + Math.abs(metrics.IM_Z)) * stats.r2 : NaN;

      results.push({
        pair,timeframe:activeTf,signal:dir,mas_z:metrics.MAS_Z,im_z:metrics.IM_Z,mas:metrics.MAS,im:metrics.IM,ratio:metrics.IM_OVER_MAS,
        eventAngle:angle,weeklySlope:metrics.perTF?.W?.slope ?? NaN,roc:stats.roc,r2:stats.r2,pValue:stats.pValue,pipsPerHour,strength,
        type:classifyType(dir,metrics.MAS_Z),priceCache,historyMode:metrics.historyMode
      });
    }

    state.evaluationTableData = results;
    renderEvaluationTable();
    renderFourSlotRotator();
  }

`
);

replaceRange(
  "evaluation chart loader",
  "  async function loadEvalChartData(pair, timeframe) {",
  "  function drawEvalCharts() {",
`  async function loadEvalChartData(pair, timeframe) {
    if (!state.connected) return;
    try {
      const priceCache = await ensureEvaluationPairFrames(pair);
      const candlesList = priceCache[timeframe] || [];
      state.evalCandles = candlesList;
      const metrics = evaluationFramesReady(priceCache) ? calculateMAS_IM_ZScores(pair, timeframe, priceCache) : null;
      state.evalMasImMetrics = metrics;

      const activeScheduleKey = \`${pair}|${timeframe}\`;
      const activeSignal = state.scheduleEvaluations.get(activeScheduleKey)?.latest?.[state.selectedScheduleStrategy]?.direction || 0;
      const metricSignal = activeSignal || (Number.isFinite(metrics?.MAS_Z) ? Math.sign(metrics.MAS_Z) : 0);
      el("evalMetricSignal").textContent = signalWord(metricSignal);
      el("evalMetricSignal").className = directionClass(metricSignal);
      el("evalMetricMasZ").textContent = Number.isFinite(metrics?.MAS_Z) ? metrics.MAS_Z.toFixed(2) : "—";
      el("evalMetricImZ").textContent = Number.isFinite(metrics?.IM_Z) ? metrics.IM_Z.toFixed(2) : "—";
      el("evalMetricRatio").textContent = Number.isFinite(metrics?.IM_OVER_MAS) ? metrics.IM_OVER_MAS.toFixed(2) : "—";
      const closes = candlesList.map(candle => candle.close), stats = closes.length >= 50 ? calculateSlopeStats(closes.slice(-50)) : {r2:NaN};
      el("evalMetricR2").textContent = Number.isFinite(stats.r2) ? stats.r2.toFixed(2) : "—";
      el("evalMetricPipsHour").textContent = Number.isFinite(metrics?.perTF?.[timeframe]?.pipsPerHour) ? metrics.perTF[timeframe].pipsPerHour.toFixed(1) : "—";

      el("evalChartMessage").hidden = candlesList.length > 0;
      drawEvalCharts();
      drawWeeklyCognition(pair, metrics);
    } catch (error) {
      console.error("Failed to load evaluation chart data:", error);
    }
  }

`
);

replaceRange(
  "MAS IM oscillator",
  "  function drawOscillatorChart() {",
  "  function drawWeeklyCognition(pair, zScores) {",
`  function drawOscillatorChart() {
    const canvas = el("oscillatorCanvas");
    if (!canvas) return;
    const ctx = canvas.getContext("2d"), rect = canvas.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
    const width = Math.max(100, rect.width || canvas.clientWidth || canvas.parentNode?.clientWidth || 0), height = Math.max(100, rect.height || canvas.clientHeight || canvas.parentNode?.clientHeight || 0);
    canvas.width = width * dpr; canvas.height = height * dpr; ctx.setTransform(dpr,0,0,dpr,0,0); ctx.fillStyle = "#080c12"; ctx.fillRect(0,0,width,height);
    const visible = visibleEvalSlice(), metrics = state.evalMasImMetrics;
    if (!visible.candles.length || !metrics) return;

    const selectedStrategy = el("evalChartStrategy")?.value || "ASSET", lengthInput = el("evalChartLength") ? clamp(Math.round(Number(el("evalChartLength").value) || 10),3,200) : 10, filterInput = el("evalChartFilter") ? clamp(Number(el("evalChartFilter").value) || 0,0,10) : 0, indicators = prepareIndicators(state.evalCandles,{length:lengthInput,filter:filterInput}), indicatorSet = CHART_INDICATORS[selectedStrategy] || CHART_INDICATORS.ASSET;
    const count = Math.min(state.evalVisibleBars,state.evalCandles.length), maxOffset = Math.max(0,state.evalCandles.length-count), offset = clamp(state.evalOffsetBars,0,maxOffset), visibleEnd = state.evalCandles.length-offset, visibleStart = Math.max(0,visibleEnd-count), visibleCandles = state.evalCandles.slice(visibleStart,visibleEnd), margin={top:10,right:60+state.evalRightIndent,bottom:10,left:40}, plot={x:margin.left,y:margin.top,w:width-margin.left-margin.right,h:height-margin.top-margin.bottom};
    const alignSeries = source => { const out = new Array(state.evalCandles.length).fill(NaN), start = Math.max(0,out.length-source.length); for(let index=0;index<source.length&&start+index<out.length;index++) out[start+index]=source[index]; return out; };
    const masData = alignSeries(metrics.MAS_Z_SERIES || []), imData = alignSeries(metrics.IM_Z_SERIES || []), histogram = masData.map((value,index)=>Number.isFinite(value)&&Number.isFinite(imData[index])?imData[index]-value:NaN), visibleValues=[...masData.slice(visibleStart,visibleEnd),...imData.slice(visibleStart,visibleEnd),...histogram.slice(visibleStart,visibleEnd)].filter(Number.isFinite), zMax=Math.max(3.5,...visibleValues.map(value=>Math.abs(value)))*1.08, zToY=value=>plot.y+(zMax-value)/(zMax*2)*plot.h, barWidth=plot.w/Math.max(1,visibleCandles.length), indexToX=index=>plot.x+(index+.5)*barWidth, gridEndX=width-60;
    ctx.strokeStyle="#2b3543";ctx.beginPath();ctx.moveTo(plot.x,zToY(0));ctx.lineTo(gridEndX,zToY(0));ctx.stroke();
    for(let index=visibleStart;index<visibleEnd;index++){const value=histogram[index];if(!Number.isFinite(value))continue;const x=indexToX(index-visibleStart),zero=zToY(0),y=zToY(value);ctx.fillStyle=value>=0?"rgba(72,199,142,0.3)":"rgba(239,107,115,0.3)";ctx.fillRect(x-barWidth*.3,Math.min(zero,y),barWidth*.6,Math.max(1,Math.abs(zero-y)));}
    const drawSeries=(values,color)=>{ctx.strokeStyle=color;ctx.lineWidth=1.5;ctx.beginPath();let started=false;for(let index=visibleStart;index<visibleEnd;index++){const value=values[index];if(!Number.isFinite(value)){started=false;continue;}const x=indexToX(index-visibleStart),y=zToY(value);if(!started){ctx.moveTo(x,y);started=true;}else ctx.lineTo(x,y);}ctx.stroke();};
    drawSeries(masData,"#ef6b73"); drawSeries(imData,"#48c78e");
    for (const [key,,color] of indicatorSet.osc) drawIndicatorLine(ctx,indicators[key],visibleStart,visibleEnd,indexToX,zToY,color,1.8);
    if(state.evalCrosshairEnabled&&state.evalCrosshair!==null&&state.evalCrosshair>=0&&state.evalCrosshair<visibleCandles.length){const cx=indexToX(state.evalCrosshair);ctx.setLineDash([3,3]);ctx.strokeStyle="#a7b5c7";ctx.beginPath();ctx.moveTo(cx,plot.y);ctx.lineTo(cx,plot.y+plot.h);ctx.stroke();ctx.setLineDash([]);const absIndex=visibleStart+state.evalCrosshair,masVal=masData[absIndex],imVal=imData[absIndex];ctx.fillStyle="#edf2ff";ctx.font="9px ui-monospace,monospace";ctx.fillText(\`MAS Z: ${Number.isFinite(masVal)?masVal.toFixed(2):"—"} | IM Z: ${Number.isFinite(imVal)?imVal.toFixed(2):"—"}\`,plot.x+5,plot.y+12);}
  }

`
);

replaceRange(
  "weekly cognition",
  "  function drawWeeklyCognition(pair, zScores) {",
  "  function renderEvaluationTable() {",
`  function drawWeeklyCognition(pair, metrics) {
    const canvas = el("weeklyCognitionCanvas");
    if (!canvas) return;
    const ctx=canvas.getContext("2d"),rect=canvas.getBoundingClientRect(),dpr=window.devicePixelRatio||1,width=Math.max(100,rect.width||canvas.clientWidth||canvas.parentNode?.clientWidth||0),height=Math.max(100,rect.height||canvas.clientHeight||canvas.parentNode?.clientHeight||0);
    canvas.width=width*dpr;canvas.height=height*dpr;ctx.setTransform(dpr,0,0,dpr,0,0);ctx.fillStyle="#080c12";ctx.fillRect(0,0,width,height);
    const fmt=value=>Number.isFinite(value)?value.toFixed(2):"—",sci=value=>Number.isFinite(value)?value.toExponential(3):"—";
    el("weeklyCognitionTitle").textContent=\`W · MAS Z: ${fmt(metrics?.MAS_Z)} | IM Z: ${fmt(metrics?.IM_Z)} | IM/MAS: ${fmt(metrics?.IM_OVER_MAS)}\`;
    const weeklyCandles=state.scheduleCandles.get(\`${pair}|W\`)||[],weeklyCloses=weeklyCandles.slice(-8).map(candle=>candle.close).filter(Number.isFinite);
    if(!weeklyCloses.length)return;
    const margin={top:48,right:30,bottom:40,left:30},plot={x:margin.left,y:margin.top,w:width-margin.left-margin.right,h:height-margin.top-margin.bottom},low0=Math.min(...weeklyCloses),high0=Math.max(...weeklyCloses),pad=(high0-low0)*.2||Math.abs(high0)*.002||.01,low=low0-pad,high=high0+pad,valToY=value=>plot.y+(high-value)/(high-low)*plot.h;
    ctx.fillStyle="#8b98aa";ctx.font="8px ui-monospace,monospace";ctx.fillText(\`MAS ${sci(metrics?.MAS)} log/hr · IM ${sci(metrics?.IM)} log/hr\`,plot.x,20);ctx.fillText("Z uses causal same-lag multiscale composite history; no price-space recovery.",plot.x,33);
    ctx.strokeStyle="#415267";ctx.lineWidth=1;ctx.beginPath();weeklyCloses.forEach((close,index)=>{const x=plot.x+(index/(Math.max(1,weeklyCloses.length-1)))*plot.w,y=valToY(close);if(index===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);});ctx.stroke();
    weeklyCloses.forEach((close,index)=>{const x=plot.x+(index/(Math.max(1,weeklyCloses.length-1)))*plot.w,y=valToY(close);ctx.fillStyle=index>0&&close>=weeklyCloses[index-1]?"#48c78e":"#ef6b73";ctx.beginPath();ctx.arc(x,y,3,0,2*Math.PI);ctx.fill();ctx.fillStyle="#8b98aa";ctx.textAlign="center";ctx.fillText(\`W${index+1}\`,x,plot.y+plot.h+22);});ctx.textAlign="left";
  }

`
);

await writeFile(path,html);
console.log("Applied canonical MAS/IM evaluation migration to public/index.html");
