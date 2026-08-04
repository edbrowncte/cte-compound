import {readFile} from "node:fs/promises";
import {spawnSync} from "node:child_process";

let html;
try{html=await readFile(new URL("../public/index.html",import.meta.url),"utf8");}
catch{html=await readFile(new URL("../cte-compound.html",import.meta.url),"utf8");}
for(const required of ["Timeframe Signal Schedule","Interactive Analytical Chart","HTL Event Forecast","Trading Ledger","htlCausal(data,length)","resolvedConfiguration("]){
  if(!html.includes(required))throw new Error(`Missing HTML feature: ${required}`);
}
const script=html.match(/<script>([\s\S]*)<\/script>/)?.[1];
if(!script)throw new Error("Inline application script was not found.");
const result=spawnSync(process.execPath,["--check","-"],{input:script,encoding:"utf8"});
if(result.status!==0)throw new Error(result.stderr||result.stdout||"Inline JavaScript syntax failed");
console.log("HTML structure, causal forecast path, resolved configuration, and syntax verified.");
