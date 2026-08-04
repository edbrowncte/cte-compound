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


worker_path = Path("src/worker.js")
worker = worker_path.read_text()
worker = replace_once(
    worker,
    'const OANDA_MAX_CONCURRENCY=4,OANDA_REQUEST_TIMEOUT_MS=15000;\nlet oandaActive=0,oandaLastStart=0;\nconst oandaWaiters=[];',
    'const OANDA_MAX_CONCURRENCY=3,OANDA_REQUEST_TIMEOUT_MS=15000;\nlet oandaActive=0,oandaLastStart=0;\nconst oandaWaiters=[];\nconst oandaTelemetry={requests:0,retries:0,timeouts:0,failures:0,statuses:{}};',
    "Worker concurrency and telemetry",
)
worker = regex_once(
    worker,
    r'async function oandaRequest\(path,token,init=\{\}\) \{.*?\n\}\n\nfunction normalizeCandles',
    '''async function oandaRequest(path,token,init={}) {
  await acquireOandaSlot();
  try{
    let lastError=null;
    for(let attempt=0;attempt<3;attempt++){
      const delay=Math.max(0,45-(Date.now()-oandaLastStart));
      if(delay)await new Promise(resolve=>setTimeout(resolve,delay));
      oandaLastStart=Date.now();oandaTelemetry.requests++;
      const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),OANDA_REQUEST_TIMEOUT_MS);
      try{
        const response=await fetch(LIVE_OANDA_ORIGIN+path,{method:init.method||"GET",headers:{Authorization:`Bearer ${token}`,Accept:"application/json",...(init.body?{"Content-Type":"application/json"}:{})},body:init.body,redirect:"manual",cache:"no-store",signal:controller.signal});
        const payload=await response.json().catch(()=>({}));
        if(!response.ok){const error=Object.assign(new Error(payload.errorMessage||payload.errorCode||`OANDA HTTP ${response.status}`),{status:response.status,payload});oandaTelemetry.statuses[response.status]=Number(oandaTelemetry.statuses[response.status]||0)+1;throw error;}
        return payload;
      }catch(error){
        const timedOut=controller.signal.aborted;if(timedOut){oandaTelemetry.timeouts++;lastError=Object.assign(new Error("OANDA request timed out."),{status:504});}else lastError=error;
        const status=Number(lastError?.status)||0,retryable=timedOut||status===429||status>=500;
        if(!retryable||attempt===2){oandaTelemetry.failures++;throw lastError;}
        oandaTelemetry.retries++;await new Promise(resolve=>setTimeout(resolve,500*(2**attempt)+Math.floor(Math.random()*250)));
      }finally{clearTimeout(timer);}
    }
    throw lastError||new Error("OANDA request failed.");
  }finally{releaseOandaSlot();}
}

function normalizeCandles''',
    "Worker OANDA retry/backoff",
)
diagnostic_handler = '''
async function handlePlatformDiagnostic(env,url){
  const started=Date.now(),instrument=(url.searchParams.get("instrument")||"EUR_USD").toUpperCase(),granularity=(url.searchParams.get("granularity")||"M15").toUpperCase();
  if(!INSTRUMENTS.has(instrument)||!GRANULARITIES.has(granularity))return json({error:"Invalid diagnostic instrument or granularity."},400);
  const {token,accountId:configuredAccountId}=credentials(env),accountId=await resolveAccount(token,configuredAccountId),summaryStart=Date.now();
  const summary=await oandaRequest(`/v3/accounts/${encodeURIComponent(accountId)}/summary`,token),summaryLatencyMs=Date.now()-summaryStart,candleStart=Date.now(),candles=await oandaRequest(`/v3/instruments/${instrument}/candles?price=M&granularity=${granularity}&count=60&smooth=false`,token),candleLatencyMs=Date.now()-candleStart,engineResponse=await env.HTL_ENGINE.getByName("live").fetch("https://engine/status"),engine=await engineResponse.json().catch(()=>({}));
  return json({time:new Date().toISOString(),totalLatencyMs:Date.now()-started,worker:{oandaActive,oandaQueued:oandaWaiters.length,maxConcurrency:OANDA_MAX_CONCURRENCY,requestTimeoutMs:OANDA_REQUEST_TIMEOUT_MS,candleCacheEntries:candleCache.size,telemetry:oandaTelemetry},oanda:{accountSuffix:String(accountId).slice(-3),summaryLatencyMs,candleLatencyMs,completedCandles:normalizeCandles(candles).length,NAV:summary.account?.NAV||null,marginAvailable:summary.account?.marginAvailable||null},engine:{reachable:engineResponse.ok,armed:engine.armed,running:engine.running,lastRun:engine.lastRun,lastError:engine.lastError,optimizerCoverage:engine.optimizerCoverage,optimizerTotal:engine.optimizerTotal,optimizerLastError:engine.optimizerLastError,mtfCoverage:engine.mtfCoverage,pendingOrders:engine.pendingOrders},cloneAssessment:{structuredCloneCalls:0,applicable:false,verdict:"No structuredClone hot path exists in this repository."}});
}
'''
worker = replace_once(worker, 'async function handlePricingStream(env,url) {', diagnostic_handler + '\nasync function handlePricingStream(env,url) {', "Platform diagnostic handler")
worker = replace_once(
    worker,
    '        if(url.pathname==="/api/engine/status"&&request.method==="GET") return await env.HTL_ENGINE.getByName("live").fetch("https://engine/status");',
    '        if(url.pathname==="/api/platform/diagnostic"&&request.method==="GET") return await handlePlatformDiagnostic(env,url);\n        if(url.pathname==="/api/engine/status"&&request.method==="GET") return await env.HTL_ENGINE.getByName("live").fetch("https://engine/status");',
    "Platform diagnostic route",
)
worker_path.write_text(worker)

html_path = Path("public/index.html")
html = html_path.read_text()
html = replace_once(
    html,
    '    .performance-table th:first-child,.performance-table td:first-child { text-align:left; }',
    '''    .performance-table th:first-child,.performance-table td:first-child { text-align:left; }
    .date-range-controls { display:flex; flex-wrap:wrap; gap:7px; align-items:end; padding:9px 12px; }
    .date-range-controls .field { min-width:145px; }
    .date-range-scope { color:var(--muted); font-size:9px; align-self:center; }
    .diagnostic-grid { display:grid; grid-template-columns:repeat(4,minmax(135px,1fr)); gap:7px; padding:10px 12px; }
    .diagnostic-card { border:1px solid var(--line); background:#0b1118; padding:8px; min-width:0; }
    .diagnostic-card span { display:block; color:var(--muted); font-size:8px; text-transform:uppercase; letter-spacing:.07em; }
    .diagnostic-card strong { display:block; margin-top:3px; overflow-wrap:anywhere; font-size:10px; }
    .diagnostic-card.good strong { color:var(--buy); }.diagnostic-card.bad strong { color:var(--sell); }
    @media(max-width:900px) { .diagnostic-grid { grid-template-columns:1fr 1fr; } }''',
    "Date and diagnostic CSS",
)
html = replace_once(
    html,
    '      </form>\n      <section class="positions-panel"',
    '''      </form>
      <details class="data-details" id="platformDiagnosticDetails">
        <summary>Platform Diagnostic Scan</summary>
        <div class="date-range-controls"><button id="runPlatformDiagnostic" type="button">Run diagnostic scan</button><span class="date-range-scope" id="platformDiagnosticStatus">Not scanned</span></div>
        <div class="diagnostic-grid" id="platformDiagnosticGrid"><div class="diagnostic-card"><span>Status</span><strong>Awaiting scan</strong></div></div>
      </details>
      <section class="positions-panel"''',
    "Account-panel diagnostic UI",
)
html = replace_once(
    html,
    '        <details class="data-details" id="microPerformanceDetails">\n          <summary>Micro: OANDA Account Trading Performance</summary>\n          <div class="performance-wrap">',
    '''        <details class="data-details" id="microPerformanceDetails">
          <summary>Micro: OANDA Account Trading Performance</summary>
          <div class="date-range-controls"><label class="field"><span>Start date</span><input id="microStartDate" type="date"></label><label class="field"><span>End date</span><input id="microEndDate" type="date"></label><button id="microClearDates" type="button">Clear dates</button><span class="date-range-scope" id="microPerformanceScope">All retained engine records</span></div>
          <div class="performance-wrap">''',
    "Micro performance date controls",
)
html = replace_once(
    html,
    '        <div class="panel-head"><div class="panel-title"><h2>Macro: HTL Asset / DARE(N) / DARE / COMBO / NAI / APEX Performance</h2><p>Configured signals · next-open entries · opposite-signal exits</p></div></div>\n        <div class="performance-wrap">',
    '''        <div class="panel-head"><div class="panel-title"><h2>Macro: HTL Asset / DARE(N) / DARE / COMBO / NAI / APEX Performance</h2><p>Configured signals · next-open entries · opposite-signal exits</p></div></div>
        <div class="date-range-controls"><label class="field"><span>Start date</span><input id="macroStartDate" type="date"></label><label class="field"><span>End date</span><input id="macroEndDate" type="date"></label><button id="macroClearDates" type="button">Clear dates</button><span class="date-range-scope" id="macroPerformanceScope">All loaded completed candles</span></div>
        <div class="performance-wrap">''',
    "Macro performance date controls",
)
html = replace_once(
    html,
    '<p>Drag to pan · wheel or controls to zoom · crosshair price is attached to the right y-axis.</p>',
    '<p>Drag to pan · wheel or controls to zoom · price uses the right y-axis · normalized NAI uses the left z-axis.</p>',
    "Chart axis description",
)
html = replace_once(
    html,
    '    candleSequence:0,\n    eventController:null,',
    '    candleSequence:0,\n    candleStats:{requested:0,succeeded:0,failed:0,retries:0,timeouts:0,statuses:{}},\n    scheduleFailures:new Map(),\n    ledgerLimit:500,\n    diagnosticLast:null,\n    eventController:null,',
    "Browser diagnostic state",
)
queue_pattern = r'  const MAX_CANDLE_REQUESTS=3,CANDLE_TIMEOUT_MS=20000;\n  function pumpCandleQueue\(\)\{.*?\n  function queueCandleRequest'
queue_replacement = '''  const MAX_CANDLE_REQUESTS=3,MAX_BACKGROUND_CANDLE_REQUESTS=2,CANDLE_TIMEOUT_MS=20000;
  function pumpCandleQueue(){while(state.candleQueue.length){state.candleQueue.sort((a,b)=>b.priority-a.priority||a.sequence-b.sequence);const next=state.candleQueue[0],limit=next.priority>=80?MAX_CANDLE_REQUESTS:MAX_BACKGROUND_CANDLE_REQUESTS;if(state.candleActive>=limit)break;const job=state.candleQueue.shift();if(job.cancelled?.()){job.reject(new DOMException("Aborted","AbortError"));continue;}state.candleActive++;fetchCandleJob(job).then(job.resolve,job.reject).finally(()=>{state.candleActive--;pumpCandleQueue();});}}
  async function fetchCandleJob(job){let lastError=null;for(let attempt=0;attempt<3;attempt++){const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),CANDLE_TIMEOUT_MS);state.candleStats.requested++;try{const response=await fetch(`/api/oanda/candles?instrument=${encodeURIComponent(job.instrument)}&granularity=${encodeURIComponent(job.timeframe)}&count=${encodeURIComponent(job.count)}`,{method:"GET",headers:{Accept:"application/json"},credentials:"same-origin",cache:"no-store",signal:controller.signal}),payload=await response.json().catch(()=>({error:`HTTP ${response.status}`}));if(!response.ok){const error=new Error(payload.errorMessage||payload.error||payload.message||`HTTP ${response.status}`);error.status=response.status;state.candleStats.statuses[response.status]=Number(state.candleStats.statuses[response.status]||0)+1;throw error;}state.candleStats.succeeded++;return payload;}catch(error){const timedOut=controller.signal.aborted;if(timedOut){state.candleStats.timeouts++;lastError=new Error(`OANDA candle request timed out · ${formatPair(job.instrument)} ${job.timeframe}`);lastError.status=504;}else lastError=error;const status=Number(lastError?.status)||0,retryable=timedOut||status===429||status>=500;if(!retryable||attempt===2){state.candleStats.failed++;throw lastError;}state.candleStats.retries++;await new Promise(resolve=>setTimeout(resolve,700*(2**attempt)+Math.floor(Math.random()*300)));}finally{clearTimeout(timer);}}throw lastError||new Error("Candle request failed.");}
  function queueCandleRequest'''
html = regex_once(html, queue_pattern, queue_replacement, "Reserved chart lane and browser backoff")
load_schedule = '''  async function loadScheduleDataset(instrument,timeframe,controller,priority=20){const payload=await oanda(`/v3/instruments/${encodeURIComponent(instrument)}/candles?price=M&granularity=${encodeURIComponent(timeframe)}&count=180`,controller,priority),candles=completedCandles(payload),key=scheduleKey(instrument,timeframe);if(!candles.length)throw new Error(`No completed candles · ${formatPair(instrument)} ${timeframe}`);state.scheduleCandles.set(key,candles);const optimized=state.autoConfigurations.get(key)?.config;state.scheduleEvaluations.set(key,analyzeWithConfiguration(candles,optimized||STRATEGY_CONFIG,false));renderScheduleCell(instrument,timeframe);if(instrument===state.selectedInstrument&&timeframe===state.selectedTimeframe&&!state.chartCandles.length)applyChartDataset(instrument,timeframe,candles);return key;}

  async function loadSchedule() {
    if(!state.connected)return;
    state.scheduleController?.abort();const controller=new AbortController();state.scheduleController=controller;el("refreshSchedule").disabled=true;document.querySelectorAll(".signal-cell").forEach(cell=>cell.classList.add("loading"));
    const timeframes=[state.selectedTimeframe,...TIMEFRAMES.filter(item=>item!==state.selectedTimeframe)],instruments=[state.selectedInstrument,...INSTRUMENTS.filter(item=>item!==state.selectedInstrument)],jobs=timeframes.flatMap(timeframe=>instruments.map(instrument=>({instrument,timeframe}))),total=jobs.length,resolved=new Set();state.scheduleFailures.clear();let attempted=0,lastError="";
    const runJobs=async(items,priority)=>runPool(items,4,async job=>{const key=scheduleKey(job.instrument,job.timeframe);try{await loadScheduleDataset(job.instrument,job.timeframe,controller,priority);resolved.add(key);state.scheduleFailures.delete(key);}catch(error){if(error.name!=="AbortError"){lastError=error.message||"Candle load failed";state.scheduleFailures.set(key,{...job,error:lastError});}}finally{attempted++;el("progressFill").style.width=`${resolved.size/total*100}%`;el("progressText").textContent=`Loading ${resolved.size} / ${total} datasets · ${state.scheduleFailures.size} unresolved`;}});
    try{
      await runJobs(jobs,20);
      for(let round=1;round<=2&&!controller.signal.aborted&&state.scheduleFailures.size;round++){const retry=[...state.scheduleFailures.values()].map(({instrument,timeframe})=>({instrument,timeframe}));el("progressText").textContent=`Retry ${round} / 2 · ${retry.length} unresolved datasets`;await new Promise(resolve=>setTimeout(resolve,1200*round));attempted=0;await runJobs(retry,35+round);}
      if(!controller.signal.aborted){const failures=state.scheduleFailures.size;el("progressFill").style.width=`${resolved.size/total*100}%`;el("progressText").textContent=`Loaded ${resolved.size} / ${total} datasets${failures?` · ${failures} errors · ${lastError}`:""}`;el("scheduleStamp").textContent=`Last schedule refresh ${new Date().toLocaleTimeString()} · completed candles only`;renderMtfForecast();queueAutomaticOptimization();startAdaptiveMonitor();void runPlatformDiagnostic(false);}
    }finally{if(!controller.signal.aborted)el("refreshSchedule").disabled=false;}
  }
'''
html = regex_once(html, r'  async function loadSchedule\(\) \{.*?\n  \}\n\n  function applyChartDataset', load_schedule + '\n  function applyChartDataset', "Schedule retry and recovery")
date_helpers = '''  function dateRange(prefix){const start=el(`${prefix}StartDate`)?.value||"",end=el(`${prefix}EndDate`)?.value||"",startMs=start?Date.parse(`${start}T00:00:00`):-Infinity,endMs=end?Date.parse(`${end}T23:59:59.999`):Infinity;return{start,end,startMs,endMs,valid:startMs<=endMs};}
  function filterByDateRange(rows,prefix,timeKey="time"){const range=dateRange(prefix);return{range,rows:range.valid?rows.filter(row=>{const value=Date.parse(row?.[timeKey]||0);return Number.isFinite(value)&&value>=range.startMs&&value<=range.endMs;}):[]};}
  function rangeLabel(range,fallback){if(!range.valid)return"Invalid date range";return range.start||range.end?`${range.start||"earliest"} — ${range.end||"latest"}`:fallback;}
'''
html = replace_once(html, '  function renderTradingLedger(entries){', date_helpers + '\n  function renderTradingLedger(entries){', "Date range helpers")
new_render_ledger = '''  function renderTradingLedger(entries){const rows=Array.isArray(entries)?entries:[];state.tradingLedger=rows;el("downloadTradingLedger").disabled=!rows.length;const fmt=value=>value??"—";el("tradingLedgerBody").innerHTML=rows.map(item=>`<tr><td>${formatTime(item.time)}</td><td>${fmt(item.type)}</td><td>${item.pair?formatPair(item.pair):"—"}</td><td>${fmt(item.strategy)}</td><td class="${item.direction==="BUY"?"positive":item.direction==="SELL"?"negative":""}">${fmt(item.direction)}</td><td>${fmt(item.units)}</td><td>${fmt(item.price)}</td><td>${fmt(item.realizedPL)}</td><td>${fmt(item.message)}</td></tr>`).join("")||`<tr><td colspan="9">No engine records.</td></tr>`;const filtered=filterByDateRange(rows,"micro"),groups=new Map(STRATEGIES.map(item=>[item.id,{label:item.label,orders:0,closed:0,wins:0,losses:0,flat:0,pl:0,last:null}]));for(const item of [...filtered.rows].reverse()){const id=item.strategy||((item.type==="ORDER_FILLED"||item.type==="POSITION_CLOSED")?"ASSET":null),group=groups.get(id);if(!group)continue;if(item.type==="ORDER_FILLED")group.orders++;if(item.type==="POSITION_CLOSED"){group.closed++;const pl=Number(item.realizedPL);if(Number.isFinite(pl)){group.pl+=pl;if(pl>0)group.wins++;else if(pl<0)group.losses++;else group.flat++;}}if(item.pair)group.last=item;}el("microPerformanceScope").textContent=`${rangeLabel(filtered.range,"All retained engine records")} · ${filtered.rows.length} records`;el("microPerformanceBody").innerHTML=[...groups.values()].map(g=>`<tr><td>${g.label}</td><td>${g.orders||"—"}</td><td>${g.closed||"—"}</td><td>${g.closed?`${g.wins}/${g.losses}/${g.flat}`:"—"}</td><td class="${g.pl>0?"positive":g.pl<0?"negative":""}">${g.closed?g.pl.toFixed(2):"—"}</td><td>${g.last?.direction||"—"}</td><td>${g.last?.pair?formatPair(g.last.pair):"—"}</td><td>${g.last?formatTime(g.last.time):"—"}</td></tr>`).join("");}
'''
html = regex_once(html, r'  function renderTradingLedger\(entries\)\{.*?\}\n  function downloadTradingLedger', new_render_ledger + '  function downloadTradingLedger', "Micro date-filtered performance")
html = replace_once(
    html,
    '  async function loadTradingLedger(){try{const response=await fetch("/api/engine/ledger",{headers:{Accept:"application/json"},credentials:"same-origin",cache:"no-store"}),payload=await response.json();if(response.ok)renderTradingLedger(payload.ledger);}catch{}}',
    '  async function loadTradingLedger(limit=state.ledgerLimit){state.ledgerLimit=limit;try{const response=await fetch(`/api/engine/ledger?limit=${encodeURIComponent(limit)}`,{headers:{Accept:"application/json"},credentials:"same-origin",cache:"no-store"}),payload=await response.json();if(response.ok)renderTradingLedger(payload.ledger);}catch{}}',
    "Ledger date range depth",
)
new_macro = '''  function renderMacroPerformance(){const fmt=(value,digits=2)=>Number.isFinite(value)?Number(value).toFixed(digits):"—",filtered=filterByDateRange(state.chartCandles,"macro"),minimum=Math.max(...Object.values(resolvedConfiguration(state.selectedInstrument,state.selectedTimeframe)).filter(value=>value&&typeof value==="object").map(value=>Number(value.length)||3),3)*2;el("macroPerformanceScope").textContent=`${rangeLabel(filtered.range,"All loaded completed candles")} · ${filtered.rows.length} candles`;if(filtered.rows.length<minimum){el("macroPerformanceBody").innerHTML=`<tr><td colspan="9">Insufficient completed candles for this date range: ${filtered.rows.length} / ${minimum}</td></tr>`;el("computeConfiguration").disabled=false;return;}try{const analysis=analyzeWithConfiguration(filtered.rows,resolvedConfiguration(state.selectedInstrument,state.selectedTimeframe),true);el("macroPerformanceBody").innerHTML=STRATEGIES.map(strategy=>{const stats=tradeStats(strategyTrades(filtered.rows,analysis,strategy.id,state.selectedInstrument));return `<tr><td>${strategy.label}</td><td>${stats.trades||"—"}</td><td>${stats.trades?`${stats.wins}/${stats.losses}/${stats.flats}`:"—"}</td><td class="${stats.net>=0?"positive":"negative"}">${fmt(stats.net,1)}</td><td>${fmt(stats.average)}</td><td>${fmt(stats.mfeMae)}</td><td>${fmt(stats.maxDrawdown,1)}</td><td>${fmt(stats.profitFactor)}</td><td>${fmt(stats.recoveryFactor)}</td></tr>`;}).join("");}catch(error){el("macroPerformanceBody").innerHTML=`<tr><td colspan="9">${error.message||"Performance calculation failed"}</td></tr>`;}el("computeConfiguration").disabled=false;}
'''
html = regex_once(html, r'  function renderMacroPerformance\(\)\{.*?\}\n  function applyConfiguration', new_macro + '  function applyConfiguration', "Macro date-filtered performance")
diagnostic_functions = '''  function diagnosticCards(entries){el("platformDiagnosticGrid").innerHTML=entries.map(item=>`<div class="diagnostic-card ${item.good===true?"good":item.good===false?"bad":""}"><span>${item.label}</span><strong>${item.value}</strong></div>`).join("");}
  async function runPlatformDiagnostic(open=true){if(open)el("platformDiagnosticDetails").open=true;el("platformDiagnosticStatus").textContent="Scanning…";const started=performance.now();try{const response=await fetch(`/api/platform/diagnostic?instrument=${encodeURIComponent(state.selectedInstrument)}&granularity=${encodeURIComponent(state.selectedTimeframe)}`,{headers:{Accept:"application/json"},credentials:"same-origin",cache:"no-store"}),server=await response.json().catch(()=>({}));if(!response.ok)throw new Error(server.error||`HTTP ${response.status}`);const browserLatency=Math.round(performance.now()-started),failures=state.scheduleFailures.size,telemetry=server.worker?.telemetry||{},entries=[{label:"Browser → Worker",value:`${browserLatency} ms`,good:browserLatency<5000},{label:"Selected chart lane",value:`${state.candleActive} active · ${state.candleQueue.length} queued`,good:state.candleQueue.filter(job=>job.priority>=80).length===0},{label:"Schedule datasets",value:`${state.scheduleEvaluations.size} / 280 · ${failures} unresolved`,good:failures===0},{label:"Browser candle retries",value:`${state.candleStats.retries} retries · ${state.candleStats.timeouts} timeouts`,good:state.candleStats.timeouts===0},{label:"Worker OANDA queue",value:`${server.worker?.oandaActive??"—"} active · ${server.worker?.oandaQueued??"—"} queued`,good:Number(server.worker?.oandaQueued||0)<4},{label:"OANDA summary",value:`${server.oanda?.summaryLatencyMs??"—"} ms`,good:Number(server.oanda?.summaryLatencyMs)<5000},{label:"OANDA candles",value:`${server.oanda?.completedCandles??0} candles · ${server.oanda?.candleLatencyMs??"—"} ms`,good:Number(server.oanda?.completedCandles)>0},{label:"Engine",value:server.engine?.reachable?`Armed · ${server.engine.lastError||"no error"}`:"Unreachable",good:Boolean(server.engine?.reachable)&&!server.engine?.lastError},{label:"Optimizer",value:`${server.engine?.optimizerCoverage??0} / ${server.engine?.optimizerTotal??280} · ${server.engine?.optimizerLastError||"no error"}`,good:!server.engine?.optimizerLastError},{label:"Worker failures",value:`${telemetry.failures||0} failures · ${telemetry.timeouts||0} timeouts`,good:Number(telemetry.timeouts||0)===0},{label:"Cross-device state",value:state.preferenceSyncStatus||"Pending",good:/Synchronized/.test(state.preferenceSyncStatus||"")},{label:"Jules clone proposal",value:server.cloneAssessment?.verdict||"structuredClone hot path absent",good:true}];state.diagnosticLast={server,entries,time:new Date().toISOString()};diagnosticCards(entries);el("platformDiagnosticStatus").textContent=`Completed ${new Date().toLocaleTimeString()} · ${failures?`${failures} unresolved datasets`:"all current checks reported"}`;}catch(error){diagnosticCards([{label:"Diagnostic failure",value:error.message||"Scan failed",good:false}]);el("platformDiagnosticStatus").textContent=error.message||"Diagnostic scan failed";}}
'''
html = replace_once(html, '  function updateDateTime(){', diagnostic_functions + '\n  function updateDateTime(){', "Platform diagnostic browser scan")
html = replace_once(
    html,
    '      await loadTradeCapacity();void loadChart();void loadSchedule();',
    '      await loadTradeCapacity();void loadChart();void loadSchedule();void runPlatformDiagnostic(false);',
    "Automatic post-connect diagnostic",
)
html = replace_once(
    html,
    '    el("downloadTradingLedger").addEventListener("click",downloadTradingLedger);',
    '''    el("downloadTradingLedger").addEventListener("click",downloadTradingLedger);
    el("runPlatformDiagnostic").addEventListener("click",()=>runPlatformDiagnostic(true));
    for(const id of ["microStartDate","microEndDate"]){el(id).addEventListener("change",()=>{const ranged=Boolean(el("microStartDate").value||el("microEndDate").value);void loadTradingLedger(ranged?5000:500);});}
    el("microClearDates").addEventListener("click",()=>{el("microStartDate").value="";el("microEndDate").value="";void loadTradingLedger(500);queuePlatformPreferenceSave?.();});
    for(const id of ["macroStartDate","macroEndDate"]){el(id).addEventListener("change",()=>{renderMacroPerformance();queuePlatformPreferenceSave?.();});}
    el("macroClearDates").addEventListener("click",()=>{el("macroStartDate").value="";el("macroEndDate").value="";renderMacroPerformance();queuePlatformPreferenceSave?.();});''',
    "Date and diagnostic event handlers",
)
html = replace_once(
    html,
    'setInterval(()=>{if(state.connected)void loadTradingLedger();},5000);',
    'setInterval(()=>{if(state.connected)void loadTradingLedger(state.ledgerLimit);},5000);',
    "Preserve ledger date-range depth",
)
html_path.write_text(html)

check_worker_path = Path("scripts/check-worker.mjs")
check_worker = check_worker_path.read_text()
check_worker = replace_once(
    check_worker,
    '  [/requestCount/,"count-aware candle cache"],',
    '  [/requestCount/,"count-aware candle cache"],\n  [/handlePlatformDiagnostic/,"platform diagnostic endpoint"],\n  [/oandaTelemetry/,"OANDA retry telemetry"],',
    "Worker diagnostic checks",
)
check_worker_path.write_text(check_worker)

check_html_path = Path("scripts/check-html.mjs")
check_html = check_html_path.read_text()
check_html = replace_once(
    check_html,
    '"MAX_CANDLE_REQUESTS=3","eventLoadedKey"',
    '"MAX_CANDLE_REQUESTS=3","eventLoadedKey","macroStartDate","microStartDate","Platform Diagnostic Scan","MAX_BACKGROUND_CANDLE_REQUESTS=2"',
    "HTML performance and diagnostic checks",
)
check_html_path.write_text(check_html)

test_path = Path("scripts/test-runtime.mjs")
test = test_path.read_text()
test = replace_once(
    test,
    'assert.doesNotMatch(html,/Fixed controls/);',
    'assert.doesNotMatch(html,/Fixed controls/);assert.match(html,/macroStartDate/);assert.match(html,/microStartDate/);assert.match(html,/runPlatformDiagnostic/);assert.match(html,/MAX_BACKGROUND_CANDLE_REQUESTS=2/);assert.doesNotMatch(html,/structuredClone\\s*\\(/);',
    "Performance diagnostics runtime assertions",
)
test_path.write_text(test)

Path("scripts/performance-diagnostics-trigger").unlink(missing_ok=True)
Path("scripts/performance-diagnostics-trigger-2").unlink(missing_ok=True)
Path(__file__).unlink(missing_ok=True)
