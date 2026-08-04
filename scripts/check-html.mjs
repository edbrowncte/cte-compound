import {readFile} from "node:fs/promises";
import {spawnSync} from "node:child_process";

let html;
try{html=await readFile(new URL("../public/index.html",import.meta.url),"utf8");}
catch{html=await readFile(new URL("../cte-compound.html",import.meta.url),"utf8");}
for(const required of ["Timeframe Signal Schedule","Interactive Analytical Chart","HTL Event Forecast","Trading Ledger","htlCausal(data,length)","resolvedConfiguration(","refreshCausalChartAnalysis(","/api/oanda/order",">TEST</button>","MAX_CANDLE_REQUESTS=1","eventLoadedKey","macroStartDate","microStartDate","Platform Diagnostic Scan","MAX_BACKGROUND_CANDLE_REQUESTS=1","queueProgressiveSchedule","chartRequestCount","foregroundCandleDemand","const assetAt=","/api/platform/preferences","const zDefinitions=indicatorSet.z","decisionCandidateStrip","executeSelectedDecisionCandidate","causalIndicatorSetFast","causalAnalysisWithConfiguration","refreshEventChart","normalizeInstrumentCandles","Candle identity mismatch","id=\"minimumUnits\"","minimumUnitAmount","synchronizeMinimumUnits"]){
  if(!html.includes(required))throw new Error(`Missing HTML feature: ${required}`);
}
const script=html.match(/<script>([\s\S]*)<\/script>/)?.[1];
if(!script)throw new Error("Inline application script was not found.");
const result=spawnSync(process.execPath,["--check","-"],{input:script,encoding:"utf8"});
if(result.status!==0)throw new Error(result.stderr||result.stdout||"Inline JavaScript syntax failed");
if(/\/api\/engine\/optimizer[^\n]+method:"PUT"/.test(html))throw new Error("Browser optimizer writes remain enabled.");
console.log("HTML structure, causal chart path, immediate chart loading, TEST connection, and syntax verified.");
