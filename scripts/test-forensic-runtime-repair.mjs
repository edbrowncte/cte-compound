import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source=fs.readFileSync(new URL("../public/forensic-runtime-repair.js",import.meta.url),"utf8");
const workerExact=fs.readFileSync(new URL("../src/worker-exact-account.js",import.meta.url),"utf8");
const index=fs.readFileSync(new URL("../public/index.html",import.meta.url),"utf8");
const sandbox={console,Math,Number,Array,Object,String,Boolean,Date,Map,Set,setTimeout,clearTimeout,AbortController};sandbox.globalThis=sandbox;
vm.runInNewContext(source,sandbox,{filename:"forensic-runtime-repair.js"});
const repair=sandbox.CTEForensicRuntimeRepair;
assert.ok(repair,"forensic repair API must install");

const candles=[
  {time:"2026-08-13T10:00:00Z",open:1,high:1.001,low:.999,close:1},
  {time:"2026-08-13T10:30:00Z",open:1,high:1.002,low:.999,close:1.001},
  {time:"2026-08-13T11:00:00Z",open:1.001,high:1.003,low:1,close:1.002},
  {time:"2026-08-13T11:30:00Z",open:1.002,high:1.0025,low:.9995,close:1.0005},
];
const htl={version:"TEST",asset:[1,1.001,1.002,1.001],inverse:[1,1,1.0015,1.0015],sourceTotal:[0,1,2,3],crossings:[
  {index:1,time:candles[1].time,direction:1,priorAsset:1,priorInverse:1,asset:1.001,inverse:1},
  {index:3,time:candles[3].time,direction:-1,priorAsset:1.002,priorInverse:1.0015,asset:1.001,inverse:1.0015},
]};
const events=repair.enrichedEventFeatures(candles,htl,"EUR_USD");
assert.equal(events.length,2);
assert.equal(events[0].status,"FINAL");
assert.equal(events[0].openPrice,1.001);
assert.equal(events[0].closePrice,1.002);
assert.ok(Number.isFinite(events[0].profitPips));
assert.equal(events[0].result,"WIN");
assert.equal(events[0].pair,"EUR_USD");
assert.equal(events[1].status,"PROVISIONAL");
assert.equal(events[1].result,"OPEN");

const jpyCandles=candles.map(candle=>({...candle,open:candle.open*150,high:candle.high*150,low:candle.low*150,close:candle.close*150}));
const jpyHtl={...htl,asset:htl.asset.map(value=>value*150),inverse:htl.inverse.map(value=>value*150),crossings:htl.crossings.map(crossing=>({...crossing,priorAsset:crossing.priorAsset*150,priorInverse:crossing.priorInverse*150,asset:crossing.asset*150,inverse:crossing.inverse*150}))};
const jpy=repair.enrichedEventFeatures(jpyCandles,jpyHtl,"USD_JPY");
assert.ok(Number.isFinite(jpy[0].profitPips));
assert.equal(repair.pipScale("USD_JPY"),100);
assert.equal(repair.pipScale("EUR_USD"),10000);

const healthy4999=repair.normalizeSupportRecord({supportingStatus:"DEGRADED_HISTORY",supportingError:null,supportingHistoryBars:4999,supportingHistoryTarget:5000,supportingFinalEvents:400,supportingMagnitudeEvents:400,corroborated:false});
assert.equal(healthy4999.supportingStatus,"READY");
assert.equal(healthy4999.corroborated,true);
assert.equal(healthy4999.supportingHistoryBars,4999,"repair must preserve truthful completed-candle count");
const genuinelyShort=repair.normalizeSupportRecord({supportingStatus:"DEGRADED_HISTORY",supportingError:null,supportingHistoryBars:4900,supportingHistoryTarget:5000,supportingFinalEvents:400,supportingMagnitudeEvents:400,corroborated:false});
assert.equal(genuinelyShort.supportingStatus,"DEGRADED_HISTORY");
const missingPnl=repair.normalizeSupportRecord({supportingStatus:"DEGRADED_HISTORY",supportingError:null,supportingHistoryBars:4999,supportingHistoryTarget:5000,supportingFinalEvents:400,supportingMagnitudeEvents:0,corroborated:false});
assert.equal(missingPnl.supportingStatus,"DEGRADED_HISTORY","one-candle tolerance must not hide missing P/L evidence");

const bucketMark=repair.positionPriceFromRaw({time:"2026-08-14T08:00:00.000Z",tradeable:true,bids:[{price:"0.57506"}],asks:[{price:"0.57508"}],closeoutBid:"0.57501",closeoutAsk:"0.57513"});
assert.equal(bucketMark.bid,.57506);assert.equal(bucketMark.ask,.57508);assert.equal(bucketMark.priceBasis,"LIVE_OANDA_BID_ASK_BUCKETS","open-position mark must prefer actual bid/ask liquidity over closeout fallback prices");
const closeoutFallback=repair.positionPriceFromRaw({closeoutBid:"0.57501",closeoutAsk:"0.57513"});assert.equal(closeoutFallback.bid,.57501);assert.equal(closeoutFallback.ask,.57513);assert.equal(closeoutFallback.priceBasis,"OANDA_CLOSEOUT_FALLBACK");

const audChf={instrument:"AUD_CHF",long:{units:"1800",averagePrice:"0.57528",unrealizedPL:"0.11"},short:{units:"0"},unrealizedPL:"0.11"};
const livePrice={bid:.57506,ask:.57508,time:"2026-08-14T08:00:00.000Z",homeConversion:{positive:1.23,negative:1.24},priceBasis:"LIVE_OANDA_BID_ASK_BUCKETS"};
const liveMark=repair.livePositionMark(audChf,livePrice,"USD");
assert.ok(liveMark);assert.equal(Number(liveMark.pips.toFixed(1)),-2.2);assert.ok(liveMark.quotePnl<0);assert.ok(liveMark.unrealizedPL<0,"a long below entry must never acquire a positive live-mark P/L through currency conversion");assert.equal(liveMark.homeConversionFactor,1.24,"negative quote P/L must use the negative-units home conversion factor");assert.equal(liveMark.priceBasis,"LIVE_OANDA_BID_ASK_BUCKETS");
const sameQuote=repair.livePositionMark(audChf,{...livePrice,homeConversion:{}},"CHF");assert.ok(sameQuote.unrealizedPL<0);assert.equal(sameQuote.homeConversionFactor,1);
const unavailableConversion=repair.livePositionMark(audChf,{...livePrice,homeConversion:{}},"USD");assert.equal(unavailableConversion.unrealizedPL,null,"cross-currency home P/L must not be fabricated without a conversion factor");

assert.equal(repair.transactionChangesAccount({type:"HEARTBEAT",lastTransactionID:"100"}),false);assert.equal(repair.transactionChangesAccount({type:"ORDER_FILL",id:"101"}),true);assert.equal(repair.transactionIdentity({type:"ORDER_FILL",id:"101"}),"101");assert.equal(repair.transactionIdentity({type:"HEARTBEAT",lastTransactionID:"102"}),"102");
assert.match(repair.VERSION,/1\.2\.0/);assert.match(repair.ACCOUNT_POSITION_STREAM_VERSION,/OANDA_ACCOUNT_POSITION_STREAM_TRUTH/);assert.equal(repair.POSITION_RECONCILIATION_WATCHDOG_MS,60000);
assert.match(source,/\/api\/oanda\/transactions\/stream/);assert.match(source,/positionTransactionStreamConnected/);assert.match(source,/positionRefreshQueued/);assert.match(source,/ACCOUNT_STREAM_BOOTSTRAP/);assert.match(source,/ACCOUNT_STREAM_WATCHDOG/);assert.match(source,/TRANSACTION_STREAM:/);assert.match(source,/startAccountTransactionStream/);assert.match(source,/startPositionMonitor=wrapped/);assert.doesNotMatch(source,/setInterval\([^\n]*10000/);
assert.match(workerExact,/https:\/\/stream-fxtrade\.oanda\.com/);assert.match(workerExact,/\/api\/oanda\/transactions\/stream/);assert.match(workerExact,/transactions\/stream/);assert.match(workerExact,/requireCloudflareAccess/);assert.match(workerExact,/verifyFullAccountIdentity/);assert.match(workerExact,/X-CTE-Account-Stream/);
assert.match(index,/state\.positionTimer=setInterval\(refreshOpenPositions,10000\)/,"legacy HTML poll remains only as the base implementation that the runtime streaming-truth layer replaces");

console.log("Forensic runtime repair certified: Open Positions is bootstrapped from OANDA openPositions, account membership/units/side are invalidated immediately by the exact-account transaction stream, live bid/ask buckets drive the mark, queued transaction refreshes cannot be dropped during an in-flight snapshot, and the old 10-second poll is replaced by a 60-second reconciliation watchdog.");
