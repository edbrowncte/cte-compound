import {readFile} from "node:fs/promises";
import {spawnSync} from "node:child_process";

let html;
try{html=await readFile(new URL("../public/index.html",import.meta.url),"utf8");}
catch{html=await readFile(new URL("../cte-compound.html",import.meta.url),"utf8");}
for(const required of ["Timeframe Signal Schedule","Evaluation Table","HTL Schedule","Trading Ledger","Platform Diagnostic Scan",'id="chartPanel"','data-chart-model="canonical-single"','id="chart"','id="oscillatorCanvas"','id="weeklyCognitionCanvas"',"canonicalChartDefinition(","refreshMainPressure(","/api/oanda/order",'id="minimumUnits"']){
  if(!html.includes(required))throw new Error(`Missing HTML feature: ${required}`);
}
for(const forbidden of ['id="evalChartPanel"','id="eventChartPanel"','id="evalChart"','id="eventChart"','data-chart-model="capitalization"']){
  if(html.includes(forbidden))throw new Error(`Legacy chart surface returned: ${forbidden}`);
}
if((html.match(/data-chart-model="canonical-single"/g)||[]).length!==1)throw new Error("Exactly one canonical chart component is required.");
if((html.match(/<canvas\b/g)||[]).length!==3)throw new Error("Canonical chart must contain main, MAS/IM, and weekly cognition canvases only.");
const scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(match=>match[1]).filter(script=>script.trim());
if(!scripts.length)throw new Error("Inline application scripts were not found.");
for(const script of scripts){const result=spawnSync(process.execPath,["--check","-"],{input:script,encoding:"utf8"});if(result.status!==0)throw new Error(result.stderr||result.stdout||"Inline JavaScript syntax failed");}
if(/storage\.put\(["']optimizer["']\s*,\s*records\)/.test(html))throw new Error("Legacy optimizer persistence returned.");
if(/id="connectButton"|>TEST<\/button>|TESTING…|Testing live OANDA connection/.test(html))throw new Error("Operator-facing OANDA TEST/retest workflow remains present.");
console.log("HTML syntax and one-chart contract verified; trading, diagnostics, schedules, and tables remain.");
