import fs from "node:fs";

const files={
  html:"public/index.html",
  mentor:"public/market-mentor.js",
  platform:"src/horizon-platform-engine.js",
  optimized:"src/optimized-optimizer.js",
  certified:"src/engine-certified-execution.js",
  nemotron:"src/engine-nemotron-base.js",
  package:"package.json",
  testNemotron:"scripts/test-nemotron.mjs",
};

function edit(path,transform){
  const before=fs.readFileSync(path,"utf8");
  const after=transform(before);
  if(after===before)console.log(`No material change: ${path}`);
  else{fs.writeFileSync(path,after);console.log(`Updated ${path}`);}
}
function mustReplace(source,from,to,label){
  if(source.includes(to))return source;
  if(!source.includes(from))throw new Error(`Missing anchor: ${label}`);
  return source.replace(from,to);
}
function mustRegex(source,pattern,to,label){
  if(pattern.test(source)){pattern.lastIndex=0;return source.replace(pattern,to);}
  throw new Error(`Missing regex anchor: ${label}`);
}

edit(files.html,source=>{
  source=mustReplace(source,
`    .selector-item-tf select { font-size:8px; padding:2px; min-height:18px; background:#0b1017; border-color:var(--line2); color:var(--text); border-radius:3px; }\n\n  </style>`,
`    .selector-item-tf select { font-size:8px; padding:2px; min-height:18px; background:#0b1017; border-color:var(--line2); color:var(--text); border-radius:3px; }\n    .selector-panel > summary { cursor:pointer; list-style:none; }\n    .selector-panel > summary::-webkit-details-marker { display:none; }\n    .selector-panel[open] > summary { margin-bottom:8px; }\n    .model-composition { border:1px solid var(--line2); background:linear-gradient(180deg,#111923,#0b1118); box-shadow:var(--shadow); margin-bottom:14px; }\n    .model-composition-head { padding:12px 14px; border-bottom:1px solid var(--line); display:flex; justify-content:space-between; gap:12px; align-items:flex-start; }\n    .model-composition-head h2 { margin:0; font-size:15px; letter-spacing:.07em; text-transform:uppercase; }\n    .model-composition-head p { margin:4px 0 0; color:var(--muted); font-size:10px; line-height:1.45; }\n    .model-mandate { color:var(--accent); font-size:9px; font-weight:900; letter-spacing:.08em; text-transform:uppercase; white-space:nowrap; }\n    .model-composition-body { display:grid; gap:10px; padding:12px; }\n    .model-composition-body #fourSlotRotator { margin-bottom:0 !important; }\n    .signal-composition-divider { margin:0 12px; border-top:1px solid var(--line); }\n    .optimizer-event-group { margin:12px; border:1px solid var(--line); background:#0a1017; }\n    .optimizer-event-group > h3 { margin:0; padding:9px 11px; border-bottom:1px solid var(--line); font-size:11px; text-transform:uppercase; letter-spacing:.07em; }\n\n  </style>`,
"composition CSS");

  source=mustReplace(source,
`        <div class="selector-panel" id="selectorPanel">\n          <div class="selector-title">Tradable Pair Selector (28)</div>`,
`        <details class="selector-panel" id="selectorPanel">\n          <summary class="selector-title">Tradable Pair Selector (28) · Execution Universe</summary>`,
"collapsible selector open");
  source=mustReplace(source,
`              <span>Auto-Rotate Mode: Always trade Top 1 Most Profitable Pair (24h P/L from ledger)</span>`,
`              <span>Model Discretion Mode · all qualified pairs · capitalization rank</span>`,
"model discretion label");
  source=mustReplace(source,
`          <div class="selector-grid" id="pairSelectorGrid"></div>\n        </div>\n\n        <div class="automation-controls">`,
`          <div class="selector-grid" id="pairSelectorGrid"></div>\n        </details>\n\n        <div class="automation-controls">`,
"collapsible selector close");

  source=mustReplace(source,
`      <button class="app-tab" id="eventTab" role="tab" aria-selected="false" aria-controls="eventPanel" type="button">HTL Event Forecast</button>\n      <button class="app-tab" id="performanceTab" role="tab" aria-selected="false" aria-controls="performancePanel" type="button">Configuration &amp; Performance</button>\n      <button class="app-tab" id="evaluationTab" role="tab" aria-selected="false" aria-controls="evaluationPanel" type="button">Evaluation &amp; Pair Selection</button>`,
`      <button class="app-tab" id="eventTab" role="tab" aria-selected="false" aria-controls="eventPanel" type="button">HTL Event Chart</button>\n      <button class="app-tab" id="performanceTab" role="tab" aria-selected="false" aria-controls="performancePanel" type="button">Configuration Optimizer &amp; Event Results</button>\n      <button class="app-tab" id="evaluationTab" role="tab" aria-selected="false" aria-controls="evaluationPanel" type="button">Capitalization Model</button>`,
"facility labels");

  source=mustReplace(source,
`        <details class="event-ledger">\n          <summary>Event Ledger</summary>\n          <div class="event-table-wrap"><table class="event-table"><thead><tr><th>Event</th><th>Status</th><th>Start</th><th>Bars</th><th>High</th><th>Low</th><th>Spread μ</th><th>Spread σ²</th><th>Slope</th><th>Area</th><th>Source crosses</th></tr></thead><tbody id="eventLedger"></tbody></table></div>\n        </details>`,
`        <details class="event-ledger">\n          <summary>Event Ledger · Result / Profit</summary>\n          <div class="event-table-wrap"><table class="event-table"><thead><tr><th>Event</th><th>Status</th><th>Result</th><th>Event P/L (pips)</th><th>Start</th><th>Bars</th><th>High</th><th>Low</th><th>Spread μ</th><th>Spread σ²</th><th>Slope</th><th>Area</th><th>Source crosses</th></tr></thead><tbody id="eventLedger"></tbody></table></div>\n        </details>`,
"event result columns");

  source=mustReplace(source,
`    selectedStrategy:"ASSET",\n    selectedScheduleStrategy:"ASSET",`,
`    selectedStrategy:"ASSET",\n    eventSelectedStrategy:"ASSET",\n    evaluationSelectedStrategy:"ASSET",\n    selectedScheduleStrategy:"ASSET",`,
"independent indicator state");
  source=mustReplace(source,
`    NemotronRecommendedPair:null,`,
`    NemotronRecommendedPair:null,\n    modelContextTimer:null,`,
"model context timer");

  source=mustReplace(source,
`    el("chartStrategy").value=state.selectedStrategy;\n    el("eventStrategy").value="ASSET";`,
`    el("chartStrategy").value=state.selectedStrategy;\n    el("eventStrategy").value=state.eventSelectedStrategy;`,
"event indicator initial selection");
  source=mustReplace(source,
`    if (el("evalChartStrategy")) el("evalChartStrategy").innerHTML = strategyOptions;`,
`    if (el("evalChartStrategy")) { el("evalChartStrategy").innerHTML = strategyOptions; el("evalChartStrategy").value=state.evaluationSelectedStrategy; }`,
"evaluation indicator initial selection");

  source=mustRegex(source,
/  function platformPreferencePayload\(\)\{return\{.*?\};\}\n  function setPreferenceControl/s,
`  function platformPreferencePayload(){return{selectedInstrument:state.selectedInstrument,selectedTimeframe:state.selectedTimeframe,selectedStrategy:state.selectedStrategy,eventSelectedStrategy:el("eventStrategy")?.value||state.eventSelectedStrategy,evaluationSelectedStrategy:el("evalChartStrategy")?.value||state.evaluationSelectedStrategy,selectedScheduleStrategy:state.selectedScheduleStrategy,activeFacility:state.activeFacility,visibleBars:state.visibleBars,rightIndent:state.rightIndent,crosshairEnabled:state.crosshairEnabled,chartLength:el("chartLength")?.value||10,chartFilter:el("chartFilter")?.value||0,eventPair:el("eventPair")?.value||state.selectedInstrument,eventTimeframe:el("eventTimeframe")?.value||state.selectedTimeframe,eventLength:clamp(Math.trunc(Number(el("eventLength")?.value)||10),3,MAX_ANALYTICAL_LENGTH),eventStrategy:el("eventStrategy")?.value||state.eventSelectedStrategy,eventChartPair:el("eventChartPair")?.value||state.selectedInstrument,eventChartTimeframe:el("eventChartTimeframe")?.value||state.selectedTimeframe,eventChartLength:el("eventChartLength")?.value||10,eventChartFilter:el("eventChartFilter")?.value||0,eventVisibleBars:state.eventVisibleBars,eventRightIndent:state.eventRightIndent,eventCrosshairEnabled:state.eventCrosshairEnabled,evalChartPair:el("evalChartPair")?.value||state.selectedInstrument,evalChartTimeframe:el("evalChartTimeframe")?.value||state.selectedTimeframe,evalChartLength:el("evalChartLength")?.value||10,evalChartFilter:el("evalChartFilter")?.value||0,microStartDate:preferenceDateValue("microStartDate"),microEndDate:preferenceDateValue("microEndDate"),minimumUnits:minimumUnitAmount()};}\n  function setPreferenceControl`,
"expanded chart indicator preferences");

  source=mustRegex(source,
/  function applyPlatformPreferences\(preferences=\{\}\)\{.*?\}\n  async function loadPlatformPreferences/s,
`  function applyPlatformPreferences(preferences={}){\n    const strategyIds=new Set(STRATEGIES.map(item=>item.id));\n    state.selectedInstrument=INSTRUMENTS.includes(preferences.selectedInstrument)?preferences.selectedInstrument:state.selectedInstrument;\n    state.selectedTimeframe=TIMEFRAMES.includes(preferences.selectedTimeframe)?preferences.selectedTimeframe:state.selectedTimeframe;\n    state.selectedStrategy=strategyIds.has(preferences.selectedStrategy)?preferences.selectedStrategy:state.selectedStrategy;\n    state.eventSelectedStrategy=strategyIds.has(preferences.eventSelectedStrategy||preferences.eventStrategy)?(preferences.eventSelectedStrategy||preferences.eventStrategy):state.eventSelectedStrategy;\n    state.evaluationSelectedStrategy=strategyIds.has(preferences.evaluationSelectedStrategy)?preferences.evaluationSelectedStrategy:state.evaluationSelectedStrategy;\n    state.selectedScheduleStrategy=strategyIds.has(preferences.selectedScheduleStrategy)?preferences.selectedScheduleStrategy:state.selectedScheduleStrategy;\n    state.visibleBars=clamp(Math.trunc(Number(preferences.visibleBars))||state.visibleBars,30,300);state.rightIndent=clamp(Math.trunc(Number(preferences.rightIndent))||state.rightIndent,0,260);state.crosshairEnabled=preferences.crosshairEnabled!==false;\n    state.eventVisibleBars=clamp(Math.trunc(Number(preferences.eventVisibleBars))||state.eventVisibleBars,30,300);state.eventRightIndent=clamp(Math.trunc(Number(preferences.eventRightIndent))||state.eventRightIndent,0,260);state.eventCrosshairEnabled=preferences.eventCrosshairEnabled!==false;\n    state.activeFacility=["analysis","event","performance","evaluation"].includes(preferences.activeFacility)?preferences.activeFacility:"analysis";\n    setPreferenceControl("chartPair",state.selectedInstrument);setPreferenceControl("tradePair",state.selectedInstrument);setPreferenceControl("chartTimeframe",state.selectedTimeframe);setPreferenceControl("chartStrategy",state.selectedStrategy);setPreferenceControl("chartLength",preferences.chartLength||10);setPreferenceControl("chartFilter",preferences.chartFilter||0);setPreferenceControl("scheduleStrategy",state.selectedScheduleStrategy);\n    setPreferenceControl("eventPair",INSTRUMENTS.includes(preferences.eventPair)?preferences.eventPair:state.selectedInstrument);setPreferenceControl("eventTimeframe",TIMEFRAMES.includes(preferences.eventTimeframe)?preferences.eventTimeframe:state.selectedTimeframe);setPreferenceControl("eventLength",preferences.eventLength||10);setPreferenceControl("eventStrategy",state.eventSelectedStrategy);\n    setPreferenceControl("eventChartPair",INSTRUMENTS.includes(preferences.eventChartPair)?preferences.eventChartPair:(INSTRUMENTS.includes(preferences.eventPair)?preferences.eventPair:state.selectedInstrument));setPreferenceControl("eventChartTimeframe",TIMEFRAMES.includes(preferences.eventChartTimeframe)?preferences.eventChartTimeframe:(TIMEFRAMES.includes(preferences.eventTimeframe)?preferences.eventTimeframe:state.selectedTimeframe));setPreferenceControl("eventChartLength",preferences.eventChartLength||preferences.eventLength||10);setPreferenceControl("eventChartFilter",preferences.eventChartFilter||0);\n    setPreferenceControl("evalChartPair",INSTRUMENTS.includes(preferences.evalChartPair)?preferences.evalChartPair:state.selectedInstrument);setPreferenceControl("evalChartTimeframe",TIMEFRAMES.includes(preferences.evalChartTimeframe)?preferences.evalChartTimeframe:state.selectedTimeframe);setPreferenceControl("evalChartStrategy",state.evaluationSelectedStrategy);setPreferenceControl("evalChartLength",preferences.evalChartLength||10);setPreferenceControl("evalChartFilter",preferences.evalChartFilter||0);\n    for(const [id,key] of [["microStartDate","microStartDate"],["microEndDate","microEndDate"]])setPreferenceControl(id,preferences[key]||"");setPreferenceControl("minimumUnits",preferences.minimumUnits||1000);synchronizeMinimumUnits(false);selectFacility(state.activeFacility,false);markSelectedRow();updateChartSummary();drawChart();\n  }\n  async function loadPlatformPreferences`,
"apply expanded chart indicator preferences");

  source=mustRegex(source,
/  async function refreshCausalChartAnalysis\(instrument,timeframe,candles,configuration,strategy\)\{.*?\n  \}\n\n  \/\/ HTL event measurement and forecast\./s,
`  async function refreshCausalChartAnalysis(instrument,timeframe,candles,configuration,strategy){\n    const token=++state.chartCausalToken;await new Promise(resolve=>requestAnimationFrame(resolve));if(token!==state.chartCausalToken)return;\n    const configs=Object.fromEntries(STRATEGIES.map(item=>[item.id,configuration?.[item.id]||STRATEGY_CONFIG[item.id]])),sets=new Map(),latest={};\n    const getSet=async length=>{const key=clamp(Math.trunc(Number(length)||10),3,MAX_ANALYTICAL_LENGTH);if(!sets.has(key)){const value=await causalIndicatorSet(candles,key,token);if(!value)return null;sets.set(key,value);}return sets.get(key);};\n    const evaluateId=async id=>{if(latest[id])return latest[id];const config=configs[id],indicators=await getSet(config.length);if(!indicators||token!==state.chartCausalToken)return null;latest[id]=evaluateSingle(candles,indicators,candles.length-1,id,config);return latest[id];};\n    const buildSeries=async id=>{let prior=0,series=[];if(id==="COMBO"){const dc=configs.DARE,nc=configs.NAI,di=await getSet(dc.length),ni=await getSet(nc.length);if(!di||!ni)return{series:[],indicators:null};for(let index=0;index<candles.length;index++){const d=causalDirection(di,index,"DARE",dc.filter),n=causalDirection(ni,index,"NAI",nc.filter),direction=d&&d===n?d:0;if(direction&&direction!==prior)series.push({index,direction,confidence:.5,time:candles[index].time,price:candles[index].close});prior=direction;}return{series,indicators:{...di,naiAsset:ni.naiAsset,naiInverse:ni.naiInverse}};}const config=configs[id]||configs.ASSET,indicators=await getSet(config.length);if(!indicators)return{series:[],indicators:null};for(let index=0;index<candles.length;index++){const direction=causalDirection(indicators,index,id,config.filter);if(direction&&direction!==prior)series.push({index,direction,confidence:.5,time:candles[index].time,price:candles[index].close});prior=direction;}return{series,indicators};};\n    const publish=async()=>{if(token!==state.chartCausalToken||instrument!==state.selectedInstrument||timeframe!==state.selectedTimeframe||strategy!==state.selectedStrategy)return false;if(strategy==="COMBO"){await evaluateId("DARE");await evaluateId("NAI");const dare=latest.DARE,nai=latest.NAI;if(dare&&nai){const direction=dare.direction&&dare.direction===nai.direction?dare.direction:0,score=direction?(Math.abs(dare.score)+Math.abs(nai.score))/2:0;latest.COMBO=output(direction,score,"CSF TWO OPINIONS",{dare:dare.direction,nai:nai.direction});}}else await evaluateId(strategy);const display=await buildSeries(strategy);if(!display.indicators)return false;state.chartAnalysis={latest:{...latest}};state.chartCausalIndicators=display.indicators;state.chartCausalSeries=display.series;updateChartSummary();updateCompartments();drawChart();return true;};\n    // Publish the selected indicator first. HTL Asset no longer waits for unrelated DARE(N), NAI or APEX calculations on a 5,000-bar chart.\n    if(!await publish())return;\n    for(const id of ["ASSET","DARE_N","DARE","NAI","APEX"]){if(token!==state.chartCausalToken)return;await evaluateId(id);}\n    const dare=latest.DARE,nai=latest.NAI;if(dare&&nai){const direction=dare.direction&&dare.direction===nai.direction?dare.direction:0,score=direction?(Math.abs(dare.score)+Math.abs(nai.score))/2:0;latest.COMBO=output(direction,score,"CSF TWO OPINIONS",{dare:dare.direction,nai:nai.direction});}\n    if(token!==state.chartCausalToken||instrument!==state.selectedInstrument||timeframe!==state.selectedTimeframe||strategy!==state.selectedStrategy)return;state.chartAnalysis={latest:{...latest}};updateChartSummary();updateCompartments();drawChart();\n  }\n\n  // HTL event measurement and forecast.`,
"selected indicator first computation");

  source=mustRegex(source,
/  function eventFeatures\(data,htl\)\{.*?\n    return events;\n  \}/s,
`  function eventFeatures(data,htl,pair){\n    const crosses=[];for(let index=1;index<data.length;index++){const direction=htlCross(htl.asset,htl.inverse,index);if(direction)crosses.push({index,direction});}\n    const pipScale=String(pair||"").endsWith("JPY")?100:10000,events=[];\n    crosses.forEach((cross,position)=>{const end=position+1<crosses.length?crosses[position+1].index-1:data.length-1,status=position+1<crosses.length?"FINAL":"PROVISIONAL",segment=data.slice(cross.index,end+1),spreads=htl.asset.slice(cross.index,end+1).map((value,index)=>value-htl.inverse[cross.index+index]).filter(Number.isFinite),start=segment[0]?.close||0,close=segment.at(-1)?.close||start,profitPips=(close-start)*cross.direction*pipScale,result=status!=="FINAL"?"OPEN":profitPips>.05?"WIN":profitPips<-.05?"LOSS":"FLAT",high=Math.max(...segment.map(c=>c.high)),low=Math.min(...segment.map(c=>c.low)),mean=eventMean(spreads),variance=eventMean(spreads.map(value=>(value-mean)*(value-mean)));events.push({number:position+1,direction:cross.direction,startIndex:cross.index,endIndex:end,status,result,startTime:data[cross.index].time,endTime:data[end].time,openPrice:start,closePrice:close,profitPips,bars:end-cross.index+1,high,low,upBps:start?((high/start)-1)*10000:0,downBps:start?((low/start)-1)*10000:0,mean,variance,slope:eventSlope(spreads),area:spreads.reduce((sum,value)=>sum+Math.abs(value),0),sourceCrosses:Math.max(0,(htl.sourceTotal[end]||0)-(htl.sourceTotal[Math.max(0,cross.index-1)]||0))});});\n    return events;\n  }`,
"event realized direction result");
  source=mustReplace(source,`const htl=htlCausal(data,length),events=eventFeatures(data,htl),forecast=eventForecast(events)`,`const htl=htlCausal(data,length),events=eventFeatures(data,htl,pair),forecast=eventForecast(events)`,`event features pair scale`);
  source=mustRegex(source,
/    el\("eventLedger"\)\.innerHTML=row\.eventList\.slice\(-40\)\.reverse\(\)\.map\(event=>`<tr>.*?<\/tr>`\)\.join\(""\);/s,
`    el("eventLedger").innerHTML=row.eventList.slice(-40).reverse().map(event=>\`<tr><td>\${event.direction>0?"BUY":"SELL"} \${event.number}</td><td>\${event.status}</td><td class="\${event.result==="WIN"?"positive":event.result==="LOSS"?"negative":""}">\${event.result}</td><td class="\${event.profitPips>0?"positive":event.profitPips<0?"negative":""}">\${Number.isFinite(event.profitPips)?(event.profitPips>0?"+":"")+event.profitPips.toFixed(1):"—"}</td><td>\${new Date(event.startTime).toLocaleString()}</td><td>\${event.bars}</td><td>\${eventFmt(event.high,5)}</td><td>\${eventFmt(event.low,5)}</td><td>\${eventFmt(event.mean,6)}</td><td>\${eventFmt(event.variance,8)}</td><td>\${eventFmt(event.slope,7)}</td><td>\${eventFmt(event.area,6)}</td><td>\${event.sourceCrosses}</td></tr>\`).join("");`,
"event ledger result render");

  source=mustReplace(source,
`  function evaluationRotatorSlots(){`,
`  function modelContextNumber(value){const number=Number(value);return Number.isFinite(number)?number:null;}\n  function queueModelContextPublish(){\n    if(!state.connected)return;clearTimeout(state.modelContextTimer);state.modelContextTimer=setTimeout(async()=>{\n      const slots=evaluationRotatorSlots().map(slot=>{const c=slot.candidate;if(!c)return null;return{title:slot.title,pair:c.pair,direction:c.signal>0?"BUY":"SELL",type:c.type,regime:c.regime,strength:modelContextNumber(c.strength),mas:modelContextNumber(c.mas),im:modelContextNumber(c.im),ratio:c.ratio===Infinity?20:modelContextNumber(c.ratio),masRoc:modelContextNumber(c.masRoc),imRoc:modelContextNumber(c.imRoc),ratioRoc:modelContextNumber(c.ratioRoc),eventAngleZ:modelContextNumber(c.eventAngleZ),convexity:modelContextNumber(c.convexity),r2:modelContextNumber(c.r2),pipsPerHour:modelContextNumber(c.pipsPerHour),transitionProbability:modelContextNumber(c.transitionProbability)};}).filter(Boolean);\n      const forecasts=Object.entries(state.decisionCandidates||{}).map(([key,c])=>c?{key,pair:c.pair,direction:c.direction>0?"BUY":"SELL",confidence:modelContextNumber(c.confidence),source:c.source||null}:null).filter(Boolean);\n      const readMoney=id=>{const value=Number(String(el(id)?.textContent||"").replaceAll(",",""));return Number.isFinite(value)?value:null;};\n      const openPositions=(state.openPositions||[]).map(position=>{const long=Number(position.long?.units||0),short=Math.abs(Number(position.short?.units||0)),direction=long>0?"BUY":short>0?"SELL":null;return direction?{pair:position.instrument,direction,units:Math.max(long,short),unrealizedPL:modelContextNumber(position.unrealizedPL??(long>0?position.long?.unrealizedPL:position.short?.unrealizedPL))}:null;}).filter(Boolean);\n      const body={type:"MODEL_CONTEXT",mandate:"CAPITALIZATION_AND_ACCOUNT_VALUE_PROLIFERATION",timeframe:el("evalTableTfFilter")?.value||state.engineConfig.timeframe,account:{balance:readMoney("factBalance"),nav:readMoney("factNav"),marginAvailable:readMoney("factMargin")},slots,forecasts,openPositions};\n      try{const response=await fetch("/api/evaluation/log",{method:"POST",headers:{"Content-Type":"application/json"},credentials:"same-origin",body:JSON.stringify(body)});if(!response.ok)throw new Error("HTTP "+response.status);const node=el("modelContextStatus");if(node)node.textContent="Model context synchronized · "+new Date().toLocaleTimeString();}catch(error){const node=el("modelContextStatus");if(node)node.textContent="Model context pending · "+(error.message||error);}\n    },300);\n  }\n\n  function evaluationRotatorSlots(){`,
"model context publisher");
  source=mustReplace(source,
`    if(globalThis.CTEMarketMentor)void CTEMarketMentor.update({rows:state.evaluationTableData,slots:evaluationRotatorSlots(),selectedPair:state.selectedInstrument,timeframe:activeTf,connected:state.connected});\n  }`,
`    if(globalThis.CTEMarketMentor)void CTEMarketMentor.update({rows:state.evaluationTableData,slots:evaluationRotatorSlots(),selectedPair:state.selectedInstrument,timeframe:activeTf,connected:state.connected});\n    queueModelContextPublish();\n  }`,
"publish evaluation model context");


  source=mustReplace(source,
`      selectedPairs,\n      manualSelectMode: state.manualSelectMode,\n      autoRotateMode: state.autoRotateMode,`,
`      selectedPairs: state.autoRotateMode ? [...INSTRUMENTS] : selectedPairs,\n      manualSelectMode: state.manualSelectMode,\n      autoRotateMode: state.autoRotateMode,`,
"model discretion universe");

  source=mustReplace(source,
`    el("eventStrategy").addEventListener("change",()=>{if(state.eventData)eventDraw(state.eventData,state.eventHtl,state.eventEvents);queuePlatformPreferenceSave();});\n    for(const id of ["eventChartPair","eventChartTimeframe","eventChartLength","eventChartFilter"])el(id)?.addEventListener("change",queuePlatformPreferenceSave);`,
`    el("eventStrategy").addEventListener("change",()=>{state.eventSelectedStrategy=el("eventStrategy").value;if(state.eventData)eventDraw(state.eventData,state.eventHtl,state.eventEvents);queuePlatformPreferenceSave();});\n    for(const id of ["eventChartPair","eventChartTimeframe","eventChartLength","eventChartFilter"])el(id)?.addEventListener("change",()=>{queuePlatformPreferenceSave();if(state.connected)void refreshSelectedEventChart();});`,
"event indicator persistence and auto-load");
  source=mustReplace(source,
`    for(const id of ["evalChartStrategy","evalChartLength","evalChartFilter"])el(id)?.addEventListener("change",()=>void loadEvalChartData(el("evalChartPair").value,el("evalChartTimeframe").value));`,
`    for(const id of ["evalChartStrategy","evalChartLength","evalChartFilter"])el(id)?.addEventListener("change",()=>{if(id==="evalChartStrategy")state.evaluationSelectedStrategy=el(id).value;queuePlatformPreferenceSave();void loadEvalChartData(el("evalChartPair").value,el("evalChartTimeframe").value);});`,
"evaluation indicator persistence");
  source=mustReplace(source,
`        void loadEvalChartData(pair,el("evalChartTimeframe").value);`,
`        queuePlatformPreferenceSave();void loadEvalChartData(pair,el("evalChartTimeframe").value);`,
"evaluation pair preference");
  source=mustReplace(source,
`        void loadEvalChartData(el("evalChartPair").value,el("evalChartTimeframe").value);\n      });\n    }\n    if (el("evalRefreshChart"))`,
`        queuePlatformPreferenceSave();void loadEvalChartData(el("evalChartPair").value,el("evalChartTimeframe").value);\n      });\n    }\n    if (el("evalRefreshChart"))`,
"evaluation timeframe preference");

  source=mustReplace(source,
`  function selectFacility(name,persist=true){`,
`  function composePlatformPanels(){\n    const analysis=el("analysisPanel"),eventPanel=el("eventPanel"),performance=el("performancePanel"),evaluation=el("evaluationPanel");\n    const signalDetails=analysis?.querySelector(".facility-details");\n    if(signalDetails&&!el("htlScheduleComposition")){\n      signalDetails.querySelector("summary").textContent="Signal Schedules · Timeframe + HTL";\n      const htl=document.createElement("section");htl.id="htlScheduleComposition";htl.innerHTML='<div class="signal-composition-divider"></div>';\n      const divider=htl.firstElementChild;signalDetails.appendChild(htl);\n      const nodes=[eventPanel?.querySelector(":scope > .panel-head"),eventPanel?.querySelector(":scope > .event-section-title"),eventPanel?.querySelector(":scope > .event-table-wrap"),el("eventScheduleStatus"),el("eventScheduleInterpretation")].filter(Boolean);\n      for(const node of nodes)htl.appendChild(node);\n      divider?.insertAdjacentHTML("afterend",'<div class="panel-title" style="padding:10px 14px 0"><h2 style="margin:0;font-size:13px;text-transform:uppercase">HTL Schedule</h2><p style="margin:3px 0 0;color:var(--muted);font-size:9px">Derived from the same completed-candle timeframe signal universe.</p></div>');\n    }\n    const eventLedger=document.querySelector(".event-ledger");\n    if(performance&&eventLedger&&!el("optimizerEventComposition")){const group=document.createElement("section");group.id="optimizerEventComposition";group.className="optimizer-event-group";group.innerHTML='<h3>Configuration Optimizer · Event Outcome Ledger</h3>';performance.appendChild(group);group.appendChild(eventLedger);}\n    if(evaluation&&!el("modelComposition")){\n      const model=document.createElement("section");model.id="modelComposition";model.className="model-composition";model.innerHTML='<div class="model-composition-head"><div><h2>CTE Capitalization Model</h2><p>One decision composition: A/B/C forecasts · trend-following/transition leaders · Nemotron orchestration · CTE Market Mentor. III determines qualified structure; the Model exercises pair discretion only inside the engine-qualified candidate set.</p><div id="modelContextStatus" style="margin-top:5px;color:var(--muted);font-size:8px">Model context awaiting synchronized reports.</div></div><div class="model-mandate">Capitalization and Account Value Proliferation</div></div><div class="model-composition-body" id="modelCompositionBody"></div>';\n      evaluation.prepend(model);const body=el("modelCompositionBody");for(const node of [el("decisionCandidateStrip"),document.querySelector(".candidate-execution"),el("fourSlotRotator"),el("NemotronPanel")].filter(Boolean))body.appendChild(node);\n    }\n  }\n\n  function selectFacility(name,persist=true){`,
"platform panel composition");

  source=mustReplace(source,
`buildMatrix(); buildCompartments(); buildPairSelector(); renderStrategyConfiguration(); bindEvents();`,
`buildMatrix(); buildCompartments(); buildPairSelector(); composePlatformPanels(); renderStrategyConfiguration(); bindEvents();`,
"compose panels at startup");

  source=mustReplace(source,
`function renderOptimizerRegistry(){const rows=[];for(const [key,value] of state.autoConfigurations)`,
`function renderOptimizerRegistry(){const rows=[];for(const [key,value] of state.autoConfigurations)`,
"optimizer render anchor");


  return source;
});

edit(files.mentor,source=>{
  source=mustReplace(source,'const VERSION="CTE_MARKET_MENTOR@1.0.0";','const VERSION="CTE_MARKET_MENTOR@1.1.0";','mentor version');
  source=mustReplace(source,
`    const anchor=document.getElementById("fourSlotRotator")||document.getElementById("evalTableBody");\n    if(!anchor)return null;`,
`    const modelBody=document.getElementById("modelCompositionBody"),anchor=modelBody||document.getElementById("fourSlotRotator")||document.getElementById("evalTableBody");\n    if(!anchor)return null;`,
"mentor model composition anchor");
  source=mustReplace(source,
`    anchor.parentElement?.insertAdjacentElement("afterend",panel);`,
`    if(modelBody)modelBody.appendChild(panel);else anchor.parentElement?.insertAdjacentElement("afterend",panel);`,
"mentor placement");
  source=mustReplace(source,"teaching-first · no execution authority","capitalization interpretation · pair-discretion context · no direct execution authority","mentor mandate label");
  return source;
});

edit(files.platform,source=>{
  source=mustReplace(source,'export const OPTIMIZER_VERSION = 6;','export const OPTIMIZER_VERSION = 7;','optimizer version 7');
  source=mustReplace(source,'export const MAX_COMPUTE_BARS = 5000;','export const OPTIMIZER_HISTORY_BARS = 5000;\nexport const MAX_COMPUTE_BARS = OPTIMIZER_HISTORY_BARS;','optimizer history constant');
  source=mustReplace(source,'stage="credentials";const apiToken=token(engine.env);stage="oanda-history";const data=hasDateRange?await candlesForRange(pair,apiToken,timeframe,startDate,endDate):await candles(pair,apiToken,timeframe,REGISTERED_HISTORY_BARS);','stage="credentials";const apiToken=token(engine.env);stage="oanda-history";const data=hasDateRange?await candlesForRange(pair,apiToken,timeframe,startDate,endDate):await candles(pair,apiToken,timeframe,OPTIMIZER_HISTORY_BARS);','compute 5000 bars');
  source=mustReplace(source,'const data=await candles(pair,apiToken,timeframe,REGISTERED_HISTORY_BARS),optimized=optimizeDataset(data,pair)','const data=await candles(pair,apiToken,timeframe,OPTIMIZER_HISTORY_BARS),optimized=optimizeDataset(data,pair)','optimizer cycle 5000 bars');
  source=source.replaceAll('source:"COMPUTE_CONFIGURATION",validation:VALIDATION,','source:"COMPUTE_CONFIGURATION",optimizerHistoryBars:OPTIMIZER_HISTORY_BARS,validation:VALIDATION,');
  source=source.replaceAll('source:"SERVER",validation:VALIDATION,','source:"SERVER",optimizerHistoryBars:OPTIMIZER_HISTORY_BARS,validation:VALIDATION,');
  source=mustReplace(source,'export const __platformTest=Object.freeze({currentEvent,optimizeDataset,VALIDATION,OPTIMIZER_VERSION,strategyEngineVersion:STRATEGY_ENGINE_VERSION,performanceVersion:REGISTERED_PERFORMANCE_VERSION,analyticalCertification:ANALYTICAL_CERTIFICATION});','export const __platformTest=Object.freeze({currentEvent,optimizeDataset,VALIDATION,OPTIMIZER_VERSION,OPTIMIZER_HISTORY_BARS,strategyEngineVersion:STRATEGY_ENGINE_VERSION,performanceVersion:REGISTERED_PERFORMANCE_VERSION,analyticalCertification:ANALYTICAL_CERTIFICATION});','expose optimizer history test');
  return source;
});

edit(files.optimized,source=>{
  source=mustReplace(source,
`  OPTIMIZER_TTL_MS,\n  OPTIMIZER_VERSION,`,
`  OPTIMIZER_TTL_MS,\n  OPTIMIZER_VERSION,\n  OPTIMIZER_HISTORY_BARS,`,
"optimized import history");
  source=mustReplace(source,'const data = hasDateRange ? await candlesForRange(pair, apiToken, timeframe, startDate, endDate) : await candles(pair, apiToken, timeframe);','const data = hasDateRange ? await candlesForRange(pair, apiToken, timeframe, startDate, endDate) : await candles(pair, apiToken, timeframe, OPTIMIZER_HISTORY_BARS);','optimized compute 5000');
  source=mustReplace(source,'const data = await candles(pair, apiToken, timeframe);','const data = await candles(pair, apiToken, timeframe, OPTIMIZER_HISTORY_BARS);','optimized next 5000');
  source=source.replaceAll('source: "COMPUTE_CONFIGURATION",\n      validation: VALIDATION,','source: "COMPUTE_CONFIGURATION",\n      optimizerHistoryBars: OPTIMIZER_HISTORY_BARS,\n      validation: VALIDATION,');
  source=source.replaceAll('source: "SERVER",\n    validation: VALIDATION,','source: "SERVER",\n    optimizerHistoryBars: OPTIMIZER_HISTORY_BARS,\n    validation: VALIDATION,');
  return source;
});

edit(files.certified,source=>{
  source=mustReplace(source,
`function compactCandidate(candidate){`,
`function modelNumber(value,min=-Infinity,max=Infinity){const number=Number(value);return Number.isFinite(number)?Math.max(min,Math.min(max,number)):null;}\nfunction sanitizeModelContext(value){\n  const body=value&&typeof value==="object"?value:{},direction=value=>value==="BUY"||value==="SELL"?value:null,pair=value=>PAIRS.includes(String(value||""))?String(value):null;\n  const compactReport=item=>{const validPair=pair(item?.pair);if(!validPair)return null;return{pair:validPair,direction:direction(item.direction),type:String(item?.type||"").slice(0,32),regime:String(item?.regime||"").slice(0,48),strength:modelNumber(item?.strength,0,1),mas:modelNumber(item?.mas,0,1),im:modelNumber(item?.im,0,1),ratio:modelNumber(item?.ratio,0,20),masRoc:modelNumber(item?.masRoc,-10,10),imRoc:modelNumber(item?.imRoc,-10,10),ratioRoc:modelNumber(item?.ratioRoc,-20,20),eventAngleZ:modelNumber(item?.eventAngleZ,-20,20),convexity:modelNumber(item?.convexity,-40,40),r2:modelNumber(item?.r2,0,1),pipsPerHour:modelNumber(item?.pipsPerHour,-10000,10000),transitionProbability:modelNumber(item?.transitionProbability,0,1)};};\n  const compactForecast=item=>{const validPair=pair(item?.pair);if(!validPair)return null;return{key:["A","B","C"].includes(item?.key)?item.key:null,pair:validPair,direction:direction(item.direction),confidence:modelNumber(item?.confidence,0,1),source:String(item?.source||"").slice(0,24)};};\n  const compactPosition=item=>{const validPair=pair(item?.pair);if(!validPair)return null;return{pair:validPair,direction:direction(item.direction),units:modelNumber(item?.units,0,1e9),unrealizedPL:modelNumber(item?.unrealizedPL,-1e9,1e9)};};\n  return{mandate:"CAPITALIZATION_AND_ACCOUNT_VALUE_PROLIFERATION",timeframe:TIMEFRAMES.includes(body.timeframe)?body.timeframe:null,account:{balance:modelNumber(body.account?.balance,0,1e12),nav:modelNumber(body.account?.nav,0,1e12),marginAvailable:modelNumber(body.account?.marginAvailable,0,1e12)},slots:(Array.isArray(body.slots)?body.slots:[]).slice(0,4).map(compactReport).filter(Boolean),forecasts:(Array.isArray(body.forecasts)?body.forecasts:[]).slice(0,3).map(compactForecast).filter(Boolean),openPositions:(Array.isArray(body.openPositions)?body.openPositions:[]).slice(0,PAIRS.length).map(compactPosition).filter(Boolean),receivedAt:new Date().toISOString()};\n}\n\nfunction compactCandidate(candidate){`,
"model context sanitization");
  source=mustReplace(source,
`    if(path==="/evaluation/log"&&request.method==="POST"){\n      const body=await request.json().catch(()=>({}));\n      await this.write(body);\n      return new Response(JSON.stringify({ok:true}),{status:200,headers:{"Content-Type":"application/json","Cache-Control":"no-store"}});\n    }`,
`    if(path==="/evaluation/log"&&request.method==="POST"){\n      const body=await request.json().catch(()=>({}));\n      if(body?.type==="MODEL_CONTEXT"){const state=(await this.ctx.storage.get("state"))||{};state.modelContext=sanitizeModelContext(body);await this.ctx.storage.put("state",state);return new Response(JSON.stringify({ok:true,receivedAt:state.modelContext.receivedAt}),{status:200,headers:{"Content-Type":"application/json","Cache-Control":"no-store"}});}\n      await this.write(body);\n      return new Response(JSON.stringify({ok:true}),{status:200,headers:{"Content-Type":"application/json","Cache-Control":"no-store"}});\n    }`,
"store model context");
  source=mustReplace(source,
`      state.selectedPairs=body.selectedPairs||[];\n      state.manualSelectMode=body.manualSelectMode!==false;\n      state.autoRotateMode=Boolean(body.autoRotateMode);`,
`      state.selectedPairs=body.selectedPairs||[];\n      state.manualSelectMode=body.manualSelectMode!==false;\n      state.autoRotateMode=Boolean(body.autoRotateMode);\n      if(state.autoRotateMode){state.selectedPairs=PAIRS.slice();state.manualPositions={};}`,
"model discretion selected universe");
  source=mustRegex(source,
/      \/\/ Handle Auto-Rotate Mode\n      if \(state\.autoRotateMode\) \{.*?\n      \}\n\n      const tradablePairs/s,
`      // Model Discretion mode keeps the full qualified universe available. Pair selection is performed downstream by Nemotron among engine-qualified new-entry candidates; III itself does not choose the pair.\n      if(state.autoRotateMode){state.selectedPairs=PAIRS.slice();state.tradingMode="MODEL_DISCRETION";}\n\n      const tradablePairs`,
"replace P/L auto rotate with model discretion");
  source=mustReplace(source,
`        marginAvailable:Number(summary.marginAvailable || 0),\n        manualPositions:state.manualPositions||{}`,
`        marginAvailable:Number(summary.marginAvailable || 0),\n        manualPositions:state.manualPositions||{},\n        modelContextAt:state.modelContext?.receivedAt||null`,
"control model context timestamp");
  source=mustReplace(source,'export const __executionTest=Object.freeze({\n  EXECUTION_POLICY_VERSION,','export const __executionTest=Object.freeze({\n  EXECUTION_POLICY_VERSION,\n  sanitizeModelContext,','export sanitize helper test');
  return source;
});

edit(files.nemotron,source=>{
  source=mustReplace(source,'const AI_POLICY="MULTI_NEW_ENTRY_CANDIDATES_ONLY";','const AI_POLICY="CAPITALIZATION_NEW_ENTRY_DISCRETION";\nconst MODEL_CONTEXT_MAX_AGE_MS=10*60*1000;','capitalization policy');
  source=mustRegex(source,
/function deterministicCandidate\(candidates\)\{.*?\n\}/s,
`function modelContextFresh(context){const time=Date.parse(context?.receivedAt||0);return Number.isFinite(time)&&Date.now()-time<=MODEL_CONTEXT_MAX_AGE_MS?context:null;}\nfunction modelReportForPair(context,pair){return context?.slots?.find(item=>item?.pair===pair)||null;}\nfunction capitalizationScore(candidate,context=null){const primary=candidate?.configuration?.primary||{},report=modelReportForPair(context,candidate?.pair),confidence=Math.max(0,Math.min(1,Number(candidate?.confidence)||0)),count=Math.max(0,Number(candidate?.count)||0),winRate=Math.max(0,Math.min(1,Number(primary.winRate)||0)),net=Number(primary.net)||0,score=Number(primary.score)||0,drawdown=Math.max(0,Number(primary.maxDrawdown)||0),sample=Math.max(0,Number(primary.trades)||0),structure=Math.max(0,Math.min(1,Number(report?.strength)||0)),fit=Math.max(0,Math.min(1,Number(report?.r2)||0)),velocity=Math.tanh((Number(report?.pipsPerHour)||0)/25),regime=String(report?.regime||""),regimeBonus=regime==="TREND_ALIGNED"?.45:regime==="TRANSITION"?.3:regime==="CHALLENGE"?.1:0;return confidence*3+Math.min(10,count)*.12+winRate+Math.tanh(net/30)+Math.tanh(score/15)-Math.tanh(drawdown/25)+Math.min(1,sample/30)*.5+structure*1.5+fit*.5+velocity*.25+regimeBonus;}\nfunction deterministicCandidate(candidates,context=null){\n  return [...candidates].sort((left,right)=>capitalizationScore(right,context)-capitalizationScore(left,context)||String(left?.pair||"").localeCompare(String(right?.pair||"")))[0]||null;\n}`,
"capitalization deterministic rank");
  source=mustReplace(source,
`function compactCandidate(candidate){\n  const primary=candidate?.configuration?.primary||{},confirmation=candidate?.configuration?.confirmation||null;\n  return{`,
`function compactCandidate(candidate,context=null){\n  const primary=candidate?.configuration?.primary||{},confirmation=candidate?.configuration?.confirmation||null,report=modelReportForPair(context,candidate?.pair);\n  return{`,
"candidate model report");
  source=mustReplace(source,
`    confirmation:confirmation?{\n      length:Number.isFinite(Number(confirmation.length))?Number(confirmation.length):null,\n      filter:Number.isFinite(Number(confirmation.filter))?Number(confirmation.filter):null,\n      score:Number.isFinite(Number(confirmation.score))?Number(confirmation.score):null,\n    }:null,\n  };`,
`    confirmation:confirmation?{\n      length:Number.isFinite(Number(confirmation.length))?Number(confirmation.length):null,\n      filter:Number.isFinite(Number(confirmation.filter))?Number(confirmation.filter):null,\n      score:Number.isFinite(Number(confirmation.score))?Number(confirmation.score):null,\n    }:null,\n    capitalizationReport:report?{type:report.type||null,regime:report.regime||null,strength:Number.isFinite(Number(report.strength))?Number(report.strength):null,mas:Number.isFinite(Number(report.mas))?Number(report.mas):null,im:Number.isFinite(Number(report.im))?Number(report.im):null,ratio:Number.isFinite(Number(report.ratio))?Number(report.ratio):null,ratioRoc:Number.isFinite(Number(report.ratioRoc))?Number(report.ratioRoc):null,eventAngleZ:Number.isFinite(Number(report.eventAngleZ))?Number(report.eventAngleZ):null,convexity:Number.isFinite(Number(report.convexity))?Number(report.convexity):null,r2:Number.isFinite(Number(report.r2))?Number(report.r2):null,pipsPerHour:Number.isFinite(Number(report.pipsPerHour))?Number(report.pipsPerHour):null,transitionProbability:Number.isFinite(Number(report.transitionProbability))?Number(report.transitionProbability):null}:null,\n    capitalizationRank:capitalizationScore(candidate,context),\n  };`,
"compact capitalization report");
  source=mustReplace(source,'export const __nemotronTest=Object.freeze({AI_MODEL,AI_TIMEOUT_MS,AI_POLICY,deterministicCandidate,compactCandidate,parseAiResponse});','export const __nemotronTest=Object.freeze({AI_MODEL,AI_TIMEOUT_MS,AI_POLICY,MODEL_CONTEXT_MAX_AGE_MS,capitalizationScore,deterministicCandidate,compactCandidate,parseAiResponse});','export capitalization test helpers');
  source=mustReplace(source,
`    const fallback=deterministicCandidate(candidates),table=candidates.map(compactCandidate),candidatePairs=table.map(item=>item.pair),started=Date.now();`,
`    const engineState=(await this.ctx.storage.get("state"))||{},modelContext=modelContextFresh(engineState.modelContext),fallback=deterministicCandidate(candidates,modelContext),table=candidates.map(candidate=>compactCandidate(candidate,modelContext)),candidatePairs=table.map(item=>item.pair),started=Date.now();`,
"load model context for choice");
  source=mustReplace(source,
`        {role:"system",content:"You are the internal CTE Compound new-entry adjudicator. Select exactly one candidate from the supplied candidate set. You may rank only these candidates; do not create a new pair, change direction, alter units, modify risk controls, close or reverse positions, or change configuration. Prefer stronger multi-timeframe confirmation and statistically superior optimizer evidence while penalizing drawdown and weak sample support. Return only the requested structured result."},\n        {role:"user",content:JSON.stringify({task:"select_one_new_entry_candidate",candidates:table})}`,
`        {role:"system",content:"You are the internal CTE Capitalization Model. Your mandate is Capitalization and Account Value Proliferation. The III analytical suite qualifies signal structure but has no pair-selection discretion; you exercise pair discretion only among the supplied engine-qualified new-entry candidates. Rank risk-adjusted expected contribution to NAV and opportunity cost using multi-timeframe confirmation, optimizer net/score/win-rate/sample support, drawdown, MAS/IM pressure balance, regime, Event Angle Z/convexity, fit and pips-per-hour when available. Existing positions and available margin are context for capital efficiency. Select exactly one supplied candidate. Never invent a pair, change direction, alter units or risk controls, close/reverse positions, or change configuration. Return only the requested structured result."},\n        {role:"user",content:JSON.stringify({task:"select_one_new_entry_candidate_for_capitalization",mandate:"CAPITALIZATION_AND_ACCOUNT_VALUE_PROLIFERATION",account:modelContext?.account||null,openPositions:modelContext?.openPositions||[],forecasts:modelContext?.forecasts||[],candidates:table})}`,
"capitalization prompt");
  source=mustReplace(source,
`  async status(){const status=await super.status(),records=currentOptimizer(await this.ctx.storage.get("optimizer")),telemetry=(await this.ctx.storage.get("aiTelemetry"))||{};return{...status,optimizerVersion:OPTIMIZER_VERSION,optimizerCoverage:Object.keys(records).length,optimizerTotal:PAIRS.length*10,calculationVersion:H.VERSION,qualificationVersion:S.VERSION,crossingContract:"ONE_RAW_ASSET_RECOVERED_INVERSE_CROSSING_CLOCK",strategyContract:"POST_CROSS_STRATEGY_QUALIFICATION",ai:{model:AI_MODEL,binding:Boolean(this.env.AI),policy:AI_POLICY,...telemetry}};}`,
`  async status(){const status=await super.status(),records=currentOptimizer(await this.ctx.storage.get("optimizer")),telemetry=(await this.ctx.storage.get("aiTelemetry"))||{},engineState=(await this.ctx.storage.get("state"))||{};return{...status,optimizerVersion:OPTIMIZER_VERSION,optimizerCoverage:Object.keys(records).length,optimizerTotal:PAIRS.length*10,calculationVersion:H.VERSION,qualificationVersion:S.VERSION,crossingContract:"ONE_RAW_ASSET_RECOVERED_INVERSE_CROSSING_CLOCK",strategyContract:"POST_CROSS_STRATEGY_QUALIFICATION",ai:{model:AI_MODEL,binding:Boolean(this.env.AI),policy:AI_POLICY,mandate:"CAPITALIZATION_AND_ACCOUNT_VALUE_PROLIFERATION",modelContextAt:engineState.modelContext?.receivedAt||null,...telemetry}};}`,
"Nemotron status mandate");
  return source;
});

edit(files.testNemotron,source=>{
  source=mustReplace(source,'assert.equal(__nemotronTest.AI_POLICY,"MULTI_NEW_ENTRY_CANDIDATES_ONLY");','assert.equal(__nemotronTest.AI_POLICY,"CAPITALIZATION_NEW_ENTRY_DISCRETION");','Nemotron policy test');
  source=mustReplace(source,
`  const storage=new Storage();\n  let aiCalls=0,modelSeen=null,inputSeen=null;`,
`  const storage=new Storage();\n  await storage.put("state",{modelContext:{receivedAt:new Date().toISOString(),mandate:"CAPITALIZATION_AND_ACCOUNT_VALUE_PROLIFERATION",account:{nav:10000,marginAvailable:8000},openPositions:[{pair:"USD_JPY",direction:"BUY",units:1000,unrealizedPL:-4}],forecasts:[{key:"A",pair:"EUR_USD",direction:"BUY",confidence:.71}],slots:[{pair:"EUR_USD",type:"TREND_FOLLOWING",regime:"TREND_ALIGNED",strength:.91,mas:.05,im:.55,ratio:11,eventAngleZ:2.1,convexity:.4,r2:.72,pipsPerHour:3.2}]}});\n  let aiCalls=0,modelSeen=null,inputSeen=null;`,
"Nemotron context fixture");
  source=mustReplace(source,
`  assert.equal(inputSeen.response_format.type,"json_schema");`,
`  assert.equal(inputSeen.response_format.type,"json_schema");\n  const modelPayload=JSON.parse(inputSeen.messages[1].content);\n  assert.equal(modelPayload.mandate,"CAPITALIZATION_AND_ACCOUNT_VALUE_PROLIFERATION");\n  assert.equal(modelPayload.account.nav,10000);\n  assert.equal(modelPayload.candidates[0].capitalizationReport.regime,"TREND_ALIGNED");`,
"Nemotron context prompt assertions");
  source=mustReplace(source,'console.log("Observable Nemotron multi-candidate-only adjudication, structured selection, telemetry, and deterministic fallback verified.");','console.log("Observable Nemotron capitalization-model pair discretion, structured selection, unified context, telemetry, and deterministic fallback verified.");','Nemotron test message');
  return source;
});

edit(files.package,source=>{
  const data=JSON.parse(source);
  if(!data.scripts.check.includes("test-platform-composition-upgrade.mjs"))data.scripts.check=data.scripts.check.replace("node scripts/test-nemotron.mjs", "node scripts/test-nemotron.mjs && node scripts/test-platform-composition-upgrade.mjs");
  return JSON.stringify(data,null,2)+"\n";
});

const compositionTest=`import assert from "node:assert/strict";\nimport fs from "node:fs";\nimport {__platformTest} from "../src/horizon-platform-engine.js";\nimport {__executionTest} from "../src/engine-certified-execution.js";\n\nconst html=fs.readFileSync("public/index.html","utf8"),mentor=fs.readFileSync("public/market-mentor.js","utf8");\nassert.match(html,/<details class="selector-panel" id="selectorPanel">/);\nassert.match(html,/Signal Schedules · Timeframe \+ HTL/);\nassert.match(html,/Configuration Optimizer · Event Outcome Ledger/);\nassert.match(html,/id="modelComposition"/);\nassert.match(html,/Capitalization and Account Value Proliferation/);\nassert.match(html,/Event P\/L \(pips\)/);\nassert.match(html,/selected indicator first/i);\nassert.match(html,/evaluationSelectedStrategy/);\nassert.match(mentor,/modelCompositionBody/);\nassert.equal(__platformTest.OPTIMIZER_VERSION,7);\nassert.equal(__platformTest.OPTIMIZER_HISTORY_BARS,5000);\nconst context=__executionTest.sanitizeModelContext({type:"MODEL_CONTEXT",timeframe:"H1",account:{nav:12345,marginAvailable:10000},slots:[{pair:"EUR_USD",direction:"BUY",strength:.8,ratio:Infinity},{pair:"NOT_A_PAIR",strength:1}],forecasts:[{key:"A",pair:"EUR_USD",direction:"BUY",confidence:.7}],openPositions:[{pair:"USD_JPY",direction:"SELL",units:1000,unrealizedPL:-3}]});\nassert.equal(context.mandate,"CAPITALIZATION_AND_ACCOUNT_VALUE_PROLIFERATION");\nassert.equal(context.slots.length,1);\nassert.equal(context.slots[0].pair,"EUR_USD");\nassert.equal(context.slots[0].ratio,null);\nassert.equal(context.forecasts.length,1);\nassert.equal(context.openPositions.length,1);\nconsole.log("Platform composition, persistent chart indicators, event outcome ledger, 5,000-bar optimizer and capitalization-model context verified.");\n`;
fs.writeFileSync("scripts/test-platform-composition-upgrade.mjs",compositionTest);
console.log("Wrote scripts/test-platform-composition-upgrade.mjs");
