import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { executionOpportunity, executionWindowMs, signalObservedAt, SIGNAL_EXECUTION_WINDOW_VERSION } from "../src/signal-execution-window.js";
import { __liveSignalPriceTest, LIVE_SIGNAL_PRICE_VERSION } from "../src/engine-live-signal-price.js";

const source="2026-08-14T12:00:00.000Z";
assert.equal(signalObservedAt(source,"M5"),Date.parse("2026-08-14T12:05:00.000Z"));
assert.equal(executionOpportunity(source,"M5",Date.parse("2026-08-14T12:06:00.000Z")).open,true,"A signal remains executable after its crossing candle ceases to be the latest bar when it is still contemporaneous.");
assert.equal(executionOpportunity(source,"M5",Date.parse("2026-08-14T12:30:00.000Z")).open,false,"A signal may remain historically valid while its order-initiation window is closed.");
assert.ok(executionWindowMs("W")<20*60*1000,"Slow-timeframe signals must never authorize a days-late order.");
assert.match(SIGNAL_EXECUTION_WINDOW_VERSION,/IMMUTABLE_SIGNAL_EXECUTION_WINDOW/);

const buy=__liveSignalPriceTest.executableSignalQuote({time:"2026-08-14T12:05:02.000Z",closeoutBid:"0.8498",closeoutAsk:"0.8500"},1);
const sell=__liveSignalPriceTest.executableSignalQuote({time:"2026-08-14T12:05:03.000Z",closeoutBid:"0.8497",closeoutAsk:"0.8501"},-1);
assert.equal(buy.price,0.85);assert.equal(buy.side,"ASK");assert.equal(sell.price,0.8497);assert.equal(sell.side,"BID");assert.match(LIVE_SIGNAL_PRICE_VERSION,/2\.0\.0/);

const liveSource=await readFile(new URL("../src/engine-live-signal-price.js",import.meta.url),"utf8");
assert.doesNotMatch(liveSource,/COMPLETED_SOURCE_CANDLE_CLOSE_FALLBACK/);
assert.match(liveSource,/LIVE_SIGNAL_QUOTE_UNAVAILABLE/);
assert.match(liveSource,/INDICATOR_ONLY_EXECUTION_WINDOW_MISSED/);
assert.match(liveSource,/signal remains recorded/);
assert.ok(liveSource.includes('const executionEventId=`IO${ticket.slot}:${runtime.engagedAt||"session"}:${event.id}`'),"Indicator Only execution identity must be stable for one signal and must not depend on whichever candle happens to be latest later.");
assert.doesNotMatch(liveSource,/executionEventId=.*lastCandle/);
assert.match(liveSource,/ioMarketScanCadenceMs/);

const verifier=await readFile(new URL("../src/horizon-candidate-signal-verifier.js",import.meta.url),"utf8");
assert.doesNotMatch(verifier,/crossing\.index!==candles\.length-1/);
assert.match(verifier,/SIGNAL_SUPERSEDED/);
assert.match(verifier,/EXECUTION_WINDOW_ELAPSED/);
assert.match(verifier,/signal remains recorded/);

const chart=await readFile(new URL("../public/unified-chart.js",import.meta.url),"utf8");
assert.match(chart,/LIVE_OANDA_EXECUTABLE_SIDE_QUOTE_AT_REGISTRATION/);
assert.ok(chart.includes('label=`${direction>0?"BUY":"SELL"} @ ${shown}`;'),"Executable markers must identify the side and captured market price.");
assert.ok(chart.includes('label=`CROSS ${direction>0?"BUY":"SELL"}${signal.current?" STATE":""}`;'),"Unpriced analytical crossings must be labelled CROSS rather than masquerading as executable BUY/SELL prices.");
assert.ok(chart.includes("markerY=clamp(priceToY(exactPrice)"),"Executable arrow tip must use the exact captured bid/ask price rather than candle high/low.");
assert.match(chart,/signalPrices=.*isExecutableSignal/,"Executable signal prices must participate in the chart price scale.");

const integrity=await readFile(new URL("../public/runtime-integrity.js",import.meta.url),"utf8");
assert.match(integrity,/SIGNAL_PROVENANCE_REGISTERED/);
assert.match(integrity,/liveLedgerSignals/);
assert.match(integrity,/marketPrice:true/);
assert.match(integrity,/analyticalCrossSignals/);
assert.match(integrity,/__cteExecutableSignalAuthority/);

console.log("Executable-signal contract verified: crossings remain immutable analytical events, order initiation is time-bounded, and BUY/SELL arrows use the captured OANDA ASK/BID rather than crossing-candle geometry.");