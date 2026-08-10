import { buildIntegratedIIICore, normalizeCandles } from "./horizon-strategy-v1.js";
import { buildRegisteredTrades, summarizeRegisteredTrades } from "./horizon-registered-performance.js";

export const IOI_IOM_PERFORMANCE_VERSION="IOI_IOM_REGISTERED_PERFORMANCE@1.0.1";
export const IOI_IOM_STRATEGIES=Object.freeze(["IOI","IOM"]);

const finite=value=>value!==null&&value!==undefined&&value!==""&&Number.isFinite(Number(value));

function crossDirection(left,right,index){
  if(index<1)return 0;
  const values=[left?.[index],right?.[index],left?.[index-1],right?.[index-1]];
  if(!values.every(finite))return 0;
  if(Number(left[index])>Number(right[index])&&Number(left[index-1])<=Number(right[index-1]))return 1;
  if(Number(left[index])<Number(right[index])&&Number(left[index-1])>=Number(right[index-1]))return -1;
  return 0;
}

function pairAverage(left=[],right=[]){
  const size=Math.max(left.length||0,right.length||0);
  return Array.from({length:size},(_,index)=>finite(left[index])&&finite(right[index])?(Number(left[index])+Number(right[index]))/2:null);
}

function rollingMeanStd(values=[],length=10){
  const period=Math.max(3,Math.trunc(Number(length)||10)),mean=Array(values.length).fill(null),std=Array(values.length).fill(null);
  for(let index=period-1;index<values.length;index++){
    const window=values.slice(index-period+1,index+1);
    if(!window.every(finite))continue;
    const center=window.reduce((sum,value)=>sum+Number(value),0)/period;
    const variance=window.reduce((sum,value)=>sum+(Number(value)-center)**2,0)/period;
    mean[index]=center;std[index]=Math.sqrt(Math.max(0,variance));
  }
  return{mean,std};
}

export function buildCausalHtlAsset(rawCandles,length=10){
  const data=normalizeCandles(rawCandles),resolvedLength=Math.max(3,Math.min(500,Math.trunc(Number(length)||10))),series=buildIntegratedIIICore(data,resolvedLength),families=[[series.hl2,series.upr],[series.mui,series.ui],[series.zui,series.iuz]],crosses=new Map();
  for(let index=1;index<data.length;index++){
    const vote=families.reduce((sum,[left,right])=>sum+crossDirection(left,right,index),0);
    if(vote)crosses.set(index,{index,direction:Math.sign(vote)});
  }
  const asset=Array(data.length).fill(null),inverse=Array(data.length).fill(null),assetMean=Array(data.length).fill(null);let active=null;
  const begin=event=>({direction:event.direction,price:event.direction>0?data[event.index]?.high:data[event.index]?.low});
  const update=(episode,index)=>{const price=episode.direction>0?data[index]?.high:data[index]?.low;if(!finite(price))return;if((episode.direction>0&&Number(price)>Number(episode.price))||(episode.direction<0&&Number(price)<Number(episode.price)))episode.price=Number(price);};
  const first=Math.max(1,resolvedLength*3-1),denominator=resolvedLength*(resolvedLength+1)/2;
  for(let index=0;index<data.length;index++){
    const event=crosses.get(index);if(event&&(!active||event.direction!==active.direction))active=begin(event);
    if(active)update(active,index);
    if(index<first||!active||!finite(active.price))continue;
    asset[index]=Number(active.price);
    const start=index-resolvedLength+1;if(start<0)continue;
    const window=asset.slice(start,index+1);if(window.length!==resolvedLength||!window.every(finite))continue;
    const weighted=window.reduce((sum,value,position)=>sum+(position+1)*Number(value),0)/denominator,average=window.reduce((sum,value)=>sum+Number(value),0)/resolvedLength,deviation=Math.sqrt(window.reduce((sum,value)=>sum+(Number(value)-average)**2,0)/resolvedLength);
    assetMean[index]=weighted;inverse[index]=deviation>0?(2*weighted)-Number(asset[index]):null;
  }
  return{data,asset,inverse,assetMean,series,causal:true};
}

export function buildIoiIomSeries(rawCandles,length=10){
  const htl=buildCausalHtlAsset(rawCandles,length),close=htl.data.map(candle=>candle.close),ioi=pairAverage(close,htl.asset),ioiInverse=pairAverage(close,htl.inverse),iomMean=pairAverage(ioi,ioiInverse),stats=rollingMeanStd(iomMean,length),iomZ=iomMean.map((value,index)=>finite(value)&&finite(stats.mean[index])&&finite(stats.std[index])&&Number(stats.std[index])>1e-12?(Number(value)-Number(stats.mean[index]))/Number(stats.std[index]):null),iomInverse=iomZ.map((z,index)=>finite(z)&&finite(stats.std[index])&&finite(stats.mean[index])?(-Number(z)*Number(stats.std[index]))+Number(stats.mean[index]):null);
  return{...htl,ioi,ioiInverse,iomMean,iomCenter:stats.mean,iomStd:stats.std,iomZ,iomInverse};
}

export function crossingSignals(left=[],right=[],source="IOI"){
  const signals=[];let owner=0;
  for(let index=1;index<Math.max(left.length||0,right.length||0);index++){
    const direction=crossDirection(left,right,index);
    if(direction&&direction!==owner){signals.push({signalIndex:index,sourceIndex:index,direction,source:`${source}_CROSS`});owner=direction;}
  }
  return signals;
}

export function evaluateIoiIomPerformance(rawCandles,pair,length=10){
  const built=buildIoiIomSeries(rawCandles,length),ioiSignals=crossingSignals(built.ioi,built.ioiInverse,"IOI"),iomSignals=crossingSignals(built.iomMean,built.iomInverse,"IOM"),ioiTrades=buildRegisteredTrades(built.data,ioiSignals,pair),iomTrades=buildRegisteredTrades(built.data,iomSignals,pair);
  return{
    length:Math.max(3,Math.min(500,Math.trunc(Number(length)||10))),
    candles:built.data,
    IOI:{signals:ioiSignals,trades:ioiTrades,stats:summarizeRegisteredTrades(ioiTrades)},
    IOM:{signals:iomSignals,trades:iomTrades,stats:summarizeRegisteredTrades(iomTrades)},
    indicators:built,
  };
}

function scoreStats(stats){return stats.trades>=2?stats.net-(0.25*stats.maxDrawdown):-Infinity;}
function entry(strategy,length,stats,validation,strategyEngineVersion){return{length,filter:0,score:scoreStats(stats),trades:stats.trades,net:stats.net,maxDrawdown:stats.maxDrawdown,winRate:stats.trades?stats.wins/stats.trades:0,grossPerformance:stats,validation,strategyEngineVersion,performanceVersion:IOI_IOM_PERFORMANCE_VERSION,candidateLengths:[],candidateFilters:[0]};}
function exportRow(strategy,label,stats,pair,timeframe,length,bars,asOf){return{Pair:String(pair).replace("_"," / "),Strategy:label,Timeframe:timeframe,Bars:bars,Trades:stats.trades,"W/L/Flat":`${stats.wins}/${stats.losses}/${stats.flats}`,"Win rate":stats.trades?(stats.wins/stats.trades)*100:0,"Net pips":stats.net,Avg:stats.average,"MFE/MAE":stats.mfeMae,"Max DD":stats.maxDrawdown,"Gross winning pips":stats.grossWinning,"Gross losing pips":stats.grossLosing,"Profit factor":stats.profitFactor,"Recovery factor":stats.recoveryFactor,"IOI/IOM length":length,Filter:0,"As of":asOf,Indicator:strategy};}

export function optimizeIoiIomPerformance(rawCandles,pair,timeframe,lengthGrid,validation,strategyEngineVersion){
  const lengths=[...new Set((lengthGrid||[10,20,30,40,50]).map(value=>Math.max(3,Math.min(500,Math.trunc(Number(value)||10)))))],best={IOI:null,IOM:null},evaluated=new Map();
  for(const length of lengths){
    const result=evaluateIoiIomPerformance(rawCandles,pair,length);evaluated.set(length,result);
    for(const strategy of IOI_IOM_STRATEGIES){const stats=result[strategy].stats,candidate={length,stats,score:scoreStats(stats)};if(!best[strategy]||candidate.score>best[strategy].score)best[strategy]=candidate;}
  }
  const normalized=normalizeCandles(rawCandles),config={},rows=[];
  for(const strategy of IOI_IOM_STRATEGIES){const selected=best[strategy],final=evaluated.get(selected.length)[strategy],label=strategy==="IOI"?"IOI · Indicator Only Indicator":"IOM · Indicator Only Mean";config[strategy]={...entry(strategy,selected.length,final.stats,validation,strategyEngineVersion),candidateLengths:[...lengths]};rows.push(exportRow(strategy,label,final.stats,pair,timeframe,selected.length,normalized.length,normalized.at(-1)?.time||null));}
  return{version:IOI_IOM_PERFORMANCE_VERSION,config,rows};
}

export const __ioiIomPerformanceTest=Object.freeze({crossDirection,pairAverage,rollingMeanStd});
