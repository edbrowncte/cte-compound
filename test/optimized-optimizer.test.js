import test from "node:test";
import assert from "node:assert/strict";
import {
  optimizedOptimizeDataset,
  DIRECTIONAL_OWNERSHIP_VERSION,
  RUNTIME_OPTIMIZER_VERSION,
  bootstrapH2OptimizerCoverage,
} from "../src/optimized-optimizer.js";
import {
  CONFIGURATION_OPTIMIZER_OBJECTIVE_VERSION,
  configurationLengthCandidates,
  configurationFilterCandidates,
  candidateFitQuality,
} from "../src/configuration-optimizer-quality.js";

function generateCandles(count = 300, fast = 9, slow = 31) {
  const rows = [];
  let prior = 1.1000;
  const start = Date.parse("2026-01-01T00:00:00.000Z");
  for (let index = 0; index < count; index++) {
    const close = 1.1 + Math.sin(index / fast) * .004 + Math.sin(index / slow) * .002 + (((index * 17) % 11) - 5) * .00008;
    const open = prior, wick = .00035 + ((index * 7) % 5) * .00004;
    rows.push({time:new Date(start + index * 60000).toISOString(),open,high:Math.max(open,close)+wick,low:Math.min(open,close)-wick,close,complete:true});
    prior = close;
  }
  return rows;
}

test("optimizer v8 exposes timeframe-aware search order with broad common length support and fine sub-1 filters", () => {
  assert.equal(RUNTIME_OPTIMIZER_VERSION,8);
  const s30=configurationLengthCandidates("S30",5000),m5=configurationLengthCandidates("M5",5000),m30=configurationLengthCandidates("M30",5000),weekly=configurationLengthCandidates("W",5000);
  assert.equal(s30[0],100,"S30 prior should seed long smoothing first");
  assert.equal(m5[0],75,"M5 prior should seed a moderately long read first");
  assert.equal(m30[0],20,"M30 prior should seed a short-to-moderate read first");
  assert.equal(weekly[0],10,"W prior should seed a responsive short read first");
  for(const grid of [s30,m5,m30,weekly])for(const required of [10,20,50,100,150])assert.ok(grid.includes(required),`${required} must remain in common support so the prior cannot hardcode the answer`);
  for(const value of [.05,.1,.2,.3]){
    assert.ok(configurationFilterCandidates("DARE_N").includes(value));
    assert.ok(configurationFilterCandidates("NAI").includes(value));
  }
});

test("fit-quality objective penalizes trivial sparse candidates", () => {
  const healthyTrades=Array.from({length:24},(_,index)=>({net:1+.05*index}));
  const healthyStats={average:1.575,wins:24,grossWinning:37.8,grossLosing:0,mfeMae:2.2,profitFactor:Infinity,recoveryFactor:Infinity,maxDrawdown:0};
  const sparseTrades=[{net:8},{net:9}],sparseStats={average:8.5,wins:2,grossWinning:17,grossLosing:0,mfeMae:4,profitFactor:Infinity,recoveryFactor:Infinity,maxDrawdown:0};
  const healthy=candidateFitQuality(healthyTrades,healthyStats,5000),sparse=candidateFitQuality(sparseTrades,sparseStats,5000);
  assert.equal(healthy.eligible,true);
  assert.equal(sparse.eligible,false);
  assert.ok(sparse.sparsePenalty>0);
  assert.ok(healthy.score>sparse.score,"two spectacular trades must not outrank a statistically supported candidate merely because net pips are high");
});

test("optimizedOptimizeDataset performs an auditable coherent six-indicator search while retaining IOI/IOM additively", () => {
  const candles=generateCandles(300),pair="NZD_CAD",optimized=optimizedOptimizeDataset(candles,pair,"M5");
  assert.equal(optimized.optimizerObjectiveVersion,CONFIGURATION_OPTIMIZER_OBJECTIVE_VERSION);
  assert.equal(optimized.directionalOwnershipVersion,DIRECTIONAL_OWNERSHIP_VERSION);
  assert.equal(optimized.optimizerDiagnostics.timeframe,"M5");
  assert.ok(optimized.optimizerDiagnostics.evaluatedCandidates>100,"the optimizer must evaluate a genuine candidate population");
  assert.ok(optimized.optimizerDiagnostics.strategies.DARE_N.topCandidates.length>0);
  assert.ok(optimized.config.DARE_N.candidateFilters.includes(.05));
  assert.ok(optimized.config.NAI.candidateFilters.includes(.3));
  assert.equal(optimized.config.ASSET.length,optimized.config.DARE.length,"ASSET and DARE must share one selected root geometry");
  assert.equal(optimized.config.ASSET.selectionMode,"SHARED_ASSET_DARE_ROOT");
  assert.equal(optimized.config.COMBO.selectionMode,"DERIVED_FROM_FINAL_COHERENT_SETTINGS");
  assert.ok(Number.isFinite(optimized.config.DARE_N.score));
  assert.ok(Number.isFinite(optimized.config.NAI.score));

  const labels=optimized.grossPerformance.map(row=>row.Strategy);
  for(const label of ["HTL Asset","DARE(N)","DARE","COMBO","NAI","APEX"])assert.ok(labels.includes(label),`Macro performance must retain ${label}`);
  assert.ok(labels.some(label=>String(label).startsWith("IOI")),"Macro performance must include IOI");
  assert.ok(labels.some(label=>String(label).startsWith("IOM")),"Macro performance must include IOM");
});

test("H2 coverage is no longer fabricated from H1", () => {
  const records={"EUR_USD|H1":{version:8,settings:{assetLength:10}}},resolved=bootstrapH2OptimizerCoverage(records);
  assert.ok(resolved["EUR_USD|H1"]);
  assert.equal(resolved["EUR_USD|H2"],undefined,"H2 must remain missing until H2 candles are actually optimized");
});
