import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { evaluateRegisteredPerformance, registeredExportRows } from "../src/horizon-registered-performance.js";

const sha256=value=>createHash("sha256").update(value).digest("hex");
const fixtureUrl=name=>new URL(`./fixtures/${name}`,import.meta.url);

const manifest=JSON.parse(await readFile(fixtureUrl("registered-horizon-clean-manifest.json"),"utf8"));
const pairIndex=JSON.parse(await readFile(fixtureUrl("registered-horizon-clean-pairs.json"),"utf8"));
const expectedPerformanceBuffer=await readFile(fixtureUrl("registered-horizon-clean-performance.json"));
const expectedRows=JSON.parse(expectedPerformanceBuffer.toString("utf8"));
const contamination=JSON.parse(await readFile(fixtureUrl("legacy-horizon-contamination-evidence.json"),"utf8"));
const settings=manifest.settings;

function expectedPairRows(pair){
  const label=pair.replace("_"," / ");
  return expectedRows.filter(row=>row.Pair===label);
}

async function loadPair(entry){
  const gzip=await readFile(fixtureUrl(`registered-horizon-clean-candles/${entry.file}`));
  assert.equal(sha256(gzip),entry.gzipSha256,`${entry.pair} gzip hash must match pair index`);
  const raw=gunzipSync(gzip);
  const candles=JSON.parse(raw.toString("utf8"));
  assert.equal(candles.length,manifest.barsPerPair,`${entry.pair} must contain exactly 3000 completed candles`);
  assert.equal(sha256(JSON.stringify(candles)),entry.candleSha256,`${entry.pair} candle hash must match pair index`);
  assert.equal(entry.candleSha256,manifest.pairHashes[entry.pair],`${entry.pair} candle hash must match aggregate manifest`);
  assert.ok(candles.every(candle=>candle.complete===true),`${entry.pair} snapshot must contain completed candles only`);
  assert.equal(candles[0]?.time,entry.firstCandle,`${entry.pair} first candle must match pair index`);
  assert.equal(candles.at(-1)?.time,entry.lastCandle,`${entry.pair} last candle must match pair index`);
  return candles;
}

test("clean pair-scoped evidence is immutable and internally authenticated",async()=>{
  assert.equal(manifest.format,"registered-horizon-clean-certification-manifest-v1");
  assert.equal(manifest.sourceVersion,"horizon-strategy-v1");
  assert.equal(manifest.performanceVersion,"registered-horizon-performance-v1");
  assert.equal(manifest.pairs,28);
  assert.equal(manifest.rows,168);
  assert.equal(manifest.barsPerPair,3000);
  assert.equal(pairIndex.format,"registered-horizon-clean-pair-index-v1");
  assert.equal(pairIndex.aggregateSnapshotSha256,manifest.candleSnapshotSha256);
  assert.equal(pairIndex.aggregateSnapshotGzipSha256,manifest.candleSnapshotGzipSha256);
  assert.equal(pairIndex.barsPerPair,manifest.barsPerPair);
  assert.equal(pairIndex.pairs.length,28);
  assert.equal(sha256(expectedPerformanceBuffer),manifest.cleanPerformanceSha256);
  assert.equal(expectedRows.length,168);
  for(const entry of pairIndex.pairs){
    await loadPair(entry);
  }
});

test("registered six-strategy engine reproduces all 168 clean rows exactly",async()=>{
  let certifiedRows=0;
  for(const entry of pairIndex.pairs){
    const candles=await loadPair(entry);
    const actual=registeredExportRows(
      evaluateRegisteredPerformance(candles,entry.pair,settings),
      entry.pair,
      "M1",
    );
    const expected=expectedPairRows(entry.pair);
    assert.equal(actual.length,6,`${entry.pair} must produce six registered strategy rows`);
    assert.equal(expected.length,6,`${entry.pair} clean baseline must contain six strategy rows`);
    assert.deepEqual(actual,expected,`${entry.pair} six-strategy performance must reproduce exactly`);
    certifiedRows+=actual.length;
  }
  assert.equal(certifiedRows,168,"all 168 clean registered-Horizon rows must be certified");
});

test("legacy benchmark is rejected rather than emulated",()=>{
  assert.equal(manifest.legacyBenchmark.status,"REJECTED_DATA_CONTAMINATION");
  assert.equal(contamination.crossInstrumentFinding.verdict,"REJECTED_DATA_CONTAMINATION");
  assert.equal(contamination.sourceFiles.tradeLedgerAudit.rows,6431);
  assert.equal(contamination.sourceFiles.performanceExport.rows,168);
  assert.equal(contamination.crossInstrumentFinding.nzdUsdTrades,226);
  assert.equal(contamination.crossInstrumentFinding.nzdCadTrades,250);
  assert.equal(contamination.crossInstrumentFinding.exactDuplicateTradeTuples,198);
  assert.deepEqual(contamination.crossInstrumentFinding.nzdUsdObservedPriceRange,[0.57675,0.81828]);
  assert.deepEqual(contamination.crossInstrumentFinding.nzdCadObservedPriceRange,[0.81317,0.81828]);
});
