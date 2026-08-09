import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { OptimizerRuntimeService, OPTIMIZER_SERVICE_VERSION } from "../src/optimizer-runtime-service.js";

class Storage{
  constructor(entries=[]){this.map=new Map(entries);this.writes=[];}
  async get(key){return this.map.get(key);}
  async put(key,value){this.map.set(key,value);this.writes.push(key);}
  async delete(key){this.map.delete(key);}
  async list({prefix}){return new Map([...this.map].filter(([key])=>key.startsWith(prefix)));}
}

const storage=new Storage([["state",{optimizerCycleIndex:112,optimizerLastError:"legacy failure"}]]);
const engine={ctx:{storage},env:{OANDA_API_KEY:"x".repeat(40),OANDA_ACCOUNT_ID:"101-001-12345678-001"},async optimizeNext(state,token){assert.equal(token.length,40);state.optimizerCycleIndex=113;state.optimizerLastDataset="EUR_USD|M15";state.optimizerLastRun="2026-08-09T21:32:00.000Z";state.optimizerLastError=null;return{records:{}};}};
const service=new OptimizerRuntimeService(engine);
let status=await service.status();assert.equal(status.optimizerLastError,"legacy failure");assert.equal(status.optimizerPersistenceHealthy,false);assert.equal(status.optimizerServiceVersion,OPTIMIZER_SERVICE_VERSION);
status=await service.run();assert.equal(status.optimizerCycleIndex,113);assert.equal(status.optimizerLastError,null);assert.equal(status.optimizerPersistenceHealthy,true);assert.ok(storage.writes.includes("optimizerRuntimeState"));

const certified=await readFile(new URL("../src/engine-certified-execution.js",import.meta.url),"utf8");
const worker=await readFile(new URL("../src/worker-base.js",import.meta.url),"utf8");
const tickBody=certified.slice(certified.indexOf("async tick()"));
assert.doesNotMatch(tickBody,/this\.optimizeNext\(/,"The trading tick must not execute optimizer work.");
assert.match(certified,/path==="\/optimizer\/tick"/);
assert.ok(worker.indexOf('https://engine/tick')<worker.indexOf('https://engine/optimizer/tick'),"Trading must run before the independent optimizer budget.");
console.log("Independent optimizer runtime state, trading-first scheduling, and persistence recovery verified.");
