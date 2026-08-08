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
controlsInOrder(eventChart,["eventChartPair","eventChartTimeframe","eventStrategy","eventChartLength","eventChartFilter","refreshEventChart","eventZoomOut","eventZoomIn","eventIndentOut","eventIndentIn","eventCrosshairToggle","eventMaximize"],"HTL Event chart");

const eventSchedule=between('<section class="panel tab-panel" id="eventPanel"','<div class="chart-toolbar event-chart-toolbar">',"HTL schedule");
assert.ok(eventSchedule.includes('id="eventPair"'),"HTL schedule must retain its own pair selector");
assert.ok(eventSchedule.includes('id="eventTimeframe"'),"HTL schedule must retain its own timeframe selector");
assert.ok(eventSchedule.includes('id="eventLength"'),"HTL schedule must retain its own HTL length");
assert.ok(!eventSchedule.includes('id="eventStrategy"'),"HTL schedule must not own the Event chart strategy selector");

const eventRefresh=between('async function refreshSelectedEventChart()','async function loadEventForecast()',"Event chart refresh");
for(const token of ['el("eventChartPair")','el("eventChartTimeframe")','el("eventChartLength")'])assert.ok(eventRefresh.includes(token),`Event chart refresh must use ${token}`);
assert.ok(!eventRefresh.includes('el("eventPair").value'),"Event chart refresh must not use schedule pair");
assert.ok(!eventRefresh.includes('el("eventTimeframe").value'),"Event chart refresh must not use schedule timeframe");
assert.ok(!eventRefresh.includes('el("eventLength").value'),"Event chart refresh must not use schedule length");

const scheduleSelection=between('function selectEventScheduleRow','function eventDraw',"HTL schedule row selection");
assert.ok(!scheduleSelection.includes("renderEventDetail"),"HTL schedule row selection must not redraw the independent Event chart");

const analyticalApply=between('function applyChartDataset','function chartRequestCount',"Analytical chart calculation");
assert.ok(analyticalApply.includes('chartControlConfiguration(instrument,timeframe,state.selectedStrategy,"chartLength","chartFilter")'),"Analytical chart must calculate from its own Length/Filter controls");

const evalLoad=between('async function loadEvalChartData','function drawEvalCharts',"Evaluation chart calculation");
assert.ok(evalLoad.includes('chartControlConfiguration(pair,timeframe,strategy,"evalChartLength","evalChartFilter")'),"Evaluation chart must calculate from its own Strategy/Length/Filter controls");

const evalDraw=between('function drawEvalCharts()','function drawOscillatorChart',"Evaluation chart draw");
assert.ok(evalDraw.includes('const evalPair=el("evalChartPair")?.value||state.selectedInstrument'),"Evaluation chart must resolve its own pair");
assert.ok(evalDraw.includes('liveMid(evalPair)'),"Evaluation chart live price must use its own pair");
assert.ok(evalDraw.includes('formatPrice(live, evalPair)'),"Evaluation chart price label must use its own pair");

const evaluationBindings=between('// Evaluation panel event listeners','const evaluationHeaders = [',"Evaluation bindings");
const tableFilter=between('if (el("evalTableTfFilter")) {','const sortHeaders=[',"Evaluation table filter");
assert.ok(!tableFilter.includes('evalChartTimeframe").value = tf'),"Evaluation table timeframe filter must not drive the chart timeframe");
assert.ok(!tableFilter.includes("loadEvalChartData"),"Evaluation table timeframe filter must not refresh or repoint the independent chart");
assert.ok(evaluationBindings.includes('loadEvalChartData(el("evalChartPair").value,el("evalChartTimeframe").value)'),"Evaluation chart controls must load their own pair/timeframe");
assert.ok(!evaluationBindings.includes('loadEvalChartData(state.selectedInstrument'),"Evaluation chart controls must not load the Analytical Compound pair");

console.log("Independent chart-control contract verified.");
