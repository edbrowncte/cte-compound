import {readFile} from "node:fs/promises";
import {spawnSync} from "node:child_process";

let html;
try{html=await readFile(new URL("../public/index.html",import.meta.url),"utf8");}
catch{html=await readFile(new URL("../cte-compound.html",import.meta.url),"utf8");}
const unifiedChart=await readFile(new URL("../public/unified-chart.js",import.meta.url),"utf8").catch(()=>"");
for(const required of ["Timeframe Signal Schedule","Capitalization Model Chart · Analytical Compound","Capitalization Model Chart · HTL Event","Trading Ledger","htlCausal(data,length)","resolvedConfiguration(","refreshCausalChartAnalysis(","/api/oanda/order","id=\"connectionRuntime\"","MAX_CANDLE_REQUESTS=2","eventLoadedKey","eventScheduleStatus","eventScheduleLoading","eventChartLoading","CANDLE_TIMEOUT_MS=55000","macroPerformanceScope","microStartDate","Platform Diagnostic Scan","MAX_BACKGROUND_CANDLE_REQUESTS=2","queueProgressiveSchedule","chartRequestCount","foregroundCandleDemand","asset[index]=active.price","/api/platform/preferences","decisionCandidateStrip","executeSelectedDecisionCandidate","causalIndicatorSetFast","causalAnalysisWithConfiguration","refreshEventChart","normalizeInstrumentCandles","Candle identity mismatch","id=\"minimumUnits\"","minimumUnitAmount","synchronizeMinimumUnits","Worker deployment","hasNormalized=","addEventListener(\"click\",()=>loadChart(state.selectedInstrument,state.selectedTimeframe,false,true))"]){
  if(!html.includes(required))throw new Error(`Missing HTML feature: ${required}`);
}
if((html.match(/data-chart-model="capitalization"/g)||[]).length!==3)throw new Error("All three analytical facilities must use the complete Capitalization Model chart component.");
if(!html.includes('<script src="/unified-chart.js"></script>'))throw new Error("Canonical unified chart module is not loaded by the platform.");
if(!unifiedChart.includes("indicatorSet.z")||!unifiedChart.includes("indicatorSet.osc")||!unifiedChart.includes("indicatorSet.price"))throw new Error("Canonical unified chart renderer does not cover price, z, and oscillator indicator families.");
if(html.includes("const assetAt="))throw new Error("Noncausal reconstructed Asset interpolation path remains present.");
const script=html.match(/<script>([\s\S]*)<\/script>/)?.[1];
if(!script)throw new Error("Inline application script was not found.");
const result=spawnSync(process.execPath,["--check","-"],{input:script,encoding:"utf8"});
if(result.status!==0)throw new Error(result.stderr||result.stdout||"Inline JavaScript syntax failed");
if(/\/api\/engine\/optimizer[^\n]+method:"PUT"/.test(html))throw new Error("Browser optimizer writes remain enabled.");
if(/id="macro(?:Start|End)Date"|macroClearDates/.test(html))throw new Error("Editable Macro date controls remain present.");
if(/id="connectButton"|>TEST<\/button>|TESTING…|Testing live OANDA connection/.test(html))throw new Error("Operator-facing OANDA TEST/retest workflow remains present.");
console.log("HTML structure, automatic live session, canonical shared chart renderer, composed schedules, persistent indicators, bounded candle concurrency, and syntax verified.");
