from pathlib import Path


def replace_once(path, old, new):
    p = Path(path)
    text = p.read_text()
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{path}: expected exactly one match, found {count}: {old[:80]!r}")
    p.write_text(text.replace(old, new, 1))


# Canonical public HTL: attachment extrema Asset, direct mirror Inverse,
# Asset Mean = average(Asset, Inverse), Asset Mean Inverse = mirror of Asset Mean.
htl = Path("public/htl-horizon-contract.js")
text = htl.read_text()
text = text.replace(
    "CTE_HORIZON_HTL_ASSET_CROSSING@1.0.0",
    "CTE_HORIZON_HTL_ASSET_CROSSING@2.0.0",
    1,
)
old = """    const assetMean = wma(assetResult.values, normalizedLength);
    const assetDeviation = stdev(assetResult.values, normalizedLength);
    const assetZ = normalizedDifference(assetResult.values, assetMean, assetDeviation);
    const inverse = recoverInverse(assetZ, assetDeviation, assetMean);
    const crossings = assetCrossings(clean, assetResult.values, inverse);"""
new = """    const inverseWma = wma(assetResult.values, normalizedLength);
    const inverse = assetResult.values.map((value, index) =>
      finite(value) && finite(inverseWma[index]) ? (2 * inverseWma[index]) - value : null,
    );
    const assetMean = pairAverage(assetResult.values, inverse);
    const assetMeanWma = wma(assetMean, normalizedLength);
    const assetMeanInverse = assetMean.map((value, index) =>
      finite(value) && finite(assetMeanWma[index]) ? (2 * assetMeanWma[index]) - value : null,
    );
    const assetDeviation = stdev(assetResult.values, normalizedLength);
    const assetZ = normalizedDifference(assetResult.values, inverseWma, assetDeviation);
    const crossings = assetCrossings(clean, assetResult.values, inverse);"""
if text.count(old) != 1:
    raise SystemExit("canonical HTL old inverse block not found exactly once")
text = text.replace(old, new, 1)
old = """      version: VERSION,
      length: normalizedLength,
      candles: clean,
      series,
      asset: assetResult.values,
      inverse,
      assetMean,
      assetDeviation,"""
new = """      version: VERSION,
      formula: "ATTACHMENT_HTL_ASSET_DIRECT_MIRROR@1.0.0",
      length: normalizedLength,
      candles: clean,
      series,
      asset: assetResult.values,
      inverse,
      assetMean,
      assetMeanInverse,
      meanAsset: assetMean,
      meanInverse: assetMeanInverse,
      assetDeviation,"""
if text.count(old) != 1:
    raise SystemExit("canonical HTL return block not found exactly once")
htl.write_text(text.replace(old, new, 1))

# Strategy qualification consumes canonical Asset Mean / Asset Mean Inverse.
strategy = Path("public/horizon-strategy-contract.js")
text = strategy.read_text()
old = """  const VERSION="CTE_HORIZON_STRATEGY_QUALIFICATION@1.0.0",finite=Number.isFinite,pairAverage=(left,right)=>left.map((value,index)=>finite(value)&&finite(right[index])?(value+right[index])/2:null),signRelation=(left,right,threshold=0)=>finite(left)&&finite(right)?left-right>threshold?1:left-right<-threshold?-1:0:0;
  function buildIndicators(candles,length){const horizon=H.build(candles,length),meanAsset=pairAverage(horizon.asset,horizon.inverse),meanCenter=H.wma(meanAsset,length),meanInverse=meanAsset.map((value,index)=>finite(value)&&finite(meanCenter[index])?(2*meanCenter[index])-value:null),assetCenter=H.wma(horizon.asset,length),inverseCenter=H.wma(horizon.inverse,length),naiAsset=H.normalizedDifference(horizon.asset,assetCenter,H.stdev(horizon.asset,length)),naiInverse=H.normalizedDifference(horizon.inverse,inverseCenter,H.stdev(horizon.inverse,length)),dareNAsset=H.normalizedDifference(meanAsset,H.wma(meanAsset,length),H.stdev(meanAsset,length)),dareNInverse=H.normalizedDifference(meanInverse,H.wma(meanInverse,length),H.stdev(meanInverse,length));return{horizon,asset:horizon.asset,inverse:horizon.inverse,assetDeviation:horizon.assetDeviation,meanAsset,meanInverse,naiAsset,naiInverse,dareNAsset,dareNInverse,zup:horizon.series.zup,puz:horizon.series.puz};}"""
new = """  const VERSION="CTE_HORIZON_STRATEGY_QUALIFICATION@1.0.0",finite=Number.isFinite,signRelation=(left,right,threshold=0)=>finite(left)&&finite(right)?left-right>threshold?1:left-right<-threshold?-1:0:0;
  function buildIndicators(candles,length){const horizon=H.build(candles,length),assetMean=horizon.assetMean||horizon.meanAsset||[],assetMeanInverse=horizon.assetMeanInverse||horizon.meanInverse||[],naiAssetWma=H.wma(horizon.asset,length),naiInverseWma=H.wma(horizon.inverse,length),naiAsset=H.normalizedDifference(horizon.asset,naiAssetWma,H.stdev(horizon.asset,length)),naiInverse=H.normalizedDifference(horizon.inverse,naiInverseWma,H.stdev(horizon.inverse,length)),dareNAsset=H.normalizedDifference(assetMean,H.wma(assetMean,length),H.stdev(assetMean,length)),dareNInverse=H.normalizedDifference(assetMeanInverse,H.wma(assetMeanInverse,length),H.stdev(assetMeanInverse,length));return{horizon,asset:horizon.asset,inverse:horizon.inverse,assetMean,assetMeanInverse,assetDeviation:horizon.assetDeviation,meanAsset:assetMean,meanInverse:assetMeanInverse,naiAsset,naiInverse,dareNAsset,dareNInverse,zup:horizon.series.zup,puz:horizon.series.puz};}"""
if text.count(old) != 1:
    raise SystemExit("strategy canonical derivative block not found exactly once")
strategy.write_text(text.replace(old, new, 1))

# Chart must consume canonical HTL instead of maintaining an alternate rolling-extreme Asset.
chart = Path("public/chart-indicator-ownership.js")
text = chart.read_text().replace(
    "CTE_CHART_INDICATOR_OWNERSHIP@1.0.4",
    "CTE_CHART_INDICATOR_OWNERSHIP@1.1.0",
    1,
)
start = text.index("  function selectedCross(left,right,index){")
end = text.index("  function assetSignalSeries(candles,htl,filter=0){")
replacement = """  function selectedHtlCausal(data,length){
    const candles=Array.isArray(data)?data:[],resolvedLength=clamp(Math.round(Number(length)||10),3,MAX_ANALYTICAL_LENGTH),htl=htlBuild(candles,resolvedLength);
    if(!htl||!Array.isArray(htl.asset)||!Array.isArray(htl.inverse))throw new Error("Canonical HTL Asset / Asset Inverse package is unavailable for the selected chart");
    const assetMean=Array.isArray(htl.assetMean)?htl.assetMean:Array.isArray(htl.meanAsset)?htl.meanAsset:htlPairAverage(htl.asset,htl.inverse),assetMeanInverse=Array.isArray(htl.assetMeanInverse)?htl.assetMeanInverse:Array.isArray(htl.meanInverse)?htl.meanInverse:[];
    return{...htl,assetMean,assetMeanInverse,meanAsset:assetMean,meanInverse:assetMeanInverse,causal:true};
  }

"""
text = text[:start] + replacement + text[end:]
start = text.index("  function selectedIndicatorSet(candles,length,strategy){")
end = text.index("  CHART_INDICATORS.COMBO={")
replacement = """  function selectedIndicatorSet(candles,length,strategy){
    const data=Array.isArray(candles)?candles:[],resolvedLength=clamp(Math.round(Number(length)||10),3,MAX_ANALYTICAL_LENGTH),id=CHART_INDICATORS[strategy]?strategy:"ASSET";
    if(!data.length)return normalizeUnifiedIndicators(data,{});
    const htl=selectedHtlCausal(data,resolvedLength),assetMean=htl.assetMean,assetMeanInverse=htl.assetMeanInverse,selected={};

    if(id==="ASSET"){
      selected.asset=htl.asset;
      selected.inverse=htl.inverse;
    }else if(id==="DARE"){
      selected.meanAsset=assetMean;
      selected.meanInverse=assetMeanInverse;
    }else if(id==="DARE_N"){
      selected.dareNAsset=htlNorm(assetMean,htlSeriesWma(assetMean,resolvedLength),htlSeriesStdev(assetMean,resolvedLength));
      selected.dareNInverse=htlNorm(assetMeanInverse,htlSeriesWma(assetMeanInverse,resolvedLength),htlSeriesStdev(assetMeanInverse,resolvedLength));
    }else if(id==="NAI"){
      selected.naiAsset=htlNorm(htl.asset,htlSeriesWma(htl.asset,resolvedLength),htlSeriesStdev(htl.asset,resolvedLength));
      selected.naiInverse=htlNorm(htl.inverse,htlSeriesWma(htl.inverse,resolvedLength),htlSeriesStdev(htl.inverse,resolvedLength));
    }else if(id==="APEX"){
      selected.zup=Array.isArray(htl.series?.zup)?htl.series.zup:[];
      selected.puz=Array.isArray(htl.series?.puz)?htl.series.puz:[];
    }else if(id==="COMBO"){
      selected.meanAsset=assetMean;
      selected.meanInverse=assetMeanInverse;
      selected.naiAsset=htlNorm(htl.asset,htlSeriesWma(htl.asset,resolvedLength),htlSeriesStdev(htl.asset,resolvedLength));
      selected.naiInverse=htlNorm(htl.inverse,htlSeriesWma(htl.inverse,resolvedLength),htlSeriesStdev(htl.inverse,resolvedLength));
    }
    return normalizeUnifiedIndicators(data,selected);
  }

"""
chart.write_text(text[:start] + replacement + text[end:])

# System observability/versioning must identify the new root formula.
replace_once(
    "src/worker-horizon-base.js",
    "CTE_HORIZON_HTL_ASSET_CROSSING@1.0.0",
    "CTE_HORIZON_HTL_ASSET_CROSSING@2.0.0",
)
replace_once(
    "src/worker-horizon-base.js",
    "COMPLETED_CANDLE_ASSET_RECOVERED_INVERSE_CROSS",
    "COMPLETED_CANDLE_ATTACHMENT_ASSET_DIRECT_MIRROR_CROSS",
)
replace_once(
    "public/platform-horizon-runtime.js",
    "completed-candle Asset / recovered-inverse crossover and crossunder",
    "completed-candle Asset / direct-WMA-mirror Asset Inverse crossover and crossunder",
)
replace_once(
    "scripts/test-horizon-platform-base.mjs",
    "/^CTE_HORIZON_HTL_ASSET_CROSSING@1\\.0\\.0:[0-9a-f]{8}$/",
    "/^CTE_HORIZON_HTL_ASSET_CROSSING@2\\.0\\.0:[0-9a-f]{8}$/",
)

# Update chart ownership regression contract.
test = Path("scripts/test-chart-indicator-ownership.mjs")
text = test.read_text().replace(
    "CTE_CHART_INDICATOR_OWNERSHIP@1\\.0\\.4",
    "CTE_CHART_INDICATOR_OWNERSHIP@1\\.1\\.0",
    1,
)
old = """assert.match(ownership,/function selectedCross\\(left,right,index\\)/,"selected chart must own a guarded HTL crossing helper");
assert.match(ownership,/!Array\\.isArray\\(left\\)\\|\\|!Array\\.isArray\\(right\\)/,"selected HTL crossing must reject unavailable source arrays before numeric indexing");
assert.match(ownership,/function selectedHtlCausal\\(data,length\\)/,"selected chart must have an isolated causal HTL builder");
assert.match(ownership,/validFamilies=families\\.filter\\(\\(\\[,left,right\\]\\)=>Array\\.isArray\\(left\\)&&Array\\.isArray\\(right\\)\\)/,"selected HTL builder must validate every source family before crossing evaluation");"""
new = """assert.match(ownership,/function selectedHtlCausal\\(data,length\\)/,"selected chart must expose the canonical HTL adapter");
assert.match(ownership,/htl=htlBuild\\(candles,resolvedLength\\)/,"selected chart must consume the system canonical HTL Asset package");
assert.doesNotMatch(ownership,/const series=htlCore\\(data,length\\)/,"chart must not maintain a parallel HTL Asset reconstruction");
assert.doesNotMatch(ownership,/deviation>0\\?\\(2\\*mean\\)-current:null/,"chart must not gate Asset Inverse on local deviation");"""
if text.count(old) != 1:
    raise SystemExit("chart ownership test old assertions not found exactly once")
test.write_text(text.replace(old, new, 1))

# Attachment-derived numerical parity test, including registered server path.
Path("scripts/test-attachment-htl-asset.mjs").write_text(r'''import assert from "node:assert/strict";
import "../public/htl-horizon-contract.js";
import "../public/horizon-strategy-contract.js";
import { buildIntegratedHtlAsset, buildDareSignals, buildNaiPackage, buildDareNPackage } from "../src/horizon-strategy-v1.js";

const H=globalThis.CTE_HORIZON_HTL,S=globalThis.CTE_HORIZON_STRATEGIES,length=10;
const candles=Array.from({length:360},(_,index)=>{const close=1.1+Math.sin(index/7)*.004+Math.sin(index/19)*.002+index*.000002,open=close-Math.sin(index/3)*.00015;return{time:new Date(Date.UTC(2026,0,1,0,index)).toISOString(),open,high:Math.max(open,close)+.0004,low:Math.min(open,close)-.0004,close,complete:true};});
const h=H.build(candles,length),registered=buildIntegratedHtlAsset(candles,length),wma=H.wma(h.asset,length);
assert.equal(H.VERSION,"CTE_HORIZON_HTL_ASSET_CROSSING@2.0.0");
assert.equal(h.formula,"ATTACHMENT_HTL_ASSET_DIRECT_MIRROR@1.0.0");
assert.equal(Object.hasOwn(h,"assetCenter"),false,"Asset Center must not exist as an exposed HTL series");
assert.deepEqual(h.asset,registered.asset,"public Asset must equal registered extrema/interpolation Asset");
assert.deepEqual(h.inverse,registered.inverseAsset,"public Asset Inverse must equal registered direct mirror");
for(let index=0;index<h.asset.length;index++){
  if(Number.isFinite(h.asset[index])&&Number.isFinite(wma[index]))assert.ok(Math.abs(h.inverse[index]-((2*wma[index])-h.asset[index]))<1e-12,`Asset Inverse direct mirror mismatch at ${index}`);
  if(Number.isFinite(h.asset[index])&&Number.isFinite(h.inverse[index]))assert.ok(Math.abs(h.assetMean[index]-((h.asset[index]+h.inverse[index])/2))<1e-12,`Asset Mean average mismatch at ${index}`);
}
assert.deepEqual(h.assetMean,registered.meanAsset,"Asset Mean must equal average(Asset, Asset Inverse) system-wide");
assert.deepEqual(h.assetMeanInverse,registered.meanInverse,"Asset Mean Inverse must match registered DARE root");
const indicators=S.buildIndicators(candles,length);
assert.deepEqual(indicators.assetMean,h.assetMean);assert.deepEqual(indicators.assetMeanInverse,h.assetMeanInverse);
assert.deepEqual(indicators.meanAsset,h.assetMean);assert.deepEqual(indicators.meanInverse,h.assetMeanInverse);
assert.deepEqual(buildDareSignals(candles,registered).map(e=>[e.signalIndex,e.direction]),S.events(candles,length,"DARE",0).filter(e=>e.qualified).map(e=>[e.index,e.direction]));
const nai=buildNaiPackage(registered,length,0),dareN=buildDareNPackage(registered,length,0);
assert.ok(nai.events.length>0,"NAI must derive from Asset / Asset Inverse");assert.ok(dareN.events.length>0,"DARE(N) must derive from Asset Mean / Asset Mean Inverse");
console.log("Attachment HTL Asset root verified: extrema Asset, direct-mirror Asset Inverse, average Asset Mean, DARE/NAI/DARE(N) registered parity, and no exposed Asset Center.");
''')

# Mandatory check gate.
package = Path("package.json")
text = package.read_text()
needle = "node scripts/test-chart-indicator-ownership.mjs && node scripts/test-ioi-iom-chart.mjs"
repl = "node scripts/test-chart-indicator-ownership.mjs && node scripts/test-attachment-htl-asset.mjs && node scripts/test-ioi-iom-chart.mjs"
if text.count(needle) != 1:
    raise SystemExit("package check insertion point not found exactly once")
package.write_text(text.replace(needle, repl, 1))

# Fail closed against known divergent public implementations.
htl_text = Path("public/htl-horizon-contract.js").read_text()
chart_text = Path("public/chart-indicator-ownership.js").read_text()
assert "recoverInverse(assetZ" not in htl_text
assert "deviation>0?(2*mean)-current:null" not in chart_text
assert "assetCenter" not in htl_text
