import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source=fs.readFileSync(new URL("../public/chart-ioi-iom.js",import.meta.url),"utf8");
const worker=fs.readFileSync(new URL("../src/worker.js",import.meta.url),"utf8");
const sandbox={console,Math,Number,Array,Map,Set,Object,String,Boolean,Date};
sandbox.globalThis=sandbox;
vm.runInNewContext(source,sandbox,{filename:"chart-ioi-iom.js"});
const api=sandbox.CTEChartIOIIOM;
assert.ok(api,"IOI/IOM chart module must publish its testable formula surface");
assert.equal(api.VERSION,"CTE_CHART_IOI_IOM@1.0.3");

const candles=[10,11,12,13,14,15].map((close,index)=>({close,time:`t${index}`}));
const htl={asset:[12,12,13,14,15,16],inverse:[8,9,10,11,12,13]};
const built=api.buildIoiIom(candles,htl,3);
for(let index=0;index<candles.length;index++){
  assert.equal(built.ioi[index],(candles[index].close+htl.asset[index])/2,"IOI must average instrument close and HTL Asset");
  assert.equal(built.ioiInverse[index],(candles[index].close+htl.inverse[index])/2,"IOI Inverse must average instrument close and HTL Asset Inverse");
  assert.equal(built.ioiMean[index],(built.ioi[index]+built.ioiInverse[index])/2,"IOM Mean source must average the two IOI lines");
}
for(let index=2;index<candles.length;index++){
  const window=built.ioiMean.slice(index-2,index+1),center=window.reduce((sum,value)=>sum+value,0)/window.length,std=Math.sqrt(window.reduce((sum,value)=>sum+(value-center)**2,0)/window.length),z=std>1e-12?(built.ioiMean[index]-center)/std:null,expected=z===null?null:(-z*std)+center;
  assert.ok(Math.abs(built.iomCenter[index]-center)<1e-12,"IOM center must be the rolling arithmetic mean of IOI mean");
  assert.ok(Math.abs(built.iomStd[index]-std)<1e-12,"IOM standard deviation must be calculated from IOI mean");
  assert.ok(Math.abs(built.iomZ[index]-z)<1e-12,"IOM z must standardize IOI mean");
  assert.ok(Math.abs(built.iomInverse[index]-expected)<1e-12,"IOM inverse must recover -z × std + rolling mean");
}

const signals=api.crossSignalSeries(candles,[1,2,1,0,2,3],[2,1,1,1,1,2],0);
assert.deepEqual(Array.from(signals,signal=>signal.direction),[-1,1,-1,1],"IOI/IOM chart signals must contain ownership transitions only");
assert.equal(signals.at(-1)?.current,true,"the latest true transition must carry ACTIVE ownership");
assert.equal(signals.at(-1)?.index,4,"ACTIVE ownership must remain on the transition candle rather than manufacture a duplicate latest-candle marker");
for(let index=1;index<signals.length;index++)assert.equal(signals[index].direction,-signals[index-1].direction,"IOI/IOM ownership transitions must alternate");

assert.match(source,/CHART_INDICATORS\.IOI=\{price:\[\["ioi","IOI"/,"IOI must own exactly its two chart lines");
assert.match(source,/CHART_INDICATORS\.IOM=\{price:\[\["ioiMean","IOM Mean"/,"IOM must own exactly its mean and recovered inverse lines");
assert.match(source,/IOI · Indicator Only Indicator/);
assert.match(source,/IOM · Indicator Only Mean/);
assert.match(source,/if\(!CHART_ONLY_IDS\.has\(strategy\)\)return priorDraw\(\)/,"existing chart indicators must retain their current renderer");
assert.match(source,/if\(!CHART_ONLY_IDS\.has\(strategy\)\)return priorRefresh/,"existing indicators must retain their current causal refresh path");
assert.match(source,/refreshMainPressure=async function\(pair,timeframe\)/,"IOI/IOM must participate in the shared MAS/IM pressure surface");
assert.match(source,/buildSelected\(data,length,strategy,filter\).*events=built\.signals\.map/s,"MAS/IM pressure must use the selected IOI/IOM ownership transitions");
assert.match(source,/calculateMASIMPressure\(pair,timeframe,frames,\{direction,events\}\)/,"MAS/IM must receive the actual IOI/IOM owner instead of a missing six-indicator lookup");
assert.match(worker,/chart-indicator-ownership\.js[^]*chart-ioi-iom\.js/,"IOI/IOM extension must load after singular chart ownership");
assert.doesNotMatch(source,/engineStrategy|indicatorOnlyIndicator|scheduleStrategy/,"IOI/IOM chart module must not alter automated execution selectors");

console.log("IOI/IOM chart certification passed: formulas remain causal, one transition marker carries active ownership, IOI/IOM drive their own MAS/IM pressure direction, and automated execution selectors remain untouched.");
