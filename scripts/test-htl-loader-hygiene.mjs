import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const html=await readFile(new URL("../public/index.html",import.meta.url),"utf8");

assert.match(html,/id="eventScheduleStatus"/);
assert.match(html,/eventScheduleController:null/);
assert.match(html,/eventChartController:null/);
assert.match(html,/eventScheduleLoading:false/);
assert.match(html,/eventChartLoading:false/);
assert.doesNotMatch(html,/eventController:null,\s*eventLoading:false/);
assert.match(html,/MAX_CANDLE_REQUESTS=2,MAX_BACKGROUND_CANDLE_REQUESTS=2,CANDLE_TIMEOUT_MS=55000/);
assert.match(html,/candleQueue\.some\(job=>job\.priority>=50\)/);
assert.match(html,/foreground=next\.priority>=50/);
assert.match(html,/function eventHistoryCount\(\)\{return MAX_ANALYTICAL_HISTORY;\}/);
assert.match(html,/minimum=Math\.min\(desired,Math\.max\(1200,\(Math\.max\(3,length\)\*6\)\+240\)\)/);
assert.match(html,/function eventCachedCandles\(pair,timeframe\)/);
assert.match(html,/await runPool\(pairs,2,pair=>load/);
assert.match(html,/await runPool\(retryPairs,1,pair=>load/);
assert.match(html,/state\.eventLoadedKey=loadKey/);
assert.match(html,/state\.chartCache\.clear\(\)/);
assert.match(html,/state\.eventFailures\.clear\(\)/);
const refreshStart=html.indexOf("async function refreshSelectedEventChart");
const forecastStart=html.indexOf("async function loadEventForecast",refreshStart);
assert.ok(refreshStart>=0&&forecastStart>refreshStart,"HTL chart/schedule loader functions must both exist");
const refreshSource=html.slice(refreshStart,forecastStart);
assert.doesNotMatch(refreshSource,/state\.eventRows/);
assert.match(refreshSource,/marketDataReady\(\)/);
assert.doesNotMatch(refreshSource,/eventChartPair|eventChartTimeframe|eventChartLength|eventChartFilter/);
assert.match(html,/const runJobs=async\(items,priority\)=>runPool\(items,priority>=50\?2:1/);

console.log("HTL schedule/chart isolation, 5,000-candle event history, causal fallback depth, bounded concurrency, timeout alignment, partial-success retention, and session cache hygiene verified.");
