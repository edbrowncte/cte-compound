from pathlib import Path
import re


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected 1 occurrence, found {count}")
    return text.replace(old, new, 1)


engine_path = Path("src/engine.js")
engine = engine_path.read_text()
normalize_marker = 'function normalizeConfig(value={}){const timeframe=TIMEFRAMES.has(value.timeframe)?value.timeframe:DEFAULT_CONFIG.timeframe,htlLength=Math.max(3,Math.min(200,Math.trunc(Number(value.htlLength))||DEFAULT_CONFIG.htlLength)),decisionMode=DECISION_MODES.has(value.decisionMode)?value.decisionMode:DEFAULT_CONFIG.decisionMode,strategy=STRATEGIES.has(value.strategy)?value.strategy:DEFAULT_CONFIG.strategy,confirmationStrategy=value.confirmationStrategy==="NONE"||STRATEGIES.has(value.confirmationStrategy)?value.confirmationStrategy:DEFAULT_CONFIG.confirmationStrategy,filter=Math.max(0,Math.min(10,Number(value.filter)||0)),configurationSource="OPTIMIZED";return{timeframe,htlLength,decisionMode,strategy,confirmationStrategy,filter,configurationSource};}\n'
normalize_preferences = '''function normalizeUiPreferences(value={}){const date=input=>/^\\d{4}-\\d{2}-\\d{2}$/.test(String(input||""))?String(input):"",integer=(input,min,max,fallback)=>Math.max(min,Math.min(max,Math.trunc(Number(input))||fallback));return{selectedInstrument:PAIRS.includes(value.selectedInstrument)?value.selectedInstrument:"EUR_USD",selectedTimeframe:TIMEFRAMES.has(value.selectedTimeframe)?value.selectedTimeframe:"M15",selectedStrategy:STRATEGIES.has(value.selectedStrategy)?value.selectedStrategy:"ASSET",selectedScheduleStrategy:STRATEGIES.has(value.selectedScheduleStrategy)?value.selectedScheduleStrategy:"ASSET",activeFacility:["analysis","event","performance"].includes(value.activeFacility)?value.activeFacility:"analysis",visibleBars:integer(value.visibleBars,30,300,120),rightIndent:integer(value.rightIndent,0,260,72),crosshairEnabled:value.crosshairEnabled!==false,eventPair:PAIRS.includes(value.eventPair)?value.eventPair:"EUR_USD",eventTimeframe:TIMEFRAMES.has(value.eventTimeframe)?value.eventTimeframe:"M15",eventLength:integer(value.eventLength,3,200,10),eventStrategy:STRATEGIES.has(value.eventStrategy)?value.eventStrategy:"ASSET",eventVisibleBars:integer(value.eventVisibleBars,30,300,120),eventRightIndent:integer(value.eventRightIndent,0,260,72),eventCrosshairEnabled:value.eventCrosshairEnabled!==false,macroStartDate:date(value.macroStartDate),macroEndDate:date(value.macroEndDate),microStartDate:date(value.microStartDate),microEndDate:date(value.microEndDate),updatedAt:new Date().toISOString()};}\n'''
engine = replace_once(engine, normalize_marker, normalize_marker + normalize_preferences, "UI preference normalization")
fetch_marker = 'if(path==="/status")return response(await this.status());if(path==="/config"&&request.method==="GET")'
fetch_replacement = 'if(path==="/status")return response(await this.status());if(path==="/preferences"&&request.method==="GET")return response(normalizeUiPreferences((await this.ctx.storage.get("uiPreferences"))||{}));if(path==="/preferences"&&request.method==="PUT"){const preferences=normalizeUiPreferences(await request.json());await this.ctx.storage.put("uiPreferences",preferences);return response(preferences);}if(path==="/config"&&request.method==="GET")'
engine = replace_once(engine, fetch_marker, fetch_replacement, "Durable Object preferences routes")
engine_path.write_text(engine)

worker_path = Path("src/worker.js")
worker = worker_path.read_text()
worker_marker = '        if(url.pathname==="/api/engine/status"&&request.method==="GET") return await env.HTL_ENGINE.getByName("live").fetch("https://engine/status");\n'
worker_routes = '''        if(url.pathname==="/api/platform/preferences"&&request.method==="GET") return await env.HTL_ENGINE.getByName("live").fetch("https://engine/preferences");
        if(url.pathname==="/api/platform/preferences"&&request.method==="PUT") return await env.HTL_ENGINE.getByName("live").fetch(new Request("https://engine/preferences",{method:"PUT",headers:{"Content-Type":"application/json"},body:request.body}));
'''
worker = replace_once(worker, worker_marker, worker_routes + worker_marker, "Worker preference routes")
worker_path.write_text(worker)

html_path = Path("public/index.html")
html = html_path.read_text()
html = replace_once(
    html,
    '    selectedScheduleStrategy:"ASSET"\n  };',
    '    selectedScheduleStrategy:"ASSET",\n    activeFacility:"analysis",\n    preferenceTimer:null,\n    preferencesLoaded:false,\n    preferenceSyncStatus:"Not synchronized"\n  };',
    "browser preference state",
)
html = replace_once(
    html,
    "    COMBO:{price:[['asset','HTL Asset','#d7a85c'],['inverse','Asset Inverse','#8d72d8'],['meanAsset','DARE Mean','#7c3aed'],['meanInverse','DARE Mean Inverse','#db2777']],osc:[['naiAsset','NAI Asset','#0284c7'],['naiInverse','NAI Inverse','#a21caf']]},\n    NAI:{price:[],osc:[['naiAsset','NAI Asset','#0284c7'],['naiInverse','NAI Inverse','#a21caf']]},",
    "    COMBO:{price:[['asset','HTL Asset','#d7a85c'],['inverse','Asset Inverse','#8d72d8'],['meanAsset','DARE Mean','#7c3aed'],['meanInverse','DARE Mean Inverse','#db2777']],z:[['naiAsset','NAI Asset','#0284c7'],['naiInverse','NAI Inverse','#a21caf']],osc:[]},\n    NAI:{price:[],z:[['naiAsset','NAI Asset','#0284c7'],['naiInverse','NAI Inverse','#a21caf']],osc:[]},",
    "NAI main-window z-axis definition",
)
html = replace_once(
    html,
    '    const margin={top:18,right:78+state.rightIndent,bottom:30,left:10};\n    return {canvas,ctx,width,height,dpr,plot:{x:margin.left,y:margin.top,w:Math.max(80,width-margin.left-margin.right),h:Math.max(80,height-margin.top-margin.bottom)},axisX:width-68};',
    '    const hasLeftZ=Boolean((CHART_INDICATORS[state.selectedStrategy]?.z||[]).length),margin={top:18,right:78+state.rightIndent,bottom:30,left:hasLeftZ?62:10};\n    return {canvas,ctx,width,height,dpr,plot:{x:margin.left,y:margin.top,w:Math.max(80,width-margin.left-margin.right),h:Math.max(80,height-margin.top-margin.bottom)},axisX:width-68,axisLeft:10,hasLeftZ};',
    "chart left z-axis geometry",
)
html = replace_once(
    html,
    '    for(const [key,,color] of indicatorSet.price) drawIndicatorLine(ctx,indicators[key],visible.start,visible.end,indexToX,priceToY,color);\n\n    if(oscPlot){',
    '''    for(const [key,,color] of indicatorSet.price) drawIndicatorLine(ctx,indicators[key],visible.start,visible.end,indexToX,priceToY,color);

    const zDefinitions=indicatorSet.z||[],zValues=zDefinitions.flatMap(([key])=>(indicators[key]||[]).slice(visible.start,visible.end).filter(Number.isFinite));
    if(zValues.length){const zMax=Math.max(1,...zValues.map(value=>Math.abs(value)))*1.08,zToY=value=>pricePlot.y+(zMax-value)/(zMax*2)*pricePlot.h;ctx.font="9px ui-monospace,monospace";ctx.textAlign="right";for(let index=0;index<=4;index++){const value=zMax-index*zMax/2,y=zToY(value);ctx.strokeStyle=value===0?"#415267":"#1c2632";ctx.setLineDash(value===0?[4,4]:[]);ctx.beginPath();ctx.moveTo(pricePlot.x,y+.5);ctx.lineTo(axisX,y+.5);ctx.stroke();ctx.setLineDash([]);ctx.fillStyle="#68aee8";ctx.fillText(value.toFixed(2),pricePlot.x-7,y);}ctx.textAlign="left";for(const [key,,color] of zDefinitions)drawIndicatorLine(ctx,indicators[key],visible.start,visible.end,indexToX,zToY,color,1.8);}

    if(oscPlot){''',
    "NAI overlay and left z-axis rendering",
)
html = replace_once(
    html,
    'el("indicatorLegend").innerHTML=fanLegend+[...indicatorSet.price,...indicatorSet.osc].map(',
    'el("indicatorLegend").innerHTML=fanLegend+[...indicatorSet.price,...(indicatorSet.z||[]),...indicatorSet.osc].map(',
    "z-axis legend",
)
preference_functions = '''
  function preferenceDateValue(id){return el(id)?.value||"";}
  function platformPreferencePayload(){return{selectedInstrument:state.selectedInstrument,selectedTimeframe:state.selectedTimeframe,selectedStrategy:state.selectedStrategy,selectedScheduleStrategy:state.selectedScheduleStrategy,activeFacility:state.activeFacility,visibleBars:state.visibleBars,rightIndent:state.rightIndent,crosshairEnabled:state.crosshairEnabled,eventPair:el("eventPair")?.value||state.selectedInstrument,eventTimeframe:el("eventTimeframe")?.value||state.selectedTimeframe,eventLength:clamp(Math.trunc(Number(el("eventLength")?.value)||10),3,200),eventStrategy:el("eventStrategy")?.value||"ASSET",eventVisibleBars:state.eventVisibleBars,eventRightIndent:state.eventRightIndent,eventCrosshairEnabled:state.eventCrosshairEnabled,macroStartDate:preferenceDateValue("macroStartDate"),macroEndDate:preferenceDateValue("macroEndDate"),microStartDate:preferenceDateValue("microStartDate"),microEndDate:preferenceDateValue("microEndDate")};}
  function setPreferenceControl(id,value){const control=el(id);if(control&&value!==undefined&&value!==null)control.value=String(value);}
  function applyPlatformPreferences(preferences={}){state.selectedInstrument=INSTRUMENTS.includes(preferences.selectedInstrument)?preferences.selectedInstrument:state.selectedInstrument;state.selectedTimeframe=TIMEFRAMES.includes(preferences.selectedTimeframe)?preferences.selectedTimeframe:state.selectedTimeframe;state.selectedStrategy=STRATEGIES.some(item=>item.id===preferences.selectedStrategy)?preferences.selectedStrategy:state.selectedStrategy;state.selectedScheduleStrategy=STRATEGIES.some(item=>item.id===preferences.selectedScheduleStrategy)?preferences.selectedScheduleStrategy:state.selectedScheduleStrategy;state.visibleBars=clamp(Math.trunc(Number(preferences.visibleBars))||state.visibleBars,30,300);state.rightIndent=clamp(Math.trunc(Number(preferences.rightIndent))||state.rightIndent,0,260);state.crosshairEnabled=preferences.crosshairEnabled!==false;state.eventVisibleBars=clamp(Math.trunc(Number(preferences.eventVisibleBars))||state.eventVisibleBars,30,300);state.eventRightIndent=clamp(Math.trunc(Number(preferences.eventRightIndent))||state.eventRightIndent,0,260);state.eventCrosshairEnabled=preferences.eventCrosshairEnabled!==false;state.activeFacility=["analysis","event","performance"].includes(preferences.activeFacility)?preferences.activeFacility:"analysis";setPreferenceControl("chartPair",state.selectedInstrument);setPreferenceControl("tradePair",state.selectedInstrument);setPreferenceControl("chartTimeframe",state.selectedTimeframe);setPreferenceControl("chartStrategy",state.selectedStrategy);setPreferenceControl("scheduleStrategy",state.selectedScheduleStrategy);setPreferenceControl("eventPair",INSTRUMENTS.includes(preferences.eventPair)?preferences.eventPair:state.selectedInstrument);setPreferenceControl("eventTimeframe",TIMEFRAMES.includes(preferences.eventTimeframe)?preferences.eventTimeframe:state.selectedTimeframe);setPreferenceControl("eventLength",preferences.eventLength||10);setPreferenceControl("eventStrategy",STRATEGIES.some(item=>item.id===preferences.eventStrategy)?preferences.eventStrategy:"ASSET");for(const [id,key] of [["macroStartDate","macroStartDate"],["macroEndDate","macroEndDate"],["microStartDate","microStartDate"],["microEndDate","microEndDate"]])setPreferenceControl(id,preferences[key]||"");selectFacility(state.activeFacility,false);markSelectedRow();updateChartSummary();drawChart();}
  async function loadPlatformPreferences(){if(state.preferencesLoaded)return;try{const response=await fetch("/api/platform/preferences",{headers:{Accept:"application/json"},credentials:"same-origin",cache:"no-store"}),preferences=await response.json().catch(()=>({}));if(!response.ok)throw new Error(preferences.error||`HTTP ${response.status}`);applyPlatformPreferences(preferences);state.preferenceSyncStatus=`Synchronized · ${preferences.updatedAt?formatTime(preferences.updatedAt):"server"}`;}catch(error){state.preferenceSyncStatus=error.message||"Preference synchronization unavailable";}finally{state.preferencesLoaded=true;}}
  function queuePlatformPreferenceSave(){if(!state.preferencesLoaded)return;clearTimeout(state.preferenceTimer);state.preferenceTimer=setTimeout(async()=>{try{const response=await fetch("/api/platform/preferences",{method:"PUT",headers:{Accept:"application/json","Content-Type":"application/json"},credentials:"same-origin",cache:"no-store",body:JSON.stringify(platformPreferencePayload())}),preferences=await response.json().catch(()=>({}));if(!response.ok)throw new Error(preferences.error||`HTTP ${response.status}`);state.preferenceSyncStatus=`Synchronized · ${preferences.updatedAt?formatTime(preferences.updatedAt):"server"}`;}catch(error){state.preferenceSyncStatus=error.message||"Preference synchronization failed";}},500);}
'''
html = replace_once(html, '  async function loadEngineConfig(){', preference_functions + '\n  async function loadEngineConfig(){', "browser cross-device preference functions")
html = replace_once(
    html,
    '  async function connect(event) {\n    event?.preventDefault?.();',
    '  async function connect(event) {\n    event?.preventDefault?.();\n    if(!state.preferencesLoaded)await loadPlatformPreferences();',
    "load preferences before connection data",
)
html = replace_once(
    html,
    '    if(state.connected){void startPositionStream(state.openPositions.map(position=>position.instrument));void loadChart(state.selectedInstrument,state.selectedTimeframe);}\n    el("chartPanel").scrollIntoView({behavior:"smooth",block:"start"});',
    '    if(state.connected){void startPositionStream(state.openPositions.map(position=>position.instrument));void loadChart(state.selectedInstrument,state.selectedTimeframe);}\n    queuePlatformPreferenceSave();\n    el("chartPanel").scrollIntoView({behavior:"smooth",block:"start"});',
    "persist chart selection",
)
select_pattern = re.compile(r'  function selectFacility\(name\)\{([^\n]*)\}\n')
match = select_pattern.search(html)
if not match:
    raise SystemExit("select facility function was not found")
old_select = match.group(0)
body = match.group(1)
body = body.replace("for(const facility", "state.activeFacility=name;for(const facility", 1)
new_select = f'  function selectFacility(name,persist=true){{{body}if(persist)queuePlatformPreferenceSave();}}\n'
html = html.replace(old_select, new_select, 1)
handler_replacements = {
    'el("eventPair").addEventListener("change",()=>selectEventScheduleRow(el("eventPair").value));': 'el("eventPair").addEventListener("change",()=>{selectEventScheduleRow(el("eventPair").value);queuePlatformPreferenceSave();});',
    'el("scheduleStrategy").addEventListener("change",event=>{ state.selectedScheduleStrategy=event.target.value; renderSchedule();renderMtfForecast(); });': 'el("scheduleStrategy").addEventListener("change",event=>{state.selectedScheduleStrategy=event.target.value;renderSchedule();renderMtfForecast();queuePlatformPreferenceSave();});',
    'el("chartStrategy").addEventListener("change",event=>{state.selectedStrategy=event.target.value;updateChartSummary();drawChart();if(state.chartCandles.length)void refreshCausalChartAnalysis(state.selectedInstrument,state.selectedTimeframe,state.chartCandles,resolvedConfiguration(state.selectedInstrument,state.selectedTimeframe),state.selectedStrategy);});': 'el("chartStrategy").addEventListener("change",event=>{state.selectedStrategy=event.target.value;updateChartSummary();drawChart();if(state.chartCandles.length)void refreshCausalChartAnalysis(state.selectedInstrument,state.selectedTimeframe,state.chartCandles,resolvedConfiguration(state.selectedInstrument,state.selectedTimeframe),state.selectedStrategy);queuePlatformPreferenceSave();});',
    'el("eventStrategy").addEventListener("change",()=>{if(state.eventData)eventDraw(state.eventData,state.eventHtl,state.eventEvents);});': 'el("eventStrategy").addEventListener("change",()=>{if(state.eventData)eventDraw(state.eventData,state.eventHtl,state.eventEvents);queuePlatformPreferenceSave();});',
    'el("zoomIn").addEventListener("click",()=>{ state.visibleBars=clamp(Math.round(state.visibleBars*.8),30,300); updateChartSummary(); drawChart(); });': 'el("zoomIn").addEventListener("click",()=>{state.visibleBars=clamp(Math.round(state.visibleBars*.8),30,300);updateChartSummary();drawChart();queuePlatformPreferenceSave();});',
    'el("zoomOut").addEventListener("click",()=>{ state.visibleBars=clamp(Math.round(state.visibleBars*1.25),30,300); state.offsetBars=clamp(state.offsetBars,0,Math.max(0,state.chartCandles.length-state.visibleBars)); updateChartSummary(); drawChart(); });': 'el("zoomOut").addEventListener("click",()=>{state.visibleBars=clamp(Math.round(state.visibleBars*1.25),30,300);state.offsetBars=clamp(state.offsetBars,0,Math.max(0,state.chartCandles.length-state.visibleBars));updateChartSummary();drawChart();queuePlatformPreferenceSave();});',
    'el("indentOut").addEventListener("click",()=>{ state.rightIndent=clamp(state.rightIndent+24,0,260); drawChart(); });': 'el("indentOut").addEventListener("click",()=>{state.rightIndent=clamp(state.rightIndent+24,0,260);drawChart();queuePlatformPreferenceSave();});',
    'el("indentIn").addEventListener("click",()=>{ state.rightIndent=clamp(state.rightIndent-24,0,260); drawChart(); });': 'el("indentIn").addEventListener("click",()=>{state.rightIndent=clamp(state.rightIndent-24,0,260);drawChart();queuePlatformPreferenceSave();});',
}
for old,new in handler_replacements.items():
    html = replace_once(html, old, new, f"event handler persistence: {old[:28]}")
html = replace_once(
    html,
    'el("crosshairToggle").addEventListener("click",event=>{ state.crosshairEnabled=!state.crosshairEnabled; event.currentTarget.textContent=`Crosshair ${state.crosshairEnabled?"on":"off"}`; event.currentTarget.setAttribute("aria-pressed",String(state.crosshairEnabled)); if (!state.crosshairEnabled) state.crosshair=null; drawChart(); });',
    'el("crosshairToggle").addEventListener("click",event=>{state.crosshairEnabled=!state.crosshairEnabled;event.currentTarget.textContent=`Crosshair ${state.crosshairEnabled?"on":"off"}`;event.currentTarget.setAttribute("aria-pressed",String(state.crosshairEnabled));if(!state.crosshairEnabled)state.crosshair=null;drawChart();queuePlatformPreferenceSave();});',
    "crosshair persistence",
)
html = replace_once(
    html,
    '    el("eventZoomIn").addEventListener("click",()=>{state.eventVisibleBars=clamp(Math.round(state.eventVisibleBars*.8),30,300);eventDraw(state.eventData,state.eventHtl,state.eventEvents);});',
    '    el("eventZoomIn").addEventListener("click",()=>{state.eventVisibleBars=clamp(Math.round(state.eventVisibleBars*.8),30,300);eventDraw(state.eventData,state.eventHtl,state.eventEvents);queuePlatformPreferenceSave();});',
    "event zoom in persistence",
)
html = replace_once(
    html,
    '    el("eventZoomOut").addEventListener("click",()=>{state.eventVisibleBars=clamp(Math.round(state.eventVisibleBars*1.25),30,300);eventDraw(state.eventData,state.eventHtl,state.eventEvents);});',
    '    el("eventZoomOut").addEventListener("click",()=>{state.eventVisibleBars=clamp(Math.round(state.eventVisibleBars*1.25),30,300);eventDraw(state.eventData,state.eventHtl,state.eventEvents);queuePlatformPreferenceSave();});',
    "event zoom out persistence",
)
html = replace_once(
    html,
    '    el("eventIndentOut").addEventListener("click",()=>{state.eventRightIndent=clamp(state.eventRightIndent+24,0,260);eventDraw(state.eventData,state.eventHtl,state.eventEvents);});',
    '    el("eventIndentOut").addEventListener("click",()=>{state.eventRightIndent=clamp(state.eventRightIndent+24,0,260);eventDraw(state.eventData,state.eventHtl,state.eventEvents);queuePlatformPreferenceSave();});',
    "event indent out persistence",
)
html = replace_once(
    html,
    '    el("eventIndentIn").addEventListener("click",()=>{state.eventRightIndent=clamp(state.eventRightIndent-24,0,260);eventDraw(state.eventData,state.eventHtl,state.eventEvents);});',
    '    el("eventIndentIn").addEventListener("click",()=>{state.eventRightIndent=clamp(state.eventRightIndent-24,0,260);eventDraw(state.eventData,state.eventHtl,state.eventEvents);queuePlatformPreferenceSave();});',
    "event indent in persistence",
)
html = replace_once(
    html,
    '    el("eventCrosshairToggle").addEventListener("click",event=>{state.eventCrosshairEnabled=!state.eventCrosshairEnabled;event.currentTarget.textContent=`Crosshair ${state.eventCrosshairEnabled?"on":"off"}`;event.currentTarget.setAttribute("aria-pressed",String(state.eventCrosshairEnabled));if(!state.eventCrosshairEnabled)state.eventCrosshair=null;eventDraw(state.eventData,state.eventHtl,state.eventEvents);});',
    '    el("eventCrosshairToggle").addEventListener("click",event=>{state.eventCrosshairEnabled=!state.eventCrosshairEnabled;event.currentTarget.textContent=`Crosshair ${state.eventCrosshairEnabled?"on":"off"}`;event.currentTarget.setAttribute("aria-pressed",String(state.eventCrosshairEnabled));if(!state.eventCrosshairEnabled)state.eventCrosshair=null;eventDraw(state.eventData,state.eventHtl,state.eventEvents);queuePlatformPreferenceSave();});',
    "event crosshair persistence",
)
html = replace_once(
    html,
    '    el("eventPair").addEventListener("change",()=>{selectEventScheduleRow(el("eventPair").value);queuePlatformPreferenceSave();});\n',
    '    el("eventPair").addEventListener("change",()=>{selectEventScheduleRow(el("eventPair").value);queuePlatformPreferenceSave();});\n    el("eventTimeframe").addEventListener("change",queuePlatformPreferenceSave);\n    el("eventLength").addEventListener("change",queuePlatformPreferenceSave);\n    document.addEventListener("change",event=>{if(["macroStartDate","macroEndDate","microStartDate","microEndDate"].includes(event.target?.id))queuePlatformPreferenceSave();});\n',
    "event/date preference listeners",
)
html_path.write_text(html)

test_path = Path("scripts/test-runtime.mjs")
test = test_path.read_text()
test = replace_once(
    test,
    'response=await engine.fetch(new Request("https://engine/optimizer",{method:"PUT",headers:{"Content-Type":"application/json"},body:"{}"}));assert.equal(response.status,405);',
    'response=await engine.fetch(new Request("https://engine/optimizer",{method:"PUT",headers:{"Content-Type":"application/json"},body:"{}"}));assert.equal(response.status,405);response=await engine.fetch(new Request("https://engine/preferences",{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({selectedInstrument:"EUR_AUD",selectedTimeframe:"M30",selectedStrategy:"NAI",activeFacility:"performance",visibleBars:51})}));assert.equal(response.status,200);const storedPreferences=await response.json();assert.equal(storedPreferences.selectedInstrument,"EUR_AUD");assert.equal(storedPreferences.selectedStrategy,"NAI");response=await engine.fetch(new Request("https://engine/preferences"));assert.equal((await response.json()).visibleBars,51);',
    "Durable Object preference tests",
)
test = replace_once(
    test,
    'assert.match(html,/MAX_CANDLE_REQUESTS=3/);',
    'assert.match(html,/MAX_CANDLE_REQUESTS=3/);assert.match(html,/\\/api\\/platform\\/preferences/);assert.match(html,/NAI:\\{price:\\[\\],z:/);assert.match(html,/const zDefinitions=indicatorSet\\.z/);assert.match(html,/activeFacility:/);',
    "NAI and persistence HTML tests",
)
test_path.write_text(test)

check_html_path = Path("scripts/check-html.mjs")
check_html = check_html_path.read_text()
check_html = replace_once(
    check_html,
    '"const assetAt="',
    '"const assetAt=","/api/platform/preferences","const zDefinitions=indicatorSet.z"',
    "HTML preference and z-axis checks",
)
check_html_path.write_text(check_html)

check_worker_path = Path("scripts/check-worker.mjs")
check_worker = check_worker_path.read_text()
check_worker = replace_once(
    check_worker,
    '  [/Optimizer records are server-managed/,"server-authoritative optimizer boundary"]',
    '  [/Optimizer records are server-managed/,"server-authoritative optimizer boundary"],\n  [/api\\/platform\\/preferences/,"cross-device preference route"]',
    "Worker preference check",
)
check_worker = replace_once(
    check_worker,
    '  [/state\\.requirements/,"durable optimized reconciliation context"]',
    '  [/state\\.requirements/,"durable optimized reconciliation context"],\n  [/uiPreferences/,"durable UI preference storage"]',
    "Engine preference storage check",
)
check_worker_path.write_text(check_worker)

Path(__file__).unlink(missing_ok=True)
