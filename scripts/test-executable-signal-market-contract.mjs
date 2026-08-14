import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { __liveSignalPriceTest, LIVE_SIGNAL_PRICE_VERSION, AUTOMATIC_SIGNAL_EXECUTION_VERSION, IO_EVENT_CHRONOLOGY_VERSION } from "../src/engine-live-signal-price.js";

const buy=__liveSignalPriceTest.executableSignalQuote({time:"2026-08-14T12:05:02.000Z",closeoutBid:"0.8497",closeoutAsk:"0.8502",bids:[{price:"0.8498"}],asks:[{price:"0.8500"}]},1);
const sell=__liveSignalPriceTest.executableSignalQuote({time:"2026-08-14T12:05:03.000Z",closeoutBid:"0.8495",closeoutAsk:"0.8503",bids:[{price:"0.8497"}],asks:[{price:"0.8501"}]},-1);
assert.equal(buy.price,0.85);assert.equal(buy.side,"ASK");assert.equal(sell.price,0.8497);assert.equal(sell.side,"BID");assert.match(LIVE_SIGNAL_PRICE_VERSION,/2\.2\.0/);assert.match(AUTOMATIC_SIGNAL_EXECUTION_VERSION,/IMMEDIATE_ONE_ATTEMPT/);assert.match(IO_EVENT_CHRONOLOGY_VERSION,/MONOTONIC_CHRONOLOGY/);assert.equal(__liveSignalPriceTest.IO_STATE_HISTORY_BARS,5000);
assert.equal(__liveSignalPriceTest.executableSignalQuote({closeoutAsk:"0.8502"},1),null,"A closeout ask is not an executable opening ASK signal price.");
assert.equal(__liveSignalPriceTest.executableSignalQuote({closeoutBid:"0.8495"},-1),null,"A closeout bid is not an executable opening BID signal price.");
assert.equal(__liveSignalPriceTest.executableSignalQuote({tradeable:false,asks:[{price:"0.8500"}]},1),null,"A non-tradeable price cannot authorize an automatic signal execution.");

const state={},candidate={pair:"AUD_CHF",event:{id:"event-1",direction:1,startTime:"2026-08-14T12:00:00.000Z"}};
const first=__liveSignalPriceTest.beginSignalAttempt(state,candidate,"AUTOMATIC");assert.ok(first);assert.equal(first.status,"ATTEMPTING");assert.equal(__liveSignalPriceTest.priorSignalAttempt(state,"event-1"),first);
__liveSignalPriceTest.finishSignalAttempt(state,first,"EXECUTED",{fillPrice:.85001});assert.equal(first.status,"EXECUTED");assert.equal(first.fillPrice,.85001);assert.equal(__liveSignalPriceTest.beginSignalAttempt(state,candidate,"AUTOMATIC"),first,"The same signal identity must never create a second automatic execution attempt.");
const chronology={};__liveSignalPriceTest.acceptEvent(chronology,{id:"audcad-1937",startTime:"2026-08-14T19:37:00.000Z"});assert.equal(__liveSignalPriceTest.retrogradeEvent(chronology,{id:"audcad-1840-repaint",startTime:"2026-08-14T18:40:00.000Z"}),true,"A recomputed older crossing must never become a new automatic signal after a newer event has been accepted.");assert.equal(__liveSignalPriceTest.retrogradeEvent(chronology,{id:"audcad-1945",startTime:"2026-08-14T19:45:00.000Z"}),false);
const migratedRuntime={eventStartTime:"2026-08-14T18:40:00.000Z",lastExecutionEventId:"IO2:2026-08-14T18:26:25.427Z:horizon-strategy-v1:hash:AUD_CAD:M1:ASSET:2026-08-14T19:37:00.000Z:1"};assert.equal(new Date(__liveSignalPriceTest.acceptedEventStartMs(migratedRuntime)).toISOString(),"2026-08-14T19:37:00.000Z","Deployment over contaminated legacy runtime must recover chronology from the latest executed event rather than the later repaint state.");assert.equal(__liveSignalPriceTest.retrogradeEvent(migratedRuntime,{id:"audcad-1840-repaint",startTime:"2026-08-14T18:40:00.000Z"}),true);
const validRegistry={executionEventId:"IO2:session:valid",sourceEventId:"horizon-strategy-v1:hash:AUD_CAD:M1:ASSET:2026-08-14T19:37:00.000Z:1",pair:"AUD_CAD",timeframe:"M1",indicator:"ASSET",indicatorOnlyTicket:2,signalTime:"2026-08-14T19:37:00.000Z",registeredAt:"2026-08-14T19:38:35.475Z",sourcePriceBasis:__liveSignalPriceTest.PRICE_BASIS,liveSignalPriceVersion:LIVE_SIGNAL_PRICE_VERSION};const retrogradeRegistry={...validRegistry,executionEventId:"IO2:session:retrograde",sourceEventId:"horizon-strategy-v1:hash:AUD_CAD:M1:ASSET:2026-08-14T18:40:00.000Z:1",signalTime:"2026-08-14T18:40:00.000Z",registeredAt:"2026-08-14T19:42:36.320Z"};const registryResult=__liveSignalPriceTest.monotonicExecutableRegistry([validRegistry,retrogradeRegistry]);assert.equal(registryResult.kept.length,1);assert.equal(registryResult.quarantined.length,1);assert.equal(registryResult.quarantined[0].executionEventId,retrogradeRegistry.executionEventId);const migrationState={executionSignalRegistry:[validRegistry,retrogradeRegistry]};const migration=__liveSignalPriceTest.quarantineExecutionSignalRegistry(migrationState);assert.equal(migration.changed,true);assert.equal(migrationState.executionSignalRegistry.length,1);assert.equal(migrationState.executionSignalRegistry[0].executionEventId,validRegistry.executionEventId);assert.equal(migrationState.executionSignalQuarantine.length,1);

const liveSource=await readFile(new URL("../src/engine-live-signal-price.js",import.meta.url),"utf8");
assert.doesNotMatch(liveSource,/signal-execution-window/);
assert.doesNotMatch(liveSource,/EXECUTION_WINDOW|STALE_SIGNAL/);
assert.match(liveSource,/AUTOMATIC_SIGNAL_EXECUTION_FAILURE/);
assert.match(liveSource,/automatic replay is prohibited/);
assert.match(liveSource,/INDICATOR_ONLY_RETROGRADE_EVENT_REJECTED/);
assert.match(liveSource,/lastAcceptedEventStartTime/);
assert.match(liveSource,/quarantineExecutionSignalRegistry/);
assert.match(liveSource,/RETROGRADE_SOURCE_EVENT_REGISTRATION/);
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

const retrogradeGuard=liveSource.indexOf("if(retrogradeEvent(runtime,event))");
const sameEventGuard=liveSource.indexOf("if(priorEventId===event.id)",retrogradeGuard);
const accountPositionDecision=liveSource.indexOf("if(existing===event.direction)",sameEventGuard);
const reversalDecision=liveSource.indexOf("if(existing){",accountPositionDecision);
const ioOrder=liveSource.indexOf("await super.executeIndicatorOnlyUnits(pricedCandidate",reversalDecision);
assert.ok(retrogradeGuard>=0&&sameEventGuard>retrogradeGuard,"Retrograde event rejection must happen before same-event and execution logic.");
assert.ok(sameEventGuard>=0&&accountPositionDecision>sameEventGuard,"A manual position change during the same IO event must not re-arm that old signal.");
assert.ok(reversalDecision>accountPositionDecision&&ioOrder>reversalDecision,"On a new signal, IO must reconcile the actual current account position before submitting the new direction.");
assert.doesNotMatch(liveSource,/manual.*lastEventId|lastEventId.*manual/i,"Manual account activity must not rewrite IO event identity.");

const dual=await readFile(new URL("../src/engine-indicator-only-dual.js",import.meta.url),"utf8");
assert.doesNotMatch(dual,/STALE_SIGNAL|INDICATOR_ONLY_STALE_SIGNAL/);
assert.match(dual,/no pre-engagement order submitted/);
assert.match(dual,/priorEventId===event\.id/);
assert.match(dual,/INDICATOR_ONLY_RETROGRADE_EVENT_REJECTED/);
assert.doesNotMatch(dual,/executionEventId=.*lastCandle/);
assert.match(dual,/IO_STATE_HISTORY_BARS=5000/);
assert.match(dual,/IO_TICKET_CAPACITY=3/);

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
assert.match(integrity,/monotonicExecutableSignals/);
assert.match(integrity,/chartExecutableSignalQuarantine/);
assert.match(integrity,/OANDA_SELECTED_CHART_FORMING_CANDLE/);
assert.match(integrity,/LIVE_OANDA_BID_ASK_MID/);
assert.doesNotMatch(integrity,/analyticalCrossSignals/);
assert.match(integrity,/__cteExecutableSignalAuthority/);

console.log("Executable-signal contract verified: three IO tickets retain monotonic event chronology across deployment migration, retrograde persisted provenance is quarantined, manual account actions never re-arm an old event, each genuinely new selected automatic signal gets one immediate ASK/BID attempt, and the selected chart streams a forming candle plus executable BUY/SELL arrows.");
