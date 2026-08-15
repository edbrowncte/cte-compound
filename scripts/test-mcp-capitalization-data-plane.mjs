import assert from "node:assert/strict";
import fs from "node:fs";
import {CAPITALIZATION_COMPLETED_BARS,CAPITALIZATION_REQUEST_BARS,COMPOUND_CAPITALIZATION_VERSION,buildCapitalizationEvaluationRow} from "../src/compound-capitalization.js";
import {MAS_IM_TIMEFRAMES,timeframeHierarchy} from "../src/mas-im-calculator.js";

assert.equal(CAPITALIZATION_COMPLETED_BARS,320);
assert.equal(CAPITALIZATION_REQUEST_BARS,322);
assert.match(COMPOUND_CAPITALIZATION_VERSION,/MCP_CAPITALIZATION/);
assert.deepEqual(timeframeHierarchy("H1"),["H1","H2","H4","D","W"]);

const tfMs={S5:5000,S30:30000,M1:60000,M5:300000,M15:900000,M30:1800000,H1:3600000,H2:7200000,H4:14400000,D:86400000,W:604800000};
function candles(tf,count=CAPITALIZATION_COMPLETED_BARS){
  const step=tfMs[tf],start=Date.UTC(2025,0,1),phase=MAS_IM_TIMEFRAMES.indexOf(tf)*.37;
  return Array.from({length:count},(_,index)=>{const wave=Math.sin(index/8+phase)*.004+Math.sin(index/29+phase)*.002,base=1.12+index*.000015+wave,open=base+Math.sin(index/3)*.00025,close=base+Math.cos(index/4)*.00025;return{time:new Date(start+index*step).toISOString(),open,high:Math.max(open,close)+.0006,low:Math.min(open,close)-.0006,close,complete:true};});
}
const priceCache=Object.fromEntries(timeframeHierarchy("H1").map(tf=>[tf,candles(tf)]));
const settings={assetLength:15,dareNLength:15,dareNFilter:0,naiLength:15,naiFilter:0,apexLength:15,apexFilter:2,csf:{selected:["DARE","NAI"],method:"TWO_OPINIONS",regime:"DARE",trigger:"NAI"}};
const row=buildCapitalizationEvaluationRow("EUR_USD","H1",priceCache,settings,"ASSET");
assert.equal(row.pair,"EUR_USD");assert.equal(row.timeframe,"H1");assert.equal(row.strategy,"ASSET");assert.equal(row.available,true,"synthetic registered ASSET state should produce a server evaluation row");assert.ok([1,-1].includes(row.signal));assert.ok(Number.isFinite(row.strength));assert.ok(["TREND_FOLLOWING","REVERSION","NEUTRAL"].includes(row.type));

const worker=fs.readFileSync(new URL("../src/worker.js",import.meta.url),"utf8"),client=fs.readFileSync(new URL("../public/mcp-capitalization-data-plane.js",import.meta.url),"utf8"),html=fs.readFileSync(new URL("../public/index.html",import.meta.url),"utf8"),facilities=fs.readFileSync(new URL("../public/analytical-facilities.js",import.meta.url),"utf8");
assert.match(worker,/name:"get_capitalization_snapshot"/);assert.match(worker,/MCP_CAPITALIZATION_CONCURRENCY=8/);assert.match(worker,/CAPITALIZATION_REQUEST_BARS/);assert.match(worker,/buildCapitalizationEvaluationRow/);assert.match(worker,/mcp-capitalization-data-plane\.js/);
assert.match(client,/CTE_COMPOUND_MCP_CAPITALIZATION_CLIENT@1\.1\.0/);assert.match(client,/name:"get_capitalization_snapshot"/);assert.match(client,/preloadEvaluationTimeframe=async function/);assert.match(client,/state\.evaluationTableData=rows/);assert.match(client,/renderFourSlotRotator/);
assert.match(client,/ALL_PAIRS="__ALL_PAIRS__"/);assert.match(client,/All 28 pairs/);assert.match(client,/evalTablePairFilter/);assert.match(client,/rateFluctuationPairFilter/);assert.match(client,/rateFluctuationTimeframeFilter/);assert.match(client,/tfCaption\.textContent="Timeframe"/);
assert.match(client,/async function loadSelected/);assert.match(client,/await prime\(tf,strategy\)/);assert.match(client,/hydrateRateFluctuationEventSupport\(tf,\{retryErrors:true\}\)/,"Rate corroboration must hydrate directly from the capitalization lifecycle rather than wait for schedule completion.");
assert.doesNotMatch(client,/scheduleCoverageReady/,"Evaluation and Rate must not depend on 308-dataset schedule completeness.");assert.doesNotMatch(client,/MutationObserver/,"Analytical control lifecycle must not use a broad DOM observer.");
assert.doesNotMatch(client,/state\.selectedInstrument\s*=/,"Pair filtering must not mutate chart/trading pair authority.");assert.doesNotMatch(client,/state\.engineConfig\s*=/,"Analytical controls must not mutate engine configuration.");
assert.match(client,/state\.evaluationTableData=original\.filter\(row=>row\?\.pair===pair\)/,"Pair focus must filter both Evaluation and its dependent Rate render without destroying the 28-pair snapshot.");assert.match(client,/finally\{state\.evaluationTableData=original;\}/,"Full 28-pair capitalization state must be restored after focused rendering.");
assert.match(html,/id="fourSlotRotator"/);assert.match(html,/Best SELL Trend Following/);assert.match(html,/Best BUY Reversion \/ Transition/);assert.match(html,/id="evalTableTfFilter"/);
assert.match(facilities,/state\.evaluationTableData/);assert.match(facilities,/Awaiting synchronized Evaluation Table data/);
console.log("MCP Capitalization certification passed: Evaluation Table and Rate Fluctuation load independently of schedule coverage, expose synchronized analytical-only currency-pair/timeframe controls, preserve the full 28-pair snapshot, restore the four forecast cards, and retain server-side MAS/IM data authority.");
