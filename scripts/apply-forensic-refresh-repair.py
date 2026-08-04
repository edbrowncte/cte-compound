from pathlib import Path
import json


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected 1 occurrence, found {count}")
    return text.replace(old, new, 1)


html_path = Path("public/index.html")
html = html_path.read_text()

old_completed = '''  function completedCandles(payload,instrument="",timeframe="") {
    if(payload?.instrument&&instrument&&payload.instrument!==instrument)throw new Error(`Candle identity mismatch: requested ${formatPair(instrument)}, received ${formatPair(payload.instrument)}.`);
    if(payload?.granularity&&timeframe&&payload.granularity!==timeframe)throw new Error(`Candle timeframe mismatch: requested ${timeframe}, received ${payload.granularity}.`);
    const candles=(payload.candles||[]).filter(candle=>candle.complete&&candle.mid).map(candle=>({time:candle.time,open:Number(candle.mid.o),high:Number(candle.mid.h),low:Number(candle.mid.l),close:Number(candle.mid.c),volume:Number(candle.volume)||0})).filter(candle=>[candle.open,candle.high,candle.low,candle.close].every(Number.isFinite)&&candle.high>=candle.low);
    return normalizeInstrumentCandles(candles,instrument);
  }'''
new_completed = '''  function completedCandles(payload,instrument="",timeframe="") {
    if(payload?.instrument&&instrument&&payload.instrument!==instrument)throw new Error(`Candle identity mismatch: requested ${formatPair(instrument)}, received ${formatPair(payload.instrument)}.`);
    if(payload?.granularity&&timeframe&&payload.granularity!==timeframe)throw new Error(`Candle timeframe mismatch: requested ${timeframe}, received ${payload.granularity}.`);
    // Canonical Worker rows contain completed midpoint OHLC and normalized OHLC. Normalized-only rows remain accepted for deployment-contract compatibility.
    const source=Array.isArray(payload?.candles)?payload.candles:[],candles=[],rejected={incomplete:0,shape:0,nonFinite:0,ordering:0};
    for(const candle of source){
      if(candle?.complete!==true){rejected.incomplete++;continue;}
      const midpoint=candle?.mid,hasMid=Boolean(midpoint&&[midpoint.o,midpoint.h,midpoint.l,midpoint.c].every(value=>value!==undefined&&value!==null)),hasNormalized=[candle?.open,candle?.high,candle?.low,candle?.close].every(value=>value!==undefined&&value!==null);
      if(!hasMid&&!hasNormalized){rejected.shape++;continue;}
      const open=Number(hasMid?midpoint.o:candle.open),high=Number(hasMid?midpoint.h:candle.high),low=Number(hasMid?midpoint.l:candle.low),close=Number(hasMid?midpoint.c:candle.close);
      if(![open,high,low,close].every(Number.isFinite)){rejected.nonFinite++;continue;}
      if(high<low){rejected.ordering++;continue;}
      candles.push({time:candle.time,open,high,low,close,volume:Number(candle.volume)||0});
    }
    if(source.length&&!candles.length)throw new Error(`Candle contract rejected ${source.length} rows · incomplete ${rejected.incomplete} · missing OHLC ${rejected.shape} · non-finite ${rejected.nonFinite} · invalid range ${rejected.ordering}.`);
    return normalizeInstrumentCandles(candles,instrument);
  }'''
html = replace_once(html, old_completed, new_completed, "canonical candle parser")

html = replace_once(
    html,
    '    const runJobs=async(items,priority)=>runPool(items,1,async job=>{const key=scheduleKey(job.instrument,job.timeframe);',
    '    const runJobs=async(items,priority)=>runPool(items,1,async job=>{if(controller.signal.aborted)return;const key=scheduleKey(job.instrument,job.timeframe);',
    "schedule abort short-circuit",
)
html = replace_once(
    html,
    '    } finally {if(state.scheduleController===controller)state.scheduleController=null;state.scheduleLoading=false;state.scheduleMode="";el("refreshSchedule").disabled=!state.connected;if(state.connected&&!controller.signal.aborted&&state.scheduleEvaluations.size<total)queueProgressiveSchedule();}',
    '    } finally {if(state.scheduleController===controller){state.scheduleController=null;state.scheduleLoading=false;state.scheduleMode="";el("refreshSchedule").disabled=!state.connected;if(state.connected&&!controller.signal.aborted&&state.scheduleEvaluations.size<total)queueProgressiveSchedule();}}',
    "schedule controller ownership",
)
html = replace_once(
    html,
    '    } finally {if(state.chartController===controller)state.chartController=null;state.chartLoading=false;pumpCandleQueue();if(!controller.signal.aborted)el("refreshChart").disabled=false;if(state.connected)queueProgressiveSchedule(1200);}',
    '    } finally {const current=state.chartController===controller;if(current){state.chartController=null;state.chartLoading=false;el("refreshChart").disabled=!state.connected;if(state.connected)queueProgressiveSchedule(1200);}pumpCandleQueue();}',
    "chart controller ownership",
)
html = replace_once(
    html,
    '}finally{state.eventLoading=false;button.disabled=!state.connected;}}',
    '}finally{if(state.eventController===controller){state.eventController=null;state.eventLoading=false;button.disabled=!state.connected;}}}',
    "event refresh controller ownership",
)
html = replace_once(
    html,
    '    finally{state.eventLoading=false;el("loadEvents").disabled=!state.connected;}',
    '    finally{if(state.eventController===controller){state.eventController=null;state.eventLoading=false;el("loadEvents").disabled=!state.connected;}}',
    "event schedule controller ownership",
)
html = replace_once(
    html,
    '    el("refreshChart").addEventListener("click",loadChart);',
    '    el("refreshChart").addEventListener("click",()=>loadChart());',
    "Refresh chart click argument boundary",
)
html = replace_once(
    html,
    'const browserLatency=Math.round(performance.now()-started),failures=state.scheduleFailures.size,telemetry=server.worker?.telemetry||{},entries=[{label:"Browser → Worker",value:`${browserLatency} ms`,good:browserLatency<5000},',
    'const browserLatency=Math.round(performance.now()-started),failures=state.scheduleFailures.size,telemetry=server.worker?.telemetry||{},deployment=server.deployment||{},entries=[{label:"Browser → Worker",value:`${browserLatency} ms`,good:browserLatency<5000},{label:"Worker deployment",value:deployment.versionTag||deployment.versionId||"metadata unavailable",good:Boolean(deployment.versionId)},',
    "deployment diagnostic card",
)
html_path.write_text(html)

worker_path = Path("src/worker.js")
worker = worker_path.read_text()
worker = replace_once(
    worker,
    '\n\nasync function handlePlatformDiagnostic(env,url){',
    '''\n\nfunction deploymentMetadata(env){const metadata=env.CF_VERSION_METADATA||{};return{worker:"cte-compound",versionId:metadata.id||null,versionTag:metadata.tag||null,versionTimestamp:metadata.timestamp||null};}\nasync function handlePlatformVersion(env){return json({deployment:deploymentMetadata(env)});}\n\nasync function handlePlatformDiagnostic(env,url){''',
    "deployment metadata helper",
)
worker = replace_once(
    worker,
    '  return json({time:new Date().toISOString(),totalLatencyMs:Date.now()-started,worker:',
    '  return json({deployment:deploymentMetadata(env),time:new Date().toISOString(),totalLatencyMs:Date.now()-started,worker:',
    "deployment diagnostic payload",
)
worker = replace_once(
    worker,
    '        if(url.pathname==="/api/platform/diagnostic"&&request.method==="GET") return await handlePlatformDiagnostic(env,url);',
    '        if(url.pathname==="/api/platform/version"&&request.method==="GET") return await handlePlatformVersion(env);\n        if(url.pathname==="/api/platform/diagnostic"&&request.method==="GET") return await handlePlatformDiagnostic(env,url);',
    "deployment version route",
)
worker_path.write_text(worker)

wrangler_path = Path("wrangler.toml")
wrangler = wrangler_path.read_text()
if "[version_metadata]" not in wrangler:
    wrangler = wrangler.replace('[ai]\nbinding = "AI"\n', '[ai]\nbinding = "AI"\n\n[version_metadata]\nbinding = "CF_VERSION_METADATA"\n')
wrangler_path.write_text(wrangler)

package_path = Path("package.json")
package = json.loads(package_path.read_text())
package["scripts"]["check"] = "node --check src/worker.js && node --check src/engine.js && node scripts/check-worker.mjs && node scripts/check-html.mjs && node scripts/test-runtime.mjs && node scripts/test-browser.mjs"
package.setdefault("devDependencies", {})["jsdom"] = "29.1.1"
package_path.write_text(json.dumps(package, indent=2) + "\n")

runtime_path = Path("scripts/test-runtime.mjs")
runtime = runtime_path.read_text()
runtime = replace_once(
    runtime,
    'const env={OANDA_API_KEY:token,OANDA_ACCOUNT_ID:accountId};',
    'const env={OANDA_API_KEY:token,OANDA_ACCOUNT_ID:accountId,CF_VERSION_METADATA:{id:"version-1",tag:"source-sha",timestamp:"2026-08-04T18:00:00Z"}};',
    "runtime version metadata fixture",
)
runtime = replace_once(
    runtime,
    'response=await worker.fetch(browser("/api/oanda/candles?instrument=EUR_USD&granularity=M15&count=60"),env);const candlePayload=await response.json();assert.equal(candlePayload.candles[0].mid.c,"1.1");assert.equal(candlePayload.candles[0].close,1.1);',
    'response=await worker.fetch(browser("/api/oanda/candles?instrument=EUR_USD&granularity=M15&count=60"),env);const candlePayload=await response.json();assert.equal(candlePayload.candles[0].mid.c,"1.1");assert.equal(candlePayload.candles[0].close,1.1);response=await worker.fetch(browser("/api/platform/version"),env);assert.equal(response.status,200);const versionPayload=await response.json();assert.equal(versionPayload.deployment.versionId,"version-1");assert.equal(versionPayload.deployment.versionTag,"source-sha");',
    "runtime version route assertion",
)
runtime = replace_once(
    runtime,
    'assert.match(html,/setInterval\\(refreshAdaptiveTimeframe,300000\\)/);assert.match(html,/runPool\\(pairs,1,async pair=>/);',
    'assert.match(html,/setInterval\\(refreshAdaptiveTimeframe,300000\\)/);assert.match(html,/runPool\\(pairs,1,async pair=>/);assert.match(html,/refreshChart"\\)\\.addEventListener\\("click",\\(\\)=>loadChart\\(\\)\\)/);assert.match(html,/const current=state\\.chartController===controller/);assert.match(html,/state\\.scheduleController===controller\\)\\{/);assert.match(html,/hasMid=Boolean/);assert.match(html,/hasNormalized=/);assert.match(html,/Worker deployment/);',
    "runtime refresh boundary assertions",
)
runtime_path.write_text(runtime)

check_html_path = Path("scripts/check-html.mjs")
check_html = check_html_path.read_text()
check_html = replace_once(
    check_html,
    '"minimumUnitAmount","synchronizeMinimumUnits"]',
    '"minimumUnitAmount","synchronizeMinimumUnits","Worker deployment","hasNormalized=","refreshChart\").addEventListener(\"click\",()=>loadChart())"]',
    "HTML refresh boundary checks",
)
check_html_path.write_text(check_html)

check_worker_path = Path("scripts/check-worker.mjs")
check_worker = check_worker_path.read_text()
check_worker = replace_once(
    check_worker,
    '  [/handlePlatformDiagnostic/,"platform diagnostic endpoint"],',
    '  [/handlePlatformDiagnostic/,"platform diagnostic endpoint"],\n  [/handlePlatformVersion/,"deployment version endpoint"],\n  [/CF_VERSION_METADATA/,"Cloudflare version metadata binding"],',
    "Worker version checks",
)
check_worker_path.write_text(check_worker)

Path("scripts/forensic-refresh.trigger").unlink(missing_ok=True)
Path(__file__).unlink(missing_ok=True)
