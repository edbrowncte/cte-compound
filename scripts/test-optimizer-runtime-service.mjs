import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { OptimizerRuntimeService, OPTIMIZER_SERVICE_VERSION, __optimizerRuntimeTest } from "../src/optimizer-runtime-service.js";
import { RUNTIME_OPTIMIZER_VERSION } from "../src/optimized-optimizer.js";

class Storage{
  constructor(entries=[]){this.map=new Map(entries);this.writes=[];}
  async get(key){return this.map.get(key);}
  async put(key,value){this.map.set(key,value);this.writes.push(key);}
  async delete(key){this.map.delete(key);}
  async list({prefix}){return new Map([...this.map].filter(([key])=>key.startsWith(prefix)));}
}

const {datasetIndex,optimizerDatasetKey,nextOptimizerIndex}=__optimizerRuntimeTest;
assert.equal(optimizerDatasetKey(datasetIndex("EUR_USD","M5")),"EUR_USD|M5");
assert.equal(nextOptimizerIndex({},240,"M5",["EUR_CAD"]),datasetIndex("EUR_CAD","M5"),"active selected pair/timeframe must outrank a stale prior-generation cursor");
const partial={"EUR_CAD|M5":{settings:{assetLength:15}}};
assert.equal(nextOptimizerIndex(partial,240,"M5",["EUR_CAD"]),datasetIndex("EUR_USD","M5"),"after selected-pair coverage, active timeframe backfill must continue before unrelated timeframes");

const storage=new Storage([
  ["state",{config:{timeframe:"M5"},selectedPairs:["EUR_CAD"],optimizerCycleIndex:112,optimizerLastError:"legacy failure"}],
  ["optimizerRuntimeState",{optimizerVersion:RUNTIME_OPTIMIZER_VERSION-1,optimizerCycleIndex:240,optimizerLastDataset:"GBP_AUD|M1",optimizerLastRun:"2026-08-14T02:40:36.956Z",optimizerLastError:"legacy failure"}],
]);
const engine={ctx:{storage},env:{OANDA_API_KEY:"x".repeat(40),OANDA_ACCOUNT_ID:"101-001-12345678-001"},async optimizeNext(state,token){assert.equal(token.length,40);assert.equal(state.optimizerVersion,RUNTIME_OPTIMIZER_VERSION);assert.equal(state.optimizerCycleIndex,datasetIndex("EUR_CAD","M5"));state.optimizerCycleIndex=(state.optimizerCycleIndex+1)%(28*11);state.optimizerLastDataset="EUR_CAD|M5";state.optimizerLastRun="2026-08-14T02:45:00.000Z";state.optimizerLastError=null;return{records:{}};}};
const service=new OptimizerRuntimeService(engine);
let status=await service.status();assert.equal(status.optimizerVersion,RUNTIME_OPTIMIZER_VERSION);assert.equal(status.optimizerCycleIndex,0,"optimizer generation change must reset the persisted cursor");assert.equal(status.optimizerLastError,null,"prior-generation optimizer errors must not survive generation reset");assert.equal(status.optimizerPersistenceHealthy,true);assert.equal(status.optimizerServiceVersion,OPTIMIZER_SERVICE_VERSION);
status=await service.run();assert.equal(status.optimizerLastDataset,"EUR_CAD|M5");assert.equal(status.optimizerLastError,null);assert.equal(status.optimizerPersistenceHealthy,true);assert.ok(storage.writes.includes("optimizerRuntimeState"));

const certified=await readFile(new URL("../src/engine-certified-execution.js",import.meta.url),"utf8"),certifiedBase=await readFile(new URL("../src/engine-certified-execution-base.js",import.meta.url),"utf8"),certifiedContract=`${certified}\n${certifiedBase}`;
const worker=await readFile(new URL("../src/worker-base.js",import.meta.url),"utf8");
const tickBody=certified.slice(certified.indexOf("async tick()"));
assert.doesNotMatch(tickBody,/this\.optimizeNext\(/,"The active exact-account trading tick must not execute optimizer work.");
assert.match(certifiedContract,/path==="\/optimizer\/tick"/);
assert.match(certified,/resolveExactAccountAuthority/);
assert.ok(worker.indexOf('https://engine/tick')<worker.indexOf('https://engine/optimizer/tick'),"Trading must run before the independent optimizer budget.");
console.log("Optimizer generation reset, active pair/timeframe backfill priority, independent runtime state, exact account trading tick, trading-first scheduling, and persistence recovery verified.");
