import { credentials } from "./engine-base.js";
import { PAIRS, TIMEFRAMES } from "./horizon-platform-engine.js";
import {
  RUNTIME_OPTIMIZER_HISTORY_BARS,
  RUNTIME_OPTIMIZER_VERSION,
  loadRuntimeOptimizer,
} from "./optimized-optimizer.js";

const OPTIMIZER_STATE_KEY="optimizerRuntimeState";
export const OPTIMIZER_SERVICE_VERSION="OPTIMIZER_RUNTIME_SERVICE@1.1.0";

function normalizeRuntimeState(value={},legacy={}){
  return{
    optimizerVersion:Number(value.optimizerVersion??legacy.optimizerVersion??RUNTIME_OPTIMIZER_VERSION),
    optimizerCycleIndex:Number(value.optimizerCycleIndex??legacy.optimizerCycleIndex??0),
    optimizerLastDataset:value.optimizerLastDataset??legacy.optimizerLastDataset??null,
    optimizerLastRun:value.optimizerLastRun??legacy.optimizerLastRun??null,
    optimizerLastError:value.optimizerLastError??legacy.optimizerLastError??null,
  };
}

function datasetIndex(pair,timeframe){
  const pairIndex=PAIRS.indexOf(pair),timeframeIndex=TIMEFRAMES.indexOf(timeframe);
  return pairIndex<0||timeframeIndex<0?-1:(timeframeIndex*PAIRS.length)+pairIndex;
}

function optimizerDatasetKey(index){
  const total=PAIRS.length*TIMEFRAMES.length,normalized=((Math.trunc(Number(index)||0)%total)+total)%total,pair=PAIRS[normalized%PAIRS.length],timeframe=TIMEFRAMES[Math.floor(normalized/PAIRS.length)];
  return`${pair}|${timeframe}`;
}

function nextOptimizerIndex(records={},cycleIndex=0,preferredTimeframe=null,selectedPairs=[]){
  const total=PAIRS.length*TIMEFRAMES.length,start=((Math.trunc(Number(cycleIndex)||0)%total)+total)%total,preferred=TIMEFRAMES.includes(preferredTimeframe)?preferredTimeframe:null,selected=(Array.isArray(selectedPairs)?selectedPairs:[]).filter(pair=>PAIRS.includes(pair)),priority=[];
  if(preferred){
    for(const pair of selected){const index=datasetIndex(pair,preferred);if(index>=0&&!priority.includes(index))priority.push(index);}
    for(const pair of PAIRS){const index=datasetIndex(pair,preferred);if(index>=0&&!priority.includes(index))priority.push(index);}
  }
  for(let offset=0;offset<total;offset++){const index=(start+offset)%total;if(!priority.includes(index))priority.push(index);}
  return priority.find(index=>!records?.[optimizerDatasetKey(index)])??start;
}

export class OptimizerRuntimeService{
  constructor(engine){this.engine=engine;}

  async runtimeState(){
    const stored=await this.engine.ctx.storage.get(OPTIMIZER_STATE_KEY);
    if(stored){
      if(Number(stored.optimizerVersion)!==RUNTIME_OPTIMIZER_VERSION){
        const reset=normalizeRuntimeState({optimizerVersion:RUNTIME_OPTIMIZER_VERSION,optimizerCycleIndex:0,optimizerLastDataset:null,optimizerLastRun:null,optimizerLastError:null});
        await this.engine.ctx.storage.put(OPTIMIZER_STATE_KEY,reset);
        return reset;
      }
      return normalizeRuntimeState(stored);
    }
    const legacy=(await this.engine.ctx.storage.get("state"))||{},migrated=Number(legacy.optimizerVersion)===RUNTIME_OPTIMIZER_VERSION?normalizeRuntimeState(legacy):normalizeRuntimeState({optimizerVersion:RUNTIME_OPTIMIZER_VERSION,optimizerCycleIndex:0});
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
      const [{token},records,engineState]=await Promise.all([Promise.resolve(credentials(this.engine.env)),loadRuntimeOptimizer(this.engine.ctx.storage),this.engine.ctx.storage.get("state")]);
      const preferredTimeframe=TIMEFRAMES.includes(engineState?.config?.timeframe)?engineState.config.timeframe:null,selectedPairs=Array.isArray(engineState?.selectedPairs)?engineState.selectedPairs:[];
      state.optimizerCycleIndex=nextOptimizerIndex(records,state.optimizerCycleIndex,preferredTimeframe,selectedPairs);
      await this.engine.optimizeNext(state,token);
    }catch(error){
      state.optimizerLastError=String(error?.message||error);
    }
    state.optimizerVersion=RUNTIME_OPTIMIZER_VERSION;
    await this.engine.ctx.storage.put(OPTIMIZER_STATE_KEY,state);
    return this.status();
  }
}

export const __optimizerRuntimeTest=Object.freeze({OPTIMIZER_STATE_KEY,normalizeRuntimeState,datasetIndex,optimizerDatasetKey,nextOptimizerIndex});
