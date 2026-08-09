import fs from "node:fs";

let optimizer=fs.readFileSync("src/optimized-optimizer.js","utf8");
let engine=fs.readFileSync("src/engine-certified-execution.js","utf8");
let html=fs.readFileSync("public/index.html","utf8");
let changes=0;
const replace=(source,from,to,label)=>{if(!source.includes(from))throw new Error(`Missing anchor: ${label}`);changes++;return source.replace(from,to);};

optimizer=replace(optimizer,
'export const RUNTIME_OPTIMIZER_VERSION = 7;\nexport const RUNTIME_OPTIMIZER_HISTORY_BARS = 5000;\n\nexport function currentRuntimeOptimizer(records){',
'export const RUNTIME_OPTIMIZER_VERSION = 7;\nexport const RUNTIME_OPTIMIZER_HISTORY_BARS = 5000;\nexport const RUNTIME_OPTIMIZER_STORAGE_PREFIX = `optimizer:v${RUNTIME_OPTIMIZER_VERSION}:`;\n\nexport function runtimeOptimizerStorageKey(datasetKey){return `${RUNTIME_OPTIMIZER_STORAGE_PREFIX}${datasetKey}`;}\nexport async function loadRuntimeOptimizer(storage,{migrateLegacy=true}={}){\n  const listed=await storage.list({prefix:RUNTIME_OPTIMIZER_STORAGE_PREFIX}),records={};\n  for(const [storageKey,record] of listed)records[storageKey.slice(RUNTIME_OPTIMIZER_STORAGE_PREFIX.length)]=record;\n  if(migrateLegacy){\n    const legacy=await storage.get("optimizer");\n    if(legacy&&typeof legacy==="object"){\n      for(const [datasetKey,record] of Object.entries(legacy)){\n        if(record?.version!==RUNTIME_OPTIMIZER_VERSION||record?.strategyEngineVersion!==STRATEGY_ENGINE_VERSION)continue;\n        if(!(datasetKey in records)){await storage.put(runtimeOptimizerStorageKey(datasetKey),record);records[datasetKey]=record;}\n      }\n      await storage.delete("optimizer");\n    }\n  }\n  return currentRuntimeOptimizer(records);\n}\nexport async function saveRuntimeOptimizerRecord(storage,datasetKey,record){await storage.put(runtimeOptimizerStorageKey(datasetKey),record);return record;}\n\nexport function currentRuntimeOptimizer(records){',
'optimizer shard helpers');

optimizer=replace(optimizer,
'    const records = (await engine.ctx.storage.get("optimizer")) || {};\n    const key = `${pair}|${timeframe}`;',
'    const records = await loadRuntimeOptimizer(engine.ctx.storage);\n    const key = `${pair}|${timeframe}`;',
'compute load shards');
optimizer=replace(optimizer,
'    records[key] = record;\n    await engine.ctx.storage.put("optimizer", records);\n    return { key, record };',
'    records[key] = record;\n    await saveRuntimeOptimizerRecord(engine.ctx.storage,key,record);\n    return { key, record };',
'compute save shard');
optimizer=replace(optimizer,
'  const records = (await engine.ctx.storage.get("optimizer")) || {};\n  const existing = records[key];',
'  const records = await loadRuntimeOptimizer(engine.ctx.storage);\n  const existing = records[key];',
'cycle load shards');
optimizer=replace(optimizer,
'  records[key] = record;\n  await engine.ctx.storage.put("optimizer", records);\n  state.optimizerLastDataset = key;',
'  records[key] = record;\n  await saveRuntimeOptimizerRecord(engine.ctx.storage,key,record);\n  state.optimizerLastDataset = key;',
'cycle save shard');

engine=replace(engine,
'  RUNTIME_OPTIMIZER_HISTORY_BARS,\n  currentRuntimeOptimizer\n} from "./optimized-optimizer.js";',
'  RUNTIME_OPTIMIZER_HISTORY_BARS,\n  currentRuntimeOptimizer,\n  loadRuntimeOptimizer\n} from "./optimized-optimizer.js";',
'import shard loader');
engine=replace(engine,
'      const records=currentRuntimeOptimizer((await this.ctx.storage.get("optimizer"))||{});',
'      const records=await loadRuntimeOptimizer(this.ctx.storage);',
'optimizer route shards');
engine=replace(engine,
'    const runtimeOptimizer=currentRuntimeOptimizer((await this.ctx.storage.get("optimizer"))||{});',
'    const runtimeOptimizer=await loadRuntimeOptimizer(this.ctx.storage);',
'status shards');
engine=replace(engine,
'      let optimizer=currentRuntimeOptimizer((await this.ctx.storage.get("optimizer"))||{});',
'      let optimizer=await loadRuntimeOptimizer(this.ctx.storage);',
'tick shards');

const oldLedger='    el("eventLedger").innerHTML=row.eventList.slice(-40).reverse().map(event=>`<tr><td>${event.direction>0?"BUY":"SELL"} ${event.number}</td><td>${event.status}</td><td class="${event.result==="WIN"?"positive":event.result==="LOSS"?"negative":""}">${event.result}</td><td class="${event.profitPips>0?"positive":event.profitPips<0?"negative":""}">${Number.isFinite(event.profitPips)?(event.profitPips>0?"+":"")+event.profitPips.toFixed(1):"—"}</td><td>${new Date(event.startTime).toLocaleString()}</td><td>${event.bars}</td><td>${eventFmt(event.high,5)}</td><td>${eventFmt(event.low,5)}</td><td>${eventFmt(event.mean,6)}</td><td>${eventFmt(event.variance,8)}</td><td>${eventFmt(event.slope,7)}</td><td>${eventFmt(event.area,6)}</td><td>${event.sourceCrosses}</td></tr>`).join("");';
const newLedger='    renderEventLedgerRows(row);';
html=replace(html,oldLedger,newLedger,'event detail shared ledger renderer');

html=replace(html,
'  function renderEventDetail(row){',
'  function renderEventLedgerRows(row,scope="HTL Event Forecast"){const ledger=el("eventLedger");if(!ledger)return;const rows=row?.eventList||[];ledger.innerHTML=rows.slice(-40).reverse().map(event=>`<tr><td>${event.direction>0?"BUY":"SELL"} ${event.number}</td><td>${event.status}</td><td class="${event.result==="WIN"?"positive":event.result==="LOSS"?"negative":""}">${event.result}</td><td class="${event.profitPips>0?"positive":event.profitPips<0?"negative":""}">${Number.isFinite(event.profitPips)?(event.profitPips>0?"+":"")+event.profitPips.toFixed(1):"—"}</td><td>${new Date(event.startTime).toLocaleString()}</td><td>${event.bars}</td><td>${eventFmt(event.high,5)}</td><td>${eventFmt(event.low,5)}</td><td>${eventFmt(event.mean,6)}</td><td>${eventFmt(event.variance,8)}</td><td>${eventFmt(event.slope,7)}</td><td>${eventFmt(event.area,6)}</td><td>${event.sourceCrosses}</td></tr>`).join("")||`<tr><td colspan="13">No mature HTL events for this optimizer dataset.</td></tr>`;const node=el("optimizerEventLedgerScope");if(node)node.textContent=`${scope} · ${row?.pair?formatPair(row.pair):"—"} · ${row?.data?.length||0} completed candles · ${rows.filter(event=>event.status==="FINAL").length} final events`; }\n  async function loadOptimizerEventLedger(){if(!state.connected)return;const pair=state.selectedInstrument,timeframe=state.selectedTimeframe,key=scheduleKey(pair,timeframe),record=state.autoConfigurations.get(key),length=clamp(Math.trunc(Number(record?.settings?.assetLength??record?.config?.ASSET?.length??state.engineConfig?.htlLength??10)),3,MAX_ANALYTICAL_LENGTH),controller=new AbortController(),scope=`Optimizer v${state.optimizerRuntimeVersion||7} · ${timeframe} · HTL Asset length ${length}`;const node=el("optimizerEventLedgerScope");if(node)node.textContent=`Loading ${formatPair(pair)} ${timeframe} optimizer event outcomes…`;try{const row=await loadEventRow(pair,timeframe,length,controller,70,MAX_ANALYTICAL_HISTORY);renderEventLedgerRows(row,scope);}catch(error){if(node)node.textContent=`Event outcomes unavailable · ${error.message||error}`;const ledger=el("eventLedger");if(ledger)ledger.innerHTML=`<tr><td colspan="13">${error.message||"Event outcomes unavailable"}</td></tr>`;}}\n  function renderEventDetail(row){',
'optimizer event ledger loader');

html=replace(html,
'    if(performance&&eventLedger&&!el("optimizerEventComposition")){const group=document.createElement("section");group.id="optimizerEventComposition";group.className="optimizer-event-group";group.innerHTML=\'<h3>Configuration Optimizer · Event Outcome Ledger</h3>\';performance.appendChild(group);group.appendChild(eventLedger);}',
'    if(performance&&eventLedger&&!el("optimizerEventComposition")){const group=document.createElement("section");group.id="optimizerEventComposition";group.className="optimizer-event-group";group.innerHTML=\'<h3>Configuration Optimizer · Event Outcome Ledger</h3><div id="optimizerEventLedgerScope" style="padding:7px 11px;color:var(--muted);font-size:9px;border-bottom:1px solid var(--line)">Awaiting optimized event outcomes.</div>\';performance.appendChild(group);group.appendChild(eventLedger);}',
'event ledger scope');

html=replace(html,
'if(name===\'performance\'){renderStrategyConfiguration();renderMacroPerformance();}',
'if(name===\'performance\'){renderStrategyConfiguration();renderMacroPerformance();void loadOptimizerEventLedger();}',
'performance loads event ledger');
html=replace(html,
'renderStrategyConfiguration();renderMacroPerformance();renderOptimizerRegistry();renderSchedule();updateChartSummary();updateCompartments();drawChart();',
'renderStrategyConfiguration();renderMacroPerformance();renderOptimizerRegistry();renderSchedule();void loadOptimizerEventLedger();updateChartSummary();updateCompartments();drawChart();',
'compute refreshes event ledger');

fs.writeFileSync("src/optimized-optimizer.js",optimizer);
fs.writeFileSync("src/engine-certified-execution.js",engine);
fs.writeFileSync("public/index.html",html);
console.log(`Applied optimizer shard + event ledger recovery (${changes} transformations).`);
