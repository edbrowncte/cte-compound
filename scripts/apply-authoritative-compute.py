from pathlib import Path
import re


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected 1 occurrence, found {count}")
    return text.replace(old, new, 1)


def regex_once(text: str, pattern: str, replacement: str, label: str) -> str:
    result, count = re.subn(pattern, replacement, text, count=1, flags=re.S)
    if count != 1:
        raise SystemExit(f"{label}: expected 1 regex replacement, found {count}")
    return result


engine_path = Path("src/engine.js")
engine = engine_path.read_text()

engine = replace_once(
    engine,
    'const MTF_TIMEFRAMES=["W","D","H4","H1","M30","M15","M5","M1","S30","S5"],TIMEFRAMES=new Set(MTF_TIMEFRAMES),DECISION_MODES=new Set(["EVENT","MTF","COMBINED"]),STRATEGIES=new Set(["ASSET","DARE_N","DARE","COMBO","NAI","APEX"]),DEFAULT_CONFIG={timeframe:"M15",htlLength:10,decisionMode:"EVENT",strategy:"ASSET",confirmationStrategy:"NONE",filter:0,configurationSource:"OPTIMIZED"},CANDLE_COUNT=650,OPTIMIZER_VERSION=3,OPTIMIZER_TTL_MS=7*24*60*60*1000,AI_MODEL="@cf/nvidia/nemotron-3-120b-a12b";',
    'const MTF_TIMEFRAMES=["W","D","H4","H1","M30","M15","M5","M1","S30","S5"],TIMEFRAMES=new Set(MTF_TIMEFRAMES),TIMEFRAME_SECONDS={W:604800,D:86400,H4:14400,H1:3600,M30:1800,M15:900,M5:300,M1:60,S30:30,S5:5},DECISION_MODES=new Set(["EVENT","MTF","COMBINED"]),STRATEGIES=new Set(["ASSET","DARE_N","DARE","COMBO","NAI","APEX"]),DEFAULT_CONFIG={timeframe:"M15",htlLength:10,decisionMode:"EVENT",strategy:"ASSET",confirmationStrategy:"NONE",filter:0,configurationSource:"OPTIMIZED"},CANDLE_COUNT=650,MAX_COMPUTE_BARS=5000,OPTIMIZER_VERSION=4,OPTIMIZER_TTL_MS=7*24*60*60*1000,AI_MODEL="@cf/nvidia/nemotron-3-120b-a12b";',
    "optimizer schema and range constants",
)

engine = regex_once(
    engine,
    r'function walkForwardScore\(data,events,pair\)\{.*?\}\nfunction optimizeDataset',
    '''function walkForwardScore(data,events,pair){const pip=pair.endsWith("JPY")?100:10000,foldStarts=[.4,.55,.7,.85].map(value=>Math.floor(data.length*value)),foldEnds=[...foldStarts.slice(1),data.length],trades=[];for(let index=0;index<events.length-1;index++){const current=events[index],next=events[index+1],entryIndex=current.index+1,exitIndex=next.index+1;if(entryIndex>=data.length||exitIndex>=data.length||exitIndex<=entryIndex)continue;if(!foldStarts.some((start,fold)=>entryIndex>=start&&exitIndex<foldEnds[fold]))continue;const entry=data[entryIndex].open,exit=data[exitIndex].open,range=data.slice(entryIndex,exitIndex+1),gross=(exit-entry)*current.direction*pip,net=gross-1,mfe=(current.direction>0?Math.max(...range.map(candle=>candle.high))-entry:entry-Math.min(...range.map(candle=>candle.low)))*pip,mae=(current.direction>0?entry-Math.min(...range.map(candle=>candle.low)):Math.max(...range.map(candle=>candle.high))-entry)*pip;trades.push({net,mfe:Math.max(0,mfe),mae:Math.max(0,mae)});}const wins=trades.filter(trade=>trade.net>.05),losses=trades.filter(trade=>trade.net<-.05),flats=trades.length-wins.length-losses.length,net=trades.reduce((sum,trade)=>sum+trade.net,0),average=trades.length?net/trades.length:0,grossWin=wins.reduce((sum,trade)=>sum+trade.net,0),grossLoss=-losses.reduce((sum,trade)=>sum+trade.net,0);let equity=0,peak=0,maxDrawdown=0;for(const trade of trades){equity+=trade.net;peak=Math.max(peak,equity);maxDrawdown=Math.max(maxDrawdown,peak-equity);}const variance=trades.length?mean(trades.map(trade=>(trade.net-average)**2)):0,uncertainty=Math.sqrt(variance/Math.max(1,trades.length)),mfe=trades.reduce((sum,trade)=>sum+trade.mfe,0),mae=trades.reduce((sum,trade)=>sum+trade.mae,0);return{trades:trades.length,wins:wins.length,losses:losses.length,flats,net,average,mfeMae:mae?mfe/mae:mfe?Infinity:null,maxDrawdown,profitFactor:grossLoss?grossWin/grossLoss:grossWin?Infinity:null,recoveryFactor:maxDrawdown?net/maxDrawdown:net>0?Infinity:null,winRate:trades.length?wins.length/trades.length:0,score:trades.length>=5?net-.5*maxDrawdown-uncertainty:-Infinity,estimatedCostPips:1,validation:"ROLLING_ORIGIN_CAUSAL"};}
function optimizeDataset''',
    "authoritative performance statistics",
)

engine = replace_once(
    engine,
    'async function candles(pair,token,timeframe,count=CANDLE_COUNT){const q=new URLSearchParams({price:"M",granularity:timeframe,count:String(count),smooth:"false"});return normalizeCandles(await callOanda(`/v3/instruments/${pair}/candles?${q}`,token));}\n',
    '''async function candles(pair,token,timeframe,count=CANDLE_COUNT){const q=new URLSearchParams({price:"M",granularity:timeframe,count:String(count),smooth:"false"});return normalizeCandles(await callOanda(`/v3/instruments/${pair}/candles?${q}`,token));}
async function candlesForRange(pair,token,timeframe,startDate,endDate){const start=new Date(`${startDate}T00:00:00.000Z`),end=new Date(`${endDate}T23:59:59.999Z`);if(!Number.isFinite(start.getTime())||!Number.isFinite(end.getTime())||start>end)throw Object.assign(new Error("Invalid Compute Configuration date range."),{status:400});const estimated=Math.ceil((end-start)/(TIMEFRAME_SECONDS[timeframe]*1000))+2;if(estimated>MAX_COMPUTE_BARS)throw Object.assign(new Error(`Selected ${timeframe} date range is too large for one causal optimization (${estimated.toLocaleString()} estimated bars; maximum ${MAX_COMPUTE_BARS.toLocaleString()}). Reduce the date range.`),{status:400});const q=new URLSearchParams({price:"M",granularity:timeframe,from:start.toISOString(),to:end.toISOString(),smooth:"false",includeFirst:"true"}),data=normalizeCandles(await callOanda(`/v3/instruments/${pair}/candles?${q}`,token));if(data.length>MAX_COMPUTE_BARS)throw Object.assign(new Error(`OANDA returned ${data.length.toLocaleString()} bars; maximum ${MAX_COMPUTE_BARS.toLocaleString()}. Reduce the date range.`),{status:400});return data;}
''',
    "date-range candle loader",
)

engine = replace_once(
    engine,
    'if(path==="/optimizer"&&request.method==="GET")return response({version:OPTIMIZER_VERSION,records:currentOptimizer(await this.ctx.storage.get("optimizer"))});if(path==="/optimizer"&&request.method==="PUT")return response({error:"Optimizer records are server-managed."},405);if(path==="/ledger")',
    'if(path==="/optimizer"&&request.method==="GET")return response({version:OPTIMIZER_VERSION,records:currentOptimizer(await this.ctx.storage.get("optimizer"))});if(path==="/optimizer"&&request.method==="PUT")return response({error:"Optimizer records are server-managed."},405);if(path==="/compute"&&request.method==="POST"){try{return response(await this.computeConfiguration(await request.json()));}catch(error){return response({error:String(error?.message||error)},Number(error?.status)||500);}}if(path==="/ledger")',
    "Compute Configuration route",
)

compute_method = '''  async computeConfiguration(value={}){const pair=String(value.pair||"").toUpperCase(),timeframe=String(value.timeframe||"").toUpperCase(),startDate=String(value.startDate||""),endDate=String(value.endDate||"");if(!PAIRS.includes(pair))throw Object.assign(new Error("Invalid Compute Configuration currency pair."),{status:400});if(!TIMEFRAMES.has(timeframe))throw Object.assign(new Error("Invalid Compute Configuration timeframe."),{status:400});if(!/^\\d{4}-\\d{2}-\\d{2}$/.test(startDate)||!/^\\d{4}-\\d{2}-\\d{2}$/.test(endDate))throw Object.assign(new Error("Start date and end date are required."),{status:400});const {token}=secrets(this.env),data=await candlesForRange(pair,token,timeframe,startDate,endDate);if(data.length<80)throw Object.assign(new Error(`Insufficient completed candles for Compute Configuration: ${data.length}. Select a wider date range.`),{status:400});const config=optimizeDataset(data,pair),stamp=data.at(-1)?.time||new Date().toISOString(),records=(await this.ctx.storage.get("optimizer"))||{},key=`${pair}|${timeframe}`,record={version:OPTIMIZER_VERSION,stamp,computedAt:new Date().toISOString(),source:"COMPUTE_CONFIGURATION",range:{startDate,endDate,firstCandle:data[0]?.time||null,lastCandle:data.at(-1)?.time||null,bars:data.length},config};records[key]=record;await this.ctx.storage.put("optimizer",records);return{key,record};}
'''
engine = replace_once(engine, '  async optimizeNext(state,token){', compute_method + '  async optimizeNext(state,token){', "Compute Configuration method")

engine = regex_once(
    engine,
    r'  async optimizeNext\(state,token\)\{const total=.*?return\{records:currentOptimizer\(records\),key,record\};\}',
    '''  async optimizeNext(state,token){const total=PAIRS.length*MTF_TIMEFRAMES.length,index=Number(state.optimizerCycleIndex||0)%total,pair=PAIRS[index%PAIRS.length],timeframe=MTF_TIMEFRAMES[Math.floor(index/PAIRS.length)],key=`${pair}|${timeframe}`,records=(await this.ctx.storage.get("optimizer"))||{},existing=records[key];state.optimizerCycleIndex=(index+1)%total;if(existing?.source==="COMPUTE_CONFIGURATION"&&Date.now()-Date.parse(existing.computedAt||0)<OPTIMIZER_TTL_MS){state.optimizerLastDataset=key;state.optimizerLastRun=new Date().toISOString();state.optimizerLastError=null;return{records:currentOptimizer(records),key,record:existing};}const data=await candles(pair,token,timeframe),config=optimizeDataset(data,pair),stamp=data.at(-1)?.time||new Date().toISOString(),record={version:OPTIMIZER_VERSION,stamp,computedAt:new Date().toISOString(),source:"SERVER",range:{startDate:null,endDate:null,firstCandle:data[0]?.time||null,lastCandle:data.at(-1)?.time||null,bars:data.length},config};records[key]=record;await this.ctx.storage.put("optimizer",records);state.optimizerLastDataset=key;state.optimizerLastRun=new Date().toISOString();state.optimizerLastError=null;return{records:currentOptimizer(records),key,record};}''',
    "preserve explicit Compute Configuration records",
)

engine_path.write_text(engine)

worker_path = Path("src/worker.js")
worker = worker_path.read_text()
worker = replace_once(
    worker,
    '        if(url.pathname==="/api/engine/optimizer"&&request.method==="GET") return await env.HTL_ENGINE.getByName("live").fetch("https://engine/optimizer");\n        if(url.pathname==="/api/engine/optimizer"&&request.method==="PUT") return json({error:"Optimizer records are server-managed."},405,{Allow:"GET"});',
    '        if(url.pathname==="/api/engine/optimizer"&&request.method==="GET") return await env.HTL_ENGINE.getByName("live").fetch("https://engine/optimizer");\n        if(url.pathname==="/api/engine/compute"&&request.method==="POST") return await env.HTL_ENGINE.getByName("live").fetch(new Request("https://engine/compute",{method:"POST",headers:{"Content-Type":"application/json"},body:request.body}));\n        if(url.pathname==="/api/engine/optimizer"&&request.method==="PUT") return json({error:"Optimizer records are server-managed."},405,{Allow:"GET"});',
    "Worker Compute Configuration route",
)
worker_path.write_text(worker)

html_path = Path("public/index.html")
html = html_path.read_text()
html = replace_once(html, '<summary>Micro: OANDA Account Trading Performance</summary>', '<summary>OANDA Account Trading Performance</summary>', "account performance label")
html = replace_once(html, '<button id="computeConfiguration" type="button" disabled>Refresh optimizer</button>', '<button id="computeConfiguration" type="button" disabled>Compute Configuration</button>', "Compute Configuration button label")
html = replace_once(html, '<p>Configured signals · next-open entries · opposite-signal exits</p>', '<p>Authoritative Compute Configuration result · rolling-origin causal validation · next-open entries · opposite-signal exits</p>', "Macro source description")

html = regex_once(
    html,
    r'  function renderStrategyConfiguration\(\)\{.*?\}\n  function strategyTrades',
    '''  function renderStrategyConfiguration(){const automatic=state.autoConfigurations.get(scheduleKey(state.selectedInstrument,state.selectedTimeframe)),range=automatic?.range,source=automatic?.source==="COMPUTE_CONFIGURATION"?"Compute Configuration":automatic?.source||"awaiting computation";el("configurationScope").textContent=`${formatPair(state.selectedInstrument)} · ${state.selectedTimeframe} · ${source}${range?.startDate?` · ${range.startDate} — ${range.endDate} · ${range.bars} completed candles`:automatic?` · ${formatTime(automatic.stamp)}`:""}`;el("strategyConfiguration").innerHTML=STRATEGIES.map(strategy=>{const config=automatic?.config?.[strategy.id]||STRATEGY_CONFIG[strategy.id],combined=strategy.id==='COMBO';return `<section class="config-card"><h3>${strategy.label}${automatic?' · AUTO':''}</h3><label class="field"><span>${combined?'Constituent length':'Length'}</span><input data-config-length="${strategy.id}" type="number" min="3" max="200" step="1" value="${config.length}" ${combined?'disabled':''}></label><label class="field"><span>${combined?'Required agreeing strategies':'Filter'}</span><input data-config-filter="${strategy.id}" type="number" min="0" max="${combined?5:10}" step="${combined?1:.01}" value="${config.filter}"></label></section>`;}).join('');}
  function strategyTrades''',
    "configuration cards from authoritative record",
)

html = regex_once(
    html,
    r'  function renderOptimizerRegistry\(\)\{.*?\}\n  async function refreshAdaptiveTimeframe',
    '''  function renderOptimizerRegistry(){const rows=[];for(const [key,value] of state.autoConfigurations){const [pair,timeframe]=key.split("|");for(const strategy of STRATEGIES){const config=value.config?.[strategy.id];if(config)rows.push({pair,timeframe,strategy:strategy.label,source:value.source||"SERVER",computedAt:value.computedAt||null,range:value.range||null,...config,stamp:value.stamp});}}el("optimizerServerStatus").textContent=`${state.autoConfigurations.size} / ${INSTRUMENTS.length*TIMEFRAMES.length} datasets`;el("optimizerRegistryBody").innerHTML=rows.sort((a,b)=>a.pair.localeCompare(b.pair)||TIMEFRAMES.indexOf(a.timeframe)-TIMEFRAMES.indexOf(b.timeframe)||a.strategy.localeCompare(b.strategy)).map(row=>`<tr><td>${formatPair(row.pair)}</td><td>${row.timeframe}</td><td>${row.strategy}</td><td>${row.length}</td><td>${row.filter}</td><td>${row.trades??"—"}</td><td>${Number.isFinite(row.net)?row.net.toFixed(1):"—"}</td><td>${Number.isFinite(row.maxDrawdown)?row.maxDrawdown.toFixed(1):"—"}</td><td>${Number.isFinite(row.score)?row.score.toFixed(2):"—"}</td><td>${row.source}${row.range?.startDate?` · ${row.range.startDate}—${row.range.endDate} · ${row.range.bars} bars`:""}</td><td>${formatTime(row.stamp)}</td><td>${formatTime(row.computedAt)}</td></tr>`).join("")||`<tr><td colspan="12">No optimized datasets.</td></tr>`;}
  async function refreshAdaptiveTimeframe''',
    "registry authoritative range disclosure",
)

html = regex_once(
    html,
    r'  function renderMacroPerformance\(\)\{.*?\}\n  function applyConfiguration',
    '''  function renderMacroPerformance(){const fmt=(value,digits=2)=>Number.isFinite(value)?Number(value).toFixed(digits):"—",record=state.autoConfigurations.get(scheduleKey(state.selectedInstrument,state.selectedTimeframe)),range=dateRange("macro"),matches=Boolean(record?.source==="COMPUTE_CONFIGURATION"&&record.range?.startDate===range.start&&record.range?.endDate===range.end);if(!range.valid){el("macroPerformanceScope").textContent="Invalid date range";el("macroPerformanceBody").innerHTML='<tr><td colspan="9">Start date must not be after end date.</td></tr>';el("computeConfiguration").disabled=false;return;}if(!range.start||!range.end){el("macroPerformanceScope").textContent="Select both dates, then run Compute Configuration";el("macroPerformanceBody").innerHTML='<tr><td colspan="9">Start date and end date are required for an authoritative computation.</td></tr>';el("computeConfiguration").disabled=!state.connected;return;}if(!matches){el("macroPerformanceScope").textContent=`${range.start} — ${range.end} · not computed`;el("macroPerformanceBody").innerHTML='<tr><td colspan="9">Run Compute Configuration for this pair, timeframe, and date range.</td></tr>';el("computeConfiguration").disabled=!state.connected;return;}el("macroPerformanceScope").textContent=`${record.range.startDate} — ${record.range.endDate} · ${record.range.bars} completed candles · ${formatTime(record.range.firstCandle)} to ${formatTime(record.range.lastCandle)} · authoritative optimizer result`;el("macroPerformanceBody").innerHTML=STRATEGIES.map(strategy=>{const stats=record.config?.[strategy.id]||{};return `<tr><td>${strategy.label}</td><td>${stats.trades??"—"}</td><td>${Number.isFinite(stats.wins)?`${stats.wins}/${stats.losses}/${stats.flats}`:"—"}</td><td class="${Number(stats.net)>=0?"positive":"negative"}">${fmt(stats.net,1)}</td><td>${fmt(stats.average)}</td><td>${fmt(stats.mfeMae)}</td><td>${fmt(stats.maxDrawdown,1)}</td><td>${fmt(stats.profitFactor)}</td><td>${fmt(stats.recoveryFactor)}</td></tr>`;}).join("");el("computeConfiguration").disabled=!state.connected;}
  function applyConfiguration''',
    "Macro table from Compute Configuration record",
)

html = regex_once(
    html,
    r'  async function computeConfiguration\(\)\{.*?\}\n  function selectFacility',
    '''  async function computeConfiguration(){const button=el("computeConfiguration"),range=dateRange("macro");if(!state.connected)return;if(!range.valid||!range.start||!range.end){renderMacroPerformance();return;}button.disabled=true;button.textContent="Computing…";el("macroPerformanceScope").textContent=`${range.start} — ${range.end} · loading completed OANDA candles and optimizing…`;try{const response=await fetch("/api/engine/compute",{method:"POST",headers:{Accept:"application/json","Content-Type":"application/json"},credentials:"same-origin",cache:"no-store",body:JSON.stringify({pair:state.selectedInstrument,timeframe:state.selectedTimeframe,startDate:range.start,endDate:range.end})}),payload=await response.json().catch(()=>({}));if(!response.ok)throw new Error(payload.error||`HTTP ${response.status}`);state.autoConfigurations.set(payload.key,payload.record);const resolved=payload.record.config;if(state.chartCandles.length){state.chartAnalysis=analyzeWithConfiguration(state.chartCandles,resolved,false);state.chartCausalIndicators=null;state.chartCausalSeries=[];void refreshCausalChartAnalysis(state.selectedInstrument,state.selectedTimeframe,state.chartCandles,resolved,state.selectedStrategy);}renderStrategyConfiguration();renderMacroPerformance();renderOptimizerRegistry();renderSchedule();updateChartSummary();updateCompartments();drawChart();queuePlatformPreferenceSave();}catch(error){el("macroPerformanceScope").textContent=error.message||"Compute Configuration failed";el("macroPerformanceBody").innerHTML=`<tr><td colspan="9">${error.message||"Compute Configuration failed"}</td></tr>`;}finally{button.textContent="Compute Configuration";button.disabled=!state.connected;}}
  function selectFacility''',
    "authoritative Compute Configuration action",
)

html_path.write_text(html)

check_worker_path = Path("scripts/check-worker.mjs")
check_worker = check_worker_path.read_text()
check_worker = replace_once(
    check_worker,
    '  [/api\\/platform\\/preferences/,"cross-device preference route"]',
    '  [/api\\/platform\\/preferences/,"cross-device preference route"],\n  [/api\\/engine\\/compute/,"authoritative Compute Configuration route"]',
    "Worker compute route check",
)
check_worker = replace_once(
    check_worker,
    '  [/uiPreferences/,"durable UI preference storage"]',
    '  [/uiPreferences/,"durable UI preference storage"],\n  [/candlesForRange/,"date-range Compute Configuration candles"],\n  [/COMPUTE_CONFIGURATION/,"authoritative optimizer source"],\n  [/MAX_COMPUTE_BARS/,"bounded causal optimization range"]',
    "Engine authoritative compute checks",
)
check_worker_path.write_text(check_worker)

test_path = Path("scripts/test-runtime.mjs")
test = test_path.read_text()
test = replace_once(
    test,
    'response=await engine.fetch(new Request("https://engine/optimizer",{method:"PUT",headers:{"Content-Type":"application/json"},body:"{}"}));assert.equal(response.status,405);response=await engine.fetch',
    'response=await engine.fetch(new Request("https://engine/optimizer",{method:"PUT",headers:{"Content-Type":"application/json"},body:"{}"}));assert.equal(response.status,405);response=await engine.fetch(new Request("https://engine/compute",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({pair:"EUR_USD",timeframe:"M15",startDate:"bad",endDate:"2026-08-04"})}));assert.equal(response.status,400);response=await engine.fetch',
    "Compute Configuration validation test",
)
test = replace_once(
    test,
    'assert.match(html,/MAX_CANDLE_REQUESTS=3/);',
    'assert.match(html,/MAX_CANDLE_REQUESTS=3/);assert.match(html,/\\/api\\/engine\\/compute/);assert.match(html,/source==="COMPUTE_CONFIGURATION"/);assert.match(html,/record\\.range\\.bars/);assert.match(html,/button\\.textContent="Computing…"/);assert.doesNotMatch(html,/function renderMacroPerformance\\(\\).*causalAnalysisWithConfiguration/s);',
    "authoritative Macro runtime assertions",
)
test_path.write_text(test)

Path(__file__).unlink(missing_ok=True)
