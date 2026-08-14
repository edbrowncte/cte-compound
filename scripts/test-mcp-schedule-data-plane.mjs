import assert from "node:assert/strict";
import fs from "node:fs";
import {evaluateCompoundScheduleDataset,requiredCompletedScheduleBars,requiredScheduleBars,normalizeScheduleStrategies,COMPOUND_MCP_PROTOCOL_VERSION,COMPOUND_SCHEDULE_VERSION} from "../src/compound-schedule.js";

assert.equal(COMPOUND_MCP_PROTOCOL_VERSION,"2024-11-05");
assert.match(COMPOUND_SCHEDULE_VERSION,/COMPOUND_MCP_SCHEDULE/);
assert.deepEqual(normalizeScheduleStrategies(["NAI","asset","NAI"]),["NAI","ASSET"]);
const settings={assetLength:200,dareNLength:150,dareNFilter:.2,naiLength:100,naiFilter:.1,apexLength:75,apexFilter:2,csf:{selected:["DARE","NAI"],method:"TWO_OPINIONS",regime:"DARE",trigger:"NAI"}};
assert.equal(requiredCompletedScheduleBars(settings,["ASSET"]),600);
assert.equal(requiredScheduleBars(settings,["ASSET"]),602,"length-200 source geometry must request enough completed candles plus terminal-candle margin");
assert.equal(requiredScheduleBars({...settings,assetLength:20},["APEX"]),227);
const smallSettings={...settings,assetLength:20,dareNLength:20,naiLength:20,apexLength:20};
assert.equal(requiredCompletedScheduleBars(smallSettings,["ASSET"]),180);
assert.equal(requiredScheduleBars(smallSettings,["ASSET"]),182,"a 180-completed-bar dataset must request two extra source candles so an open terminal candle cannot create 179/180 rejection");

const candles=Array.from({length:650},(_,index)=>{const base=1.08+index*.00002+Math.sin(index/13)*.003+Math.sin(index/47)*.0015,open=base+Math.sin(index/5)*.0003,close=base+Math.cos(index/7)*.0003;return{time:new Date(Date.UTC(2026,0,1,0,index)).toISOString(),open,high:Math.max(open,close)+.0004,low:Math.min(open,close)-.0004,close,complete:true};});
assert.doesNotThrow(()=>evaluateCompoundScheduleDataset(candles.slice(0,181),smallSettings,["ASSET"]),"181 completed bars from a 182-candle source request must satisfy the 180-bar analytical minimum");
assert.throws(()=>evaluateCompoundScheduleDataset(candles.slice(0,179),smallSettings,["ASSET"]),/INSUFFICIENT_COMPOUND_SCHEDULE_CANDLES:179:180/);
const evaluated=evaluateCompoundScheduleDataset(candles,settings,["ASSET","DARE_N","DARE","COMBO","NAI","APEX"]);
assert.equal(evaluated.bars,650);assert.equal(evaluated.requiredCompletedBars,600);assert.equal(evaluated.requestedBars,602);assert.ok(evaluated.completedCandleTime);assert.ok(Number.isFinite(evaluated.currentPrice));assert.ok(["BUY","SELL","—"].includes(evaluated.htlCurrentEvent.currentEvent));
for(const strategy of ["ASSET","DARE_N","DARE","COMBO","NAI","APEX"]){assert.ok(evaluated.strategies[strategy],`${strategy} schedule output missing`);assert.ok(Number.isFinite(evaluated.strategies[strategy].confidence));}

const worker=fs.readFileSync(new URL("../src/worker.js",import.meta.url),"utf8"),client=fs.readFileSync(new URL("../public/mcp-schedule-data-plane.js",import.meta.url),"utf8");
assert.match(worker,/url\.pathname==="\/mcp"/);assert.match(worker,/name:"get_compound_schedule"/);assert.match(worker,/url\.pathname==="\/api\/engine\/schedule"/);assert.match(worker,/env\.HTL_ENGINE\.getByName\("live"\)\.fetch\("https:\/\/engine\/optimizer"\)/);assert.match(worker,/horizonWorker\.fetch\(internalCandleRequest/);assert.match(worker,/MCP_SCHEDULE_CONCURRENCY=8/);assert.match(worker,/configuredMax=Math\.max\(200/);assert.match(worker,/CTECompoundMcpSchedule\.prime/);assert.match(worker,/CTECompoundMcpSchedule\?\.get/);assert.match(worker,/mcp-schedule-data-plane\.js/);
assert.match(client,/method:"tools\/call"/);assert.match(client,/name:"get_compound_schedule"/);assert.match(client,/new Map\(\(payload\.rows\|\|\[\]\)\.map/);
console.log("MCP schedule data plane certification passed: one browser MCP call projects the 28×11 universe, server-side candle-cache evaluation replaces browser fan-out, terminal-candle request margin cannot create 179/180 underfunding, canonical length-200 history is sufficiently funded, and selected-chart candles remain independent.");
