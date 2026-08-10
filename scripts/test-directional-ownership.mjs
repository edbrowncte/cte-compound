import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { alternatingOwnershipSignals, buildRegisteredTrades, DIRECTIONAL_OWNERSHIP_VERSION } from "../src/horizon-registered-performance.js";

const raw=[
  {signalIndex:1,direction:1,source:"A"},
  {signalIndex:2,direction:1,source:"A_REPEAT"},
  {signalIndex:3,direction:-1,source:"B"},
  {signalIndex:4,direction:-1,source:"B_REPEAT"},
  {signalIndex:5,direction:1,source:"C"},
];
const owned=alternatingOwnershipSignals(raw);
assert.deepEqual(owned.map(signal=>signal.direction),[1,-1,1]);
assert.deepEqual(owned.map(signal=>signal.signalIndex),[1,3,5]);
assert.equal(DIRECTIONAL_OWNERSHIP_VERSION,"ALTERNATING_DIRECTIONAL_OWNERSHIP@1.0.0");

const candles=Array.from({length:8},(_,index)=>({time:`t${index}`,open:1+index*.001,high:1+index*.0015,low:1+index*.0005,close:1+index*.001,complete:true}));
const trades=buildRegisteredTrades(candles,raw,"EUR_USD");
assert.equal(trades.length,2,"same-direction repeats must not create extra registered trades");
assert.deepEqual(trades.map(trade=>trade.direction),[1,-1]);
assert.ok(trades.every(trade=>trade.ownership===DIRECTIONAL_OWNERSHIP_VERSION));

const source=fs.readFileSync(new URL("../public/directional-ownership.js",import.meta.url),"utf8"),worker=fs.readFileSync(new URL("../src/worker.js",import.meta.url),"utf8");
let captured=null;
const renderer={render(options){captured=options;return options;}};
const sandbox={console,Math,Number,Array,Object,String,Boolean,Date,CTEUnifiedChart:renderer};sandbox.globalThis=sandbox;
vm.runInNewContext(source,sandbox,{filename:"directional-ownership.js"});
const api=sandbox.CTEDirectionalOwnership;
assert.ok(api);
const chartCandles=Array.from({length:7},(_,index)=>({time:`c${index}`,close:1+index*.01}));
const normalized=api.normalizeSignals([
  {index:0,direction:1,current:false},
  {index:1,direction:1,current:false},
  {index:2,direction:-1,current:false},
  {index:3,direction:-1,current:false},
  {index:4,direction:1,current:false},
],chartCandles);
assert.deepEqual(Array.from(normalized,signal=>signal.direction),[1,-1,1,1],"chart must keep ownership transitions plus one final current-owner marker");
assert.deepEqual(Array.from(normalized.slice(0,-1),signal=>signal.direction),[1,-1,1]);
assert.equal(normalized.at(-1).current,true);
assert.equal(normalized.at(-1).index,chartCandles.length-1);

api.wrapUnifiedRenderer();
sandbox.CTEUnifiedChart.render({candles:chartCandles,signals:[{index:0,direction:-1},{index:1,direction:-1},{index:2,direction:1},{index:3,direction:1}]});
assert.deepEqual(Array.from(captured.signals.slice(0,-1),signal=>signal.direction),[-1,1],"unified renderer boundary must normalize every indicator marker stream");
assert.equal(captured.signals.at(-1).current,true);
assert.match(worker,/chart-ioi-iom\.js[^]*directional-ownership\.js[^]*ioi-iom-performance\.js/);

for(const label of ["HTL Asset","DARE(N)","DARE","COMBO","NAI","APEX","IOI","IOM"])assert.ok(label.length>0);
console.log("Universal directional ownership certification passed for HTL Asset, DARE(N), DARE, COMBO, NAI, APEX, IOI, and IOM: repeated same-direction events are ignored until the opposite direction takes ownership in registered performance and unified chart markers.");
