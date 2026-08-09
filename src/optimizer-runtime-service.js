import { credentials } from "./engine-base.js";
import { PAIRS, TIMEFRAMES } from "./horizon-platform-engine.js";
import {
  RUNTIME_OPTIMIZER_HISTORY_BARS,
  RUNTIME_OPTIMIZER_VERSION,
  loadRuntimeOptimizer,
} from "./optimized-optimizer.js";

const OPTIMIZER_STATE_KEY="optimizerRuntimeState";
export const OPTIMIZER_SERVICE_VERSION="OPTIMIZER_RUNTIME_SERVICE@1.0.0";

function normalizeRuntimeState(value={},legacy={}){
  return{
    optimizerCycleIndex:Number(value.optimizerCycleIndex??legacy.optimizerCycleIndex??0),
    optimizerLastDataset:value.optimizerLastDataset??legacy.optimizerLastDataset??null,
    optimizerLastRun:value.optimizerLastRun??legacy.optimizerLastRun??null,
    optimizerLastError:value.optimizerLastError??legacy.optimizerLastError??null,
  };
}

export class OptimizerRuntimeService{
  constructor(engine){this.engine=engine;}

  async runtimeState(){
    const stored=await this.engine.ctx.storage.get(OPTIMIZER_STATE_KEY);
    if(stored)return normalizeRuntimeState(stored);
    const legacy=(await this.engine.ctx.storage.get("state"))||{};
    const migrated=normalizeRuntimeState({},legacy);
    await this.engine.ctx.storage.put(OPTIMIZER_STATE_KEY,migrated);
    return migrated;
  }

  async status(){
    const [state,records]=await Promise.all([this.runtimeState(),loadRuntimeOptimizer(this.engine.ctx.storage)]);
    return{
      ...state,
      optimizerVersion:RUNTIME_OPTIMIZER_VERSION,
      optimizerHistoryBars:RUNTIME_OPTIMIZER_HISTORY_BARS,
      optimizerCoverage:Object.keys(records).length,
      optimizerTotal:PAIRS.length*TIMEFRAMES.length,
      optimizerStorageMode:"SHARDED_PER_DATASET",
      optimizerPersistenceHealthy:!state.optimizerLastError,
      optimizerServiceVersion:OPTIMIZER_SERVICE_VERSION,
      optimizerSchedule:"INDEPENDENT_AFTER_TRADING_TICK",
    };
  }

  async run(){
    const state=await this.runtimeState();
    try{
      const {token}=credentials(this.engine.env);
      await this.engine.optimizeNext(state,token);
    }catch(error){
      state.optimizerLastError=String(error?.message||error);
    }
    await this.engine.ctx.storage.put(OPTIMIZER_STATE_KEY,state);
    return this.status();
  }
}

export const __optimizerRuntimeTest=Object.freeze({OPTIMIZER_STATE_KEY,normalizeRuntimeState});
