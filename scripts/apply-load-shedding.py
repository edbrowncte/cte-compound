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


html_path = Path("public/index.html")
html = html_path.read_text()

html = replace_once(
    html,
    '''    scheduleController:null,
    chartController:null,
    chartCandles:[],''',
    '''    scheduleController:null,
    scheduleLoading:false,
    scheduleMode:"",
    progressiveScheduleTimer:null,
    chartController:null,
    chartLoading:false,
    chartCandles:[],''',
    "load state",
)
html = replace_once(
    html,
    '''    positionStreamSignature:"",
    engineConfig:''',
    '''    positionStreamSignature:"",
    liveRenderTimer:null,
    engineConfig:''',
    "live render timer state",
)
html = replace_once(
    html,
    '''    candleActive:0,
    candleSequence:0,''',
    '''    candleActive:0,
    candleForegroundActive:0,
    candleSequence:0,''',
    "foreground request state",
)

queue_block = '''  const MAX_CANDLE_REQUESTS=1,MAX_BACKGROUND_CANDLE_REQUESTS=1,CANDLE_TIMEOUT_MS=25000;
  function foregroundCandleDemand(){return state.chartLoading||state.candleForegroundActive>0||state.candleQueue.some(job=>job.priority>=80);}
  function pumpCandleQueue(){while(state.candleQueue.length){state.candleQueue.sort((a,b)=>b.priority-a.priority||a.sequence-b.sequence);const next=state.candleQueue[0],foreground=next.priority>=80;if(foreground){if(state.candleActive>=MAX_CANDLE_REQUESTS)break;}else if(foregroundCandleDemand()||state.candleActive>=MAX_BACKGROUND_CANDLE_REQUESTS)break;const job=state.candleQueue.shift();if(job.signal?.aborted){job.reject(new DOMException("Aborted","AbortError"));continue;}state.candleActive++;if(foreground)state.candleForegroundActive++;fetchCandleJob(job).then(job.resolve,job.reject).finally(()=>{state.candleActive--;if(foreground)state.candleForegroundActive--;pumpCandleQueue();});}}
  async function fetchCandleJob(job){let lastError=null;for(let attempt=0;attempt<3;attempt++){if(job.signal?.aborted)throw new DOMException("Aborted","AbortError");const controller=new AbortController(),relay=()=>controller.abort(),timer=setTimeout(()=>controller.abort(),CANDLE_TIMEOUT_MS);job.signal?.addEventListener("abort",relay,{once:true});state.candleStats.requested++;try{const response=await fetch(`/api/oanda/candles?instrument=${encodeURIComponent(job.instrument)}&granularity=${encodeURIComponent(job.timeframe)}&count=${encodeURIComponent(job.count)}`,{method:"GET",headers:{Accept:"application/json"},credentials:"same-origin",cache:"no-store",signal:controller.signal}),payload=await response.json().catch(()=>({error:`HTTP ${response.status}`}));if(!response.ok){const error=new Error(payload.errorMessage||payload.error||payload.message||`HTTP ${response.status}`);error.status=response.status;state.candleStats.statuses[response.status]=Number(state.candleStats.statuses[response.status]||0)+1;throw error;}state.candleStats.succeeded++;return payload;}catch(error){if(job.signal?.aborted)throw new DOMException("Aborted","AbortError");const timedOut=controller.signal.aborted;if(timedOut){state.candleStats.timeouts++;lastError=new Error(`OANDA candle request timed out · ${formatPair(job.instrument)} ${job.timeframe}`);lastError.status=504;}else lastError=error;const status=Number(lastError?.status)||0,retryable=timedOut||status===429||status>=500;if(!retryable||attempt===2){state.candleStats.failed++;throw lastError;}state.candleStats.retries++;await new Promise(resolve=>setTimeout(resolve,700*(2**attempt)+Math.floor(Math.random()*300)));}finally{clearTimeout(timer);job.signal?.removeEventListener("abort",relay);}}throw lastError||new Error("Candle request failed.");}
  function queueCandleRequest(instrument,timeframe,count,priority=0,signal=null){const key=`${instrument}|${timeframe}|${count}`;let request=state.candleInflight.get(key);if(!request){request=new Promise((resolve,reject)=>{state.candleQueue.push({instrument,timeframe,count,priority,sequence:state.candleSequence++,resolve,reject,signal});pumpCandleQueue();});state.candleInflight.set(key,request);request.then(()=>state.candleInflight.delete(key),()=>state.candleInflight.delete(key));}if(!signal)return request;if(signal.aborted)return Promise.reject(new DOMException("Aborted","AbortError"));return Promise.race([request,new Promise((_,reject)=>signal.addEventListener("abort",()=>reject(new DOMException("Aborted","AbortError")),{once:true}))]);}
  async function oanda'''
html = regex_once(
    html,
    r'  const MAX_CANDLE_REQUESTS=.*?\n  async function oanda',
    queue_block,
    "exclusive candle queue",
)

old_live = '''  function setPositionPrice(price){
    if(price?.type!=="PRICE"||!price.instrument)return;
    const bid=Number(price.closeoutBid??price.bids?.[0]?.price),ask=Number(price.closeoutAsk??price.asks?.[0]?.price);
    state.positionPrices.set(price.instrument,{bid,ask,time:price.time});renderOpenPositions();
    if(price.instrument===state.selectedInstrument){updateChartSummary();drawChart();}
    if(price.instrument===el("eventPair").value&&state.eventData)eventDraw(state.eventData,state.eventHtl,state.eventEvents);
  }
'''
new_live = '''  function flushLivePriceRender(){state.liveRenderTimer=null;renderOpenPositions();updateChartSummary();if(state.chartCandles.length)drawChart();if(state.eventData&&pricePanelVisible("event"))eventDraw(state.eventData,state.eventHtl,state.eventEvents);}
  function pricePanelVisible(name){return !el(`${name}Panel`)?.hidden&&!document.hidden;}
  function setPositionPrice(price){
    if(price?.type!=="PRICE"||!price.instrument)return;
    const bid=Number(price.closeoutBid??price.bids?.[0]?.price),ask=Number(price.closeoutAsk??price.asks?.[0]?.price);
    state.positionPrices.set(price.instrument,{bid,ask,time:price.time});
    if(!state.liveRenderTimer)state.liveRenderTimer=setTimeout(flushLivePriceRender,250);
  }
'''
html = replace_once(html, old_live, new_live, "throttled live rendering")
html = replace_once(html, 'state.positionStreamSignature="";state.openPositions=[];', 'state.positionStreamSignature="";clearTimeout(state.liveRenderTimer);state.liveRenderTimer=null;state.openPositions=[];', "clear live render timer")
html = replace_once(html, 'state.positionTimer=setInterval(refreshOpenPositions,3000);', 'state.positionTimer=setInterval(refreshOpenPositions,10000);', "position polling interval")

html = replace_once(
    html,
    '      await loadTradeCapacity();void loadChart();void loadSchedule();void runPlatformDiagnostic(false);',
    '      await loadTradeCapacity();await loadChart();void loadSchedule("focused");setTimeout(()=>{if(state.connected&&!state.chartLoading)void runPlatformDiagnostic(false);},5000);',
    "foreground-first connection startup",
)
html = replace_once(
    html,
    'state.connected=false;state.scheduleCandles.clear();state.scheduleEvaluations.clear();state.candleQueue=[];state.candleInflight.clear();state.eventLoadedKey="";',
    'state.connected=false;clearTimeout(state.progressiveScheduleTimer);state.progressiveScheduleTimer=null;state.scheduleLoading=false;state.scheduleMode="";state.chartLoading=false;state.scheduleCandles.clear();state.scheduleEvaluations.clear();state.candleQueue=[];state.candleInflight.clear();state.eventLoadedKey="";',
    "disconnect load reset",
)

schedule_block = '''  function orderedScheduleJobs(){const engineTimeframe=state.engineConfig.timeframe,selectedTimeframe=state.selectedTimeframe,selectedPair=state.selectedInstrument;return TIMEFRAMES.flatMap(timeframe=>INSTRUMENTS.map(instrument=>({instrument,timeframe,weight:(instrument===selectedPair?8:0)+(timeframe===engineTimeframe?4:0)+(timeframe===selectedTimeframe?2:0)}))).sort((a,b)=>b.weight-a.weight||TIMEFRAMES.indexOf(a.timeframe)-TIMEFRAMES.indexOf(b.timeframe)||a.instrument.localeCompare(b.instrument));}
  function scheduleJobsForMode(mode){const all=orderedScheduleJobs(),key=job=>scheduleKey(job.instrument,job.timeframe);if(mode==="full")return all;if(mode==="focused")return all.filter(job=>job.instrument===state.selectedInstrument||job.timeframe===state.engineConfig.timeframe||job.timeframe===state.selectedTimeframe);return all.filter(job=>!state.scheduleEvaluations.has(key(job))).sort((a,b)=>(state.scheduleFailures.has(key(a))?1:0)-(state.scheduleFailures.has(key(b))?1:0)).slice(0,6);}
  function queueProgressiveSchedule(delay=1600){clearTimeout(state.progressiveScheduleTimer);state.progressiveScheduleTimer=setTimeout(()=>{state.progressiveScheduleTimer=null;if(!state.connected)return;if(state.chartLoading||state.scheduleLoading||document.hidden){queueProgressiveSchedule(2200);return;}void loadSchedule("progressive");},delay);}
  async function loadSchedule(mode="full") {
    if(!state.connected)return;
    if(state.scheduleLoading){if(mode==="full")state.scheduleController?.abort();else return;}
    clearTimeout(state.progressiveScheduleTimer);state.progressiveScheduleTimer=null;
    state.scheduleController?.abort();const controller=new AbortController();state.scheduleController=controller;state.scheduleLoading=true;state.scheduleMode=mode;el("refreshSchedule").disabled=true;
    const jobs=scheduleJobsForMode(mode),total=INSTRUMENTS.length*TIMEFRAMES.length,resolved=new Set();let lastError="";
    if(mode==="full"){state.scheduleFailures.clear();document.querySelectorAll(".signal-cell").forEach(cell=>cell.classList.add("loading"));}
    else for(const job of jobs)document.querySelectorAll(`.signal-cell[data-instrument="${job.instrument}"][data-timeframe="${job.timeframe}"]`).forEach(cell=>cell.classList.add("loading"));
    const progress=()=>{const available=state.scheduleEvaluations.size;if(mode==="focused")el("progressText").textContent=`Priority ${resolved.size} / ${jobs.length} · ${available} / ${total} available`;else if(mode==="progressive")el("progressText").textContent=`Background ${available} / ${total} · ${state.scheduleFailures.size} unresolved`;else el("progressText").textContent=`Loading ${available} / ${total} datasets · ${state.scheduleFailures.size} unresolved`;el("progressFill").style.width=`${available/total*100}%`;};
    const runJobs=async(items,priority)=>runPool(items,1,async job=>{const key=scheduleKey(job.instrument,job.timeframe);try{await loadScheduleDataset(job.instrument,job.timeframe,controller,priority);resolved.add(key);state.scheduleFailures.delete(key);}catch(error){if(error.name!=="AbortError"){lastError=error.message||"Candle load failed";const prior=state.scheduleFailures.get(key);state.scheduleFailures.set(key,{instrument:job.instrument,timeframe:job.timeframe,error:lastError,attempts:Number(prior?.attempts||0)+1});}}finally{progress();}});
    try{
      if(jobs.length)await runJobs(jobs,mode==="focused"?50:mode==="progressive"?5:15);
      if(!controller.signal.aborted&&mode!=="progressive"){const keys=new Set(jobs.map(job=>scheduleKey(job.instrument,job.timeframe))),retry=[...state.scheduleFailures.values()].filter(job=>keys.has(scheduleKey(job.instrument,job.timeframe))&&job.attempts<2).map(({instrument,timeframe})=>({instrument,timeframe}));if(retry.length){el("progressText").textContent=`Retrying ${retry.length} priority datasets`;await new Promise(resolve=>setTimeout(resolve,1000));await runJobs(retry,mode==="focused"?55:20);}}
      if(!controller.signal.aborted){const available=state.scheduleEvaluations.size;el("progressFill").style.width=`${available/total*100}%`;el("progressText").textContent=available===total?`Loaded ${available} / ${total} datasets`:mode==="focused"?`Priority ready · ${available} / ${total} datasets · background continuation queued`:`Background ${available} / ${total} · ${state.scheduleFailures.size} unresolved${lastError?` · ${lastError}`:""}`;el("scheduleStamp").textContent=`Last schedule update ${new Date().toLocaleTimeString()} · completed candles only`;renderMtfForecast();queueAutomaticOptimization();if(available===total)startAdaptiveMonitor();else queueProgressiveSchedule();if(mode==="full")setTimeout(()=>{if(state.connected&&!state.chartLoading)void runPlatformDiagnostic(false);},1500);}
    } finally {if(state.scheduleController===controller)state.scheduleController=null;state.scheduleLoading=false;state.scheduleMode="";el("refreshSchedule").disabled=!state.connected;if(state.connected&&!controller.signal.aborted&&state.scheduleEvaluations.size<total)queueProgressiveSchedule();}
  }

  function applyChartDataset'''
html = regex_once(
    html,
    r'  async function loadSchedule\(\) \{.*?\n  \}\n\n  function applyChartDataset',
    schedule_block,
    "progressive schedule loading",
)

chart_block = '''  function chartRequestCount(instrument,timeframe){const resolved=resolvedConfiguration(instrument,timeframe),selected=state.selectedStrategy,lengths=selected==="COMBO"?[resolved.DARE?.length,resolved.NAI?.length]:[resolved[selected]?.length],length=Math.max(3,...lengths.map(value=>Number(value)||3)),warmup=Math.max(120,length*3);return clamp(Math.ceil(state.visibleBars+warmup),240,650);}
  async function loadChart(instrument=state.selectedInstrument,timeframe=state.selectedTimeframe) {
    if(!state.connected)return;
    clearTimeout(state.progressiveScheduleTimer);state.progressiveScheduleTimer=null;state.chartLoading=true;state.scheduleController?.abort();state.chartController?.abort();await new Promise(resolve=>setTimeout(resolve,0));
    const controller=new AbortController();state.chartController=controller,count=chartRequestCount(instrument,timeframe);
    el("refreshChart").disabled=true;el("chartMessage").hidden=false;el("chartMessage").textContent=`Loading ${count} completed OANDA candles…`;
    try {
      const payload=await oanda(`/v3/instruments/${encodeURIComponent(instrument)}/candles?price=M&granularity=${encodeURIComponent(timeframe)}&count=${count}`,controller,100),candles=completedCandles(payload,instrument,timeframe),key=scheduleKey(instrument,timeframe);
      state.chartCache.set(key,candles);state.scheduleCandles.set(key,candles);applyChartDataset(instrument,timeframe,candles);
    } catch (error) {
      if(error.name!=="AbortError"&&instrument===state.selectedInstrument&&timeframe===state.selectedTimeframe){const cached=state.chartCache.get(scheduleKey(instrument,timeframe))||state.scheduleCandles.get(scheduleKey(instrument,timeframe));if(cached?.length){applyChartDataset(instrument,timeframe,cached);el("chartMessage").hidden=false;el("chartMessage").textContent=`Showing cached completed candles · ${error.message||"full refresh unavailable"}`;}else{el("chartMessage").hidden=false;el("chartMessage").textContent=error.message||"Chart load failed.";state.chartCandles=[];state.chartAnalysis=null;state.chartCausalIndicators=null;state.chartCausalSeries=[];updateChartSummary();updateCompartments();drawChart();}}
    } finally {if(state.chartController===controller)state.chartController=null;state.chartLoading=false;pumpCandleQueue();if(!controller.signal.aborted)el("refreshChart").disabled=false;if(state.connected)queueProgressiveSchedule(1200);}
  }

  function updateChartSummary'''
html = regex_once(
    html,
    r'  async function loadChart\(instrument=state\.selectedInstrument,timeframe=state\.selectedTimeframe\) \{.*?\n  \}\n\n  function updateChartSummary',
    chart_block,
    "dynamic foreground chart loading",
)

html = replace_once(html, 'async function refreshAdaptiveTimeframe(){if(!state.connected||state.adaptiveBusy)return;', 'async function refreshAdaptiveTimeframe(){if(!state.connected||state.adaptiveBusy||state.chartLoading||state.scheduleLoading||document.hidden)return;', "adaptive load guard")
html = replace_once(html, 'await runPool(INSTRUMENTS,4,async pair=>', 'await runPool(INSTRUMENTS,1,async pair=>', "adaptive concurrency")
html = replace_once(html, 'state.adaptiveTimer=setInterval(refreshAdaptiveTimeframe,60000);', 'state.adaptiveTimer=setInterval(refreshAdaptiveTimeframe,300000);', "adaptive interval")
html = replace_once(html, 'runPool(pairs,2,async pair=>', 'runPool(pairs,1,async pair=>', "event forecast concurrency")
html = replace_once(html, '  async function refreshSelectedEventChart(){if(!state.connected||state.eventLoading)return;', '  async function refreshSelectedEventChart(){if(!state.connected||state.eventLoading)return;state.scheduleController?.abort();clearTimeout(state.progressiveScheduleTimer);', "event refresh foreground priority")
html = replace_once(html, '    el("refreshSchedule").addEventListener("click",loadSchedule);', '    el("refreshSchedule").addEventListener("click",()=>loadSchedule("full"));', "manual full schedule binding")
html = replace_once(html, 'if(name===\'event\'){const key=', 'if(name===\'event\'){state.scheduleController?.abort();clearTimeout(state.progressiveScheduleTimer);const key=', "event facility foreground priority")

old_boot = 'buildSelectors(); el("eventPair").innerHTML=el("chartPair").innerHTML; el("eventTimeframe").innerHTML=el("chartTimeframe").innerHTML; el("eventTimeframe").value=state.selectedTimeframe; buildMatrix(); buildCompartments(); renderStrategyConfiguration(); bindEvents(); updateDateTime();setInterval(updateDateTime,1000);setInterval(()=>{if(state.connected)void loadTradingLedger(state.ledgerLimit);},5000);setInterval(()=>{if(state.connected)void loadEngineStatus();},15000);setInterval(()=>{if(state.connected)void loadOptimizerRecords();},60000);updateChartSummary(); updateCompartments(); drawChart(); void connect();'
new_boot = 'buildSelectors(); el("eventPair").innerHTML=el("chartPair").innerHTML; el("eventTimeframe").innerHTML=el("chartTimeframe").innerHTML; el("eventTimeframe").value=state.selectedTimeframe; buildMatrix(); buildCompartments(); renderStrategyConfiguration(); bindEvents(); updateDateTime();setInterval(updateDateTime,1000);setInterval(()=>{if(state.connected&&!document.hidden&&!state.chartLoading)void loadTradingLedger(state.ledgerLimit);},15000);setInterval(()=>{if(state.connected&&!document.hidden&&!state.chartLoading)void loadEngineStatus();},30000);setInterval(()=>{if(state.connected&&!document.hidden&&!state.chartLoading)void loadOptimizerRecords();},120000);updateChartSummary(); updateCompartments(); drawChart(); void connect();'
html = replace_once(html, old_boot, new_boot, "background polling cadence")

html_path.write_text(html)

check_html_path = Path("scripts/check-html.mjs")
check_html = check_html_path.read_text()
check_html = replace_once(check_html, '"MAX_BACKGROUND_CANDLE_REQUESTS=2"', '"MAX_BACKGROUND_CANDLE_REQUESTS=1","queueProgressiveSchedule","chartRequestCount","foregroundCandleDemand"', "load shedding HTML checks")
check_html_path.write_text(check_html)

test_path = Path("scripts/test-runtime.mjs")
test = test_path.read_text()
test = replace_once(test, 'assert.match(html,/MAX_BACKGROUND_CANDLE_REQUESTS=2/);', 'assert.match(html,/MAX_BACKGROUND_CANDLE_REQUESTS=1/);assert.match(html,/foregroundCandleDemand/);assert.match(html,/queueProgressiveSchedule/);assert.match(html,/scheduleJobsForMode/);assert.match(html,/chartRequestCount/);assert.match(html,/await loadChart\\(\\);void loadSchedule\\("focused"\\)/);assert.match(html,/setInterval\\(refreshOpenPositions,10000\\)/);assert.match(html,/setInterval\\(refreshAdaptiveTimeframe,300000\\)/);assert.match(html,/runPool\\(pairs,1,async pair=>/);', "load shedding runtime assertions")
test_path.write_text(test)

Path(__file__).unlink(missing_ok=True)
