from pathlib import Path
import re


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected 1 occurrence, found {count}")
    return text.replace(old, new, 1)


html_path = Path("public/index.html")
html = html_path.read_text()

html = replace_once(
    html,
    '''        <div class="chart-toolbar event-chart-toolbar">
          <button id="eventZoomOut" type="button">Zoom −</button><button id="eventZoomIn" type="button">Zoom +</button>''',
    '''        <div class="chart-toolbar event-chart-toolbar">
          <button id="refreshEventChart" type="button" disabled>Refresh chart</button>
          <button id="eventZoomOut" type="button">Zoom −</button><button id="eventZoomIn" type="button">Zoom +</button>''',
    "event chart refresh control",
)

html = replace_once(
    html,
    '    diagnosticLast:null,\n    eventController:null,',
    '    diagnosticLast:null,\n    jpyReciprocalCorrections:new Set(),\n    eventController:null,',
    "JPY correction state",
)

old_completed = '''  function completedCandles(payload) {
    return (payload.candles||[]).filter(candle=>candle.complete&&candle.mid).map(candle=>({
      time:candle.time,
      open:Number(candle.mid.o),
      high:Number(candle.mid.h),
      low:Number(candle.mid.l),
      close:Number(candle.mid.c),
      volume:Number(candle.volume)||0
    }));
  }
'''
new_completed = '''  function normalizeInstrumentCandles(candles,instrument){if(!instrument?.endsWith("JPY")||!candles.length)return candles;const closes=candles.map(candle=>candle.close).filter(Number.isFinite).sort((a,b)=>a-b),median=closes[Math.floor(closes.length/2)];if(!Number.isFinite(median)||median>=1)return candles;state.jpyReciprocalCorrections.add(instrument);return candles.map(candle=>{const open=1/candle.open,close=1/candle.close,high=1/candle.low,low=1/candle.high;return{...candle,open,high,low,close};});}
  function completedCandles(payload,instrument="",timeframe="") {
    if(payload?.instrument&&instrument&&payload.instrument!==instrument)throw new Error(`Candle identity mismatch: requested ${formatPair(instrument)}, received ${formatPair(payload.instrument)}.`);
    if(payload?.granularity&&timeframe&&payload.granularity!==timeframe)throw new Error(`Candle timeframe mismatch: requested ${timeframe}, received ${payload.granularity}.`);
    const candles=(payload.candles||[]).filter(candle=>candle.complete&&candle.mid).map(candle=>({time:candle.time,open:Number(candle.mid.o),high:Number(candle.mid.h),low:Number(candle.mid.l),close:Number(candle.mid.c),volume:Number(candle.volume)||0})).filter(candle=>[candle.open,candle.high,candle.low,candle.close].every(Number.isFinite)&&candle.high>=candle.low);
    return normalizeInstrumentCandles(candles,instrument);
  }
'''
html = replace_once(html, old_completed, new_completed, "instrument-aware candle normalization")

html = replace_once(
    html,
    'const payload=await oanda(`/v3/instruments/${encodeURIComponent(instrument)}/candles?price=M&granularity=${encodeURIComponent(timeframe)}&count=180`,controller,priority),candles=completedCandles(payload),key=scheduleKey(instrument,timeframe);',
    'const payload=await oanda(`/v3/instruments/${encodeURIComponent(instrument)}/candles?price=M&granularity=${encodeURIComponent(timeframe)}&count=180`,controller,priority),candles=completedCandles(payload,instrument,timeframe),key=scheduleKey(instrument,timeframe);',
    "schedule candle identity",
)
html = replace_once(
    html,
    'const payload=await oanda(`/v3/instruments/${encodeURIComponent(instrument)}/candles?price=M&granularity=${encodeURIComponent(timeframe)}&count=650`,controller,100),candles=completedCandles(payload),key=scheduleKey(instrument,timeframe);',
    'const payload=await oanda(`/v3/instruments/${encodeURIComponent(instrument)}/candles?price=M&granularity=${encodeURIComponent(timeframe)}&count=650`,controller,100),candles=completedCandles(payload,instrument,timeframe),key=scheduleKey(instrument,timeframe);',
    "chart candle identity",
)
html = replace_once(
    html,
    'const payload=await oanda(`/v3/instruments/${encodeURIComponent(pair)}/candles?price=M&granularity=${encodeURIComponent(timeframe)}&count=180`),candles=completedCandles(payload),key=scheduleKey(pair,timeframe);',
    'const payload=await oanda(`/v3/instruments/${encodeURIComponent(pair)}/candles?price=M&granularity=${encodeURIComponent(timeframe)}&count=180`),candles=completedCandles(payload,pair,timeframe),key=scheduleKey(pair,timeframe);',
    "adaptive candle identity",
)
html = replace_once(
    html,
    '}:await oanda(`/v3/instruments/${encodeURIComponent(pair)}/candles?price=M&granularity=${encodeURIComponent(timeframe)}&count=650`,controller,pair===selectedPair?80:40),data=completedCandles(payload);',
    '}:await oanda(`/v3/instruments/${encodeURIComponent(pair)}/candles?price=M&granularity=${encodeURIComponent(timeframe)}&count=650`,controller,pair===selectedPair?80:40),data=completedCandles(payload,pair,timeframe);',
    "event candle identity",
)

refresh_function = '''  async function refreshSelectedEventChart(){if(!state.connected||state.eventLoading)return;const pair=el("eventPair").value||state.selectedInstrument,timeframe=el("eventTimeframe").value,length=clamp(Math.trunc(Number(el("eventLength").value)||10),3,200),button=el("refreshEventChart"),controller=new AbortController();state.eventController?.abort();state.eventController=controller;state.eventLoading=true;button.disabled=true;el("eventMessage").hidden=false;el("eventMessage").textContent=`Refreshing ${formatPair(pair)} ${timeframe} completed candles…`;try{const payload=await oanda(`/v3/instruments/${encodeURIComponent(pair)}/candles?price=M&granularity=${encodeURIComponent(timeframe)}&count=650`,controller,100),data=completedCandles(payload,pair,timeframe);if(!data.length)throw new Error(`No completed candles · ${formatPair(pair)} ${timeframe}`);const row=buildEventRow(pair,data,length),index=state.eventRows.findIndex(item=>item.pair===pair);if(index>=0)state.eventRows[index]=row;else state.eventRows.push(row);state.chartCache.set(scheduleKey(pair,timeframe),data);renderEventDetail(row);renderEventSchedule();updateDecisionDisplays();el("eventMessage").hidden=true;}catch(error){if(error.name!=="AbortError"){el("eventMessage").hidden=false;el("eventMessage").textContent=error.message||"Event chart refresh failed.";}}finally{state.eventLoading=false;button.disabled=!state.connected;}}
'''
html = replace_once(html, '  async function loadEventForecast(){', refresh_function + '\n  async function loadEventForecast(){', "selected event chart refresh function")

html = replace_once(
    html,
    'el("disconnectButton").disabled=false;el("refreshSchedule").disabled=false;el("refreshChart").disabled=false;el("loadEvents").disabled=false;',
    'el("disconnectButton").disabled=false;el("refreshSchedule").disabled=false;el("refreshChart").disabled=false;el("refreshEventChart").disabled=false;el("loadEvents").disabled=false;',
    "enable event refresh on connect",
)
html = replace_once(
    html,
    'el("connectButton").disabled=false; el("disconnectButton").disabled=true; el("refreshSchedule").disabled=true; el("refreshChart").disabled=true; el("loadEvents").disabled=true;',
    'el("connectButton").disabled=false;el("disconnectButton").disabled=true;el("refreshSchedule").disabled=true;el("refreshChart").disabled=true;el("refreshEventChart").disabled=true;el("loadEvents").disabled=true;',
    "disable event refresh on disconnect",
)
html = replace_once(
    html,
    '    el("loadEvents").addEventListener("click",loadEventForecast);',
    '    el("loadEvents").addEventListener("click",loadEventForecast);\n    el("refreshEventChart").addEventListener("click",refreshSelectedEventChart);',
    "event refresh binding",
)

html = replace_once(
    html,
    '{label:"Jules clone proposal",value:server.cloneAssessment?.verdict||"structuredClone hot path absent",good:true}',
    '{label:"JPY quote normalization",value:state.jpyReciprocalCorrections.size?[...state.jpyReciprocalCorrections].map(formatPair).join(", "):"Native OANDA quote scale",good:true},{label:"Jules clone proposal",value:server.cloneAssessment?.verdict||"structuredClone hot path absent",good:true}',
    "JPY diagnostic card",
)

html_path.write_text(html)

check_html_path = Path("scripts/check-html.mjs")
check_html = check_html_path.read_text()
check_html = replace_once(
    check_html,
    '"causalAnalysisWithConfiguration"',
    '"causalAnalysisWithConfiguration","refreshEventChart","normalizeInstrumentCandles","Candle identity mismatch"',
    "JPY and event refresh HTML checks",
)
check_html_path.write_text(check_html)

test_path = Path("scripts/test-runtime.mjs")
test = test_path.read_text()
test = replace_once(
    test,
    'assert.match(html,/MAX_CANDLE_REQUESTS=3/);',
    'assert.match(html,/MAX_CANDLE_REQUESTS=3/);assert.match(html,/id="refreshEventChart"/);assert.match(html,/refreshSelectedEventChart/);assert.match(html,/normalizeInstrumentCandles/);assert.match(html,/median>=1/);assert.match(html,/high=1\\/candle\\.low,low=1\\/candle\\.high/);assert.match(html,/Candle identity mismatch/);',
    "JPY and refresh runtime assertions",
)
test_path.write_text(test)

Path(__file__).unlink(missing_ok=True)
