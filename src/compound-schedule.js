import {
  DEFAULT_STRATEGY_SETTINGS,
  normalizeCandles,
  normalizeStrategySettings,
  buildIntegratedHtlAsset,
  buildDareNPackage,
  buildNaiPackage,
  buildIntegratedIIICore,
} from "./horizon-strategy-v1.js";

export const COMPOUND_SCHEDULE_VERSION="COMPOUND_MCP_SCHEDULE@1.0.1";
export const COMPOUND_MCP_PROTOCOL_VERSION="2024-11-05";
export const COMPOUND_SCHEDULE_STRATEGIES=Object.freeze(["ASSET","DARE_N","DARE","COMBO","NAI","APEX"]);
const MIN_SCHEDULE_BARS=180;
const MAX_SCHEDULE_BARS=650;
const TERMINAL_CANDLE_REQUEST_MARGIN=2;

const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
const finite=value=>Number.isFinite(Number(value))?Number(value):0;
const directionWord=direction=>direction>0?"BUY":direction<0?"SELL":"—";

export function confidenceFromScheduleScore(score,threshold=.7){
  const magnitude=Math.max(0,Math.abs(finite(score))-threshold);
  return clamp(.5+.48*(1-Math.exp(-magnitude*1.35)),.5,.98);
}

export function normalizeScheduleStrategies(values=[]){
  const source=Array.isArray(values)?values:[values],out=[];
  for(const raw of source){const value=String(raw||"").trim().toUpperCase().replace(/[\s/-]+/g,"_");const normalized=value==="HTL_ASSET"?"ASSET":value==="CSF"||value==="COMBO_CSF"?"COMBO":value;if(COMPOUND_SCHEDULE_STRATEGIES.includes(normalized)&&!out.includes(normalized))out.push(normalized);}
  if(!out.includes("ASSET"))out.unshift("ASSET");
  return out;
}

function scheduleHistoryLength(settingsInput=DEFAULT_STRATEGY_SETTINGS,strategiesInput=["ASSET"]){
  const settings=normalizeStrategySettings(settingsInput),strategies=normalizeScheduleStrategies(strategiesInput);
  let length=settings.assetLength;
  for(const strategy of strategies){
    if(strategy==="DARE_N")length=Math.max(length,settings.assetLength,settings.dareNLength);
    else if(strategy==="NAI"||strategy==="COMBO")length=Math.max(length,settings.assetLength,settings.naiLength);
    else if(strategy==="APEX")length=Math.max(length,settings.apexLength);
    else length=Math.max(length,settings.assetLength);
  }
  return length;
}

export function requiredCompletedScheduleBars(settingsInput=DEFAULT_STRATEGY_SETTINGS,strategiesInput=["ASSET"]){
  const length=scheduleHistoryLength(settingsInput,strategiesInput);
  return clamp(Math.max(MIN_SCHEDULE_BARS,length*3),MIN_SCHEDULE_BARS,MAX_SCHEDULE_BARS-TERMINAL_CANDLE_REQUEST_MARGIN);
}

export function requiredScheduleBars(settingsInput=DEFAULT_STRATEGY_SETTINGS,strategiesInput=["ASSET"]){
  return requiredCompletedScheduleBars(settingsInput,strategiesInput)+TERMINAL_CANDLE_REQUEST_MARGIN;
}

function relation(left,right,threshold=0){
  const l=Number(left),r=Number(right);
  if(!Number.isFinite(l)||!Number.isFinite(r))return{direction:0,score:0,left:null,right:null};
  const score=l-r,direction=score>threshold?1:score<-threshold?-1:0;
  return{direction,score,left:l,right:r};
}
function output(direction,score,regime,metrics={}){return{direction,signal:directionWord(direction),score:finite(score),confidence:direction?confidenceFromScheduleScore(score):0,regime,metrics};}

export function evaluateCompoundScheduleDataset(candlesInput,settingsInput=DEFAULT_STRATEGY_SETTINGS,strategiesInput=["ASSET"]){
  const candles=normalizeCandles(candlesInput),settings=normalizeStrategySettings(settingsInput),strategies=normalizeScheduleStrategies(strategiesInput);
  if(!candles.length)throw new Error("NO_COMPLETED_SCHEDULE_CANDLES");
  const requiredCompleted=requiredCompletedScheduleBars(settings,strategies),requested=requiredScheduleBars(settings,strategies);
  if(candles.length<requiredCompleted)throw new Error(`INSUFFICIENT_COMPOUND_SCHEDULE_CANDLES:${candles.length}:${requiredCompleted}`);
  const index=candles.length-1,htl=buildIntegratedHtlAsset(candles,settings.assetLength),outputs={};
  const asset=relation(htl.asset[index],htl.inverseAsset[index]);
  outputs.ASSET=output(asset.direction,asset.score,"HTL EVENT",{asset:asset.left,inverse:asset.right,spread:asset.score});
  let dare=null,nai=null;
  if(strategies.includes("DARE")||strategies.includes("COMBO")){
    dare=relation(htl.meanAsset[index],htl.meanInverse[index]);
    outputs.DARE=output(dare.direction,dare.score,"MEAN CROSS",{mean:dare.left,meanInverse:dare.right,spread:dare.score});
  }
  if(strategies.includes("DARE_N")){
    const pkg=buildDareNPackage(htl,settings.dareNLength,settings.dareNFilter),value=relation(pkg.series.assetNormalized[index],pkg.series.inverseNormalized[index],settings.dareNFilter);
    outputs.DARE_N=output(value.direction,value.score,"NORMALIZED MEAN",{dareNMean:value.left,dareNInverse:value.right,spread:value.score});
  }
  if(strategies.includes("NAI")||strategies.includes("COMBO")){
    const pkg=buildNaiPackage(htl,settings.naiLength,settings.naiFilter);nai=relation(pkg.series.assetNormalized[index],pkg.series.inverseNormalized[index],settings.naiFilter);
    outputs.NAI=output(nai.direction,nai.score,"NORMALIZED ASSET",{naiAsset:nai.left,naiInverse:nai.right,spread:nai.score});
  }
  if(strategies.includes("COMBO")){
    if(!dare){dare=relation(htl.meanAsset[index],htl.meanInverse[index]);outputs.DARE=output(dare.direction,dare.score,"MEAN CROSS",{mean:dare.left,meanInverse:dare.right,spread:dare.score});}
    if(!nai){const pkg=buildNaiPackage(htl,settings.naiLength,settings.naiFilter);nai=relation(pkg.series.assetNormalized[index],pkg.series.inverseNormalized[index],settings.naiFilter);}
    const direction=dare.direction&&dare.direction===nai.direction?dare.direction:0,score=direction?(Math.abs(dare.score)+Math.abs(nai.score))/2:0;
    outputs.COMBO=output(direction,score,"CSF TWO OPINIONS",{dare:dare.direction,nai:nai.direction});
  }
  if(strategies.includes("APEX")){
    const core=buildIntegratedIIICore(candles,settings.apexLength),z=Number(core.zup[index]),p=Number(core.puz[index]);let direction=0;if(Number.isFinite(z)&&Number.isFinite(p)){const sell=z>=settings.apexFilter&&p<=-settings.apexFilter,buy=z<=-settings.apexFilter&&p>=settings.apexFilter;direction=sell===buy?0:sell?-1:1;}outputs.APEX=output(direction,Number.isFinite(z)?z:0,"APEX",{zup:Number.isFinite(z)?z:null,puz:Number.isFinite(p)?p:null});
  }
  const lastSignal=htl.signals?.at(-1)||null,signalCandle=lastSignal?candles[lastSignal.signalIndex]:null;
  return{
    version:COMPOUND_SCHEDULE_VERSION,
    bars:candles.length,
    requiredCompletedBars:requiredCompleted,
    requestedBars:requested,
    completedCandleTime:candles[index].time,
    currentPrice:candles[index].close,
    settings,
    strategies:outputs,
    htlCurrentEvent:{direction:asset.direction,currentEvent:directionWord(asset.direction),openPrice:signalCandle?.close??null,startTime:signalCandle?.time??null,eventDirection:lastSignal?.direction||0},
  };
}

export function projectOptimizerSchedule(records={},pairs=[],timeframes=[]){
  const rows=[];
  for(const timeframe of timeframes)for(const pair of pairs){const key=`${pair}|${timeframe}`,record=records?.[key]||null;rows.push({key,pair,timeframe,available:Boolean(record),bars:Number(record?.range?.bars)||0,stamp:record?.stamp||null,computedAt:record?.computedAt||null,source:record?.source||null,settings:record?.settings||DEFAULT_STRATEGY_SETTINGS,config:record?.config||null,strategyEngineVersion:record?.strategyEngineVersion||null,performanceVersion:record?.performanceVersion||null,optimizerObjectiveVersion:record?.optimizerObjectiveVersion||null});}
  return rows;
}
