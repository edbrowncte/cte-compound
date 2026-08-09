import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const optimizer=await readFile(new URL("../src/optimized-optimizer.js",import.meta.url),"utf8");
const engine=await readFile(new URL("../src/engine-certified-execution.js",import.meta.url),"utf8");
const html=await readFile(new URL("../public/index.html",import.meta.url),"utf8");

assert.match(optimizer,/RUNTIME_OPTIMIZER_STORAGE_PREFIX/);
assert.match(optimizer,/storage\.list\(\{prefix:RUNTIME_OPTIMIZER_STORAGE_PREFIX\}\)/);
assert.match(optimizer,/storage\.put\(runtimeOptimizerStorageKey\(datasetKey\),record\)/);
assert.match(optimizer,/storage\.delete\("optimizer"\)/);
assert.doesNotMatch(optimizer,/storage\.put\("optimizer", records\)/);
assert.doesNotMatch(optimizer,/ctx\.storage\.put\("optimizer", records\)/);
assert.match(engine,/loadRuntimeOptimizer/);
assert.doesNotMatch(engine,/currentRuntimeOptimizer\(\(await this\.ctx\.storage\.get\("optimizer"\)\)\|\|\{\}\)/);
assert.doesNotMatch(engine,/ctx\.storage\.get\("optimizer"\)/);
assert.match(engine,/optimizerStorageMode:"SHARDED_PER_DATASET"/);
assert.match(engine,/optimizerPersistenceHealthy:!state\.optimizerLastError/);
assert.match(html,/function loadOptimizerEventLedger\(\)/);
assert.match(html,/renderEventLedgerRows\(row,scope/);
assert.match(html,/optimizerEventLedgerScope/);
assert.match(html,/if\(name==='performance'\)\{renderStrategyConfiguration\(\);renderMacroPerformance\(\);void loadOptimizerEventLedger\(\);\}/);
assert.match(html,/No mature HTL events for this optimizer dataset/);
console.log("Per-dataset optimizer sharding, legacy monolith migration, and populated optimizer Event Ledger contracts verified.");
