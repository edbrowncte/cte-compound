import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source=fs.readFileSync(new URL("../public/forensic-runtime-repair.js",import.meta.url),"utf8");
const sandbox={console,Math,Number,Array,Object,String,Boolean,Date,Map,Set};sandbox.globalThis=sandbox;
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

console.log("Forensic runtime repair certified: canonical events retain Result/Profit fields and healthy 4,999 completed-candle support is not falsely degraded.");
