from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected 1 occurrence, found {count}")
    return text.replace(old, new, 1)


worker_path = Path("src/worker.js")
worker = worker_path.read_text()
worker = replace_once(
    worker,
    'const candleCache=new Map();\nlet oandaActive=0,oandaLastStart=0;\nconst oandaWaiters=[];',
    'const candleCache=new Map();\nconst OANDA_MAX_CONCURRENCY=4,OANDA_REQUEST_TIMEOUT_MS=15000;\nlet oandaActive=0,oandaLastStart=0;\nconst oandaWaiters=[];',
    "worker request constants",
)
worker = replace_once(
    worker,
    '''async function oandaRequest(path,token,init={}) {
  if(oandaActive>=6) await new Promise(resolve=>oandaWaiters.push(resolve));
  oandaActive++;
  const delay=Math.max(0,25-(Date.now()-oandaLastStart));
  if(delay) await new Promise(resolve=>setTimeout(resolve,delay));
  oandaLastStart=Date.now();
  try{
    const response=await fetch(LIVE_OANDA_ORIGIN+path,{
      method:init.method||"GET",
      headers:{Authorization:`Bearer ${token}`,Accept:"application/json",...(init.body?{"Content-Type":"application/json"}:{})},
      body:init.body,
      redirect:"manual",
      cache:"no-store"
    });
    const payload=await response.json().catch(()=>({}));
    if(!response.ok) throw Object.assign(new Error(payload.errorMessage||payload.errorCode||`OANDA HTTP ${response.status}`),{status:response.status,payload});
    return payload;
  } finally {oandaActive--;oandaWaiters.shift()?.();}
}
''',
    '''async function acquireOandaSlot(){if(oandaActive<OANDA_MAX_CONCURRENCY){oandaActive++;return;}await new Promise(resolve=>oandaWaiters.push(resolve));}
function releaseOandaSlot(){const next=oandaWaiters.shift();if(next)next();else oandaActive=Math.max(0,oandaActive-1);}

async function oandaRequest(path,token,init={}) {
  await acquireOandaSlot();
  const delay=Math.max(0,35-(Date.now()-oandaLastStart));
  if(delay) await new Promise(resolve=>setTimeout(resolve,delay));
  oandaLastStart=Date.now();
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),OANDA_REQUEST_TIMEOUT_MS);
  try{
    const response=await fetch(LIVE_OANDA_ORIGIN+path,{
      method:init.method||"GET",
      headers:{Authorization:`Bearer ${token}`,Accept:"application/json",...(init.body?{"Content-Type":"application/json"}:{})},
      body:init.body,
      redirect:"manual",
      cache:"no-store",
      signal:controller.signal
    });
    const payload=await response.json().catch(()=>({}));
    if(!response.ok) throw Object.assign(new Error(payload.errorMessage||payload.errorCode||`OANDA HTTP ${response.status}`),{status:response.status,payload});
    return payload;
  } catch(error){
    if(controller.signal.aborted)throw Object.assign(new Error("OANDA request timed out."),{status:504});
    throw error;
  } finally {clearTimeout(timer);releaseOandaSlot();}
}
''',
    "worker bounded timeout request",
)
worker = replace_once(
    worker,
    '''async function handleCandles(env,url) {
  const {token}=credentials(env),instrument=(url.searchParams.get("instrument")||"").toUpperCase(),granularity=(url.searchParams.get("granularity")||"").toUpperCase();
  if(!INSTRUMENTS.has(instrument)||!GRANULARITIES.has(granularity)) return json({error:"Invalid instrument or granularity."},400);
  const count=Math.max(60,Math.min(1200,Math.trunc(Number(url.searchParams.get("count")))||650));
  const query=new URLSearchParams({price:"M",granularity,count:String(count),smooth:"false"}),key=`${instrument}|${granularity}|${count}`,cached=candleCache.get(key),now=Date.now();
  if(cached?.expires>now)return json(cached.value);
  if(cached?.promise)return json(await cached.promise);
  const ttl={S5:4000,S30:15000,M1:30000,M5:120000,M15:300000,M30:600000,H1:1200000,H4:3600000,D:21600000,W:86400000}[granularity]||30000;
  const promise=oandaRequest(`/v3/instruments/${instrument}/candles?${query}`,token).then(payload=>({instrument,granularity,candles:normalizeCandles(payload),completedOnly:true}));
  candleCache.set(key,{promise,expires:0});
  try{const value=await promise;candleCache.set(key,{value,expires:Date.now()+ttl});if(candleCache.size>1000)candleCache.delete(candleCache.keys().next().value);return json(value);}catch(error){candleCache.delete(key);throw error;}
}
''',
    '''async function handleCandles(env,url) {
  const {token}=credentials(env),instrument=(url.searchParams.get("instrument")||"").toUpperCase(),granularity=(url.searchParams.get("granularity")||"").toUpperCase();
  if(!INSTRUMENTS.has(instrument)||!GRANULARITIES.has(granularity)) return json({error:"Invalid instrument or granularity."},400);
  const count=Math.max(60,Math.min(1200,Math.trunc(Number(url.searchParams.get("count")))||650)),key=`${instrument}|${granularity}`,cached=candleCache.get(key),now=Date.now();
  const select=value=>({...value,candles:(value.candles||[]).slice(-count)});
  if(cached?.value&&cached.expires>now&&cached.count>=count)return json(select(cached.value));
  if(cached?.promise&&cached.count>=count)return json(select(await cached.promise));
  const requestCount=Math.max(count,cached?.count||0),query=new URLSearchParams({price:"M",granularity,count:String(requestCount),smooth:"false"}),ttl={S5:4000,S30:15000,M1:30000,M5:120000,M15:300000,M30:600000,H1:1200000,H4:3600000,D:21600000,W:86400000}[granularity]||30000;
  const promise=oandaRequest(`/v3/instruments/${instrument}/candles?${query}`,token).then(payload=>({instrument,granularity,candles:normalizeCandles(payload),completedOnly:true}));
  candleCache.set(key,{promise,count:requestCount,expires:0,value:cached?.value});
  try{const value=await promise;candleCache.set(key,{value,count:requestCount,expires:Date.now()+ttl});if(candleCache.size>400)candleCache.delete(candleCache.keys().next().value);return json(select(value));}catch(error){if(candleCache.get(key)?.promise===promise)candleCache.delete(key);throw error;}
}
''',
    "worker count-aware candle cache",
)
worker_path.write_text(worker)

engine_path = Path("src/engine.js")
engine = engine_path.read_text()
engine = replace_once(
    engine,
    'configurationSource=value.configurationSource==="FIXED"?"FIXED":"OPTIMIZED";',
    'configurationSource="OPTIMIZED";',
    "force optimized engine configuration",
)
engine_path.write_text(engine)

html_path = Path("public/index.html")
html = html_path.read_text()
html = replace_once(
    html,
    '<select id="engineConfigurationSource"><option value="OPTIMIZED" selected>Pair × timeframe optimizer</option><option value="FIXED">Fixed controls</option></select>',
    '<select id="engineConfigurationSource"><option value="OPTIMIZED" selected>Pair × timeframe optimizer</option></select>',
    "remove fixed configuration option",
)
html = replace_once(
    html,
    '    chartCausalToken:0,\n    eventData:null,',
    '    chartCausalToken:0,\n    candleQueue:[],\n    candleInflight:new Map(),\n    candleActive:0,\n    candleSequence:0,\n    eventController:null,\n    eventLoading:false,\n    eventLoadedKey:"",\n    eventData:null,',
    "browser candle orchestration state",
)
html = replace_once(
    html,
    '''  async function oanda(path,controller) {
    const candle=String(path).match(/^\/v3\/instruments\/([A-Z]{3}_[A-Z]{3})\/candles\?(.*)$/),params=candle?new URLSearchParams(candle[2]):null,url=candle?`/api/oanda/candles?instrument=${encodeURIComponent(candle[1])}&granularity=${encodeURIComponent(params.get("granularity")||"")}&count=${encodeURIComponent(params.get("count")||650)}`:`/api/oanda/proxy?path=${encodeURIComponent(path)}`;
    const response=await fetch(url,{method:"GET",headers:{"Accept":"application/json"},credentials:"same-origin",cache:"no-store",signal:controller?.signal});
    const payload=await response.json().catch(()=>({error:`HTTP ${response.status}`}));
    if (!response.ok) {
      const message=payload.errorMessage||payload.error||payload.message||`HTTP ${response.status}`;
      throw new Error(message);
    }
    return payload;
  }
''',
    '''  const MAX_CANDLE_REQUESTS=3,CANDLE_TIMEOUT_MS=20000;
  function pumpCandleQueue(){while(state.candleActive<MAX_CANDLE_REQUESTS&&state.candleQueue.length){state.candleQueue.sort((a,b)=>b.priority-a.priority||a.sequence-b.sequence);const job=state.candleQueue.shift();if(job.cancelled?.()){job.reject(new DOMException("Aborted","AbortError"));continue;}state.candleActive++;fetchCandleJob(job).then(job.resolve,job.reject).finally(()=>{state.candleActive--;pumpCandleQueue();});}}
  async function fetchCandleJob(job){let lastError=null;for(let attempt=0;attempt<2;attempt++){const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),CANDLE_TIMEOUT_MS);try{const response=await fetch(`/api/oanda/candles?instrument=${encodeURIComponent(job.instrument)}&granularity=${encodeURIComponent(job.timeframe)}&count=${encodeURIComponent(job.count)}`,{method:"GET",headers:{Accept:"application/json"},credentials:"same-origin",cache:"no-store",signal:controller.signal}),payload=await response.json().catch(()=>({error:`HTTP ${response.status}`}));if(!response.ok)throw new Error(payload.errorMessage||payload.error||payload.message||`HTTP ${response.status}`);return payload;}catch(error){lastError=controller.signal.aborted?new Error(`OANDA candle request timed out · ${formatPair(job.instrument)} ${job.timeframe}`):error;}finally{clearTimeout(timer);}if(attempt===0)await new Promise(resolve=>setTimeout(resolve,350));}throw lastError||new Error("Candle request failed.");}
  function queueCandleRequest(instrument,timeframe,count,priority=0,signal=null){const key=`${instrument}|${timeframe}|${count}`;let request=state.candleInflight.get(key);if(!request){request=new Promise((resolve,reject)=>{state.candleQueue.push({instrument,timeframe,count,priority,sequence:state.candleSequence++,resolve,reject,cancelled:()=>Boolean(signal?.aborted)});pumpCandleQueue();});state.candleInflight.set(key,request);request.then(()=>state.candleInflight.delete(key),()=>state.candleInflight.delete(key));}if(!signal)return request;if(signal.aborted)return Promise.reject(new DOMException("Aborted","AbortError"));return Promise.race([request,new Promise((_,reject)=>signal.addEventListener("abort",()=>reject(new DOMException("Aborted","AbortError")),{once:true}))]);}
  async function oanda(path,controller,priority=0) {
    const candle=String(path).match(/^\/v3\/instruments\/([A-Z]{3}_[A-Z]{3})\/candles\?(.*)$/),params=candle?new URLSearchParams(candle[2]):null;
    if(candle)return queueCandleRequest(candle[1],params.get("granularity")||"",Number(params.get("count")||650),priority,controller?.signal);
    const local=new AbortController(),relay=()=>local.abort(),timer=setTimeout(()=>local.abort(),CANDLE_TIMEOUT_MS);controller?.signal?.addEventListener("abort",relay,{once:true});
    try{const response=await fetch(`/api/oanda/proxy?path=${encodeURIComponent(path)}`,{method:"GET",headers:{Accept:"application/json"},credentials:"same-origin",cache:"no-store",signal:local.signal}),payload=await response.json().catch(()=>({error:`HTTP ${response.status}`}));if(!response.ok)throw new Error(payload.errorMessage||payload.error||payload.message||`HTTP ${response.status}`);return payload;}
    catch(error){if(local.signal.aborted&&!controller?.signal?.aborted)throw new Error("OANDA request timed out.");throw error;}
    finally{clearTimeout(timer);controller?.signal?.removeEventListener("abort",relay);}
  }
''',
    "browser bounded shared candle queue",
)
html = replace_once(
    html,
    'configurationSource:config?.configurationSource==="FIXED"?"FIXED":"OPTIMIZED"',
    'configurationSource:"OPTIMIZED"',
    "force optimized browser configuration",
)
html = replace_once(
    html,
    'configurationSource:el("engineConfigurationSource").value',
    'configurationSource:"OPTIMIZED"',
    "force optimized save payload",
)
html = replace_once(
    html,
    '      await Promise.all([loadTradeCapacity(),loadSchedule(),loadChart(),loadEventForecast()]);',
    '      await loadTradeCapacity();void loadChart();void loadSchedule();',
    "nonblocking prioritized startup",
)
html = replace_once(
    html,
    '    state.scheduleController?.abort(); state.chartController?.abort();',
    '    state.scheduleController?.abort();state.chartController?.abort();state.eventController?.abort();',
    "disconnect event cancellation",
)
html = replace_once(
    html,
    '    state.connected=false; state.scheduleCandles.clear(); state.scheduleEvaluations.clear();',
    '    state.connected=false;state.scheduleCandles.clear();state.scheduleEvaluations.clear();state.candleQueue=[];state.candleInflight.clear();state.eventLoadedKey="";',
    "disconnect orchestration reset",
)
html = replace_once(
    html,
    '''  async function loadSchedule() {
    if (!state.connected) return;
    state.scheduleController?.abort();
    const controller=new AbortController(); state.scheduleController=controller;
    el("refreshSchedule").disabled=true;
    document.querySelectorAll(".signal-cell").forEach(cell=>cell.classList.add("loading"));
    let completed=0,errors=0;
    el("progressText").textContent="Loading 0 / 10 timeframes";
    try {
      await runPool(TIMEFRAMES,2,async timeframe=>{
        try {
          await runPool(INSTRUMENTS,4,async instrument=>{
            try {
              const payload=await oanda(`/v3/instruments/${encodeURIComponent(instrument)}/candles?price=M&granularity=${encodeURIComponent(timeframe)}&count=180`,controller);
              const candles=completedCandles(payload);
              const key=scheduleKey(instrument,timeframe);
              state.scheduleCandles.set(key,candles);
              const optimized=state.autoConfigurations.get(key)?.config;
              state.scheduleEvaluations.set(key,optimized?analyzeWithConfiguration(candles,optimized,false):analyzeCandles(candles,false));
              renderScheduleCell(instrument,timeframe);
            } catch (error) { if (error.name!=="AbortError") errors++; }
          });
        } catch (error) { if (error.name!=="AbortError") errors++; }
        completed++;
        el("progressFill").style.width=`${completed/TIMEFRAMES.length*100}%`;
        el("progressText").textContent=`Loading ${completed} / ${TIMEFRAMES.length} timeframes${errors?` · ${errors} errors`:""}`;
      });
      if (!controller.signal.aborted) {
        el("progressText").textContent=`Loaded ${TIMEFRAMES.length} / ${TIMEFRAMES.length}${errors?` · ${errors} errors`:""}`;
        el("scheduleStamp").textContent=`Last schedule refresh ${new Date().toLocaleTimeString()} · completed candles only`;
        renderMtfForecast();queueAutomaticOptimization();startAdaptiveMonitor();
      }
    } finally { if (!controller.signal.aborted) el("refreshSchedule").disabled=false; }
  }
''',
    '''  async function loadSchedule() {
    if(!state.connected)return;
    state.scheduleController?.abort();
    const controller=new AbortController();state.scheduleController=controller;
    el("refreshSchedule").disabled=true;document.querySelectorAll(".signal-cell").forEach(cell=>cell.classList.add("loading"));
    const timeframes=[state.selectedTimeframe,...TIMEFRAMES.filter(item=>item!==state.selectedTimeframe)],instruments=[state.selectedInstrument,...INSTRUMENTS.filter(item=>item!==state.selectedInstrument)],total=TIMEFRAMES.length*INSTRUMENTS.length;
    let completed=0,errors=0,lastError="";el("progressText").textContent=`Loading 0 / ${total} datasets`;
    try{
      await runPool(timeframes,1,async timeframe=>runPool(instruments,3,async instrument=>{
        try{
          const payload=await oanda(`/v3/instruments/${encodeURIComponent(instrument)}/candles?price=M&granularity=${encodeURIComponent(timeframe)}&count=180`,controller,20),candles=completedCandles(payload),key=scheduleKey(instrument,timeframe);
          if(!candles.length)throw new Error(`No completed candles · ${formatPair(instrument)} ${timeframe}`);
          state.scheduleCandles.set(key,candles);const optimized=state.autoConfigurations.get(key)?.config;state.scheduleEvaluations.set(key,analyzeWithConfiguration(candles,optimized||STRATEGY_CONFIG,false));renderScheduleCell(instrument,timeframe);
          if(instrument===state.selectedInstrument&&timeframe===state.selectedTimeframe&&!state.chartCandles.length)applyChartDataset(instrument,timeframe,candles);
        }catch(error){if(error.name!=="AbortError"){errors++;lastError=error.message||"Candle load failed";}}
        finally{completed++;el("progressFill").style.width=`${completed/total*100}%`;el("progressText").textContent=`Loading ${completed} / ${total} datasets${errors?` · ${errors} errors`:""}`;}
      }));
      if(!controller.signal.aborted){el("progressText").textContent=`Loaded ${total-errors} / ${total} datasets${errors?` · ${errors} errors · ${lastError}`:""}`;el("scheduleStamp").textContent=`Last schedule refresh ${new Date().toLocaleTimeString()} · completed candles only`;renderMtfForecast();queueAutomaticOptimization();startAdaptiveMonitor();}
    }finally{if(!controller.signal.aborted)el("refreshSchedule").disabled=false;}
  }
''',
    "bounded dataset-aware schedule",
)
html = replace_once(
    html,
    'const payload=await oanda(`/v3/instruments/${encodeURIComponent(instrument)}/candles?price=M&granularity=${encodeURIComponent(timeframe)}&count=650`,controller),candles=completedCandles(payload),key=scheduleKey(instrument,timeframe);',
    'const payload=await oanda(`/v3/instruments/${encodeURIComponent(instrument)}/candles?price=M&granularity=${encodeURIComponent(timeframe)}&count=650`,controller,100),candles=completedCandles(payload),key=scheduleKey(instrument,timeframe);',
    "prioritized chart request",
)
html = replace_once(
    html,
    '''    } catch (error) {
      if(error.name!=="AbortError"&&instrument===state.selectedInstrument&&timeframe===state.selectedTimeframe){el("chartMessage").hidden=false;el("chartMessage").textContent=error.message||"Chart load failed.";state.chartCandles=[];state.chartAnalysis=null;state.chartCausalIndicators=null;state.chartCausalSeries=[];updateChartSummary();updateCompartments();drawChart();}
    } finally {if(!controller.signal.aborted)el("refreshChart").disabled=false;}
''',
    '''    } catch (error) {
      if(error.name!=="AbortError"&&instrument===state.selectedInstrument&&timeframe===state.selectedTimeframe){const cached=state.chartCache.get(scheduleKey(instrument,timeframe))||state.scheduleCandles.get(scheduleKey(instrument,timeframe));if(cached?.length){applyChartDataset(instrument,timeframe,cached);el("chartMessage").hidden=false;el("chartMessage").textContent=`Showing cached completed candles · ${error.message||"full refresh unavailable"}`;}else{el("chartMessage").hidden=false;el("chartMessage").textContent=error.message||"Chart load failed.";state.chartCandles=[];state.chartAnalysis=null;state.chartCausalIndicators=null;state.chartCausalSeries=[];updateChartSummary();updateCompartments();drawChart();}}
    } finally {if(!controller.signal.aborted)el("refreshChart").disabled=false;}
''',
    "chart cached fallback",
)
html = replace_once(
    html,
    '''  function selectChart(instrument,timeframe) {
    state.selectedInstrument=instrument||state.selectedInstrument;state.selectedTimeframe=timeframe||state.selectedTimeframe;
    el("chartPair").value=state.selectedInstrument;el("chartTimeframe").value=state.selectedTimeframe;markSelectedRow();renderMtfForecast();
    const key=scheduleKey(state.selectedInstrument,state.selectedTimeframe),cached=state.chartCache.get(key)||state.scheduleCandles.get(key);
    if(cached?.length)try{applyChartDataset(state.selectedInstrument,state.selectedTimeframe,cached);}catch{}
    if(state.connected){void startPositionStream(state.openPositions.map(position=>position.instrument));void loadChart(state.selectedInstrument,state.selectedTimeframe);}
    el("chartPanel").scrollIntoView({behavior:"smooth",block:"start"});
  }
''',
    '''  function selectChart(instrument,timeframe) {
    state.selectedInstrument=instrument||state.selectedInstrument;state.selectedTimeframe=timeframe||state.selectedTimeframe;state.chartCausalToken++;
    el("chartPair").value=state.selectedInstrument;el("chartTimeframe").value=state.selectedTimeframe;markSelectedRow();renderMtfForecast();
    const key=scheduleKey(state.selectedInstrument,state.selectedTimeframe),cached=state.chartCache.get(key)||state.scheduleCandles.get(key);
    if(cached?.length)try{applyChartDataset(state.selectedInstrument,state.selectedTimeframe,cached);}catch{}
    else{state.chartCandles=[];state.chartAnalysis=null;state.chartCausalIndicators=null;state.chartCausalSeries=[];el("chartMessage").hidden=false;el("chartMessage").textContent="Loading selected completed OANDA candles…";updateChartSummary();updateCompartments();drawChart();}
    if(state.connected){void startPositionStream(state.openPositions.map(position=>position.instrument));void loadChart(state.selectedInstrument,state.selectedTimeframe);}
    el("chartPanel").scrollIntoView({behavior:"smooth",block:"start"});
  }
''',
    "immediate selected chart state",
)
html = replace_once(
    html,
    '''  async function loadEventForecast(){
    if(!state.connected)return;
    const timeframe=el("eventTimeframe").value,length=clamp(Math.trunc(Number(el("eventLength").value)||10),3,200);el("loadEvents").disabled=true;state.eventRows=[];renderEventSchedule();el("eventMessage").hidden=false;el("eventMessage").textContent=`Loading HTL schedule 0 / ${INSTRUMENTS.length}`;
    let completed=0;
    try{
      await runPool(INSTRUMENTS,4,async pair=>{
        try{const payload=await oanda(`/v3/instruments/${encodeURIComponent(pair)}/candles?price=M&granularity=${encodeURIComponent(timeframe)}&count=650`),data=completedCandles(payload);if(data.length)state.eventRows.push(buildEventRow(pair,data,length));}
        finally{completed++;el("eventMessage").textContent=`Loading HTL schedule ${completed} / ${INSTRUMENTS.length}`;renderEventSchedule();}
      });
      const selected=state.eventRows.find(row=>row.pair===el("eventPair").value)||state.eventRows[0];
      if(selected){el("eventPair").value=selected.pair;renderEventDetail(selected);}else{el("eventMessage").textContent="No completed candles returned.";}updateDecisionDisplays();
    }catch(error){el("eventMessage").hidden=false;el("eventMessage").textContent=error.message||"HTL schedule load failed.";}
    finally{el("loadEvents").disabled=!state.connected;}
  }
''',
    '''  async function loadEventForecast(){
    if(!state.connected||state.eventLoading)return;
    state.eventController?.abort();const controller=new AbortController();state.eventController=controller;state.eventLoading=true;
    const timeframe=el("eventTimeframe").value,length=clamp(Math.trunc(Number(el("eventLength").value)||10),3,200),loadKey=`${timeframe}|${length}`,selectedPair=el("eventPair").value||state.selectedInstrument,pairs=[selectedPair,...INSTRUMENTS.filter(pair=>pair!==selectedPair)];
    el("loadEvents").disabled=true;state.eventRows=[];renderEventSchedule();el("eventMessage").hidden=false;el("eventMessage").textContent=`Loading HTL schedule 0 / ${INSTRUMENTS.length}`;
    let completed=0,errors=0,lastError="";
    try{
      await runPool(pairs,2,async pair=>{
        try{const key=scheduleKey(pair,timeframe),cached=state.chartCache.get(key),payload=cached?.length>=300?{candles:cached.map(c=>({time:c.time,mid:{o:c.open,h:c.high,l:c.low,c:c.close},volume:c.volume,complete:true}))}:await oanda(`/v3/instruments/${encodeURIComponent(pair)}/candles?price=M&granularity=${encodeURIComponent(timeframe)}&count=650`,controller,pair===selectedPair?80:40),data=completedCandles(payload);if(!data.length)throw new Error(`No completed candles · ${formatPair(pair)} ${timeframe}`);const row=buildEventRow(pair,data,length);state.eventRows.push(row);if(pair===selectedPair)renderEventDetail(row);}
        catch(error){if(error.name!=="AbortError"){errors++;lastError=error.message||"Event candle load failed";}}
        finally{completed++;el("eventMessage").textContent=`Loading HTL schedule ${completed} / ${INSTRUMENTS.length}${errors?` · ${errors} errors`:""}`;renderEventSchedule();}
      });
      if(!controller.signal.aborted){state.eventLoadedKey=errors?"":loadKey;const selected=state.eventRows.find(row=>row.pair===selectedPair)||state.eventRows[0];if(selected)renderEventDetail(selected);else{el("eventMessage").hidden=false;el("eventMessage").textContent=`No completed candles returned${lastError?` · ${lastError}`:""}.`;}updateDecisionDisplays();}
    }catch(error){if(error.name!=="AbortError"){el("eventMessage").hidden=false;el("eventMessage").textContent=error.message||"HTL schedule load failed.";}}
    finally{state.eventLoading=false;el("loadEvents").disabled=!state.connected;}
  }
''',
    "selected-first event loader",
)
html = replace_once(
    html,
    '''  function selectFacility(name){for(const facility of ['analysis','event','performance']){const active=name===facility;el(`${facility}Panel`).hidden=!active;el(`${facility}Tab`).setAttribute('aria-selected',String(active));}if(name==='event'&&state.eventData)requestAnimationFrame(()=>eventDraw(state.eventData,state.eventHtl,state.eventEvents));if(name==='performance'){renderStrategyConfiguration();renderMacroPerformance();}}
''',
    '''  function selectFacility(name){for(const facility of ['analysis','event','performance']){const active=name===facility;el(`${facility}Panel`).hidden=!active;el(`${facility}Tab`).setAttribute('aria-selected',String(active));}if(name==='event'){const key=`${el("eventTimeframe").value}|${clamp(Math.trunc(Number(el("eventLength").value)||10),3,200)}`;if(state.eventData)requestAnimationFrame(()=>eventDraw(state.eventData,state.eventHtl,state.eventEvents));if(state.connected&&state.eventLoadedKey!==key&&!state.eventLoading)void loadEventForecast();}if(name==='performance'){renderStrategyConfiguration();renderMacroPerformance();}}
''',
    "lazy event facility loading",
)
html_path.write_text(html)

test_path = Path("scripts/test-runtime.mjs")
test = test_path.read_text()
test = replace_once(
    test,
    'assert.equal(config.strategy,"ASSET");assert.equal(config.configurationSource,"OPTIMIZED");',
    'assert.equal(config.strategy,"ASSET");assert.equal(config.configurationSource,"OPTIMIZED");const forced=await engine.configure({...config,configurationSource:"FIXED"});assert.equal(forced.configurationSource,"OPTIMIZED");',
    "engine optimized migration test",
)
test = replace_once(
    test,
    'assert.match(html,/async function causalIndicatorSet/);assert.match(html,/token!==state\\.chartCausalToken/);',
    'assert.match(html,/async function causalIndicatorSet/);assert.match(html,/token!==state\\.chartCausalToken/);assert.match(html,/MAX_CANDLE_REQUESTS=3/);assert.match(html,/eventLoadedKey/);assert.match(html,/await loadTradeCapacity\\(\\);void loadChart\\(\\);void loadSchedule\\(\\);/);assert.doesNotMatch(html,/Fixed controls/);',
    "loading orchestration assertions",
)
test_path.write_text(test)

check_worker_path = Path("scripts/check-worker.mjs")
check_worker = check_worker_path.read_text()
check_worker = replace_once(
    check_worker,
    '  [/oandaWaiters/,"upstream request limiter"],',
    '  [/oandaWaiters/,"upstream request limiter"],\n  [/OANDA_REQUEST_TIMEOUT_MS/,"upstream timeout boundary"],\n  [/requestCount/,"count-aware candle cache"],',
    "worker loading checks",
)
check_worker_path.write_text(check_worker)

check_html_path = Path("scripts/check-html.mjs")
check_html = check_html_path.read_text()
check_html = replace_once(
    check_html,
    '"refreshCausalChartAnalysis(","/api/oanda/order",">TEST</button>"',
    '"refreshCausalChartAnalysis(","/api/oanda/order",">TEST</button>","MAX_CANDLE_REQUESTS=3","eventLoadedKey"',
    "HTML loading checks",
)
check_html_path.write_text(check_html)

Path(__file__).unlink(missing_ok=True)
