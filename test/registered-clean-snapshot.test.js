import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { evaluateRegisteredPerformance, registeredExportRows } from "../src/horizon-registered-performance.js";

const sha256=value=>createHash("sha256").update(value).digest("hex");
const fixtureUrl=name=>new URL(`./fixtures/${name}`,import.meta.url);

const manifest=JSON.parse(await readFile(fixtureUrl("registered-horizon-clean-manifest.json"),"utf8"));
const expectedRows=JSON.parse(await readFile(fixtureUrl("registered-horizon-clean-performance.json"),"utf8"));
const contamination=JSON.parse(await readFile(fixtureUrl("legacy-horizon-contamination-evidence.json"),"utf8"));
const candleGzip=await readFile(fixtureUrl("registered-horizon-clean-candles.json.gz"));
const candleRaw=gunzipSync(candleGzip);
const snapshot=JSON.parse(candleRaw.toString("utf8"));

const settings=manifest.settings;

function compareRows(actual,expected){
  assert.equal(actual.length,168,"clean performance must contain 28 pairs × 6 strategies");
  assert.equal(expected.length,168,"frozen clean baseline must contain 168 rows");
  assert.deepEqual(actual,expected,"every clean registered-Horizon performance field must reproduce exactly");
}

test("clean candle snapshot is immutable and internally authenticated",()=>{
  assert.equal(manifest.format,"registered-horizon-clean-certification-manifest-v1");
  assert.equal(manifest.sourceVersion,"horizon-strategy-v1");
  assert.equal(manifest.performanceVersion,"registered-horizon-performance-v1");
  assert.equal(manifest.pairs,28);
  assert.equal(manifest.rows,168);
  assert.equal(manifest.barsPerPair,3000);
  assert.equal(sha256(candleGzip),manifest.candleSnapshotGzipSha256);
  assert.equal(sha256(candleRaw),manifest.candleSnapshotSha256);
  assert.equal(sha256(await readFile(fixtureUrl("registered-horizon-clean-performance.json"))),manifest.cleanPerformanceSha256);
  assert.equal(snapshot.pairs.length,28);
  for(const pair of snapshot.pairs){
    const candles=snapshot.candlesByPair[pair];
    assert.equal(candles.length,3000,`${pair} must contain exactly 3000 completed candles`);
    assert.equal(sha256(JSON.stringify(candles)),manifest.pairHashes[pair],`${pair} candle hash must match manifest`);
    assert.ok(candles.every(candle=>candle.complete===true),`${pair} snapshot must contain completed candles only`);
  }
});

test("registered six-strategy engine reproduces all 168 clean rows exactly",()=>{
  const actual=[];
  for(const pair of snapshot.pairs){
    const rows=registeredExportRows(
      evaluateRegisteredPerformance(snapshot.candlesByPair[pair],pair,settings),
      pair,
      "M1",
    );
    actual.push(...rows);
  }
  compareRows(actual,expectedRows);
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
