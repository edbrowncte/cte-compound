import {
  STRATEGY_ENGINE_VERSION,
  DEFAULT_STRATEGY_SETTINGS,
  normalizeCandles,
  normalizeStrategySettings,
  buildIntegratedHtlAsset,
  buildDareSignals,
  buildDareNPackage,
  buildNaiPackage,
  buildIntegratedIIICore,
  buildCausalApexEvents,
  normalizeStrategyId,
} from "./horizon-strategy-v1.js";

import {
  REGISTERED_PERFORMANCE_VERSION,
  buildRegisteredTrades,
  summarizeRegisteredTrades,
  evaluateRegisteredPerformance,
  registeredExportRows,
} from "./horizon-registered-performance.js";

import {
  VALIDATION,
  LENGTH_GRID,
  STRATEGIES,
  ANALYTICAL_CERTIFICATION,
  OPTIMIZER_TTL_MS,
  PAIRS,
  TIMEFRAMES,
  candles,
  candlesForRange,
  currentEvent,
} from "./horizon-platform-engine.js";
import { optimizeIoiIomPerformance } from "./ioi-iom-performance.js";
import {
  CONFIGURATION_OPTIMIZER_OBJECTIVE_VERSION,
  CONFIGURATION_OPTIMIZER_FILTER_GRID,
  configurationLengthCandidates,
  configurationFilterCandidates,
  candidateFitQuality,
  betterConfigurationCandidate,
  topCandidateTrace,
} from "./configuration-optimizer-quality.js";

export const RUNTIME_OPTIMIZER_VERSION = 8;
export const RUNTIME_OPTIMIZER_HISTORY_BARS = 5000;
export const RUNTIME_OPTIMIZER_STORAGE_PREFIX = `optimizer:v${RUNTIME_OPTIMIZER_VERSION}:`;
export const DIRECTIONAL_OWNERSHIP_VERSION = "ALTERNATING_DIRECTIONAL_OWNERSHIP@1.0.0";
export const H2_BOOTSTRAP_SOURCE = "RETIRED_H2_BOOTSTRAP_FROM_H1";

export function runtimeOptimizerStorageKey(datasetKey){return `${RUNTIME_OPTIMIZER_STORAGE_PREFIX}${datasetKey}`;}
export function bootstrapH2OptimizerCoverage(records){return{...(records||{})};}
export async function loadRuntimeOptimizer(storage,{migrateLegacy=true}={}){
  const records={},canList=typeof storage.list==="function";
  if(canList){const listed=await storage.list({prefix:RUNTIME_OPTIMIZER_STORAGE_PREFIX});for(const [storageKey,record] of listed)records[storageKey.slice(RUNTIME_OPTIMIZER_STORAGE_PREFIX.length)]=record;}
  const legacy=await storage.get("optimizer");
  if(legacy&&typeof legacy==="object"){
    for(const [datasetKey,record]of Object.entries(legacy)){
      if(record?.version!==RUNTIME_OPTIMIZER_VERSION||record?.strategyEngineVersion!==STRATEGY_ENGINE_VERSION)continue;
      if(!(datasetKey in records)){if(migrateLegacy&&canList)await storage.put(runtimeOptimizerStorageKey(datasetKey),record);records[datasetKey]=record;}
    }
    if(migrateLegacy&&canList)await storage.delete("optimizer");
  }
  return currentRuntimeOptimizer(records);
}
export async function saveRuntimeOptimizerRecord(storage,datasetKey,record){await storage.put(runtimeOptimizerStorageKey(datasetKey),record);return record;}

export function currentRuntimeOptimizer(records){
  const now=Date.now();
  return Object.fromEntries(Object.entries(records||{}).filter(([,record])=>record?.version===RUNTIME_OPTIMIZER_VERSION&&record?.strategyEngineVersion===STRATEGY_ENGINE_VERSION&&record?.optimizerObjectiveVersion===CONFIGURATION_OPTIMIZER_OBJECTIVE_VERSION&&now-Date.parse(record?.computedAt||record?.stamp||0)<OPTIMIZER_TTL_MS));
}

export function alternatingOwnershipSignals(signalsInput=[]){
  const output=[];let owner=0;
  for(const raw of Array.isArray(signalsInput)?signalsInput:[]){
    const direction=Math.sign(Number(raw?.direction)),signalIndex=Number(raw?.signalIndex??raw?.index);
    if(!direction||!Number.isInteger(signalIndex)||direction===owner)continue;
    output.push({...raw,signalIndex,direction});owner=direction;
  }
  return output;
}

function ownedPerformance(candlesInput,signals,pair){
  const ownedSignals=alternatingOwnershipSignals(signals),trades=buildRegisteredTrades(candlesInput,ownedSignals,pair);
  return{signals:ownedSignals,trades,stats:summarizeRegisteredTrades(trades),ownership:DIRECTIONAL_OWNERSHIP_VERSION};
}

function applyDirectionalOwnershipPerformance(result,pair){
  const performanceCandles=result?.evaluation?.candles||[];
  const strategies=Object.fromEntries(Object.entries(result?.strategies||{}).map(([strategy,item])=>[strategy,{...item,...ownedPerformance(performanceCandles,item?.signals||[],pair)}]));
  return{...result,strategies,ownershipVersion:DIRECTIONAL_OWNERSHIP_VERSION};
}

const responseError = (message, status = 400) => Object.assign(new Error(message), { status });
function token(env){const value=String(env.OANDA_API_KEY||"").trim();if(value.length<20)throw responseError("OANDA secrets unavailable.",503);return value;}

function entryFor(strategy,settings,stats,quality=null){
  const length=strategy==="DARE_N"?settings.dareNLength:strategy==="NAI"?settings.naiLength:strategy==="APEX"?settings.apexLength:settings.assetLength;
  const filter=strategy==="DARE_N"?settings.dareNFilter:strategy==="NAI"?settings.naiFilter:strategy==="APEX"?settings.apexFilter:0;
  return{length,filter,score:Number(quality?.score),strength:Number(quality?.strength),eligible:Boolean(quality?.eligible),minimumTrades:Number(quality?.minimumTrades)||0,fitR2:Number(quality?.fitR2),fitPValue:Number(quality?.fitPValue),fitFStat:Number(quality?.fitFStat),sampleAdequacy:Number(quality?.sampleAdequacy),sparsePenalty:Number(quality?.sparsePenalty),drawdownBurden:Number(quality?.drawdownBurden),objectiveVersion:CONFIGURATION_OPTIMIZER_OBJECTIVE_VERSION,trades:stats.trades,net:stats.net,maxDrawdown:stats.maxDrawdown,winRate:stats.trades?stats.wins/stats.trades:0,grossPerformance:stats,validation:VALIDATION,strategyEngineVersion:STRATEGY_ENGINE_VERSION};
}

export function settingsFromEntry(strategyInput,entry,baseSettings=DEFAULT_STRATEGY_SETTINGS){
  const strategy=normalizeStrategyId(strategyInput),settings=normalizeStrategySettings(baseSettings),length=Math.max(3,Math.min(500,Math.trunc(Number(entry?.length)||50))),filter=Math.max(0,Math.min(10,Number(entry?.filter)||0));
  if(strategy==="ASSET"||strategy==="DARE"||strategy==="COMBO")settings.assetLength=length;
  if(strategy==="DARE_N"){settings.dareNLength=length;settings.dareNFilter=filter;}
  if(strategy==="NAI"){settings.naiLength=length;settings.naiFilter=filter;}
  if(strategy==="APEX"){settings.apexLength=length;settings.apexFilter=filter;}
  return normalizeStrategySettings(settings);
}

export function fullSettings(engine,config,optimizer,pair,timeframe){
  const record=optimizer?.[`${pair}|${timeframe}`];
  if(config.configurationSource==="OPTIMIZED"&&record?.settings)return normalizeStrategySettings(record.settings);
  const effective=engine.pairConfig(config,optimizer,pair,timeframe);
  return settingsFromEntry(effective.strategy,effective.primary,DEFAULT_STRATEGY_SETTINGS);
}

function evaluateSignals(candlesInput,signals,pair){
  const trades=buildRegisteredTrades(candlesInput,signals,pair),stats=summarizeRegisteredTrades(trades),quality=candidateFitQuality(trades,stats,candlesInput.length);
  return{trades,stats,quality};
}

function rootCandidate(candlesInput,pair,normalizedBase,length){
  const settings={...normalizedBase,assetLength:length},htl=buildIntegratedHtlAsset(candlesInput,length),asset=evaluateSignals(candlesInput,htl.signals,pair),dareSignals=buildDareSignals(candlesInput,htl),dare=evaluateSignals(candlesInput,dareSignals,pair),quality={...asset.quality,score:(asset.quality.score+dare.quality.score)/2,strength:(asset.quality.strength+dare.quality.strength)/2,eligible:asset.quality.eligible&&dare.quality.eligible};
  return{strategy:"ASSET",length,filter:0,settings,htl,dareSignals,asset,dare,stats:asset.stats,quality};
}

function filteredCandidate(candlesInput,pair,baseSettings,strategy,htl,length,filter){
  const settings=settingsFromEntry(strategy,{length,filter},baseSettings);
  const events=strategy==="DARE_N"?buildDareNPackage(htl,length,filter).events:buildNaiPackage(htl,length,filter).events;
  const evaluated=evaluateSignals(candlesInput,events,pair);
  return{strategy,length,filter,settings,stats:evaluated.stats,quality:evaluated.quality};
}

function apexCandidate(candlesInput,pair,baseSettings,length,filter,core){
  const settings=settingsFromEntry("APEX",{length,filter},baseSettings),events=buildCausalApexEvents(core.zup,core.puz,filter),evaluated=evaluateSignals(candlesInput,events,pair);
  return{strategy:"APEX",length,filter,settings,stats:evaluated.stats,quality:evaluated.quality};
}

function selectCandidate(candidates){
  let selected=null;
  for(const candidate of candidates)if(betterConfigurationCandidate(candidate,selected))selected=candidate;
  return selected;
}

export function optimizedOptimizeDataset(data,pair,timeframe="UNSPECIFIED",baseSettings=DEFAULT_STRATEGY_SETTINGS){
  const normalizedBase=normalizeStrategySettings(baseSettings),normalizedCandles=normalizeCandles(data),lengths=configurationLengthCandidates(timeframe,normalizedCandles.length);
  if(!lengths.length)throw new Error(`NO_OPTIMIZER_LENGTH_CANDIDATES:${timeframe}:${normalizedCandles.length}`);

  const rootCandidates=lengths.map(length=>rootCandidate(normalizedCandles,pair,normalizedBase,length)),root=selectCandidate(rootCandidates),rootSettings=normalizeStrategySettings({...normalizedBase,assetLength:root.settings.assetLength}),selectedHtl=root.htl;

  const dareNCandidates=[];
  for(const length of lengths)for(const filter of configurationFilterCandidates("DARE_N"))dareNCandidates.push(filteredCandidate(normalizedCandles,pair,rootSettings,"DARE_N",selectedHtl,length,filter));
  const bestDareN=selectCandidate(dareNCandidates);

  const naiCandidates=[];
  for(const length of lengths)for(const filter of configurationFilterCandidates("NAI"))naiCandidates.push(filteredCandidate(normalizedCandles,pair,rootSettings,"NAI",selectedHtl,length,filter));
  const bestNai=selectCandidate(naiCandidates);

  const apexCandidates=[],apexCoreCache=new Map();
  for(const length of lengths){
    const core=buildIntegratedIIICore(normalizedCandles,length);apexCoreCache.set(length,core);
    for(const filter of configurationFilterCandidates("APEX"))apexCandidates.push(apexCandidate(normalizedCandles,pair,rootSettings,length,filter,core));
  }
  const bestApex=selectCandidate(apexCandidates);

  const settings=normalizeStrategySettings({...rootSettings,dareNLength:bestDareN.settings.dareNLength,dareNFilter:bestDareN.settings.dareNFilter,naiLength:bestNai.settings.naiLength,naiFilter:bestNai.settings.naiFilter,apexLength:bestApex.settings.apexLength,apexFilter:bestApex.settings.apexFilter,csf:normalizedBase.csf});
  const finalResult=evaluateRegisteredPerformance(normalizedCandles,pair,settings),directionalResult=applyDirectionalOwnershipPerformance(finalResult,pair),config={};

  const finalQuality={};
  for(const strategy of STRATEGIES){const item=finalResult.strategies[strategy],quality=candidateFitQuality(item.trades,item.stats,normalizedCandles.length);finalQuality[strategy]=quality;config[strategy]={...entryFor(strategy,settings,item.stats,quality),candidateLengths:strategy==="COMBO"?[settings.assetLength]:[...lengths],candidateFilters:[...(CONFIGURATION_OPTIMIZER_FILTER_GRID[strategy]||[0])]};}
  config.ASSET={...config.ASSET,score:root.quality.score,strength:root.quality.strength,eligible:root.quality.eligible,fitR2:root.quality.fitR2,fitPValue:root.quality.fitPValue,selectionMode:"SHARED_ASSET_DARE_ROOT",consumerScores:{ASSET:root.asset.quality.score,DARE:root.dare.quality.score}};
  config.DARE={...config.DARE,selectionMode:"SHARED_ASSET_DARE_ROOT",consumerScore:root.dare.quality.score};
  config.DARE_N={...config.DARE_N,score:bestDareN.quality.score,strength:bestDareN.quality.strength,fitR2:bestDareN.quality.fitR2,fitPValue:bestDareN.quality.fitPValue};
  config.NAI={...config.NAI,score:bestNai.quality.score,strength:bestNai.quality.strength,fitR2:bestNai.quality.fitR2,fitPValue:bestNai.quality.fitPValue};
  config.APEX={...config.APEX,score:bestApex.quality.score,strength:bestApex.quality.strength,fitR2:bestApex.quality.fitR2,fitPValue:bestApex.quality.fitPValue};
  config.COMBO={...config.COMBO,selectionMode:"DERIVED_FROM_FINAL_COHERENT_SETTINGS"};

  const searchDiagnostics={
    objectiveVersion:CONFIGURATION_OPTIMIZER_OBJECTIVE_VERSION,
    timeframe,
    candidateLengthOrder:[...lengths],
    filterGrid:Object.fromEntries(Object.entries(CONFIGURATION_OPTIMIZER_FILTER_GRID).map(([strategy,filters])=>[strategy,[...filters]])),
    evaluatedCandidates:rootCandidates.length+dareNCandidates.length+naiCandidates.length+apexCandidates.length+1,
    strategies:{
      ASSET:{selectionMode:"SHARED_ASSET_DARE_ROOT",evaluatedCandidates:rootCandidates.length,selected:{length:root.length,filter:0,score:root.quality.score,assetScore:root.asset.quality.score,dareScore:root.dare.quality.score},topCandidates:topCandidateTrace(rootCandidates)},
      DARE:{selectionMode:"SHARED_ASSET_DARE_ROOT",evaluatedCandidates:rootCandidates.length,selected:{length:root.length,filter:0,score:root.dare.quality.score}},
      DARE_N:{evaluatedCandidates:dareNCandidates.length,selected:topCandidateTrace([bestDareN],1)[0],topCandidates:topCandidateTrace(dareNCandidates)},
      NAI:{evaluatedCandidates:naiCandidates.length,selected:topCandidateTrace([bestNai],1)[0],topCandidates:topCandidateTrace(naiCandidates)},
      APEX:{evaluatedCandidates:apexCandidates.length,selected:topCandidateTrace([bestApex],1)[0],topCandidates:topCandidateTrace(apexCandidates)},
      COMBO:{selectionMode:"DERIVED_FROM_FINAL_COHERENT_SETTINGS",evaluatedCandidates:1,selected:{length:settings.assetLength,filter:0,score:finalQuality.COMBO.score}},
    },
  };

  const ioiIom=optimizeIoiIomPerformance(normalizedCandles,pair,timeframe,LENGTH_GRID,VALIDATION,STRATEGY_ENGINE_VERSION);
  for(const strategy of ["IOI","IOM"])if(ioiIom.config[strategy])ioiIom.config[strategy].directionalOwnershipVersion=DIRECTIONAL_OWNERSHIP_VERSION;
  Object.assign(config,ioiIom.config);
  return{settings,config,grossPerformance:[...registeredExportRows(directionalResult,pair,timeframe),...ioiIom.rows],directionalOwnershipVersion:DIRECTIONAL_OWNERSHIP_VERSION,optimizerObjectiveVersion:CONFIGURATION_OPTIMIZER_OBJECTIVE_VERSION,optimizerDiagnostics:searchDiagnostics};
}

export async function optimizedComputeConfiguration(engine,value={}){
  let stage="validation";
  try{
    const pair=String(value.pair||"").toUpperCase(),timeframe=String(value.timeframe||"").toUpperCase(),startDate=String(value.startDate||""),endDate=String(value.endDate||""),hasDateRange=Boolean(startDate||endDate);
    if(!PAIRS.includes(pair))throw responseError("Invalid Compute Configuration currency pair.");
    if(!TIMEFRAMES.includes(timeframe))throw responseError("Invalid Compute Configuration timeframe.");
    if(hasDateRange&&(!/^\d{4}-\d{2}-\d{2}$/.test(startDate)||!/^\d{4}-\d{2}-\d{2}$/.test(endDate)))throw responseError("Both dates are required when an explicit range is supplied.");
    stage="credentials";const apiToken=token(engine.env);stage="oanda-history";
    const data=hasDateRange?await candlesForRange(pair,apiToken,timeframe,startDate,endDate):await candles(pair,apiToken,timeframe,RUNTIME_OPTIMIZER_HISTORY_BARS);
    if(data.length<150)throw responseError(`Insufficient completed candles for registered Horizon computation: ${data.length}.`);
    stage="registered-horizon-optimization";const optimized=optimizedOptimizeDataset(data,pair,timeframe),stamp=data.at(-1)?.time||new Date().toISOString();stage="durable-storage";
    const records=await loadRuntimeOptimizer(engine.ctx.storage),key=`${pair}|${timeframe}`,record={version:RUNTIME_OPTIMIZER_VERSION,strategyEngineVersion:STRATEGY_ENGINE_VERSION,performanceVersion:REGISTERED_PERFORMANCE_VERSION,directionalOwnershipVersion:optimized.directionalOwnershipVersion,optimizerObjectiveVersion:optimized.optimizerObjectiveVersion,optimizerDiagnostics:optimized.optimizerDiagnostics,stamp,computedAt:new Date().toISOString(),source:"COMPUTE_CONFIGURATION",optimizerHistoryBars:RUNTIME_OPTIMIZER_HISTORY_BARS,validation:VALIDATION,analyticalCertification:ANALYTICAL_CERTIFICATION,range:{startDate:hasDateRange?startDate:null,endDate:hasDateRange?endDate:null,firstCandle:data[0]?.time||null,lastCandle:data.at(-1)?.time||null,bars:data.length},settings:optimized.settings,config:optimized.config,grossPerformance:optimized.grossPerformance,spreadAdjustedPerformance:{status:"SEPARATE_NOT_COMPUTED",rows:[]}};
    records[key]=record;await saveRuntimeOptimizerRecord(engine.ctx.storage,key,record);return{key,record};
  }catch(error){if(!error.stage)error.stage=stage;throw error;}
}

export async function optimizedOptimizeNext(engine,state,apiToken){
  const total=PAIRS.length*TIMEFRAMES.length,index=Number(state.optimizerCycleIndex||0)%total,pair=PAIRS[index%PAIRS.length],timeframe=TIMEFRAMES[Math.floor(index/PAIRS.length)],key=`${pair}|${timeframe}`,records=await loadRuntimeOptimizer(engine.ctx.storage),existing=records[key];state.optimizerCycleIndex=(index+1)%total;
  if(existing?.version===RUNTIME_OPTIMIZER_VERSION&&existing?.strategyEngineVersion===STRATEGY_ENGINE_VERSION&&existing?.optimizerObjectiveVersion===CONFIGURATION_OPTIMIZER_OBJECTIVE_VERSION&&existing?.source==="COMPUTE_CONFIGURATION"&&Date.now()-Date.parse(existing.computedAt||0)<OPTIMIZER_TTL_MS){state.optimizerLastDataset=key;state.optimizerLastRun=new Date().toISOString();state.optimizerLastError=null;return{records:currentRuntimeOptimizer(records),key,record:existing};}
  const data=await candles(pair,apiToken,timeframe,RUNTIME_OPTIMIZER_HISTORY_BARS),optimized=optimizedOptimizeDataset(data,pair,timeframe),stamp=data.at(-1)?.time||new Date().toISOString(),record={version:RUNTIME_OPTIMIZER_VERSION,strategyEngineVersion:STRATEGY_ENGINE_VERSION,performanceVersion:REGISTERED_PERFORMANCE_VERSION,directionalOwnershipVersion:optimized.directionalOwnershipVersion,optimizerObjectiveVersion:optimized.optimizerObjectiveVersion,optimizerDiagnostics:optimized.optimizerDiagnostics,stamp,computedAt:new Date().toISOString(),source:"SERVER",optimizerHistoryBars:RUNTIME_OPTIMIZER_HISTORY_BARS,validation:VALIDATION,analyticalCertification:ANALYTICAL_CERTIFICATION,range:{startDate:null,endDate:null,firstCandle:data[0]?.time||null,lastCandle:data.at(-1)?.time||null,bars:data.length},settings:optimized.settings,config:optimized.config,grossPerformance:optimized.grossPerformance,spreadAdjustedPerformance:{status:"SEPARATE_NOT_COMPUTED",rows:[]}};
  records[key]=record;await saveRuntimeOptimizerRecord(engine.ctx.storage,key,record);state.optimizerLastDataset=key;state.optimizerLastRun=new Date().toISOString();state.optimizerLastError=null;return{records:currentRuntimeOptimizer(records),key,record};
}

export async function optimizedScan(engine,apiToken,config,timeframe=config.timeframe,optimizer={}){
  const rows=[],errors=[],queue=[...PAIRS],concurrencyLimit=4,workers=Array(concurrencyLimit).fill(null).map(async()=>{while(queue.length>0){const pair=queue.shift();try{const settings=fullSettings(engine,config,optimizer,pair,timeframe),data=await candles(pair,apiToken,timeframe),event=currentEvent(data,pair,timeframe,config.strategy,settings);if(event)rows.push({pair,event,configuration:{primary:engine.pairConfig(config,optimizer,pair,timeframe).primary,settings,strategyEngineVersion:STRATEGY_ENGINE_VERSION}});}catch(error){errors.push({pair,error:String(error?.message||error)});}}});
  await Promise.all(workers);if(errors.length)await engine.write({type:"SCAN_PARTIAL",timeframe,strategyEngineVersion:STRATEGY_ENGINE_VERSION,message:`${timeframe}: ${rows.length} pairs loaded, ${errors.length} failed`,failures:errors},false);return rows;
}
