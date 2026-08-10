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
assert.equal(api.VERSION,"CTE_CHART_IOI_IOM@1.0.0");

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
assert.deepEqual(Array.from(signals,signal=>signal.direction),[-1,1,-1,1],"cross signals must alternate BUY/SELL only when line ownership changes");

assert.match(source,/CHART_INDICATORS\.IOI=\{price:\[\["ioi","IOI"/,"IOI must own exactly its two chart lines");
assert.match(source,/CHART_INDICATORS\.IOM=\{price:\[\["ioiMean","IOM Mean"/,"IOM must own exactly its mean and recovered inverse lines");
assert.match(source,/IOI · Indicator Only Indicator/);
assert.match(source,/IOM · Indicator Only Mean/);
assert.match(source,/if\(!CHART_ONLY_IDS\.has\(strategy\)\)return priorDraw\(\)/,"existing chart indicators must retain their current renderer");
assert.match(source,/if\(!CHART_ONLY_IDS\.has\(strategy\)\)return priorRefresh/,"registered analytical strategies must retain their current causal refresh path");
assert.match(worker,/chart-indicator-ownership\.js[^]*chart-ioi-iom\.js/,"IOI/IOM extension must load after singular chart ownership");
assert.doesNotMatch(source,/engineStrategy|indicatorOnlyIndicator|scheduleStrategy/,"IOI/IOM must be added only to the Forensic chart selector");

console.log("IOI/IOM chart certification passed: IOI averages instrument/HTL lines, IOM standardizes the IOI mean and recovers its inverse, crossing signals are singularly owned, and only the Forensic chart selector is extended.");
