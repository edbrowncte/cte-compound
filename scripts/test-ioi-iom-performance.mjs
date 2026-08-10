import assert from "node:assert/strict";
import fs from "node:fs";
import { buildIoiIomSeries, crossingSignals, evaluateIoiIomPerformance, optimizeIoiIomPerformance, IOI_IOM_PERFORMANCE_VERSION } from "../src/ioi-iom-performance.js";

const candles=Array.from({length:900},(_,index)=>{
  const base=1.1+index*0.00001+Math.sin(index/11)*0.002+Math.sin(index/37)*0.0012;
  const open=base+Math.sin(index/5)*0.0002,close=base+Math.cos(index/7)*0.0002;
  return{time:new Date(Date.UTC(2026,0,1,0,index)).toISOString(),open,high:Math.max(open,close)+0.00035,low:Math.min(open,close)-0.00035,close,complete:true};
});

const built=buildIoiIomSeries(candles,20);
assert.equal(built.ioi.length,candles.length);
assert.equal(built.ioiInverse.length,candles.length);
assert.equal(built.iomMean.length,candles.length);
assert.equal(built.iomInverse.length,candles.length);
for(let index=0;index<candles.length;index++)if(Number.isFinite(built.asset[index]))assert.equal(built.ioi[index],(candles[index].close+built.asset[index])/2,"IOI must average instrument and causal HTL Asset");
for(let index=0;index<candles.length;index++)if(Number.isFinite(built.ioi[index])&&Number.isFinite(built.ioiInverse[index]))assert.equal(built.iomMean[index],(built.ioi[index]+built.ioiInverse[index])/2,"IOM Mean must average IOI and IOI Inverse");
for(let index=0;index<candles.length;index++)if(Number.isFinite(built.iomZ[index]))assert.ok(Math.abs(built.iomInverse[index]-((-built.iomZ[index]*built.iomStd[index])+built.iomCenter[index]))<1e-12,"IOM inverse recovery must use -z × std + rolling mean");

const ioiSignals=crossingSignals(built.ioi,built.ioiInverse,"IOI"),iomSignals=crossingSignals(built.iomMean,built.iomInverse,"IOM");
assert.ok(ioiSignals.length>4,"IOI fixture must produce multiple crossing signals");
assert.ok(iomSignals.length>4,"IOM fixture must produce multiple crossing signals");
for(const signals of [ioiSignals,iomSignals])for(let index=1;index<signals.length;index++)assert.equal(signals[index].direction,-signals[index-1].direction,"opposite crossing signals must alternate");

const evaluated=evaluateIoiIomPerformance(candles,"EUR_USD",20);
for(const strategy of ["IOI","IOM"]){const stats=evaluated[strategy].stats;assert.ok(Number.isInteger(stats.trades));assert.ok(Number.isFinite(stats.net));assert.ok("profitFactor" in stats&&"recoveryFactor" in stats&&"mfeMae" in stats);}
const optimized=optimizeIoiIomPerformance(candles,"EUR_USD","M1",[10,20,30,40,50],"REGISTERED_HORIZON_STRATEGY_V1_GROSS","horizon-strategy-v1");
assert.equal(optimized.version,IOI_IOM_PERFORMANCE_VERSION);
for(const strategy of ["IOI","IOM"]){assert.ok(optimized.config[strategy]);assert.ok([10,20,30,40,50].includes(optimized.config[strategy].length));assert.equal(optimized.config[strategy].filter,0);assert.ok(optimized.config[strategy].grossPerformance);}
assert.deepEqual(optimized.rows.map(row=>row.Indicator),["IOI","IOM"]);

const engine=fs.readFileSync(new URL("../src/engine-ioi-iom-performance.js",import.meta.url),"utf8"),worker=fs.readFileSync(new URL("../src/worker.js",import.meta.url),"utf8"),ui=fs.readFileSync(new URL("../public/ioi-iom-performance.js",import.meta.url),"utf8");
assert.match(engine,/super\.computeConfiguration\(value\)/,"IOI/IOM analytics must extend the existing authoritative Compute Configuration result");
assert.match(engine,/runtimeOptimizerStorageKey\(result\.key\)/,"augmented IOI/IOM configuration must persist in the same optimizer record");
assert.match(worker,/engine-ioi-iom-performance\.js/);
assert.match(worker,/chart-ioi-iom\.js[^]*ioi-iom-performance\.js/);
assert.match(ui,/Macro: HTL Asset \/ DARE\(N\) \/ DARE \/ COMBO \/ NAI \/ APEX \/ IOI \/ IOM Performance/);
assert.match(ui,/renderMacroPerformance=function/);
assert.match(ui,/renderStrategyConfiguration=function/);
assert.match(ui,/renderOptimizerRegistry=function/);

console.log("IOI/IOM performance certification passed: causal formulas, crossing trades, next-open/opposite-signal statistics, Compute Configuration persistence, Macro rows, configuration cards, and optimizer registry integration are wired without adding IOI/IOM to automated execution strategies.");
