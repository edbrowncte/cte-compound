from pathlib import Path
import re


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected 1 occurrence, found {count}")
    return text.replace(old, new, 1)


def sub_once(text: str, pattern: str, replacement: str, label: str) -> str:
    result, count = re.subn(pattern, replacement, text, count=1, flags=re.S)
    if count != 1:
        raise SystemExit(f"{label}: expected 1 replacement, found {count}")
    return result


html_path = Path("public/index.html")
html = html_path.read_text()

html = replace_once(
    html,
    '<div class="date-range-controls"><label class="field"><span>Start date</span><input id="macroStartDate" type="date"></label><label class="field"><span>End date</span><input id="macroEndDate" type="date"></label><button id="macroClearDates" type="button">Clear dates</button><span class="date-range-scope" id="macroPerformanceScope">All loaded completed candles</span></div>',
    '<div class="date-range-controls"><span class="date-range-scope" id="macroPerformanceScope">Run Compute Configuration to load the current completed OANDA candle history.</span></div>',
    "remove editable Macro dates",
)

html = sub_once(
    html,
    r',macroStartDate:preferenceDateValue\("macroStartDate"\),macroEndDate:preferenceDateValue\("macroEndDate"\)',
    '',
    "remove Macro date preference payload",
)
html = replace_once(
    html,
    'for(const [id,key] of [["macroStartDate","macroStartDate"],["macroEndDate","macroEndDate"],["microStartDate","microStartDate"],["microEndDate","microEndDate"]])setPreferenceControl(id,preferences[key]||"");',
    'for(const [id,key] of [["microStartDate","microStartDate"],["microEndDate","microEndDate"]])setPreferenceControl(id,preferences[key]||"");',
    "remove Macro date preference application",
)

html = replace_once(
    html,
    '${row.source}${row.range?.startDate?` · ${row.range.startDate}—${row.range.endDate} · ${row.range.bars} bars`:""}',
    '${row.source}${row.range?.bars?` · ${formatTime(row.range.firstCandle)}—${formatTime(row.range.lastCandle)} · ${row.range.bars} bars`:""}',
    "show actual optimizer history span",
)

new_macro = '''  function renderMacroPerformance(){const fmt=(value,digits=2)=>Number.isFinite(value)?Number(value).toFixed(digits):"—",record=state.autoConfigurations.get(scheduleKey(state.selectedInstrument,state.selectedTimeframe)),authoritative=Boolean(record?.source==="COMPUTE_CONFIGURATION");if(!authoritative){el("macroPerformanceScope").textContent="Not computed · Run Compute Configuration to load the current completed OANDA candle history";el("macroPerformanceBody").innerHTML='<tr><td colspan="9">Compute Configuration will determine and report the actual first and last completed OANDA candles.</td></tr>';el("computeConfiguration").disabled=!state.connected;return;}const first=record.range?.firstCandle,last=record.range?.lastCandle,bars=Number(record.range?.bars)||0;el("macroPerformanceScope").textContent=`History started ${formatTime(first)} · ended ${formatTime(last)} · ${bars} completed candles · computed ${formatTime(record.computedAt)}`;el("macroPerformanceBody").innerHTML=STRATEGIES.map(strategy=>{const stats=record.config?.[strategy.id]||{};return `<tr><td>${strategy.label}</td><td>${stats.trades??"—"}</td><td>${Number.isFinite(stats.wins)?`${stats.wins}/${stats.losses}/${stats.flats}`:"—"}</td><td class="${Number(stats.net)>=0?"positive":"negative"}">${fmt(stats.net,1)}</td><td>${fmt(stats.average)}</td><td>${fmt(stats.mfeMae)}</td><td>${fmt(stats.maxDrawdown,1)}</td><td>${fmt(stats.profitFactor)}</td><td>${fmt(stats.recoveryFactor)}</td></tr>`;}).join("");el("computeConfiguration").disabled=!state.connected;}
  function applyConfiguration'''
html = sub_once(
    html,
    r'  function renderMacroPerformance\(\)\{.*?\}\n  function applyConfiguration',
    new_macro,
    "automatic Macro scope renderer",
)

new_compute = '''  async function computeConfiguration(){const button=el("computeConfiguration");if(!state.connected)return;button.disabled=true;button.textContent="Computing…";el("macroPerformanceScope").textContent="Loading the current completed OANDA candle history and optimizing…";try{const response=await fetch("/api/engine/compute",{method:"POST",headers:{Accept:"application/json","Content-Type":"application/json"},credentials:"same-origin",cache:"no-store",body:JSON.stringify({pair:state.selectedInstrument,timeframe:state.selectedTimeframe})}),payload=await response.json().catch(()=>({}));if(!response.ok)throw new Error(payload.error?`${payload.stage||"compute"} · ${payload.error}`:`HTTP ${response.status}`);state.autoConfigurations.set(payload.key,payload.record);const resolved=payload.record.config;if(state.chartCandles.length){state.chartAnalysis=analyzeWithConfiguration(state.chartCandles,resolved,false);state.chartCausalIndicators=null;state.chartCausalSeries=[];void refreshCausalChartAnalysis(state.selectedInstrument,state.selectedTimeframe,state.chartCandles,resolved,state.selectedStrategy);}renderStrategyConfiguration();renderMacroPerformance();renderOptimizerRegistry();renderSchedule();updateChartSummary();updateCompartments();drawChart();}catch(error){el("macroPerformanceScope").textContent=error.message||"Compute Configuration failed";el("macroPerformanceBody").innerHTML=`<tr><td colspan="9">${error.message||"Compute Configuration failed"}</td></tr>`;}finally{button.textContent="Compute Configuration";button.disabled=!state.connected;}}
  function selectFacility'''
html = sub_once(
    html,
    r'  async function computeConfiguration\(\)\{.*?\}\n  function selectFacility',
    new_compute,
    "automatic Compute Configuration history",
)

html = sub_once(
    html,
    r'    for\(const id of \["macroStartDate","macroEndDate"\]\)\{.*?\}\n    el\("macroClearDates"\)\.addEventListener\("click",.*?\);\n',
    '',
    "remove Macro date bindings",
)

html_path.write_text(html)

engine_path = Path("src/engine.js")
engine = engine_path.read_text()
new_engine_compute = '''  async computeConfiguration(value={}){let stage="validation";try{const pair=String(value.pair||"").toUpperCase(),timeframe=String(value.timeframe||"").toUpperCase(),startDate=String(value.startDate||""),endDate=String(value.endDate||""),hasDateRange=Boolean(startDate||endDate);if(!PAIRS.includes(pair))throw Object.assign(new Error("Invalid Compute Configuration currency pair."),{status:400});if(!TIMEFRAMES.has(timeframe))throw Object.assign(new Error("Invalid Compute Configuration timeframe."),{status:400});if(hasDateRange&&(!/^\\d{4}-\\d{2}-\\d{2}$/.test(startDate)||!/^\\d{4}-\\d{2}-\\d{2}$/.test(endDate)))throw Object.assign(new Error("Both start date and end date are required when an explicit range is supplied."),{status:400});stage="credentials";const {token}=secrets(this.env);stage="oanda-history";const data=hasDateRange?await candlesForRange(pair,token,timeframe,startDate,endDate):await candles(pair,token,timeframe);if(data.length<80)throw Object.assign(new Error(`Insufficient completed candles for Compute Configuration: ${data.length}.`),{status:400});stage="causal-optimization";const config=optimizeDataset(data,pair),stamp=data.at(-1)?.time||new Date().toISOString();stage="durable-storage";const records=(await this.ctx.storage.get("optimizer"))||{},key=`${pair}|${timeframe}`,record={version:OPTIMIZER_VERSION,stamp,computedAt:new Date().toISOString(),source:"COMPUTE_CONFIGURATION",range:{startDate:hasDateRange?startDate:null,endDate:hasDateRange?endDate:null,firstCandle:data[0]?.time||null,lastCandle:data.at(-1)?.time||null,bars:data.length},config};records[key]=record;await this.ctx.storage.put("optimizer",records);return{key,record};}catch(error){if(!error.stage)error.stage=stage;throw error;}}
  async optimizeNext'''
engine = sub_once(
    engine,
    r'  async computeConfiguration\(value=\{\}\)\{.*?\}\n  async optimizeNext',
    new_engine_compute,
    "optional explicit range and automatic OANDA history",
)
engine_path.write_text(engine)

check_path = Path("scripts/check-html.mjs")
check = check_path.read_text()
check = replace_once(check, '"macroStartDate"', '"macroPerformanceScope"', "HTML required feature")
check = replace_once(
    check,
    'if(/\\/api\\/engine\\/optimizer[^\\n]+method:"PUT"/.test(html))throw new Error("Browser optimizer writes remain enabled.");',
    'if(/\\/api\\/engine\\/optimizer[^\\n]+method:"PUT"/.test(html))throw new Error("Browser optimizer writes remain enabled.");\nif(/id="macro(?:Start|End)Date"|macroClearDates/.test(html))throw new Error("Editable Macro date controls remain present.");',
    "HTML Macro date absence check",
)
check_path.write_text(check)

test_path = Path("scripts/test-runtime.mjs")
test = test_path.read_text()
test = replace_once(
    test,
    'if(parsed.searchParams.has("from")){',
    'if(parsed.searchParams.has("from")||parsed.searchParams.get("count")==="650"){',
    "automatic history test candles",
)
test = sub_once(
    test,
    r'(assert\.equal\(computed\.record\.range\.bars,180\);)(response=await engine\.fetch\(new Request\("https://engine/preferences")',
    r'''\1response=await engine.fetch(new Request("https://engine/compute",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({pair:"EUR_USD",timeframe:"M15"})}));assert.equal(response.status,200);const automatic=await response.json();assert.equal(automatic.record.range.startDate,null);assert.equal(automatic.record.range.endDate,null);assert.equal(automatic.record.range.bars,180);assert.ok(automatic.record.range.firstCandle);assert.ok(automatic.record.range.lastCandle);\2''',
    "automatic Compute Configuration endpoint test",
)
test = replace_once(
    test,
    'assert.match(html,/macroStartDate/);',
    'assert.doesNotMatch(html,/id="macroStartDate"/);assert.doesNotMatch(html,/id="macroEndDate"/);assert.doesNotMatch(html,/macroClearDates/);assert.match(html,/History started/);assert.match(html,/body:JSON.stringify\\(\\{pair:state.selectedInstrument,timeframe:state.selectedTimeframe\\}\\)/);',
    "Macro automatic range browser assertions",
)
test_path.write_text(test)

Path(__file__).unlink(missing_ok=True)
