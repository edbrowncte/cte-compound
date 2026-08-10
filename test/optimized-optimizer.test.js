import test from "node:test";
import assert from "node:assert/strict";
import { optimizeDataset as originalOptimizeDataset } from "../src/horizon-platform-engine.js";
import { optimizedOptimizeDataset, DIRECTIONAL_OWNERSHIP_VERSION } from "../src/optimized-optimizer.js";

function generateCandles(count = 300) {
  const rows = [];
  let prior = 1.1000;
  const start = Date.parse("2026-01-01T00:00:00.000Z");
  for (let index = 0; index < count; index++) {
    const close = 1.1 + Math.sin(index / 9) * .004 + Math.sin(index / 31) * .002 + (((index * 17) % 11) - 5) * .00008;
    const open = prior, wick = .00035 + ((index * 7) % 5) * .00004;
    rows.push({
      time: new Date(start + index * 60000).toISOString(),
      open,
      high: Math.max(open, close) + wick,
      low: Math.min(open, close) - wick,
      close,
      complete: true
    });
    prior = close;
  }
  return rows;
}

test("optimizedOptimizeDataset preserves the original six-indicator configuration while extending analytical performance", () => {
  const candles = generateCandles(300);
  const pair = "NZD_CAD";
  const original = originalOptimizeDataset(candles, pair);
  const optimized = optimizedOptimizeDataset(candles, pair);

  assert.deepEqual(optimized.settings, original.settings, "optimized settings must match original");
  const originalIds = Object.keys(original.config);
  const preservedConfig = Object.fromEntries(originalIds.map(id => [id, optimized.config[id]]));
  assert.deepEqual(preservedConfig, original.config, "existing six-indicator configuration metrics must match original exactly");
  assert.ok(optimized.config.IOI && optimized.config.IOM, "IOI and IOM analytical configuration results must be additive");
  assert.equal(optimized.directionalOwnershipVersion, DIRECTIONAL_OWNERSHIP_VERSION);

  assert.equal(optimized.grossPerformance.length, original.grossPerformance.length + 2, "Macro performance must add IOI and IOM to the six existing indicators");
  const labels = optimized.grossPerformance.map(row => row.Strategy);
  for (const label of ["HTL Asset", "DARE(N)", "DARE", "COMBO", "NAI", "APEX"]) assert.ok(labels.includes(label), `Macro performance must retain ${label}`);
  assert.ok(labels.some(label => String(label).startsWith("IOI")), "Macro performance must include IOI");
  assert.ok(labels.some(label => String(label).startsWith("IOM")), "Macro performance must include IOM");
});
