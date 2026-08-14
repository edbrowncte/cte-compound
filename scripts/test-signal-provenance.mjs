import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  SIGNAL_PROVENANCE_VERSION,
  EXECUTION_CLOCK_AUTHORITY_VERSION,
  buildSignalProvenance,
  registerSignalProvenance,
  executionClockProbeDue,
  __signalProvenanceTest,
} from "../src/engine-signal-provenance.js";
import { LIVE_SIGNAL_PRICE_VERSION, AUTOMATIC_SIGNAL_EXECUTION_VERSION, IO_EVENT_CHRONOLOGY_VERSION, __liveSignalPriceTest } from "../src/engine-live-signal-price.js";
import {
  STRATEGY_ENGINE_VERSION,
  normalizeStrategySettings,
  strategyConfigHash,
} from "../src/horizon-strategy-v1.js";

const settings = normalizeStrategySettings({ assetLength: 15, dareNLength: 15, naiLength: 15, apexLength: 15 });
const sourceTime = "2026-08-14T03:50:00.000Z";
const normalSourceId = `${STRATEGY_ENGINE_VERSION}:${strategyConfigHash(settings)}:EUR_USD:M5:ASSET:${sourceTime}:1`;
const normalCandidate = {
  pair: "EUR_USD",
  event: {
    id: normalSourceId,
    direction: 1,
    startTime: sourceTime,
    crossingTime: sourceTime,
    openPrice: 1.16789,
    strategyEngineVersion: STRATEGY_ENGINE_VERSION,
    performanceVersion: "registered-horizon-performance-v1",
    qualificationResult: "REGISTERED_EVENT",
  },
  configuration: { settings },
};
const normal = buildSignalProvenance(normalCandidate, { timeframe: "M5", strategy: "ASSET" });
assert.equal(normal.signalProvenanceVersion, SIGNAL_PROVENANCE_VERSION);
assert.equal(normal.sourceEventId, normalSourceId);
assert.equal(normal.executionEventId, normalSourceId);
assert.equal(normal.signalPrice, 1.16789);
assert.equal(normal.signalTime, sourceTime);
assert.equal(normal.pair, "EUR_USD");
assert.equal(normal.timeframe, "M5");
assert.equal(normal.indicator, "ASSET");
assert.equal(normal.direction, "BUY");
assert.equal(normal.sourcePriceBasis, "COMPLETED_SOURCE_CANDLE_CLOSE");
assert.equal(normal.fillPriceBasis, "OANDA_ORDER_FILL_PRICE_SEPARATE");
assert.equal(normal.complete, true);

const ioExecutionId = `IO1:session:${normalSourceId}:2026-08-14T03:55:00.000Z`;
const ioCandidate = {
  ...normalCandidate,
  event: { ...normalCandidate.event, id: ioExecutionId },
  IO: { timeframe: "M5", indicator: "ASSET", ticket: 1 },
};
const io = buildSignalProvenance(ioCandidate, {});
assert.equal(io.executionEventId, ioExecutionId);
assert.equal(io.sourceEventId, normalSourceId, "Indicator Only must reconstruct and retain the canonical registered event identity separately from its execution identity");
assert.equal(io.indicatorOnly, true);
assert.equal(io.indicatorOnlyTicket, 1);
assert.equal(io.signalPrice, normal.signalPrice);
assert.equal(io.signalTime, normal.signalTime);
assert.equal(io.complete, true);

const buyQuote=__liveSignalPriceTest.executableSignalQuote({time:"2026-08-14T04:00:00.000Z",closeoutBid:"1.16780",closeoutAsk:"1.16792",bids:[{price:"1.16781"}],asks:[{price:"1.16791"}]},1);
assert.equal(buyQuote.price,1.16791);assert.equal(buyQuote.side,"ASK");assert.equal(buyQuote.time,"2026-08-14T04:00:00.000Z");
const sellQuote=__liveSignalPriceTest.executableSignalQuote({time:"2026-08-14T04:00:01.000Z",closeoutBid:"1.16779",closeoutAsk:"1.16793",bids:[{price:"1.16778"}],asks:[{price:"1.16794"}]},-1);
assert.equal(sellQuote.price,1.16778);assert.equal(sellQuote.side,"BID");assert.match(__liveSignalPriceTest.PRICE_BASIS,/LIVE_OANDA_EXECUTABLE_SIDE_QUOTE/);assert.match(LIVE_SIGNAL_PRICE_VERSION,/2\.2\.0/);assert.match(AUTOMATIC_SIGNAL_EXECUTION_VERSION,/IMMEDIATE_ONE_ATTEMPT/);assert.match(IO_EVENT_CHRONOLOGY_VERSION,/MONOTONIC_CHRONOLOGY/);
assert.equal(__liveSignalPriceTest.executableSignalQuote({closeoutAsk:"1.16792"},1),null);assert.equal(__liveSignalPriceTest.executableSignalQuote({closeoutBid:"1.16779"},-1),null);assert.equal(__liveSignalPriceTest.executableSignalQuote({tradeable:false,asks:[{price:"1.16791"}]},1),null);

const state = {};
const first = registerSignalProvenance(state, normal, "2026-08-14T03:56:00.000Z");
assert.equal(first.status, "REGISTERED");
assert.equal(state.executionSignalRegistry.length, 1);
registerSignalProvenance(state, normal, "2026-08-14T03:57:00.000Z");
assert.equal(state.executionSignalRegistry.length, 1, "Re-registering the same execution event must not duplicate the durable provenance registry");
assert.equal(state.lastSignalProvenance.executionEventId, normalSourceId);

assert.equal(executionClockProbeDue({ indicatorOnly: { enabled: true } }), false);
assert.equal(executionClockProbeDue({}), true);
assert.equal(executionClockProbeDue({
  executionClockSource: "OANDA_ACCOUNT_CANDLES_LATEST@1.0.0",
  executionClockCandle: "2026-08-14T03:55:00.000Z",
  executionClockProbeAt: new Date(Date.now() - 30_000).toISOString(),
  executionClockTimeframe: "M5",
  config: { timeframe: "M5" },
}), false);
assert.equal(executionClockProbeDue({
  executionClockSource: "OANDA_ACCOUNT_CANDLES_LATEST@1.0.0",
  executionClockCandle: "2026-08-14T03:55:00.000Z",
  executionClockProbeAt: new Date(Date.now() - 180_000).toISOString(),
  executionClockTimeframe: "M5",
  config: { timeframe: "M5" },
}), true);
assert.equal(executionClockProbeDue({
  executionClockSource: "OANDA_ACCOUNT_CANDLES_LATEST@1.0.0",
  executionClockCandle: "2026-08-14T03:55:00.000Z",
  executionClockProbeAt: new Date().toISOString(),
  executionClockTimeframe: "M15",
  config: { timeframe: "M5" },
}), true);

assert.equal(__signalProvenanceTest.EXECUTION_CLOCK_AUTHORITY_VERSION, EXECUTION_CLOCK_AUTHORITY_VERSION);
const worker = await readFile(new URL("../src/worker.js", import.meta.url), "utf8");
assert.match(worker, /export \{ HtlEngine \} from "\.\/engine-live-signal-price\.js";/, "Cloudflare Durable Object export must use the live executable signal-price wrapper");
const source = await readFile(new URL("../src/engine-signal-provenance.js", import.meta.url), "utf8");
assert.match(source, /SIGNAL_PROVENANCE_REGISTERED/);
assert.match(source, /sourcePriceBasis: "COMPLETED_SOURCE_CANDLE_CLOSE"/);
assert.match(source, /fillPriceBasis: "OANDA_ORDER_FILL_PRICE_SEPARATE"/);
assert.match(source, /executionClockParentProbeObserved/);
assert.match(source, /executionClockEarlyProbeStatus/);
const liveSource=await readFile(new URL("../src/engine-live-signal-price.js",import.meta.url),"utf8");
assert.match(liveSource,/LIVE_OANDA_EXECUTABLE_SIDE_QUOTE_AT_REGISTRATION/);assert.match(liveSource,/sourceCandleClose/);assert.match(liveSource,/signalPriceSide/);assert.match(liveSource,/SIGNAL_PROVENANCE_REGISTERED/);assert.match(liveSource,/IMMEDIATE_ONE_ATTEMPT_SIGNAL_EXECUTION/);assert.match(liveSource,/INDICATOR_ONLY_RETROGRADE_EVENT_REJECTED/);assert.doesNotMatch(liveSource,/price\.asks\?\.\[0\]\?\.price\?\?price\.closeoutAsk|price\.bids\?\.\[0\]\?\.price\?\?price\.closeoutBid/);

console.log("Signal provenance verified: canonical crossing context stays auditable while automatic execution captures a tradeable OANDA ASK/BID once, rejects retrograde repaint identities, and records fill price separately.");
