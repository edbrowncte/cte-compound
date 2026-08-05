import test from "node:test";
import assert from "node:assert/strict";
import { optimizeDataset as originalOptimizeDataset } from "../src/horizon-platform-engine.js";
import { optimizedOptimizeDataset } from "../src/optimized-optimizer.js";

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

test("optimizedOptimizeDataset reproduces the original optimizeDataset output exactly", () => {
  const candles = generateCandles(300);
  const pair = "NZD_CAD";
  const original = originalOptimizeDataset(candles, pair);
  const optimized = optimizedOptimizeDataset(candles, pair);

  assert.deepEqual(optimized.settings, original.settings, "optimized settings must match original");
  assert.deepEqual(optimized.config, original.config, "optimized config must match original");
  assert.deepEqual(optimized.grossPerformance, original.grossPerformance, "optimized grossPerformance must match original");
});
