import assert from "node:assert/strict";
import fs from "node:fs";

const ownership=fs.readFileSync(new URL("../public/chart-indicator-ownership.js",import.meta.url),"utf8");
const worker=fs.readFileSync(new URL("../src/worker.js",import.meta.url),"utf8");

assert.match(ownership,/CTE_CHART_INDICATOR_OWNERSHIP@1\.0\.0/);
assert.match(ownership,/canonicalChartDefinition=function\(strategy\)\{return ownedDefinition\(strategy\);\}/,"chart definition must be the selected indicator only");
assert.doesNotMatch(ownership,/fan=CHART_INDICATORS\.ASSET|price:\[\.\.\.fan/,"HTL Asset must not be injected into every indicator selection");
assert.match(ownership,/if\(id==="ASSET"\)\{\s*selected\.asset=htl\.asset;\s*selected\.inverse=htl\.inverse;/s,"HTL Asset must have a self-contained selected-indicator path");
assert.match(ownership,/CHART_INDICATORS\.COMBO=\{\s*price:\[\["meanAsset"/s,"COMBO must own a composite display without the HTL Asset fan");
const comboBlock=ownership.match(/CHART_INDICATORS\.COMBO=\{([\s\S]*?)\n  \};/)?.[1]||"";
assert.doesNotMatch(comboBlock,/\["asset"|\["inverse"/,"COMBO display must not carry HTL Asset/Inverse lines");
assert.match(ownership,/drawChart=function\(\)\{[\s\S]*selectedIndicatorSet\(state\.chartCandles,length,strategy\)[\s\S]*indicatorSignalSeries\(state\.chartCandles,indicators,strategy,filter\)/,"main chart overlay and signals must come from the same selected indicator");
assert.match(ownership,/drawEvalCharts=function\(\)\{[\s\S]*selectedIndicatorSet\(state\.evalCandles,length,strategy\)[\s\S]*indicatorSignalSeries\(state\.evalCandles,indicators,strategy,filter\)/,"evaluation chart overlay and signals must come from the same selected indicator");
assert.match(ownership,/selected indicator exclusively owns its overlay and BUY\/SELL signals/,"visible chart copy must state the ownership contract");
assert.match(ownership,/const height=Math\.max\(300,Math\.round\(stage\.getBoundingClientRect\(\)\.height/,"Weekly Bar height must derive from the main chart stage");
assert.match(ownership,/aside\.style\.height=`\$\{height\}px`/);
assert.match(ownership,/body\.style\.minHeight="0"/,"legacy weekly minimum height must be neutralized");
assert.match(ownership,/ResizeObserver\(synchronizeWeeklyBar\)/,"Weekly Bar must remain synchronized through chart resize/maximize changes");
assert.match(worker,/html=html\.replace\('\<\/body\>'[^;]*chart-indicator-ownership\.js/s,"ownership repair must load after the main inline chart runtime");

console.log("Chart indicator ownership certification passed: selected indicator exclusively owns overlay/signals, HTL is no longer injected into other indicators, and Weekly Bar height follows the main chart.");
