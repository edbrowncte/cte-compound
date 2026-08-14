import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { __liveSignalPriceTest, LIVE_SIGNAL_PRICE_VERSION, AUTOMATIC_SIGNAL_EXECUTION_VERSION } from "../src/engine-live-signal-price.js";

const buy=__liveSignalPriceTest.executableSignalQuote({time:"2026-08-14T12:05:02.000Z",closeoutBid:"0.8497",closeoutAsk:"0.8502",bids:[{price:"0.8498"}],asks:[{price:"0.8500"}]},1);
const sell=__liveSignalPriceTest.executableSignalQuote({time:"2026-08-14T12:05:03.000Z",closeoutBid:"0.8495",closeoutAsk:"0.8503",bids:[{price:"0.8497"}],asks:[{price:"0.8501"}]},-1);
assert.equal(buy.price,0.85);assert.equal(buy.side,"ASK");assert.equal(sell.price,0.8497);assert.equal(sell.side,"BID");assert.match(LIVE_SIGNAL_PRICE_VERSION,/2\.1\.1/);assert.match(AUTOMATIC_SIGNAL_EXECUTION_VERSION,/IMMEDIATE_ONE_ATTEMPT/);assert.equal(__liveSignalPriceTest.IO_STATE_HISTORY_BARS,5000);
assert.equal(__liveSignalPriceTest.executableSignalQuote({closeoutAsk:"0.8502"},1),null,"A closeout ask is not an executable opening ASK signal price.");
assert.equal(__liveSignalPriceTest.executableSignalQuote({closeoutBid:"0.8495"},-1),null,"A closeout bid is not an executable opening BID signal price.");
assert.equal(__liveSignalPriceTest.executableSignalQuote({tradeable:false,asks:[{price:"0.8500"}]},1),null,"A non-tradeable price cannot authorize an automatic signal execution.");

const state={},candidate={pair:"AUD_CHF",event:{id:"event-1",direction:1,startTime:"2026-08-14T12:00:00.000Z"}};
const first=__liveSignalPriceTest.beginSignalAttempt(state,candidate,"AUTOMATIC");assert.ok(first);assert.equal(first.status,"ATTEMPTING");assert.equal(__liveSignalPriceTest.priorSignalAttempt(state,"event-1"),first);
__liveSignalPriceTest.finishSignalAttempt(state,first,"EXECUTED",{fillPrice:.85001});assert.equal(first.status,"EXECUTED");assert.equal(first.fillPrice,.85001);assert.equal(__liveSignalPriceTest.beginSignalAttempt(state,candidate,"AUTOMATIC"),first,"The same signal identity must never create a second automatic execution attempt.");

const liveSource=await readFile(new URL("../src/engine-live-signal-price.js",import.meta.url),"utf8");
assert.doesNotMatch(liveSource,/signal-execution-window/);
assert.doesNotMatch(liveSource,/EXECUTION_WINDOW|STALE_SIGNAL/);
assert.match(liveSource,/AUTOMATIC_SIGNAL_EXECUTION_FAILURE/);
assert.match(liveSource,/automatic replay is prohibited/);
assert.ok(liveSource.includes('const executionEventId=`IO${ticket.slot}:${runtime.engagedAt||"session"}:${event.id}`'),"Indicator Only execution identity must be stable for one signal and must not depend on whichever candle happens to be latest later.");
assert.doesNotMatch(liveSource,/executionEventId=.*lastCandle/);
assert.match(liveSource,/runtime\.lastEventId=event\.id/);
assert.match(liveSource,/no pre-engagement order submitted/);
assert.match(liveSource,/ioMarketScanCadenceMs/);
assert.ok(liveSource.includes("candles(ticket.pair,token,ticket.timeframe,IO_STATE_HISTORY_BARS)"),"The effective live IO wrapper must use the full 5,000-bar state history rather than a short length-derived window.");
assert.ok(liveSource.includes("runtime.historyTarget=IO_STATE_HISTORY_BARS"));
assert.ok(liveSource.includes("price.asks?.[0]?.price"),"BUY signal price must require the live ask bucket.");
assert.ok(liveSource.includes("price.bids?.[0]?.price"),"SELL signal price must require the live bid bucket.");
assert.doesNotMatch(liveSource,/price\.asks\?\.\[0\]\?\.price\?\?price\.closeoutAsk|price\.bids\?\.\[0\]\?\.price\?\?price\.closeoutBid/);
assert.match(liveSource,/price\?\.tradeable===false/);

const sameEventGuard=liveSource.indexOf("if(priorEventId===event.id)");
const accountPositionDecision=liveSource.indexOf("if(existing===event.direction)",sameEventGuard);
const reversalDecision=liveSource.indexOf("if(existing){",accountPositionDecision);
const ioOrder=liveSource.indexOf("await super.executeIndicatorOnlyUnits(pricedCandidate",reversalDecision);
assert.ok(sameEventGuard>=0&&accountPositionDecision>sameEventGuard,"A manual position change during the same IO event must not re-arm that old signal.");
assert.ok(reversalDecision>accountPositionDecision&&ioOrder>reversalDecision,"On a new signal, IO must reconcile the actual current account position before submitting the new direction.");
assert.doesNotMatch(liveSource,/manual.*lastEventId|lastEventId.*manual/i,"Manual account activity must not rewrite IO event identity.");

const dual=await readFile(new URL("../src/engine-indicator-only-dual.js",import.meta.url),"utf8");
assert.doesNotMatch(dual,/STALE_SIGNAL|INDICATOR_ONLY_STALE_SIGNAL/);
assert.match(dual,/no pre-engagement order submitted/);
assert.match(dual,/priorEventId===event\.id/);
assert.doesNotMatch(dual,/executionEventId=.*lastCandle/);
assert.match(dual,/IO_STATE_HISTORY_BARS=5000/);

const verifier=await readFile(new URL("../src/horizon-candidate-signal-verifier.js",import.meta.url),"utf8");
assert.match(verifier,/crossing\.index!==candles\.length-1/);
assert.match(verifier,/SIGNAL_REPLAY_REJECTED/);
assert.doesNotMatch(verifier,/executionOpportunity|EXECUTION_WINDOW|stale/i);

const chart=await readFile(new URL("../public/unified-chart.js",import.meta.url),"utf8");
assert.match(chart,/LIVE_OANDA_EXECUTABLE_SIDE_QUOTE_AT_REGISTRATION/);
assert.ok(chart.includes('label=`${direction>0?"BUY":"SELL"} @ ${shown}`'),"Executable markers must identify the side and captured market price.");
assert.doesNotMatch(chart,/CROSS \$\{/);
assert.match(chart,/!isExecutableSignal\(signal\)\|\|!finite\(signal\?\.price\)\)continue/);
assert.ok(chart.includes("markerY=clamp(priceToY(exactPrice)"),"Executable arrow tip must use the exact captured bid/ask price rather than candle high/low.");
assert.match(chart,/signalPrices=.*isExecutableSignal/,"Executable signal prices must participate in the chart price scale.");

const integrity=await readFile(new URL("../public/runtime-integrity.js",import.meta.url),"utf8");
assert.match(integrity,/SIGNAL_PROVENANCE_REGISTERED/);
assert.match(integrity,/liveLedgerSignals/);
assert.match(integrity,/marketPrice:true/);
assert.match(integrity,/signals:live/);
assert.doesNotMatch(integrity,/analyticalCrossSignals/);
assert.match(integrity,/__cteExecutableSignalAuthority/);

console.log("Executable-signal contract verified: IO state survives manual account opens/closes, a new opposite signal reconciles and reverses the actual account position, the effective IO scanner retains 5,000-bar directional history, each selected automatic signal gets one immediate attempt at live ASK/BID, and BUY/SELL chart arrows remain anchored to captured executable prices.");
