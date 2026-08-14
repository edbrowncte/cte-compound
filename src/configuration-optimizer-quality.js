import { calculateSlopeStats } from "./mas-im-calculator.js";

export const CONFIGURATION_OPTIMIZER_OBJECTIVE_VERSION="EVENT_EQUITY_FIT_QUALITY@1.0.0";
export const CONFIGURATION_OPTIMIZER_LENGTH_SUPPORT=Object.freeze([5,8,10,15,20,30,40,50,75,100,150,200]);

const TIMEFRAME_LENGTH_PRIOR=Object.freeze({
  S5:[100,150,75,200,50,40,30,20,15,10,8,5],
  S30:[100,150,75,200,50,40,30,20,15,10,8,5],
  M1:[75,100,50,150,40,30,20,15,10,8,5,200],
  M5:[75,100,50,150,40,30,20,15,10,8,5,200],
  M15:[20,15,30,10,40,50,8,5,75,100,150,200],
  M30:[20,15,30,10,40,50,8,5,75,100,150,200],
  H1:[15,10,20,8,30,5,40,50,75,100,150,200],
  H2:[15,10,20,8,30,5,40,50,75,100,150,200],
  H4:[10,8,15,5,20,30,40,50,75,100,150,200],
  D:[10,8,15,5,20,30,40,50,75,100,150,200],
  W:[10,8,15,5,20,30,40,50,75,100,150,200],
});

export const CONFIGURATION_OPTIMIZER_FILTER_GRID=Object.freeze({
  ASSET:Object.freeze([0]),
  DARE_N:Object.freeze([0,.05,.1,.2,.3,.5,.75,1,1.5,2]),
  DARE:Object.freeze([0]),
  COMBO:Object.freeze([0]),
  NAI:Object.freeze([0,.05,.1,.2,.3,.5,.75,1,1.5,2]),
  APEX:Object.freeze([0,1,2,3,5,7]),
});

const finite=value=>Number.isFinite(Number(value))?Number(value):0;
const boundedLogRatio=value=>{
  if(value===Infinity)return 1;
  const number=Number(value);
  if(!Number.isFinite(number)||number<=0)return-1;
  return Math.tanh(Math.log(number));
};

export function configurationLengthCandidates(timeframe,candleCount=Infinity){
  const key=String(timeframe||"").toUpperCase(),prior=TIMEFRAME_LENGTH_PRIOR[key]||CONFIGURATION_OPTIMIZER_LENGTH_SUPPORT,limit=Number(candleCount);
  return prior.filter(length=>!Number.isFinite(limit)||length*3<limit);
}

export function configurationFilterCandidates(strategy){
  return [...(CONFIGURATION_OPTIMIZER_FILTER_GRID[String(strategy||"").toUpperCase()]||[0])];
}

export function candidateFitQuality(tradesInput=[],statsInput={},candleCount=0){
  const trades=Array.isArray(tradesInput)?tradesInput:[],stats=statsInput||{},tradeCount=trades.length,minimumTrades=Math.max(6,Math.ceil(Math.log2(Math.max(2,Number(candleCount)||2))));
  let equity=0;
  const curve=trades.map(trade=>equity+=finite(trade?.net));
  const fit=calculateSlopeStats(curve),fitDirection=Math.sign(finite(fit?.slope)),fitConfidence=fitDirection*finite(fit?.r2)*(1-Math.min(1,Math.max(0,finite(fit?.pValue))));
  const meanAbsNet=tradeCount?trades.reduce((sum,trade)=>sum+Math.abs(finite(trade?.net)),0)/tradeCount:0,average=finite(stats.average),edgeScore=meanAbsNet>0?Math.tanh(average/meanAbsNet):0;
  const excursionScore=boundedLogRatio(stats.mfeMae),profitFactorScore=boundedLogRatio(stats.profitFactor),recoveryValue=stats.recoveryFactor===Infinity?1:Math.tanh(finite(stats.recoveryFactor)/2),winRate=tradeCount?finite(stats.wins)/tradeCount:0,winScore=(2*winRate)-1;
  const grossMovement=Math.abs(finite(stats.grossWinning))+Math.abs(finite(stats.grossLosing)),drawdownBurden=grossMovement>0?Math.min(1,Math.abs(finite(stats.maxDrawdown))/grossMovement):Math.abs(finite(stats.maxDrawdown))>0?1:0,sampleAdequacy=Math.min(1,tradeCount/(minimumTrades*2)),sparsePenalty=tradeCount<minimumTrades?(minimumTrades-tradeCount)/minimumTrades:0;
  const strength=.30*fitConfidence+.20*edgeScore+.15*excursionScore+.15*profitFactorScore+.10*recoveryValue+.10*winScore,score=(sampleAdequacy*strength)-(.35*drawdownBurden)-(.75*sparsePenalty);
  return{objectiveVersion:CONFIGURATION_OPTIMIZER_OBJECTIVE_VERSION,score,strength,eligible:tradeCount>=minimumTrades,minimumTrades,trades:tradeCount,fitR2:finite(fit?.r2),fitPValue:Number.isFinite(Number(fit?.pValue))?Number(fit.pValue):1,fitFStat:finite(fit?.fStat),fitSlope:finite(fit?.slope),fitConfidence,sampleAdequacy,sparsePenalty,edgeScore,excursionScore,profitFactorScore,recoveryScore:recoveryValue,winScore,drawdownBurden};
}

export function betterConfigurationCandidate(candidate,current){
  if(!current)return true;
  const left=Number(candidate?.quality?.score),right=Number(current?.quality?.score);
  if(Number.isFinite(left)&&Number.isFinite(right)&&Math.abs(left-right)>1e-12)return left>right;
  if(Boolean(candidate?.quality?.eligible)!==Boolean(current?.quality?.eligible))return Boolean(candidate?.quality?.eligible);
  const leftTrades=Number(candidate?.quality?.trades)||0,rightTrades=Number(current?.quality?.trades)||0;
  if(leftTrades!==rightTrades)return leftTrades>rightTrades;
  return false;
}

export function candidateTrace(candidate){
  const quality=candidate?.quality||{};
  return{length:Number(candidate?.length),filter:Number(candidate?.filter)||0,score:Number(quality.score),strength:Number(quality.strength),eligible:Boolean(quality.eligible),minimumTrades:Number(quality.minimumTrades)||0,trades:Number(quality.trades)||0,fitR2:Number(quality.fitR2),fitPValue:Number(quality.fitPValue),fitFStat:Number(quality.fitFStat),sampleAdequacy:Number(quality.sampleAdequacy),sparsePenalty:Number(quality.sparsePenalty),drawdownBurden:Number(quality.drawdownBurden),net:Number(candidate?.stats?.net)||0,maxDrawdown:Number(candidate?.stats?.maxDrawdown)||0,winRate:Number(candidate?.stats?.trades)?Number(candidate.stats.wins||0)/Number(candidate.stats.trades):0};
}

export function topCandidateTrace(candidates,limit=5){
  return (Array.isArray(candidates)?candidates:[]).map(candidateTrace).sort((left,right)=>right.score-left.score||right.trades-left.trades||left.length-right.length||left.filter-right.filter).slice(0,Math.max(1,Math.trunc(Number(limit)||5)));
}
