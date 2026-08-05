import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import {
  STRATEGY_ENGINE_VERSION,
  evaluateStrategyWindow,
  normalizeStrategySettings,
} from "../src/horizon-strategy-v1.js";
import {
  REGISTERED_HISTORY_BARS,
  REGISTERED_PERFORMANCE_VERSION,
  evaluateRegisteredPerformance,
  registeredExportRows,
} from "../src/horizon-registered-performance.js";

const digest=value=>createHash("sha256").update(value).digest("hex");
function generateCandles(count=500){
  const rows=[];let prior=1.1000;const start=Date.parse("2026-01-01T00:00:00.000Z");
  for(let index=0;index<count;index++){
    const close=1.1+Math.sin(index/9)*.004+Math.sin(index/31)*.002+(((index*17)%11)-5)*.00008;
    const open=prior,wick=.00035+((index*7)%5)*.00004;
    rows.push({time:new Date(start+index*60000).toISOString(),open,high:Math.max(open,close)+wick,low:Math.min(open,close)-wick,close,complete:true});
    prior=close;
  }
  return rows;
}

test("checksum-verified Horizon strategy source is unchanged",async()=>{
  const source=await readFile(new URL("../src/horizon-strategy-v1.js",import.meta.url));
  assert.equal(digest(source),"5dbf45b24ceff1f1d740dbf6aed7a17012f43210d79506d5a930567b6b391814");
  assert.equal(STRATEGY_ENGINE_VERSION,"horizon-strategy-v1");
});

test("registered performance uses six independent event streams and next-open exits",()=>{
  const candles=generateCandles(600),settings=normalizeStrategySettings({assetLength:50,dareNLength:40,dareNFilter:1.5,naiLength:50,naiFilter:1.5,apexLength:50,apexFilter:7,csf:{selected:["DARE_N","NAI"],method:"REGIME_TRIGGER",regime:"NAI",trigger:"DARE_N"}}),evaluation=evaluateStrategyWindow(candles,settings),result=evaluateRegisteredPerformance(candles,"NZD_CAD",settings);
  assert.equal(result.performanceVersion,REGISTERED_PERFORMANCE_VERSION);
  assert.deepEqual(Object.keys(result.strategies),["ASSET","DARE_N","DARE","COMBO","NAI","APEX"]);
  const counts=[evaluation.diagnostics.htl.signals.length,evaluation.diagnostics.dareN.events.length,evaluation.diagnostics.dareSignals.length,evaluation.diagnostics.csf.signals.length,evaluation.diagnostics.nai.events.length,evaluation.diagnostics.apexEvents.length];
  assert.ok(new Set(counts).size>1,"six strategies must not share one event count/clock");
  for(const item of Object.values(result.strategies))for(const trade of item.trades){
    assert.equal(trade.entryIndex,trade.signalIndex+1);
    assert.ok(trade.exitIndex>trade.entryIndex);
    assert.equal(trade.entry,candles[trade.entryIndex].open);
    assert.equal(trade.exit,candles[trade.exitIndex].open);
  }
});

test("registered export schema preserves the original 3000-bar configuration contract",async()=>{
  const saved=JSON.parse(await readFile(new URL("./fixtures/registered-horizon-performance.json",import.meta.url),"utf8"));
  assert.equal(saved.length,168);
  assert.ok(saved.every(row=>row.Bars===REGISTERED_HISTORY_BARS));
  assert.deepEqual(new Set(saved.map(row=>row.Strategy)),new Set(["HTL Asset","DARE(N)","DARE","COMBO","NAI","APEX"]));
  assert.ok(saved.every(row=>row["Asset length"]===50&&row["DARE(N) length"]===40&&row["DARE(N) separation"]===1.5&&row["NAI length"]===50&&row["NAI separation"]===1.5&&row["CSF method"]==="Regime()–Trigger()"&&row["CSF strategies"]==="DARE_N + NAI"&&row["CSF regime"]==="NAI"&&row["CSF trigger"]==="DARE_N"&&row["APEX length"]===50&&row["APEX threshold"]===7));
  const candles=generateCandles(REGISTERED_HISTORY_BARS),settings={assetLength:50,dareNLength:40,dareNFilter:1.5,naiLength:50,naiFilter:1.5,apexLength:50,apexFilter:7,csf:{selected:["DARE_N","NAI"],method:"REGIME_TRIGGER",regime:"NAI",trigger:"DARE_N"}},rows=registeredExportRows(evaluateRegisteredPerformance(candles,"NZD_CAD",settings),"NZD_CAD","M1");
  assert.equal(rows.length,6);assert.ok(rows.every(row=>row.Bars===REGISTERED_HISTORY_BARS&&row["CSF method"]==="Regime()–Trigger()"));
});

test("saved historical performance is explicitly not certified without its exact candles",async()=>{
  const saved=JSON.parse(await readFile(new URL("./fixtures/registered-horizon-performance.json",import.meta.url),"utf8"));
  const nzd=saved.filter(row=>row.Pair==="NZD / CAD");
  assert.equal(nzd.length,6);
  assert.deepEqual(nzd.map(row=>row.Trades),[75,41,37,39,53,3]);
  assert.notEqual(nzd[0].Trades,nzd[4].Trades,"registered HTL Asset and NAI trade clocks are independent");
});
