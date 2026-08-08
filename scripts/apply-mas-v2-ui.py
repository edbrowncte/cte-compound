from pathlib import Path

html_path = Path("public/index.html")
html = html_path.read_text()


def replace_once(label: str, before: str, after: str) -> None:
    global html
    count = html.count(before)
    if count != 1:
        raise RuntimeError(f"{label}: expected one match, found {count}")
    html = html.replace(before, after, 1)


def replace_range(label: str, start_marker: str, end_marker: str, replacement: str) -> None:
    global html
    start = html.find(start_marker)
    if start < 0:
        raise RuntimeError(f"{label}: start marker not found")
    end = html.find(end_marker, start + len(start_marker))
    if end < 0:
        raise RuntimeError(f"{label}: end marker not found")
    html = html[:start] + replacement + html[end:]


replace_once(
    "Evaluation subtitle",
    "Interactive slope-trend chart with synced oscillators and Weekly cognition.",
    "Timestamp-synchronized antagonist pressure, reverse-cadence IM, event power, and transition diagnostics.",
)

replace_once(
    "Evaluation metrics",
    '''              <div class="chart-summary" style="grid-template-columns:repeat(6, 1fr);">
                <div class="metric"><span>Signal</span><strong id="evalMetricSignal">—</strong></div>
                <div class="metric"><span>MAS Z</span><strong id="evalMetricMasZ">—</strong></div>
                <div class="metric"><span>IM Z</span><strong id="evalMetricImZ">—</strong></div>
                <div class="metric"><span>IM/MAS</span><strong id="evalMetricRatio">—</strong></div>
                <div class="metric"><span>R²</span><strong id="evalMetricR2">—</strong></div>
                <div class="metric"><span>Pips/Hr</span><strong id="evalMetricPipsHour">—</strong></div>
              </div>''',
    '''              <div class="chart-summary" style="grid-template-columns:repeat(8, minmax(0,1fr));">
                <div class="metric"><span>Signal</span><strong id="evalMetricSignal">—</strong></div>
                <div class="metric"><span>MAS</span><strong id="evalMetricMas">—</strong></div>
                <div class="metric"><span>IM</span><strong id="evalMetricIm">—</strong></div>
                <div class="metric"><span>IM/MAS</span><strong id="evalMetricRatio">—</strong></div>
                <div class="metric"><span>Required IM</span><strong id="evalMetricRequiredIm">—</strong></div>
                <div class="metric"><span>Transition P</span><strong id="evalMetricTransition">—</strong></div>
                <div class="metric"><span>Regime</span><strong id="evalMetricRegime">—</strong></div>
                <div class="metric"><span>Pips/Hr</span><strong id="evalMetricPipsHour">—</strong></div>
              </div>''',
)

replace_once("Oscillator heading", "Synced MAS/IM Oscillator", "Synced MAS / IM Pressure")
replace_once(
    "Hierarchy cognition note",
    "Weekly closes are price-space context only. MAS and IM are scale-free log-slope composites; their z-scores are not projected back into price space.",
    "Each row is the latest completed, timestamp-synchronized trend power for the signal timeframe and every enclosing timeframe. MAS weights increase toward W; IM uses the exact reverse cadence.",
)

replace_once(
    "Evaluation timeframe filter",
    '''                <select id="evalTableTfFilter">
                  <option value="H1" selected>H1</option>
                  <option value="M1">M1</option>
                  <option value="M5">M5</option>
                  <option value="M15">M15</option>
                  <option value="M30">M30</option>
                  <option value="H4">H4</option>
                  <option value="D">D</option>
                  <option value="W">W</option>
                </select>''',
    '''                <select id="evalTableTfFilter">
                  <option value="H1" selected>H1</option>
                  <option value="S5">S5</option>
                  <option value="S30">S30</option>
                  <option value="M1">M1</option>
                  <option value="M5">M5</option>
                  <option value="M15">M15</option>
                  <option value="M30">M30</option>
                  <option value="H4">H4</option>
                  <option value="D">D</option>
                  <option value="W">W</option>
                </select>''',
)

replace_once(
    "Evaluation table header",
    '''                <tr>
                  <th style="cursor:pointer;" id="sort-pair">Pair</th>
                  <th style="cursor:pointer;" id="sort-timeframe">TF</th>
                  <th style="cursor:pointer;" id="sort-signal">Signal</th>
                  <th style="cursor:pointer;" id="sort-mas_z">MAS Z</th>
                  <th style="cursor:pointer;" id="sort-im_z">IM Z</th>
                  <th style="cursor:pointer;" id="sort-ratio">IM/MAS</th>
                  <th style="cursor:pointer;" id="sort-eventAngle">Event Angle</th>
                  <th style="cursor:pointer;" id="sort-weeklySlope">Antag Slope (W)</th>
                  <th style="cursor:pointer;" id="sort-roc">ROC</th>
                  <th style="cursor:pointer;" id="sort-r2">R²</th>
                  <th style="cursor:pointer;" id="sort-pValue">Significance (p)</th>
                  <th style="cursor:pointer;" id="sort-pipsPerHour">Pips/Hr</th>
                  <th style="cursor:pointer;" id="sort-strength">Strength</th>
                  <th style="cursor:pointer;" id="sort-type">Type</th>
                </tr>''',
    '''                <tr>
                  <th style="cursor:pointer;" id="sort-pair">Pair</th>
                  <th style="cursor:pointer;" id="sort-timeframe">Signal TF</th>
                  <th style="cursor:pointer;" id="sort-signal">Signal</th>
                  <th style="cursor:pointer;" id="sort-mas">MAS</th>
                  <th style="cursor:pointer;" id="sort-im">IM</th>
                  <th style="cursor:pointer;" id="sort-ratio">IM/MAS</th>
                  <th style="cursor:pointer;" id="sort-masRoc">MAS ROC</th>
                  <th style="cursor:pointer;" id="sort-imRoc">IM ROC</th>
                  <th style="cursor:pointer;" id="sort-ratioRoc">Ratio ROC</th>
                  <th style="cursor:pointer;" id="sort-eventAngleZ">Event Angle Z</th>
                  <th style="cursor:pointer;" id="sort-convexity">Convexity</th>
                  <th style="cursor:pointer;" id="sort-r2">R²</th>
                  <th style="cursor:pointer;" id="sort-fStat">F</th>
                  <th style="cursor:pointer;" id="sort-pValue">Significance (p)</th>
                  <th style="cursor:pointer;" id="sort-pipsPerHour">Pips/Hr</th>
                  <th style="cursor:pointer;" id="sort-requiredIm">Required IM</th>
                  <th style="cursor:pointer;" id="sort-transitionProbability">Transition P</th>
                  <th style="cursor:pointer;" id="sort-regime">Regime</th>
                </tr>''',
)

replace_once("Evaluation default sort", '    evalSortKey:"strength",', '    evalSortKey:"transitionProbability",')
replace_once("Remove obsolete Evaluation slope state", '    evaluationSlopeHistory:{},\n', '')
replace_once(
    "Canonical calculator imports",
    '  const { MAS_IM_TIMEFRAMES, calculateSlopeStats, calculateMAS_IM_ZScores, calculateEventAngle, classifyType } = CTEMASIM;',
    '  const { MAS_IM_TIMEFRAMES, timeframeHierarchy, calculateMASIMPressure } = CTEMASIM;',
)

replace_range(
    "Evaluation hierarchy loading",
    "  function evaluationFramesReady(priceCache) {",
    "  async function computeEvaluationResults() {",
    '''  function evaluationFramesReady(priceCache, timeframe) {
    const required=timeframeHierarchy(timeframe);
    return required.length>0&&required.every(tf=>Array.isArray(priceCache[tf])&&priceCache[tf].length>=80);
  }

  async function ensureEvaluationPairFrames(pair,timeframe) {
    const required=timeframeHierarchy(timeframe);
    const missing=required.filter(tf=>(state.scheduleCandles.get(`${pair}|${tf}`)||[]).length<320);
    if(missing.length){
      await runPool(missing.map(tf=>({pair,tf})),3,async item=>{
        try{
          const q=new URLSearchParams({price:"M",granularity:item.tf,count:"320",smooth:"false"});
          const payload=await oanda(`/v3/instruments/${item.pair}/candles?${q}`,null,10);
          const candlesList=completedCandles(payload,item.pair,item.tf);
          if(candlesList.length){
            const key=`${item.pair}|${item.tf}`;
            state.scheduleCandles.set(key,candlesList);
            const optimized=state.autoConfigurations.get(key)?.config;
            state.scheduleEvaluations.set(key,analyzeWithConfiguration(candlesList,optimized||STRATEGY_CONFIG,item.tf===timeframe));
          }
        }catch(error){console.error(`Evaluation frame load failed for ${item.pair} ${item.tf}:`,error);}
      });
    }
    const activeKey=`${pair}|${timeframe}`,activeCandles=state.scheduleCandles.get(activeKey)||[];
    if(activeCandles.length){
      const optimized=state.autoConfigurations.get(activeKey)?.config;
      const analysis=state.scheduleEvaluations.get(activeKey);
      if(!analysis?.series?.[state.selectedScheduleStrategy]?.length)state.scheduleEvaluations.set(activeKey,analyzeWithConfiguration(activeCandles,optimized||STRATEGY_CONFIG,true));
    }
    return evaluationPriceCache(pair);
  }

  async function preloadEvaluationTimeframe(activeTf) {
    if(!state.connected)return;
    const required=timeframeHierarchy(activeTf),jobs=[];
    for(const pair of INSTRUMENTS)for(const tf of required)if((state.scheduleCandles.get(`${pair}|${tf}`)||[]).length<320)jobs.push({pair,tf});
    if(jobs.length){
      await runPool(jobs,3,async item=>{
        try{
          const q=new URLSearchParams({price:"M",granularity:item.tf,count:"320",smooth:"false"});
          const payload=await oanda(`/v3/instruments/${item.pair}/candles?${q}`,null,10);
          const candlesList=completedCandles(payload,item.pair,item.tf);
          if(candlesList.length){
            const key=`${item.pair}|${item.tf}`;
            state.scheduleCandles.set(key,candlesList);
            const optimized=state.autoConfigurations.get(key)?.config;
            state.scheduleEvaluations.set(key,analyzeWithConfiguration(candlesList,optimized||STRATEGY_CONFIG,item.tf===activeTf));
          }
        }catch(error){console.error(`Evaluation preload failed for ${item.pair} ${item.tf}:`,error);}
      });
    }
    for(const pair of INSTRUMENTS){
      const key=`${pair}|${activeTf}`,candlesList=state.scheduleCandles.get(key)||[];
      if(!candlesList.length)continue;
      const optimized=state.autoConfigurations.get(key)?.config;
      const analysis=state.scheduleEvaluations.get(key);
      if(!analysis?.series?.[state.selectedScheduleStrategy]?.length)state.scheduleEvaluations.set(key,analyzeWithConfiguration(candlesList,optimized||STRATEGY_CONFIG,true));
    }
    await computeEvaluationResults();
  }

''',
)

replace_range(
    "Evaluation pressure computation",
    "  async function computeEvaluationResults() {",
    "  function renderFourSlotRotator() {",
    '''  async function computeEvaluationResults() {
    const results=[],activeTf=el("evalTableTfFilter").value,strategy=state.selectedScheduleStrategy;
    for(const pair of INSTRUMENTS){
      const priceCache=evaluationPriceCache(pair),activeKey=`${pair}|${activeTf}`,activeCandles=priceCache[activeTf]||[];
      if(!evaluationFramesReady(priceCache,activeTf)){
        results.push({pair,timeframe:activeTf,signal:0,mas:NaN,im:NaN,ratio:NaN,masRoc:NaN,imRoc:NaN,ratioRoc:NaN,eventAngleZ:NaN,convexity:NaN,r2:NaN,fStat:NaN,pValue:NaN,pipsPerHour:NaN,requiredIm:NaN,transitionProbability:NaN,regime:"NEUTRAL",type:"NEUTRAL",strength:NaN});
        continue;
      }
      const optimized=state.autoConfigurations.get(activeKey)?.config;
      let analysis=state.scheduleEvaluations.get(activeKey);
      if(!analysis?.series?.[strategy]?.length){analysis=analyzeWithConfiguration(activeCandles,optimized||STRATEGY_CONFIG,true);state.scheduleEvaluations.set(activeKey,analysis);}
      const activeSignal=analysis?.latest?.[strategy],events=analysis?.series?.[strategy]||[],dir=Number(activeSignal?.direction)||0,metrics=calculateMASIMPressure(pair,activeTf,priceCache,{direction:dir,events});
      const pressureShare=Number.isFinite(metrics.MAS)&&Number.isFinite(metrics.IM)&&(metrics.MAS+metrics.IM)>0?metrics.IM/(metrics.MAS+metrics.IM):0;
      const transition=Number.isFinite(metrics.TRANSITION_PROBABILITY)?metrics.TRANSITION_PROBABILITY:pressureShare;
      const eventPower=Number.isFinite(metrics.EVENT_ANGLE_Z)?clamp(.5+.2*Math.tanh(metrics.EVENT_ANGLE_Z/2),0,1):.5;
      const fit=Number.isFinite(metrics.R2)?metrics.R2:0;
      const strength=.55*transition+.25*eventPower+.20*fit;
      results.push({
        pair,timeframe:activeTf,signal:dir,mas:metrics.MAS,im:metrics.IM,ratio:metrics.IM_OVER_MAS,modelRatio:metrics.MODEL_RATIO,
        masRoc:metrics.MAS_ROC,imRoc:metrics.IM_ROC,ratioRoc:metrics.RATIO_ROC,eventAngleZ:metrics.EVENT_ANGLE_Z,eventAngle:metrics.EVENT_ANGLE,convexity:metrics.CONVEXITY,
        r2:metrics.R2,fStat:metrics.F_STAT,pValue:metrics.P_VALUE,pipsPerHour:metrics.PIPS_PER_HOUR,requiredIm:metrics.REQUIRED_IM,
        transitionThreshold:metrics.TRANSITION_THRESHOLD,transitionThresholdSource:metrics.TRANSITION_THRESHOLD_SOURCE,transitionProbability:metrics.TRANSITION_PROBABILITY,
        transitionSamples:metrics.TRANSITION_SAMPLE_COUNT,regime:metrics.REGIME,type:metrics.TYPE,strength,macroForce:metrics.macroForce,hierarchy:metrics.hierarchy,priceCache
      });
    }
    state.evaluationTableData=results;
    renderEvaluationTable();
    renderFourSlotRotator();
  }

''',
)

replace_range(
    "Evaluation candidate rotator",
    "  function renderFourSlotRotator() {",
    "  async function loadEvalChartData(pair, timeframe) {",
    '''  function evaluationRotatorSlots(){
    const data=(state.evaluationTableData||[]).filter(row=>row.signal&&Number.isFinite(row.strength));
    const best=(direction,type)=>[...data].filter(row=>Math.sign(row.signal)===direction&&row.type===type).sort((a,b)=>b.strength-a.strength||(Number(b.transitionProbability)||0)-(Number(a.transitionProbability)||0)||(Number(b.r2)||0)-(Number(a.r2)||0))[0]||null;
    return[
      {title:"Best SELL Trend Following",candidate:best(-1,"TREND_FOLLOWING")},
      {title:"Best SELL Reversion / Transition",candidate:best(-1,"REVERSION")},
      {title:"Best BUY Trend Following",candidate:best(1,"TREND_FOLLOWING")},
      {title:"Best BUY Reversion / Transition",candidate:best(1,"REVERSION")}
    ];
  }

  function renderFourSlotRotator(){
    const fmt=(value,digits=2)=>Number.isFinite(value)?value.toFixed(digits):value===Infinity?"∞":"—",pct=value=>Number.isFinite(value)?`${(value*100).toFixed(1)}%`:"—",slots=evaluationRotatorSlots();
    el("fourSlotRotator").innerHTML=slots.map((slot,index)=>{
      const c=slot.candidate;
      if(!c)return `<div class="fact" style="border:1px solid var(--line);border-radius:5px;padding:10px;background:#0c1219;opacity:.6;"><span style="font-size:8px;color:var(--muted);">${slot.title}</span><div style="font-size:11px;font-weight:bold;margin-top:4px;">No Candidate Found</div></div>`;
      const isSelected=state.evalSelectedSlot===index,borderStyle=isSelected?"border:2px solid var(--accent);background:rgba(215,168,92,.08);":"border:1px solid var(--line);";
      return `<div class="fact" style="${borderStyle}border-radius:5px;padding:10px;position:relative;cursor:pointer;" onclick="selectRotatorSlot(${index})">
        <span style="font-size:8px;color:var(--muted);font-weight:bold;">${slot.title}</span>
        <div style="display:flex;align-items:center;justify-content:space-between;margin-top:6px;"><strong style="font-size:14px;">${formatPair(c.pair)}</strong><span class="badge ${directionClass(c.signal)}">${signalWord(c.signal)}</span></div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px;margin-top:6px;font-size:9px;">
          <div>MAS <b>${fmt(c.mas,3)}</b></div><div>IM <b>${fmt(c.im,3)}</b></div>
          <div>IM/MAS <b>${fmt(c.ratio,2)}</b></div><div>Ratio ROC <b>${fmt(c.ratioRoc,3)}</b></div>
          <div>Event Z <b>${fmt(c.eventAngleZ,2)}</b></div><div>Transition <b>${pct(c.transitionProbability)}</b></div>
        </div>
        <div style="margin-top:5px;font-size:8px;color:var(--muted);">${String(c.regime||"NEUTRAL").replaceAll("_"," ")}</div>
        <button type="button" class="connect" style="width:100%;margin-top:8px;padding:4px;font-size:9px;" onclick="confirmRotatorSlot(event,${index})">Confirm</button>
      </div>`;
    }).join("");
  }

  function getRotatorSlot(index){return evaluationRotatorSlots()[index]||null;}

  function selectRotatorSlot(index){
    state.evalSelectedSlot=index;
    const slot=getRotatorSlot(index),c=slot?.candidate;
    if(!c)return;
    state.selectedInstrument=c.pair;state.selectedTimeframe=c.timeframe;
    const ratio=Number.isFinite(c.ratio)?c.ratio.toFixed(2):c.ratio===Infinity?"∞":"—";
    el("evalChartTitle").textContent=`Preview: ${formatPair(c.pair)} ${c.timeframe} ${signalWord(c.signal)} · MAS ${Number.isFinite(c.mas)?c.mas.toFixed(3):"—"} · IM ${Number.isFinite(c.im)?c.im.toFixed(3):"—"} · R ${ratio} · ${String(c.regime).replaceAll("_"," ")}`;
    el("evalConfirmButton").style.display="inline-block";el("evalChartPair").value=c.pair;el("evalChartTimeframe").value=c.timeframe;
    void loadEvalChartData(c.pair,c.timeframe);renderFourSlotRotator();
  }

  async function confirmRotatorSlot(event,index){
    if(event)event.stopPropagation();
    const c=getRotatorSlot(index)?.candidate;
    if(!c)return;
    state.evalSelectedSlot=index;
    el("evalChartTitle").textContent=`HTL Confirmed: ${formatPair(c.pair)} ${c.timeframe} ${signalWord(c.signal)} · ${String(c.regime).replaceAll("_"," ")} · ${new Date().toLocaleTimeString()}`;
    el("evalConfirmButton").style.display="none";
    const fmt=value=>Number.isFinite(value)?value.toFixed(4):value===Infinity?"Infinity":"—",entry={
      type:"EVALUATION",pair:c.pair,direction:c.signal>0?"BUY":"SELL",timeframe:c.timeframe,
      mas:c.mas,im:c.im,imMasRatio:Number.isFinite(c.ratio)?c.ratio:null,masRoc:c.masRoc,imRoc:c.imRoc,ratioRoc:c.ratioRoc,eventAngleZ:c.eventAngleZ,convexity:c.convexity,
      r2:c.r2,fStat:c.fStat,pValue:c.pValue,pipsPerHour:c.pipsPerHour,requiredIm:c.requiredIm,transitionProbability:c.transitionProbability,regime:c.regime,
      message:`MAS ${fmt(c.mas)} | IM ${fmt(c.im)} | IM/MAS ${fmt(c.ratio)} | MAS ROC ${fmt(c.masRoc)} | IM ROC ${fmt(c.imRoc)} | Ratio ROC ${fmt(c.ratioRoc)} | Event Z ${fmt(c.eventAngleZ)} | Required IM ${fmt(c.requiredIm)} | Transition ${Number.isFinite(c.transitionProbability)?(c.transitionProbability*100).toFixed(1)+"%":"—"} | ${c.regime}`
    };
    try{const response=await fetch("/api/evaluation/log",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(entry)});if(response.ok)void loadTradingLedger();}catch(error){console.error("Failed to write evaluation to ledger:",error);}
  }

''',
)

replace_range(
    "Evaluation chart pressure loading",
    "  async function loadEvalChartData(pair, timeframe) {",
    "  function drawEvalCharts() {",
    '''  async function loadEvalChartData(pair,timeframe){
    if(!state.connected)return;
    try{
      const priceCache=await ensureEvaluationPairFrames(pair,timeframe),candlesList=priceCache[timeframe]||[],key=`${pair}|${timeframe}`,strategy=el("evalChartStrategy")?.value||state.selectedScheduleStrategy;
      state.evalCandles=candlesList;
      const optimized=state.autoConfigurations.get(key)?.config;
      let analysis=state.scheduleEvaluations.get(key);
      if(candlesList.length&&(!analysis?.series?.[strategy]?.length)){analysis=analyzeWithConfiguration(candlesList,optimized||STRATEGY_CONFIG,true);state.scheduleEvaluations.set(key,analysis);}
      const activeSignal=analysis?.latest?.[strategy],events=analysis?.series?.[strategy]||[],direction=Number(activeSignal?.direction)||0,metrics=evaluationFramesReady(priceCache,timeframe)?calculateMASIMPressure(pair,timeframe,priceCache,{direction,events}):null;
      state.evalMasImMetrics=metrics;
      const fmt=(value,digits=3)=>Number.isFinite(value)?value.toFixed(digits):value===Infinity?"∞":"—";
      el("evalMetricSignal").textContent=signalWord(direction);el("evalMetricSignal").className=directionClass(direction);
      el("evalMetricMas").textContent=fmt(metrics?.MAS);el("evalMetricIm").textContent=fmt(metrics?.IM);el("evalMetricRatio").textContent=fmt(metrics?.IM_OVER_MAS,2);
      el("evalMetricRequiredIm").textContent=fmt(metrics?.REQUIRED_IM);el("evalMetricTransition").textContent=Number.isFinite(metrics?.TRANSITION_PROBABILITY)?`${(metrics.TRANSITION_PROBABILITY*100).toFixed(1)}%`:"—";
      el("evalMetricRegime").textContent=String(metrics?.REGIME||"—").replaceAll("_"," ");el("evalMetricPipsHour").textContent=fmt(metrics?.PIPS_PER_HOUR,1);
      if(metrics?.hierarchy?.length)el("evalChartSubtitle").textContent=`${metrics.hierarchy.join(" → ")} · timestamp-synchronized · MAS top-down / IM reverse cadence`;
      el("evalChartMessage").hidden=candlesList.length>0;drawEvalCharts();drawWeeklyCognition(pair,metrics);
    }catch(error){console.error("Failed to load evaluation chart data:",error);}
  }

''',
)

replace_range(
    "MAS IM pressure oscillator",
    "  function drawOscillatorChart() {",
    "  function drawWeeklyCognition(pair, metrics) {",
    '''  function drawOscillatorChart(){
    const canvas=el("oscillatorCanvas");if(!canvas)return;
    const ctx=canvas.getContext("2d"),rect=canvas.getBoundingClientRect(),dpr=window.devicePixelRatio||1,width=Math.max(100,rect.width||canvas.clientWidth||canvas.parentNode?.clientWidth||0),height=Math.max(100,rect.height||canvas.clientHeight||canvas.parentNode?.clientHeight||0);
    canvas.width=width*dpr;canvas.height=height*dpr;ctx.setTransform(dpr,0,0,dpr,0,0);ctx.fillStyle="#080c12";ctx.fillRect(0,0,width,height);
    const visible=visibleEvalSlice(),metrics=state.evalMasImMetrics;if(!visible.candles.length||!metrics)return;
    const count=Math.min(state.evalVisibleBars,state.evalCandles.length),maxOffset=Math.max(0,state.evalCandles.length-count),offset=clamp(state.evalOffsetBars,0,maxOffset),visibleEnd=state.evalCandles.length-offset,visibleStart=Math.max(0,visibleEnd-count),visibleCandles=state.evalCandles.slice(visibleStart,visibleEnd),margin={top:12,right:60+state.evalRightIndent,bottom:12,left:40},plot={x:margin.left,y:margin.top,w:width-margin.left-margin.right,h:height-margin.top-margin.bottom};
    const align=source=>{const out=new Array(state.evalCandles.length).fill(NaN),start=Math.max(0,out.length-source.length);for(let index=0;index<source.length&&start+index<out.length;index++)out[start+index]=source[index];return out;},mas=align(metrics.MAS_SERIES||[]),im=align(metrics.IM_SERIES||[]),valueToY=value=>plot.y+(1-clamp(value,0,1))*plot.h,barWidth=plot.w/Math.max(1,visibleCandles.length),indexToX=index=>plot.x+(index+.5)*barWidth,gridEndX=width-60;
    ctx.font="8px ui-monospace,monospace";ctx.textAlign="right";
    for(const value of [0,0.25,0.5,0.75,1]){const y=valueToY(value);ctx.strokeStyle=value===0.5?"#2b3543":"#18212c";ctx.beginPath();ctx.moveTo(plot.x,y);ctx.lineTo(gridEndX,y);ctx.stroke();ctx.fillStyle="#8b98aa";ctx.fillText(value.toFixed(2),plot.x-5,y+3);}ctx.textAlign="left";
    const draw=(values,color)=>{ctx.strokeStyle=color;ctx.lineWidth=1.8;ctx.beginPath();let started=false;for(let index=visibleStart;index<visibleEnd;index++){const value=values[index];if(!Number.isFinite(value)){started=false;continue;}const x=indexToX(index-visibleStart),y=valueToY(value);if(!started){ctx.moveTo(x,y);started=true;}else ctx.lineTo(x,y);}ctx.stroke();};
    draw(mas,"#ef6b73");draw(im,"#48c78e");ctx.fillStyle="#ef6b73";ctx.fillText("MAS",plot.x+5,plot.y+10);ctx.fillStyle="#48c78e";ctx.fillText("IM",plot.x+38,plot.y+10);
    if(state.evalCrosshairEnabled&&state.evalCrosshair!==null&&state.evalCrosshair>=0&&state.evalCrosshair<visibleCandles.length){const cx=indexToX(state.evalCrosshair),absolute=visibleStart+state.evalCrosshair,m=mas[absolute],i=im[absolute],ratio=Number.isFinite(m)&&m>1e-12&&Number.isFinite(i)?i/m:Number.isFinite(i)&&i>0?Infinity:0;ctx.setLineDash([3,3]);ctx.strokeStyle="#a7b5c7";ctx.beginPath();ctx.moveTo(cx,plot.y);ctx.lineTo(cx,plot.y+plot.h);ctx.stroke();ctx.setLineDash([]);ctx.fillStyle="#edf2ff";ctx.fillText(`MAS ${Number.isFinite(m)?m.toFixed(3):"—"} · IM ${Number.isFinite(i)?i.toFixed(3):"—"} · R ${Number.isFinite(ratio)?ratio.toFixed(2):ratio===Infinity?"∞":"—"}`,plot.x+75,plot.y+10);}
  }

''',
)

replace_range(
    "Hierarchy cognition",
    "  function drawWeeklyCognition(pair, metrics) {",
    "  function renderEvaluationTable() {",
    '''  function drawWeeklyCognition(pair,metrics){
    const canvas=el("weeklyCognitionCanvas");if(!canvas)return;
    const ctx=canvas.getContext("2d"),rect=canvas.getBoundingClientRect(),dpr=window.devicePixelRatio||1,width=Math.max(100,rect.width||canvas.clientWidth||canvas.parentNode?.clientWidth||0),height=Math.max(100,rect.height||canvas.clientHeight||canvas.parentNode?.clientHeight||0);
    canvas.width=width*dpr;canvas.height=height*dpr;ctx.setTransform(dpr,0,0,dpr,0,0);ctx.fillStyle="#080c12";ctx.fillRect(0,0,width,height);
    const fmt=(value,digits=2)=>Number.isFinite(value)?value.toFixed(digits):value===Infinity?"∞":"—",hierarchy=metrics?.hierarchy||[];
    el("weeklyCognitionTitle").textContent=hierarchy.length?`${hierarchy.join("→")} · MAS ${fmt(metrics.MAS,3)} | IM ${fmt(metrics.IM,3)} | R ${fmt(metrics.IM_OVER_MAS,2)}`:"Hierarchy cognition · —";
    if(!hierarchy.length)return;
    const top=28,bottom=20,rowHeight=Math.max(22,(height-top-bottom)/hierarchy.length),center=width*.52,half=Math.max(40,width*.34);
    ctx.font="9px ui-monospace,monospace";ctx.strokeStyle="#263342";ctx.beginPath();ctx.moveTo(center,top-8);ctx.lineTo(center,height-bottom);ctx.stroke();
    hierarchy.forEach((tf,index)=>{const frame=metrics.currentFrames?.[tf],force=frame?.force,y=top+index*rowHeight+rowHeight*.45;ctx.fillStyle="#9aa8ba";ctx.textAlign="left";ctx.fillText(tf,10,y+3);ctx.fillStyle="#6f7c8d";ctx.fillText(`M${frame?.masWeight??"—"}/I${frame?.imWeight??"—"}`,35,y+3);ctx.strokeStyle="#18212c";ctx.beginPath();ctx.moveTo(center-half,y);ctx.lineTo(center+half,y);ctx.stroke();if(Number.isFinite(force)){ctx.fillStyle=force>=0?"#48c78e":"#ef6b73";const end=center+force*half;ctx.fillRect(Math.min(center,end),y-4,Math.max(1,Math.abs(end-center)),8);ctx.textAlign=force>=0?"left":"right";ctx.fillText(force.toFixed(3),end+(force>=0?4:-4),y+3);}});ctx.textAlign="left";ctx.fillStyle="#8b98aa";ctx.fillText(`R* ${fmt(metrics.TRANSITION_THRESHOLD,2)} · Required IM ${fmt(metrics.REQUIRED_IM,3)} · P ${Number.isFinite(metrics.TRANSITION_PROBABILITY)?(metrics.TRANSITION_PROBABILITY*100).toFixed(1)+"%":"—"}`,10,height-6);
  }

''',
)

replace_range(
    "Evaluation table rendering",
    "  function renderEvaluationTable() {",
    "  function sortEvalTable(key) {",
    '''  function renderEvaluationTable(){
    const activeTf=el("evalTableTfFilter").value,filtered=(state.evaluationTableData||[]).filter(row=>row.timeframe===activeTf),key=state.evalSortKey,direction=state.evalSortDirection;
    filtered.sort((a,b)=>{const av=a[key],bv=b[key];if(typeof av==="string"||typeof bv==="string")return String(av??"").localeCompare(String(bv??""))*direction;const aMissing=av===null||av===undefined||Number.isNaN(av),bMissing=bv===null||bv===undefined||Number.isNaN(bv);if(aMissing&&bMissing)return a.pair.localeCompare(b.pair);if(aMissing)return 1;if(bMissing)return-1;if(av===bv)return a.pair.localeCompare(b.pair);return(av-bv)*direction;});
    const headers={pair:"Pair",timeframe:"Signal TF",signal:"Signal",mas:"MAS",im:"IM",ratio:"IM/MAS",masRoc:"MAS ROC",imRoc:"IM ROC",ratioRoc:"Ratio ROC",eventAngleZ:"Event Angle Z",convexity:"Convexity",r2:"R²",fStat:"F",pValue:"Significance (p)",pipsPerHour:"Pips/Hr",requiredIm:"Required IM",transitionProbability:"Transition P",regime:"Regime"};
    for(const[k,label]of Object.entries(headers)){const th=el(`sort-${k}`);if(th)th.textContent=state.evalSortKey===k?`${label} ${state.evalSortDirection>0?"▲":"▼"}`:label;}
    const fmt=(value,digits=2)=>Number.isFinite(value)?value.toFixed(digits):value===Infinity?"∞":"—",pct=value=>Number.isFinite(value)?`${(value*100).toFixed(1)}%`:"—";
    el("evalTableBody").innerHTML=filtered.map(row=>`<tr style="cursor:pointer;${row.pair===state.selectedInstrument?"background:rgba(215,168,92,.14);":""}" onclick="selectEvalTablePair('${row.pair}')">
      <td><b>${formatPair(row.pair)}</b></td><td>${row.timeframe}</td><td class="${directionClass(row.signal)}"><b>${signalWord(row.signal)}</b></td>
      <td>${fmt(row.mas,3)}</td><td>${fmt(row.im,3)}</td><td>${fmt(row.ratio,2)}</td><td>${fmt(row.masRoc,4)}</td><td>${fmt(row.imRoc,4)}</td><td>${fmt(row.ratioRoc,4)}</td>
      <td>${fmt(row.eventAngleZ,2)}</td><td>${fmt(row.convexity,2)}</td><td>${fmt(row.r2,2)}</td><td>${fmt(row.fStat,2)}</td><td>${fmt(row.pValue,4)}</td><td>${fmt(row.pipsPerHour,1)}</td>
      <td>${fmt(row.requiredIm,3)}</td><td>${pct(row.transitionProbability)}</td><td>${String(row.regime||"NEUTRAL").replaceAll("_"," ")}</td></tr>`).join("")||`<tr><td colspan="18">No synchronized MAS/IM data available for ${activeTf}</td></tr>`;
  }

''',
)

replace_range(
    "Evaluation sort bindings",
    "    const sortHeaders = [",
    "    sortHeaders.forEach(h => {",
    '''    const sortHeaders=[
      {id:"sort-pair",key:"pair"},{id:"sort-timeframe",key:"timeframe"},{id:"sort-signal",key:"signal"},{id:"sort-mas",key:"mas"},{id:"sort-im",key:"im"},{id:"sort-ratio",key:"ratio"},
      {id:"sort-masRoc",key:"masRoc"},{id:"sort-imRoc",key:"imRoc"},{id:"sort-ratioRoc",key:"ratioRoc"},{id:"sort-eventAngleZ",key:"eventAngleZ"},{id:"sort-convexity",key:"convexity"},
      {id:"sort-r2",key:"r2"},{id:"sort-fStat",key:"fStat"},{id:"sort-pValue",key:"pValue"},{id:"sort-pipsPerHour",key:"pipsPerHour"},{id:"sort-requiredIm",key:"requiredIm"},
      {id:"sort-transitionProbability",key:"transitionProbability"},{id:"sort-regime",key:"regime"}
    ];

''',
)

html_path.write_text(html)

calculator_path = Path("public/mas-im-calculator.js")
calculator = calculator_path.read_text()
bug = 'if(!(hours>0)&&!Number.isFinite(hours))'
if bug not in calculator:
    raise RuntimeError("event velocity hours guard marker not found")
calculator_path.write_text(calculator.replace(bug, 'if(!(hours>0)||!Number.isFinite(hours))', 1))

print("Applied MAS antagonist pressure v2 Evaluation UI and calculator guard migration")
