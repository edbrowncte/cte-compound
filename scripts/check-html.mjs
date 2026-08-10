import {readFile} from "node:fs/promises";
import {spawnSync} from "node:child_process";

let html;
try{html=await readFile(new URL("../public/index.html",import.meta.url),"utf8");}
catch{html=await readFile(new URL("../cte-compound.html",import.meta.url),"utf8");}

for(const required of ["Timeframe Signal Schedule","Evaluation Table","HTL Schedule","Trading Ledger","htlCausal(data,length)","resolvedConfiguration(","refreshCausalChartAnalysis(","/api/oanda/order",'id="connectionRuntime"',"eventLoadedKey","eventScheduleStatus","macroPerformanceScope","Platform Diagnostic Scan","queueProgressiveSchedule","decisionCandidateStrip","executeSelectedDecisionCandidate",'id="minimumUnits"',"Worker deployment"]){
  if(!html.includes(required))throw new Error(`Missing HTML feature: ${required}`);
}
for(const forbidden of ['id="chartPanel"','id="evalChartPanel"','id="eventChartPanel"','id="chart"','id="evalChart"','id="eventChart"','id="oscillatorCanvas"','id="weeklyCognitionCanvas"','data-chart-model="capitalization"']){
  if(html.includes(forbidden))throw new Error(`Deleted chart surface returned: ${forbidden}`);
}
if((html.match(/<canvas\b/g)||[]).length!==0)throw new Error("A chart canvas remains in the application.");
const script=html.match(/<script>([\s\S]*)<\/script>/)?.[1];
if(!script)throw new Error("Inline application script was not found.");
const result=spawnSync(process.execPath,["--check","-"],{input:script,encoding:"utf8"});
if(result.status!==0)throw new Error(result.stderr||result.stdout||"Inline JavaScript syntax failed");
if(/\/api\/engine\/optimizer[^\n]+method:"PUT"/.test(html))throw new Error("Browser optimizer writes remain enabled.");
if(/id="macro(?:Start|End)Date"|macroClearDates/.test(html))throw new Error("Editable Macro date controls remain present.");
if(/id="connectButton"|>TEST<\/button>|TESTING…|Testing live OANDA connection/.test(html))throw new Error("Operator-facing OANDA TEST/retest workflow remains present.");
console.log("HTML syntax and chart deletion contract verified; schedules, tables, trading, diagnostics, and execution remain.");
