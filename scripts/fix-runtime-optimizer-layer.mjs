import fs from "node:fs";

function replaceRequired(source,from,to,label){
  if(source.includes(to))return source;
  if(!source.includes(from))throw new Error(`Missing runtime optimizer anchor: ${label}`);
  return source.replace(from,to);
}

const optimizedPath="src/optimized-optimizer.js";
let optimized=fs.readFileSync(optimizedPath,"utf8");
optimized=optimized.replace("  OPTIMIZER_VERSION,\n","").replace("  OPTIMIZER_HISTORY_BARS,\n","").replace("  currentOptimizer,\n","");
optimized=optimized.replaceAll("OPTIMIZER_HISTORY_BARS","RUNTIME_OPTIMIZER_HISTORY_BARS");
optimized=optimized.replaceAll("OPTIMIZER_VERSION","RUNTIME_OPTIMIZER_VERSION");
optimized=optimized.replaceAll("currentOptimizer(records)","currentRuntimeOptimizer(records)");
optimized=replaceRequired(optimized,
`const responseError = (message, status = 400) => Object.assign(new Error(message), { status });`,
`export const RUNTIME_OPTIMIZER_VERSION = 7;\nexport const RUNTIME_OPTIMIZER_HISTORY_BARS = 5000;\n\nexport function currentRuntimeOptimizer(records){\n  const now=Date.now();\n  return Object.fromEntries(Object.entries(records||{}).filter(([,record])=>record?.version===RUNTIME_OPTIMIZER_VERSION&&record?.strategyEngineVersion===STRATEGY_ENGINE_VERSION&&now-Date.parse(record?.computedAt||record?.stamp||0)<OPTIMIZER_TTL_MS));\n}\n\nconst responseError = (message, status = 400) => Object.assign(new Error(message), { status });`,
"runtime optimizer constants");
fs.writeFileSync(optimizedPath,optimized);

const certifiedPath="src/engine-certified-execution.js";
let certified=fs.readFileSync(certifiedPath,"utf8");
certified=certified.replace("import { PAIRS, TIMEFRAMES, OPTIMIZER_VERSION, currentOptimizer, candles, currentEvent } from \"./horizon-platform-engine.js\";","import { PAIRS, TIMEFRAMES, candles, currentEvent } from \"./horizon-platform-engine.js\";");
certified=replaceRequired(certified,
`  optimizedScan,\n  fullSettings\n} from "./optimized-optimizer.js";`,
`  optimizedScan,\n  fullSettings,\n  RUNTIME_OPTIMIZER_VERSION,\n  RUNTIME_OPTIMIZER_HISTORY_BARS,\n  currentRuntimeOptimizer\n} from "./optimized-optimizer.js";`,
"certified runtime optimizer imports");
certified=certified.replaceAll("optimizerVersion:OPTIMIZER_VERSION","optimizerVersion:RUNTIME_OPTIMIZER_VERSION");
certified=certified.replaceAll("currentOptimizer((await this.ctx.storage.get(\"optimizer\"))||{})","currentRuntimeOptimizer((await this.ctx.storage.get(\"optimizer\"))||{})");
certified=replaceRequired(certified,
`    const url=new URL(request.url),path=url.pathname;\n    if(path==="/control/selectedPairs"&&request.method==="POST"){`,
`    const url=new URL(request.url),path=url.pathname;\n    if(path==="/optimizer"&&request.method==="GET"){\n      const records=currentRuntimeOptimizer((await this.ctx.storage.get("optimizer"))||{});\n      return new Response(JSON.stringify({version:RUNTIME_OPTIMIZER_VERSION,optimizerHistoryBars:RUNTIME_OPTIMIZER_HISTORY_BARS,strategyEngineVersion:STRATEGY_ENGINE_VERSION,performanceVersion:REGISTERED_PERFORMANCE_VERSION,records}),{status:200,headers:{"Content-Type":"application/json","Cache-Control":"no-store"}});\n    }\n    if(path==="/control/selectedPairs"&&request.method==="POST"){`,
"runtime optimizer GET route");
certified=replaceRequired(certified,
`    const status=await super.status();\n    const state=(await this.ctx.storage.get("state"))||{};\n    return{\n      ...status,`,
`    const status=await super.status();\n    const state=(await this.ctx.storage.get("state"))||{};\n    const runtimeOptimizer=currentRuntimeOptimizer((await this.ctx.storage.get("optimizer"))||{});\n    return{\n      ...status,\n      optimizerVersion:RUNTIME_OPTIMIZER_VERSION,\n      optimizerHistoryBars:RUNTIME_OPTIMIZER_HISTORY_BARS,\n      optimizerCoverage:Object.keys(runtimeOptimizer).length,\n      optimizerTotal:PAIRS.length*TIMEFRAMES.length,`,
"runtime optimizer status");
fs.writeFileSync(certifiedPath,certified);

const htmlPath="public/index.html";
let html=fs.readFileSync(htmlPath,"utf8");
html=replaceRequired(html,
`async function loadOptimizerRecords(){try{const response=await fetch("/api/engine/optimizer",{headers:{Accept:"application/json"},credentials:"same-origin",cache:"no-store"}),payload=await response.json();if(!response.ok)return;state.autoConfigurations.clear();for(const [key,value] of Object.entries(payload.records||{}))state.autoConfigurations.set(key,value);renderOptimizerRegistry();}catch{}}`,
`async function loadOptimizerRecords(){try{const response=await fetch("/api/engine/optimizer",{headers:{Accept:"application/json"},credentials:"same-origin",cache:"no-store"}),payload=await response.json();if(!response.ok)return;state.optimizerRuntimeVersion=Number(payload.version)||7;state.optimizerHistoryBars=Number(payload.optimizerHistoryBars)||5000;state.autoConfigurations.clear();for(const [key,value] of Object.entries(payload.records||{}))state.autoConfigurations.set(key,value);renderOptimizerRegistry();}catch{}}`,
"optimizer response metadata");
html=replaceRequired(html,
`el("optimizerServerStatus").textContent=\`${'${state.autoConfigurations.size}'} / ${'${INSTRUMENTS.length*TIMEFRAMES.length}'} datasets\`;`,
`el("optimizerServerStatus").textContent=\`v${'${state.optimizerRuntimeVersion||7}'} · ${'${state.optimizerHistoryBars||5000}'}-bar target · ${'${state.autoConfigurations.size}'} / ${'${INSTRUMENTS.length*TIMEFRAMES.length}'} datasets\`;`,
"optimizer registry runtime label");
html=replaceRequired(html,
`el("optimizerServerStatus").textContent=\`${'${status.optimizerCoverage||0}'} / ${'${status.optimizerTotal||280}'} datasets${'${status.optimizerLastDataset?` · last ${status.optimizerLastDataset.replace("_","/")}`:""}'}${'${status.optimizerLastError?` · ${status.optimizerLastError}`:""}'}\`;`,
`el("optimizerServerStatus").textContent=\`v${'${status.optimizerVersion||state.optimizerRuntimeVersion||7}'} · ${'${status.optimizerHistoryBars||state.optimizerHistoryBars||5000}'}-bar target · ${'${status.optimizerCoverage||0}'} / ${'${status.optimizerTotal||280}'} datasets${'${status.optimizerLastDataset?` · last ${status.optimizerLastDataset.replace("_","/")}`:""}'}${'${status.optimizerLastError?` · ${status.optimizerLastError}`:""}'}\`;`,
"engine optimizer runtime label");
fs.writeFileSync(htmlPath,html);

const testPath="scripts/test-platform-composition-upgrade.mjs";
fs.writeFileSync(testPath,`import assert from "node:assert/strict";\nimport fs from "node:fs";\nimport {RUNTIME_OPTIMIZER_VERSION,RUNTIME_OPTIMIZER_HISTORY_BARS,currentRuntimeOptimizer} from "../src/optimized-optimizer.js";\nimport {__executionTest} from "../src/engine-certified-execution.js";\n\nconst html=fs.readFileSync("public/index.html","utf8"),mentor=fs.readFileSync("public/market-mentor.js","utf8");\nassert.match(html,/<details class="selector-panel" id="selectorPanel">/);\nassert.match(html,/Signal Schedules · Timeframe \\+ HTL/);\nassert.match(html,/Configuration Optimizer · Event Outcome Ledger/);\nassert.match(html,/id="modelComposition"/);\nassert.match(html,/Capitalization and Account Value Proliferation/);\nassert.match(html,/Event P\\/L \\(pips\\)/);\nassert.match(html,/selected indicator first/i);\nassert.match(html,/evaluationSelectedStrategy/);\nassert.match(html,/5000-bar target/);\nassert.match(mentor,/modelCompositionBody/);\nassert.equal(RUNTIME_OPTIMIZER_VERSION,7);\nassert.equal(RUNTIME_OPTIMIZER_HISTORY_BARS,5000);\nassert.equal(typeof currentRuntimeOptimizer,"function");\nconst context=__executionTest.sanitizeModelContext({type:"MODEL_CONTEXT",timeframe:"H1",account:{nav:12345,marginAvailable:10000},slots:[{pair:"EUR_USD",direction:"BUY",strength:.8,ratio:Infinity},{pair:"NOT_A_PAIR",strength:1}],forecasts:[{key:"A",pair:"EUR_USD",direction:"BUY",confidence:.7}],openPositions:[{pair:"USD_JPY",direction:"SELL",units:1000,unrealizedPL:-3}]});\nassert.equal(context.mandate,"CAPITALIZATION_AND_ACCOUNT_VALUE_PROLIFERATION");\nassert.equal(context.slots.length,1);\nassert.equal(context.slots[0].pair,"EUR_USD");\nassert.equal(context.slots[0].ratio,null);\nassert.equal(context.forecasts.length,1);\nassert.equal(context.openPositions.length,1);\nconsole.log("Platform composition, persistent chart indicators, event outcome ledger, runtime 5,000-bar optimizer and capitalization-model context verified.");\n`);
console.log("Separated runtime optimizer v7/5000 from checksum-hydrated registered optimizer v6/3000.");
