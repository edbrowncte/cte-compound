import fs from "node:fs";
import assert from "node:assert/strict";

const html=fs.readFileSync("public/index.html","utf8");

function between(start,end,label){
  const from=html.indexOf(start);assert.ok(from>=0,`${label}: start anchor missing`);
  const to=html.indexOf(end,from);assert.ok(to>from,`${label}: end anchor missing`);
  return html.slice(from,to);
}

function controlsInOrder(segment,ids,label){
  let cursor=-1;
  for(const id of ids){
    const next=segment.indexOf(`id="${id}"`);
    assert.ok(next>=0,`${label}: missing ${id}`);
    assert.ok(next>cursor,`${label}: ${id} is out of order`);
    cursor=next;
  }
}

const analytical=between('<section class="panel chart-panel" id="chartPanel"','<div class="chart-summary">',"Analytical Compound chart");
controlsInOrder(analytical,["chartPair","chartTimeframe","chartStrategy","chartLength","chartFilter","refreshChart","zoomOut","zoomIn","indentOut","indentIn","crosshairToggle","maximizeChart"],"Analytical Compound chart");

const evaluation=between('<section class="panel chart-panel" id="evalChartPanel"','<div class="chart-summary"',"Evaluation chart");
controlsInOrder(evaluation,["evalChartPair","evalChartTimeframe","evalChartStrategy","evalChartLength","evalChartFilter","evalRefreshChart","evalZoomOut","evalZoomIn","evalIndentOut","evalIndentIn","evalCrosshairToggle","evalMaximizeChart"],"Evaluation chart");

const eventChart=between('<div class="chart-toolbar event-chart-toolbar">','<div class="indicator-legend" id="eventIndicatorLegend"',"HTL Event chart");
controlsInOrder(eventChart,["eventStrategy","refreshEventChart","eventZoomOut","eventZoomIn","eventIndentOut","eventIndentIn","eventCrosshairToggle","eventMaximize"],"HTL Event chart");
for(const deprecated of ["eventChartPair","eventChartTimeframe","eventChartLength","eventChartFilter"])assert.ok(!eventChart.includes(`id="${deprecated}"`),`HTL Event chart must not expose deprecated ${deprecated}`);
assert.ok(eventChart.includes('id="eventStrategy" type="hidden" value="ASSET"'),"HTL Event chart must be fixed to HTL Asset");

const eventSchedule=between('<section class="panel tab-panel" id="eventPanel"','<div class="chart-toolbar event-chart-toolbar">',"HTL schedule");
assert.ok(eventSchedule.includes('id="eventPair"'),"HTL schedule must retain its own pair selector");
assert.ok(eventSchedule.includes('id="eventTimeframe"'),"HTL schedule must retain its own timeframe selector");
assert.ok(eventSchedule.includes('id="eventLength"'),"HTL schedule must retain its own HTL length");
assert.ok(!eventSchedule.includes('id="eventStrategy"'),"HTL schedule must not own the Event chart strategy selector");

const eventRefresh=between('async function refreshSelectedEventChart()','async function loadEventForecast()',"Event chart refresh");
for(const token of ['el("eventPair")','el("eventTimeframe")','el("eventLength")'])assert.ok(eventRefresh.includes(token),`Event chart refresh must use authoritative ${token}`);
for(const deprecated of ["eventChartPair","eventChartTimeframe","eventChartLength","eventChartFilter"])assert.ok(!eventRefresh.includes(deprecated),`Event chart refresh must not use deprecated ${deprecated}`);

const scheduleSelection=between('function selectEventScheduleRow','function eventDraw',"HTL schedule row selection");
assert.ok(scheduleSelection.includes("renderEventDetail(row)"),"HTL schedule row selection must redraw the unified HTL Event chart");

const analyticalApply=between('function applyChartDataset','function loadUnifiedChartCandles',"Analytical chart calculation");
assert.ok(analyticalApply.includes('chartControlConfiguration(instrument,timeframe,state.selectedStrategy,"chartLength","chartFilter")'),"Analytical chart must calculate from its own Length/Filter controls");

const evalLoad=between('async function loadEvalChartData','function drawEvalCharts',"Evaluation chart calculation");
assert.ok(evalLoad.includes('chartControlConfiguration(pair,timeframe,strategy,"evalChartLength","evalChartFilter")'),"Evaluation chart must calculate from its own Strategy/Length/Filter controls");
assert.ok(evalLoad.includes('loadUnifiedChartCandles(pair,timeframe,null,95,true)'),"Evaluation chart must load its own pair/timeframe through the canonical maximum-history loader");

const evalDraw=between('function drawEvalCharts()','function drawOscillatorChart',"Evaluation chart draw");
assert.ok(evalDraw.includes('const pair=el("evalChartPair")?.value||state.selectedInstrument'),"Evaluation chart must resolve its own pair");
assert.ok(evalDraw.includes('timeframe=el("evalChartTimeframe")?.value||state.selectedTimeframe'),"Evaluation chart must resolve its own timeframe");
assert.ok(evalDraw.includes('strategy=el("evalChartStrategy")?.value||state.evaluationSelectedStrategy'),"Evaluation chart must resolve its own indicator");
assert.ok(evalDraw.includes('renderUnifiedChartSurface('),"Evaluation chart must delegate rendering to the canonical shared chart surface");
assert.ok(evalDraw.includes('pair,timeframe,strategy,length'),"Evaluation chart must pass its own controls into the canonical renderer");
assert.ok(!evalDraw.includes('state.chartCandles'),"Evaluation chart must not render the Analytical Compound candle array");
assert.ok(!evalDraw.includes('state.eventData'),"Evaluation chart must not render the HTL Event candle array");

const analyticalDraw=between('function drawChart()','// Canonical HTL series construction.',"Analytical chart draw");
assert.ok(analyticalDraw.includes('renderUnifiedChartSurface('),"Analytical chart must use the same canonical renderer as Evaluation");
const eventDraw=between('function eventDraw(data,htl,events)','function eventHistoryCount',"HTL Event chart draw");
assert.ok(eventDraw.includes('renderUnifiedChartSurface('),"HTL Event chart must use the same canonical renderer as Evaluation");

const evaluationBindings=between('// Evaluation panel event listeners','const evaluationHeaders = [',"Evaluation bindings");
const tableFilter=between('if (el("evalTableTfFilter")) {','const sortHeaders=[',"Evaluation table filter");
assert.ok(!tableFilter.includes('evalChartTimeframe").value = tf'),"Evaluation table timeframe filter must not drive the chart timeframe");
assert.ok(!tableFilter.includes("loadEvalChartData"),"Evaluation table timeframe filter must not refresh or repoint the independent chart");
assert.ok(evaluationBindings.includes('loadEvalChartData(el("evalChartPair").value,el("evalChartTimeframe").value)'),"Evaluation chart controls must load their own pair/timeframe");
assert.ok(!evaluationBindings.includes('loadEvalChartData(state.selectedInstrument'),"Evaluation chart controls must not load the Analytical Compound pair");

console.log("Independent chart controls over one canonical shared chart renderer verified.");
