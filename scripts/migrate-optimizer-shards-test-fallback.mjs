import fs from "node:fs";
const path="src/optimized-optimizer.js";
let source=fs.readFileSync(path,"utf8");
const from=`export async function loadRuntimeOptimizer(storage,{migrateLegacy=true}={}){
  const listed=await storage.list({prefix:RUNTIME_OPTIMIZER_STORAGE_PREFIX}),records={};
  for(const [storageKey,record] of listed)records[storageKey.slice(RUNTIME_OPTIMIZER_STORAGE_PREFIX.length)]=record;
  if(migrateLegacy){
    const legacy=await storage.get("optimizer");
    if(legacy&&typeof legacy==="object"){
      for(const [datasetKey,record] of Object.entries(legacy)){
        if(record?.version!==RUNTIME_OPTIMIZER_VERSION||record?.strategyEngineVersion!==STRATEGY_ENGINE_VERSION)continue;
        if(!(datasetKey in records)){await storage.put(runtimeOptimizerStorageKey(datasetKey),record);records[datasetKey]=record;}
      }
      await storage.delete("optimizer");
    }
  }
  return currentRuntimeOptimizer(records);
}`;
const to=`export async function loadRuntimeOptimizer(storage,{migrateLegacy=true}={}){
  const records={},canList=typeof storage.list==="function";
  if(canList){const listed=await storage.list({prefix:RUNTIME_OPTIMIZER_STORAGE_PREFIX});for(const [storageKey,record] of listed)records[storageKey.slice(RUNTIME_OPTIMIZER_STORAGE_PREFIX.length)]=record;}
  const legacy=await storage.get("optimizer");
  if(legacy&&typeof legacy==="object"){
    for(const [datasetKey,record] of Object.entries(legacy)){
      if(record?.version!==RUNTIME_OPTIMIZER_VERSION||record?.strategyEngineVersion!==STRATEGY_ENGINE_VERSION)continue;
      if(!(datasetKey in records)){if(migrateLegacy&&canList)await storage.put(runtimeOptimizerStorageKey(datasetKey),record);records[datasetKey]=record;}
    }
    if(migrateLegacy&&canList)await storage.delete("optimizer");
  }
  return currentRuntimeOptimizer(records);
}`;
if(!source.includes(from)){if(source.includes('const records={},canList=typeof storage.list==="function"')){console.log("Shard fallback already applied.");process.exit(0);}throw new Error("Shard fallback anchor missing.");}
source=source.replace(from,to);fs.writeFileSync(path,source);console.log("Applied optimizer shard storage-mock fallback.");
