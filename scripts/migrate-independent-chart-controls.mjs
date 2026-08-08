import fs from "node:fs";

const path="public/index.html";
let html=fs.readFileSync(path,"utf8");
let changes=0;

function replaceOnce(from,to,label){
  if(!html.includes(from))throw new Error(`Migration anchor missing: ${label}`);
  html=html.replace(from,to);changes++;
}

// 1. Analytical Compound chart gets the same five analytical settings as Evaluation.
replaceOnce(
`            <label class="field"><span>Strategy</span><select id="chartStrategy"></select></label>\n            <button id="refreshChart" type="button" disabled>Refresh chart</button>`,
`            <label class="field"><span>Strategy</span><select id="chartStrategy"></select></label>\n            <label class="field"><span>Length</span><input id="chartLength" type="number" min="3" max="200" value="10" style="width:70px;"></label>\n            <label class="field"><span>Filter</span><input id="chartFilter" type="number" min="0" max="10" step="0.1" value="0" style="width:70px;"></label>\n            <button id="refreshChart" type="button" disabled>Refresh chart</button>`,
"analytical chart length/filter controls");

// 2. HTL schedule retains its own schedule settings. Move Strategy to the chart row and add independent chart pair/timeframe/length/filter.
replaceOnce(
`            <label class="field"><span>HTL length</span><input id="eventLength" type="number" min="3" max="200" value="10"></label>\n            <label class="field"><span>Chart indicator</span><select id="eventStrategy"></select></label>\n            <button id="loadEvents" type="button" disabled>Forecast events</button>`,
`            <label class="field"><span>HTL length</span><input id="eventLength" type="number" min="3" max="200" value="10"></label>\n            <button id="loadEvents" type="button" disabled>Forecast events</button>`,
"remove chart strategy from HTL schedule controls");

replaceOnce(
`        <div class="chart-toolbar event-chart-toolbar">\n          <button id="refreshEventChart" type="button" disabled>Refresh chart</button>`,
`        <div class="chart-toolbar event-chart-toolbar">\n          <label class="field"><span>Currency pair</span><select id="eventChartPair"></select></label>\n          <label class="field"><span>Timeframe</span><select id="eventChartTimeframe"></select></label>\n          <label class="field"><span>Strategy</span><select id="eventStrategy"></select></label>\n          <label class="field"><span>Length</span><input id="eventChartLength" type="number" min="3" max="200" value="10" style="width:70px;"></label>\n          <label class="field"><span>Filter</span><input id="eventChartFilter" type="number" min="0" max="10" step="0.1" value="0" style="width:70px;"></label>\n          <button id="refreshEventChart" type="button" disabled>Refresh chart</button>`,
"independent HTL Event chart controls");

// 3. Shared helper: apply a chart-local strategy/length/filter without mutating optimizer/server state.
replaceOnce(
`  function configurationSnapshot(){return Object.fromEntries(Object.entries(STRATEGY_CONFIG).map(([id,value])=>[id,{...value}));}`,
`  function chartControlConfiguration(instrument,timeframe,strategy,lengthControlId,filterControlId){\n    const resolved=resolvedConfiguration(instrument,timeframe),config=Object.fromEntries(Object.entries(resolved).map(([id,value])=>[id,{...value}]));\n    const length=clamp(Math.trunc(Number(el(lengthControlId)?.value)||10),3,200),rawFilter=Number(el(filterControlId)?.value)||0,filter=clamp(rawFilter,0,strategy==="COMBO"?5:10);\n    if(strategy==="COMBO"){\n      config.COMBO={...(config.COMBO||STRATEGY_CONFIG.COMBO),filter};\n      for(const member of ["DARE","NAI"])config[member]={...(config[member]||STRATEGY_CONFIG[member]),length};\n    }else config[strategy]={...(config[strategy]||STRATEGY_CONFIG[strategy]),length,filter};\n    return config;\n  }\n\n  function configurationSnapshot(){return Object.fromEntries(Object.entries(STRATEGY_CONFIG).map(([id,value])=>[id,{...value}));}`,
"chart-local configuration helper");

// 4. Analytical chart calculation uses chart-local Length/Filter rather than the optimizer configuration.
replaceOnce(
`    const resolved=resolvedConfiguration(instrument,timeframe);\n    state.chartCandles=candles;state.chartAnalysis=analyzeWithConfiguration(candles,resolved,false);`,
`    const resolved=chartControlConfiguration(instrument,timeframe,state.selectedStrategy,"chartLength","chartFilter");\n    state.chartCandles=candles;state.chartAnalysis=analyzeWithConfiguration(candles,resolved,false);`,
"analytical chart local calculation");

replaceOnce(
`  function chartRequestCount(instrument,timeframe){const resolved=resolvedConfiguration(instrument,timeframe),selected=state.selectedStrategy,lengths=selected==="COMBO"?[resolved.DARE?.length,resolved.NAI?.length]:[resolved[selected]?.length],length=Math.max(3,...lengths.map(value=>Number(value)||3)),warmup=Math.max(120,length*3);return clamp(Math.ceil(state.visibleBars+warmup),240,650);}`,
`  function chartRequestCount(instrument,timeframe){const length=clamp(Math.trunc(Number(el("chartLength")?.value)||10),3,200),warmup=Math.max(120,length*3);return clamp(Math.ceil(state.visibleBars+warmup),240,650);}`,
"analytical chart request length");

// 5. Build independent selectors for the Event chart.
replaceOnce(
`    if (el("evalChartStrategy")) el("evalChartStrategy").innerHTML = strategyOptions;\n    if (el("evalChartPair")) el("evalChartPair").innerHTML = pairOptions;\n    if (el("evalChartTimeframe")) el("evalChartTimeframe").innerHTML = TIMEFRAMES.map(item=>\`<option value="${item}">${item}</option>\`).join("");`,
`    if (el("eventChartPair")) { el("eventChartPair").innerHTML=pairOptions; el("eventChartPair").value=state.selectedInstrument; }\n    if (el("eventChartTimeframe")) { el("eventChartTimeframe").innerHTML=TIMEFRAMES.map(item=>\`<option value="${item}">${item}</option>\`).join(""); el("eventChartTimeframe").value=state.selectedTimeframe; }\n    if (el("evalChartStrategy")) el("evalChartStrategy").innerHTML = strategyOptions;\n    if (el("evalChartPair")) el("evalChartPair").innerHTML = pairOptions;\n    if (el("evalChartTimeframe")) el("evalChartTimeframe").innerHTML = TIMEFRAMES.map(item=>\`<option value="${item}">${item}</option>\`).join("");`,
"event chart selector population");

// 6. Event chart draws from chart-local pair/timeframe/length/filter, not the HTL schedule settings.
replaceOnce(
`    const live=state.eventOffsetBars===0?liveMid(el("eventPair").value):NaN,rightAxis=72+state.eventRightIndent,plot={x:12,y:12,w:Math.max(80,width-rightAxis-12),h:Math.max(80,height-42)},series=`,
`    const live=state.eventOffsetBars===0?liveMid(el("eventChartPair")?.value||el("eventPair").value):NaN,rightAxis=72+state.eventRightIndent,plot={x:12,y:12,w:Math.max(80,width-rightAxis-12),h:Math.max(80,height-42)},series=`,
"event chart live price pair");

replaceOnce(
`    const selected=el("eventStrategy").value||"ASSET",resolved=resolvedConfiguration(el("eventPair").value,el("eventTimeframe").value),config=resolved[selected]||resolved.ASSET||STRATEGY_CONFIG.ASSET,indicators=prepareIndicators(data,config),definition=CHART_INDICATORS[selected]||CHART_INDICATORS.ASSET;`,
`    const chartPair=el("eventChartPair")?.value||el("eventPair").value,chartTimeframe=el("eventChartTimeframe")?.value||el("eventTimeframe").value,selected=el("eventStrategy").value||"ASSET",resolved=chartControlConfiguration(chartPair,chartTimeframe,selected,"eventChartLength","eventChartFilter"),config=resolved[selected]||resolved.ASSET||STRATEGY_CONFIG.ASSET,indicators=prepareIndicators(data,config),definition=CHART_INDICATORS[selected]||CHART_INDICATORS.ASSET;`,
"event chart local indicator config");

replaceOnce(
`    if(Number.isFinite(live)){const yy=y(live),label=eventFmt(live,el("eventPair").value.endsWith("JPY")?3:5);`,
`    if(Number.isFinite(live)){const yy=y(live),label=eventFmt(live,(el("eventChartPair")?.value||el("eventPair").value).endsWith("JPY")?3:5);`,
"event chart live label pair");

replaceOnce(
`      const label=eventFmt(price,state.eventRows.find(row=>row.pair===el("eventPair").value)?.pair.endsWith("JPY")?3:5),labelWidth=ctx.measureText(label).width+12;`,
`      const label=eventFmt(price,(el("eventChartPair")?.value||el("eventPair").value).endsWith("JPY")?3:5),labelWidth=ctx.measureText(label).width+12;`,
"event chart crosshair precision");

replaceOnce(
`  async function refreshSelectedEventChart(){if(!state.connected||state.eventLoading)return;state.scheduleController?.abort();clearTimeout(state.progressiveScheduleTimer);const pair=el("eventPair").value||state.selectedInstrument,timeframe=el("eventTimeframe").value,length=clamp(Math.trunc(Number(el("eventLength").value)||10),3,200),button=el("refreshEventChart"),controller=new AbortController();`,
`  async function refreshSelectedEventChart(){if(!state.connected||state.eventLoading)return;state.scheduleController?.abort();clearTimeout(state.progressiveScheduleTimer);const pair=el("eventChartPair")?.value||state.selectedInstrument,timeframe=el("eventChartTimeframe")?.value||state.selectedTimeframe,length=clamp(Math.trunc(Number(el("eventChartLength")?.value)||10),3,200),button=el("refreshEventChart"),controller=new AbortController();`,
"event chart independent refresh settings");

replaceOnce(
`    el("eventMethod").textContent=\`Completed midpoint candles · ${formatPair(row.pair)} · ${el("eventTimeframe").value} · HTL length ${row.length} · ${row.data.length} candles · ${forecast.completed.length} FINAL events\`;`,
`    el("eventMethod").textContent=\`Completed midpoint candles · ${formatPair(row.pair)} · ${el("eventChartTimeframe")?.value||el("eventTimeframe").value} · HTL length ${row.length} · ${row.data.length} candles · ${forecast.completed.length} FINAL events\`;`,
"event chart method description");

// Schedule row selection no longer drives the chart.
replaceOnce(
`    el("eventPair").value=pair;renderEventDetail(row);if(state.connected)void startPositionStream(state.openPositions.map(position=>position.instrument));`,
`    el("eventPair").value=pair;renderEventSchedule();`,
"decouple schedule row from event chart");

replaceOnce(
`const row=buildEventRow(pair,data,length);state.eventRows.push(row);if(pair===selectedPair)renderEventDetail(row);`,
`const row=buildEventRow(pair,data,length);state.eventRows.push(row);`,
"schedule load must not redraw chart");

// 7. Evaluation chart metrics honor its own Strategy/Length/Filter and do not mutate the shared schedule cache.
replaceOnce(
`      const optimized=state.autoConfigurations.get(key)?.config;\n      let analysis=state.scheduleEvaluations.get(key);\n      if(candlesList.length&&(!analysis?.series?.[strategy]?.length)){analysis=analyzeWithConfiguration(candlesList,optimized||STRATEGY_CONFIG,true);state.scheduleEvaluations.set(key,analysis);}`,
`      const chartConfig=chartControlConfiguration(pair,timeframe,strategy,"evalChartLength","evalChartFilter");\n      const analysis=candlesList.length?analyzeWithConfiguration(candlesList,chartConfig,true):null;`,
"evaluation chart local calculation");

// 8. Evaluation chart selection no longer changes Analytical Compound selection.
html=html.replace(/state\.selectedInstrument=c\.pair;state\.selectedTimeframe=c\.timeframe;\n    const ratio=/,`const ratio=`);changes++;
html=html.replace(/state\.selectedInstrument = el\("evalChartPair"\)\.value;\n        void loadEvalChartData\(state\.selectedInstrument, el\("evalChartTimeframe"\)\.value\);/,`const pair=el("evalChartPair").value;\n        void loadEvalChartData(pair,el("evalChartTimeframe").value);`);changes++;

// Evaluation facility activation respects its chart's own pair/timeframe instead of forcing the table filter/global selection.
replaceOnce(
`if(name==='evaluation'){const activeTf = el("evalTableTfFilter")?.value || "H1"; if (el("evalChartTimeframe")) { el("evalChartTimeframe").value = activeTf; } void loadEvaluationData(); void loadEvalChartData(state.selectedInstrument, activeTf); void preloadEvaluationTimeframe(activeTf); setTimeout(() => { drawEvalCharts(); setupSyncedCrosshair(); }, 50);}`,
`if(name==='evaluation'){const activeTf=el("evalTableTfFilter")?.value||"H1",chartPair=el("evalChartPair")?.value||state.selectedInstrument,chartTf=el("evalChartTimeframe")?.value||activeTf;void loadEvaluationData();void loadEvalChartData(chartPair,chartTf);void preloadEvaluationTimeframe(activeTf);setTimeout(()=>{drawEvalCharts();setupSyncedCrosshair();},50);}`,
"evaluation chart independent activation");

// 9. Bind chart-local controls.
replaceOnce(
`    el("chartStrategy").addEventListener("change",event=>{state.selectedStrategy=event.target.value;updateChartSummary();drawChart();if(state.chartCandles.length)void refreshCausalChartAnalysis(state.selectedInstrument,state.selectedTimeframe,state.chartCandles,resolvedConfiguration(state.selectedInstrument,state.selectedTimeframe),state.selectedStrategy);queuePlatformPreferenceSave();});`,
`    const refreshAnalyticalChartConfig=()=>{state.selectedStrategy=el("chartStrategy").value;if(state.chartCandles.length)applyChartDataset(state.selectedInstrument,state.selectedTimeframe,state.chartCandles);else{updateChartSummary();drawChart();}queuePlatformPreferenceSave();};\n    el("chartStrategy").addEventListener("change",refreshAnalyticalChartConfig);\n    el("chartLength").addEventListener("change",refreshAnalyticalChartConfig);\n    el("chartFilter").addEventListener("change",refreshAnalyticalChartConfig);`,
"analytical chart local-control events");

replaceOnce(
`    el("eventStrategy").addEventListener("change",()=>{if(state.eventData)eventDraw(state.eventData,state.eventHtl,state.eventEvents);queuePlatformPreferenceSave();});`,
`    el("eventStrategy").addEventListener("change",()=>{if(state.eventData)eventDraw(state.eventData,state.eventHtl,state.eventEvents);queuePlatformPreferenceSave();});\n    for(const id of ["eventChartPair","eventChartTimeframe","eventChartLength","eventChartFilter"])el(id)?.addEventListener("change",queuePlatformPreferenceSave);`,
"event chart local-control events");

// Evaluation strategy/length/filter changes recalculate its own chart only.
replaceOnce(
`    if (el("evalChartPair")) {\n      el("evalChartPair").addEventListener("change", () => {`,
`    for(const id of ["evalChartStrategy","evalChartLength","evalChartFilter"])el(id)?.addEventListener("change",()=>void loadEvalChartData(el("evalChartPair").value,el("evalChartTimeframe").value));\n    if (el("evalChartPair")) {\n      el("evalChartPair").addEventListener("change", () => {`,
"evaluation chart local-control events");

// 10. Initialize Event chart selectors after the schedule selectors are populated.
replaceOnce(
`  buildSelectors(); el("eventPair").innerHTML=el("chartPair").innerHTML; el("eventTimeframe").innerHTML=el("chartTimeframe").innerHTML; el("eventTimeframe").value=state.selectedTimeframe;`,
`  buildSelectors(); el("eventPair").innerHTML=el("chartPair").innerHTML; el("eventTimeframe").innerHTML=el("chartTimeframe").innerHTML; el("eventTimeframe").value=state.selectedTimeframe; if(el("eventChartPair")){el("eventChartPair").innerHTML=el("chartPair").innerHTML;el("eventChartPair").value=state.selectedInstrument;} if(el("eventChartTimeframe")){el("eventChartTimeframe").innerHTML=el("chartTimeframe").innerHTML;el("eventChartTimeframe").value=state.selectedTimeframe;}`,
"event chart selector initialization");

// Sanity contract: all three chart rows now expose pair/timeframe/strategy/length/filter.
for(const id of ["chartPair","chartTimeframe","chartStrategy","chartLength","chartFilter","eventChartPair","eventChartTimeframe","eventStrategy","eventChartLength","eventChartFilter","evalChartPair","evalChartTimeframe","evalChartStrategy","evalChartLength","evalChartFilter"]){
  if(!html.includes(`id="${id}"`))throw new Error(`Missing required chart control ${id}`);
}

fs.writeFileSync(path,html);
console.log(`Applied independent chart-control migration (${changes} transformations).`);
