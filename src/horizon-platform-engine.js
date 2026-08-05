import {
  STRATEGY_ENGINE_VERSION,
  DEFAULT_STRATEGY_SETTINGS,
  normalizeStrategyId,
  normalizeStrategySettings,
  evaluateStrategyWindow,
  strategyConfigHash,
} from "./horizon-strategy-v1.js";
import {
  REGISTERED_PERFORMANCE_VERSION,
  REGISTERED_HISTORY_BARS,
  evaluateRegisteredPerformance,
  registeredExportRows,
} from "./horizon-registered-performance.js";

export const OPTIMIZER_VERSION = 6;
export const VALIDATION = "REGISTERED_HORIZON_STRATEGY_V1_GROSS";
export const MAX_COMPUTE_BARS = 5000;
export const OPTIMIZER_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const PAIRS = ["EUR_USD","GBP_USD","USD_JPY","USD_CAD","USD_CHF","AUD_USD","NZD_USD","EUR_GBP","EUR_JPY","EUR_CHF","EUR_AUD","EUR_CAD","EUR_NZD","GBP_JPY","GBP_CHF","GBP_AUD","GBP_CAD","GBP_NZD","AUD_JPY","AUD_CHF","AUD_CAD","AUD_NZD","NZD_JPY","NZD_CHF","NZD_CAD","CAD_JPY","CAD_CHF","CHF_JPY"];
export const TIMEFRAMES = ["W","D","H4","H1","M30","M15","M5","M1","S30","S5"];
export const TIMEFRAME_SECONDS = {W:604800,D:86400,H4:14400,H1:3600,M30:1800,M15:900,M5:300,M1:60,S30:30,S5:5};
export const STRATEGIES = ["ASSET","DARE_N","DARE","COMBO","NAI","APEX"];
export const LENGTH_GRID = [10,20,30,40,50];
export const FILTER_GRID = Object.freeze({
  ASSET:[0], DARE_N:[0,.5,1,1.5,2], DARE:[0], COMBO:[0],
  NAI:[0,.5,1,1.5,2], APEX:[0,1,2,3,5,7],
});
export const ANALYTICAL_CERTIFICATION = Object.freeze({
  formulaParity: "PASS_CHECKSUM_VERIFIED_SOURCE",
  terminalFixtureParity: "PASS_TERMINAL_DERIVED_FIXTURE",
  cleanSnapshotParity: "PASS_28_PAIRS_3000_BARS_168_ROWS",
  legacyBenchmarkParity: "REJECTED_DATA_CONTAMINATION",
  cleanCandleSnapshotSha256: "60f2a9e3353bfe18dc8f0bafe8032438e982b38d8b1f85734440ab3805c56b5d",
  cleanPerformanceSha256: "8a294dbf8be60f87b70367ce780024af87c86a2b67081eb2fc8a9b481a61fe2f",
  strategyEngineVersion: STRATEGY_ENGINE_VERSION,
  performanceVersion: REGISTERED_PERFORMANCE_VERSION,
});

const API = "https://api-fxtrade.oanda.com";
const responseError = (message,status=400) => Object.assign(new Error(message),{status});

async function callOanda(path, token, init={}) {
  const result = await fetch(API + path, {
    method:init.method || "GET",
    headers:{Authorization:`Bearer ${token}`,Accept:"application/json",...(init.body?{"Content-Type":"application/json"}:{})},
    body:init.body, redirect:"manual", cache:"no-store",
  });
  const payload = await result.json().catch(()=>({}));
  if (!result.ok) throw Object.assign(new Error(payload.errorMessage||payload.errorCode||`OANDA HTTP ${result.status}`),{status:result.status,payload});
  return payload;
}
function token(env) { const value=String(env.OANDA_API_KEY||"").trim(); if(value.length<20) throw responseError("OANDA secrets unavailable.",503); return value; }
function normalizeOandaCandles(payload) {
  return (payload.candles||[]).filter(candle=>candle.complete===true&&candle.mid).map(candle=>({
    time:candle.time, open:Number(candle.mid.o), high:Number(candle.mid.h), low:Number(candle.mid.l), close:Number(candle.mid.c), volume:Number(candle.volume||0), complete:true,
  })).filter(candle=>[candle.open,candle.high,candle.low,candle.close].every(Number.isFinite));
}
export async function candles(pair, apiToken, timeframe, count=REGISTERED_HISTORY_BARS) {
  const query=new URLSearchParams({price:"M",granularity:timeframe,count:String(Math.min(MAX_COMPUTE_BARS,count)),smooth:"false"});
  return normalizeOandaCandles(await callOanda(`/v3/instruments/${pair}/candles?${query}`,apiToken));
}
export async function candlesForRange(pair, apiToken, timeframe, startDate, endDate) {
  const start=new Date(`${startDate}T00:00:00.000Z`), end=new Date(`${endDate}T23:59:59.999Z`);
  if(!Number.isFinite(start.getTime())||!Number.isFinite(end.getTime())||start>end) throw responseError("Invalid Compute Configuration date range.");
  const estimated=Math.ceil((end-start)/(TIMEFRAME_SECONDS[timeframe]*1000))+2;
  if(estimated>MAX_COMPUTE_BARS) throw responseError(`Selected ${timeframe} range is too large (${estimated.toLocaleString()} estimated bars; maximum ${MAX_COMPUTE_BARS.toLocaleString()}).`);
  const query=new URLSearchParams({price:"M",granularity:timeframe,from:start.toISOString(),to:end.toISOString(),smooth:"false",includeFirst:"true"});
  const data=normalizeOandaCandles(await callOanda(`/v3/instruments/${pair}/candles?${query}`,apiToken));
  if(data.length>MAX_COMPUTE_BARS) throw responseError(`OANDA returned ${data.length.toLocaleString()} bars; maximum ${MAX_COMPUTE_BARS.toLocaleString()}.`);
  return data;
}

function settingsFromEntry(strategyInput, entry, baseSettings=DEFAULT_STRATEGY_SETTINGS) {
  const strategy=normalizeStrategyId(strategyInput), settings=normalizeStrategySettings(baseSettings), length=Math.max(3,Math.min(500,Math.trunc(Number(entry?.length)||50))), filter=Math.max(0,Math.min(10,Number(entry?.filter)||0));
  if(strategy==="ASSET"||strategy==="DARE"||strategy==="COMBO") settings.assetLength=length;
  if(strategy==="DARE_N"){settings.dareNLength=length;settings.dareNFilter=filter;}
  if(strategy==="NAI"){settings.naiLength=length;settings.naiFilter=filter;}
  if(strategy==="APEX"){settings.apexLength=length;settings.apexFilter=filter;}
  return normalizeStrategySettings(settings);
}
function fullSettings(engine, config, optimizer, pair, timeframe) {
  const record=optimizer?.[`${pair}|${timeframe}`];
  if(config.configurationSource==="OPTIMIZED"&&record?.settings) return normalizeStrategySettings(record.settings);
  const effective=engine.pairConfig(config,optimizer,pair,timeframe);
  return settingsFromEntry(effective.strategy,effective.primary,DEFAULT_STRATEGY_SETTINGS);
}
function eventArrays(evaluation) {
  return {
    ASSET:evaluation.diagnostics.htl.signals,
    DARE_N:evaluation.diagnostics.dareN.events,
    DARE:evaluation.diagnostics.dareSignals,
    COMBO:evaluation.diagnostics.csf.signals,
    NAI:evaluation.diagnostics.nai.events,
    APEX:evaluation.diagnostics.apexEvents,
  };
}
export function currentEvent(data,pair,timeframe,strategyInput,settingsInput) {
  const strategy=normalizeStrategyId(strategyInput), settings=normalizeStrategySettings(settingsInput), evaluation=evaluateStrategyWindow(data,settings), events=eventArrays(evaluation)[strategy];
  if(!events.length)return null;
  const event=events.at(-1), start=evaluation.candles[event.signalIndex], id=`${STRATEGY_ENGINE_VERSION}:${strategyConfigHash(settings)}:${pair}:${timeframe}:${strategy}:${start.time}:${event.direction}`;
  return {direction:event.direction,rawDirection:event.direction,startTime:start.time,crossingTime:start.time,openPrice:start.close,bars:evaluation.candles.length-event.signalIndex,id,qualified:true,qualificationResult:"REGISTERED_EVENT",qualificationReason:event.source||`${strategy}_REGISTERED_STATE_CHANGE`,strategyEngineVersion:STRATEGY_ENGINE_VERSION,performanceVersion:REGISTERED_PERFORMANCE_VERSION,sourceEvent:event};
}

function scoreStats(stats){return stats.trades>=2?stats.net-(.25*stats.maxDrawdown):-Infinity;}
function entryFor(strategy,settings,stats){const length=strategy==="DARE_N"?settings.dareNLength:strategy==="NAI"?settings.naiLength:strategy==="APEX"?settings.apexLength:settings.assetLength,filter=strategy==="DARE_N"?settings.dareNFilter:strategy==="NAI"?settings.naiFilter:strategy==="APEX"?settings.apexFilter:0;return{length,filter,score:scoreStats(stats),trades:stats.trades,net:stats.net,maxDrawdown:stats.maxDrawdown,winRate:stats.trades?stats.wins/stats.trades:0,grossPerformance:stats,validation:VALIDATION,strategyEngineVersion:STRATEGY_ENGINE_VERSION};}
export function optimizeDataset(data,pair,baseSettings=DEFAULT_STRATEGY_SETTINGS){
  const normalizedBase=normalizeStrategySettings(baseSettings), best={};
  for(const strategy of STRATEGIES){
    const lengths=strategy==="COMBO"?[normalizedBase.assetLength]:LENGTH_GRID.filter(length=>length*3<data.length), filters=FILTER_GRID[strategy];
    let selected=null;
    for(const length of lengths) for(const filter of filters){
      const settings=settingsFromEntry(strategy,{length,filter},normalizedBase), result=evaluateRegisteredPerformance(data,pair,settings), stats=result.strategies[strategy].stats, candidate={settings,entry:entryFor(strategy,settings,stats)};
      if(!selected||candidate.entry.score>selected.entry.score)selected=candidate;
    }
    best[strategy]=selected;
  }
  const settings={...normalizedBase,assetLength:best.ASSET.settings.assetLength,dareNLength:best.DARE_N.settings.dareNLength,dareNFilter:best.DARE_N.settings.dareNFilter,naiLength:best.NAI.settings.naiLength,naiFilter:best.NAI.settings.naiFilter,apexLength:best.APEX.settings.apexLength,apexFilter:best.APEX.settings.apexFilter,csf:normalizedBase.csf};
  const finalResult=evaluateRegisteredPerformance(data,pair,settings), config={};
  for(const strategy of STRATEGIES) config[strategy]={...entryFor(strategy,settings,finalResult.strategies[strategy].stats),candidateLengths:[...LENGTH_GRID],candidateFilters:[...FILTER_GRID[strategy]]};
  return{settings:normalizeStrategySettings(settings),config,grossPerformance:registeredExportRows(finalResult,pair,"UNSPECIFIED")};
}
export function currentOptimizer(records){const now=Date.now();return Object.fromEntries(Object.entries(records||{}).filter(([,record])=>record?.version===OPTIMIZER_VERSION&&record?.strategyEngineVersion===STRATEGY_ENGINE_VERSION&&now-Date.parse(record.computedAt||record.stamp||0)<OPTIMIZER_TTL_MS));}

export async function computeConfiguration(engine,value={}){
  let stage="validation";
  try{
    const pair=String(value.pair||"").toUpperCase(),timeframe=String(value.timeframe||"").toUpperCase(),startDate=String(value.startDate||""),endDate=String(value.endDate||""),hasDateRange=Boolean(startDate||endDate);
    if(!PAIRS.includes(pair))throw responseError("Invalid Compute Configuration currency pair.");
    if(!TIMEFRAMES.includes(timeframe))throw responseError("Invalid Compute Configuration timeframe.");
    if(hasDateRange&&(!/^\d{4}-\d{2}-\d{2}$/.test(startDate)||!/^\d{4}-\d{2}-\d{2}$/.test(endDate)))throw responseError("Both dates are required when an explicit range is supplied.");
    stage="credentials";const apiToken=token(engine.env);stage="oanda-history";const data=hasDateRange?await candlesForRange(pair,apiToken,timeframe,startDate,endDate):await candles(pair,apiToken,timeframe,REGISTERED_HISTORY_BARS);
    if(data.length<150)throw responseError(`Insufficient completed candles for registered Horizon computation: ${data.length}.`);
    stage="registered-horizon-optimization";const optimized=optimizeDataset(data,pair),result=evaluateRegisteredPerformance(data,pair,optimized.settings),stamp=data.at(-1)?.time||new Date().toISOString();
    stage="durable-storage";const records=(await engine.ctx.storage.get("optimizer"))||{},key=`${pair}|${timeframe}`,record={version:OPTIMIZER_VERSION,strategyEngineVersion:STRATEGY_ENGINE_VERSION,performanceVersion:REGISTERED_PERFORMANCE_VERSION,stamp,computedAt:new Date().toISOString(),source:"COMPUTE_CONFIGURATION",validation:VALIDATION,analyticalCertification:ANALYTICAL_CERTIFICATION,range:{startDate:hasDateRange?startDate:null,endDate:hasDateRange?endDate:null,firstCandle:data[0]?.time||null,lastCandle:data.at(-1)?.time||null,bars:data.length},settings:optimized.settings,config:optimized.config,grossPerformance:registeredExportRows(result,pair,timeframe),spreadAdjustedPerformance:{status:"SEPARATE_NOT_COMPUTED",rows:[]}};
    records[key]=record;await engine.ctx.storage.put("optimizer",records);return{key,record};
  }catch(error){if(!error.stage)error.stage=stage;throw error;}
}
export async function optimizeNext(engine,state,apiToken){
  const total=PAIRS.length*TIMEFRAMES.length,index=Number(state.optimizerCycleIndex||0)%total,pair=PAIRS[index%PAIRS.length],timeframe=TIMEFRAMES[Math.floor(index/PAIRS.length)],key=`${pair}|${timeframe}`,records=(await engine.ctx.storage.get("optimizer"))||{},existing=records[key];state.optimizerCycleIndex=(index+1)%total;
  if(existing?.version===OPTIMIZER_VERSION&&existing?.strategyEngineVersion===STRATEGY_ENGINE_VERSION&&existing?.source==="COMPUTE_CONFIGURATION"&&Date.now()-Date.parse(existing.computedAt||0)<OPTIMIZER_TTL_MS){state.optimizerLastDataset=key;state.optimizerLastRun=new Date().toISOString();state.optimizerLastError=null;return{records:currentOptimizer(records),key,record:existing};}
  const data=await candles(pair,apiToken,timeframe,REGISTERED_HISTORY_BARS),optimized=optimizeDataset(data,pair),stamp=data.at(-1)?.time||new Date().toISOString(),result=evaluateRegisteredPerformance(data,pair,optimized.settings),record={version:OPTIMIZER_VERSION,strategyEngineVersion:STRATEGY_ENGINE_VERSION,performanceVersion:REGISTERED_PERFORMANCE_VERSION,stamp,computedAt:new Date().toISOString(),source:"SERVER",validation:VALIDATION,analyticalCertification:ANALYTICAL_CERTIFICATION,range:{startDate:null,endDate:null,firstCandle:data[0]?.time||null,lastCandle:data.at(-1)?.time||null,bars:data.length},settings:optimized.settings,config:optimized.config,grossPerformance:registeredExportRows(result,pair,timeframe),spreadAdjustedPerformance:{status:"SEPARATE_NOT_COMPUTED",rows:[]}};
  records[key]=record;await engine.ctx.storage.put("optimizer",records);state.optimizerLastDataset=key;state.optimizerLastRun=new Date().toISOString();state.optimizerLastError=null;return{records:currentOptimizer(records),key,record};
}
export async function scan(engine,apiToken,config,timeframe=config.timeframe,optimizer={}){
  const rows=[],errors=[];
  for(const pair of PAIRS)try{const settings=fullSettings(engine,config,optimizer,pair,timeframe),event=currentEvent(await candles(pair,apiToken,timeframe,REGISTERED_HISTORY_BARS),pair,timeframe,config.strategy,settings);if(event)rows.push({pair,event,configuration:{primary:engine.pairConfig(config,optimizer,pair,timeframe).primary,settings,strategyEngineVersion:STRATEGY_ENGINE_VERSION}});}catch(error){errors.push({pair,error:String(error?.message||error)});}
  if(errors.length)await engine.write({type:"SCAN_PARTIAL",timeframe,strategyEngineVersion:STRATEGY_ENGINE_VERSION,message:`${timeframe}: ${rows.length} pairs loaded, ${errors.length} failed`,failures:errors},false);
  return rows;
}
export const __platformTest=Object.freeze({currentEvent,optimizeDataset,VALIDATION,OPTIMIZER_VERSION,strategyEngineVersion:STRATEGY_ENGINE_VERSION,performanceVersion:REGISTERED_PERFORMANCE_VERSION,analyticalCertification:ANALYTICAL_CERTIFICATION});
