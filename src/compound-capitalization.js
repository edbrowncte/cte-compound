import { calculateMASIMPressure, timeframeHierarchy } from "./mas-im-calculator.js";
import { evaluateStrategyWindow, normalizeStrategyId, normalizeStrategySettings } from "./horizon-strategy-v1.js";

export const COMPOUND_CAPITALIZATION_VERSION="COMPOUND_MCP_CAPITALIZATION@1.0.0";
export const CAPITALIZATION_COMPLETED_BARS=600;
export const CAPITALIZATION_REQUEST_BARS=602;

const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));

function signalArrays(evaluation){
  return{
    ASSET:evaluation.diagnostics.htl.signals,
    DARE_N:evaluation.diagnostics.dareN.events,
    DARE:evaluation.diagnostics.dareSignals,
    COMBO:evaluation.diagnostics.csf.signals,
    NAI:evaluation.diagnostics.nai.events,
    APEX:evaluation.diagnostics.apexEvents,
  };
}

function registeredEvents(evaluation,strategy){
  const signals=signalArrays(evaluation)[strategy]||[];
  return signals.map(signal=>{
    const index=Math.trunc(Number(signal?.signalIndex));
    const candle=evaluation.candles[index];
    const direction=Math.sign(Number(signal?.direction)||0);
    if(!candle||!direction)return null;
    return{direction,time:candle.time,price:candle.close,source:signal?.source||null};
  }).filter(Boolean);
}

function emptyRow(pair,timeframe,strategy,error=null){
  return{pair,timeframe,strategy,available:false,error,signal:0,mas:null,im:null,ratio:null,modelRatio:null,masRoc:null,imRoc:null,ratioRoc:null,eventAngleZ:null,eventAngle:null,convexity:null,r2:null,fStat:null,pValue:null,pipsPerHour:null,requiredIm:null,transitionThreshold:null,transitionThresholdSource:null,transitionProbability:null,transitionSamples:0,regime:"NEUTRAL",type:"NEUTRAL",strength:null,macroForce:null,hierarchy:timeframeHierarchy(timeframe)};
}

export function buildCapitalizationEvaluationRow(pair,timeframe,priceCache,settingsInput,strategyInput="ASSET"){
  const strategy=normalizeStrategyId(strategyInput),settings=normalizeStrategySettings(settingsInput),hierarchy=timeframeHierarchy(timeframe);
  if(!hierarchy.length)return emptyRow(pair,timeframe,strategy,"INVALID_TIMEFRAME");
  const missing=hierarchy.filter(tf=>!Array.isArray(priceCache?.[tf])||priceCache[tf].length<80);
  if(missing.length)return emptyRow(pair,timeframe,strategy,`MISSING_HIERARCHY:${missing.join(",")}`);
  const active=priceCache[timeframe]||[],evaluation=evaluateStrategyWindow(active,settings),events=registeredEvents(evaluation,strategy),direction=Math.sign(Number(events.at(-1)?.direction)||0);
  if(!direction)return emptyRow(pair,timeframe,strategy,"NO_REGISTERED_SIGNAL_STATE");
  const metrics=calculateMASIMPressure(pair,timeframe,priceCache,{direction,events});
  const pressureShare=Number.isFinite(metrics.MAS)&&Number.isFinite(metrics.IM)&&(metrics.MAS+metrics.IM)>0?metrics.IM/(metrics.MAS+metrics.IM):0;
  const transition=Number.isFinite(metrics.TRANSITION_PROBABILITY)?metrics.TRANSITION_PROBABILITY:pressureShare;
  const eventPower=Number.isFinite(metrics.EVENT_ANGLE_Z)?clamp(.5+.2*Math.tanh(metrics.EVENT_ANGLE_Z/2),0,1):.5;
  const fit=Number.isFinite(metrics.R2)?metrics.R2:0;
  const strength=.55*transition+.25*eventPower+.20*fit;
  const finiteOrNull=value=>Number.isFinite(Number(value))?Number(value):null;
  return{
    pair,timeframe,strategy,available:true,error:null,signal:direction,
    mas:finiteOrNull(metrics.MAS),im:finiteOrNull(metrics.IM),ratio:metrics.IM_OVER_MAS===Infinity?Infinity:finiteOrNull(metrics.IM_OVER_MAS),modelRatio:finiteOrNull(metrics.MODEL_RATIO),
    masRoc:finiteOrNull(metrics.MAS_ROC),imRoc:finiteOrNull(metrics.IM_ROC),ratioRoc:finiteOrNull(metrics.RATIO_ROC),eventAngleZ:finiteOrNull(metrics.EVENT_ANGLE_Z),eventAngle:finiteOrNull(metrics.EVENT_ANGLE),convexity:finiteOrNull(metrics.CONVEXITY),
    r2:finiteOrNull(metrics.R2),fStat:finiteOrNull(metrics.F_STAT),pValue:finiteOrNull(metrics.P_VALUE),pipsPerHour:finiteOrNull(metrics.PIPS_PER_HOUR),requiredIm:finiteOrNull(metrics.REQUIRED_IM),
    transitionThreshold:finiteOrNull(metrics.TRANSITION_THRESHOLD),transitionThresholdSource:metrics.TRANSITION_THRESHOLD_SOURCE||null,transitionProbability:finiteOrNull(metrics.TRANSITION_PROBABILITY),transitionSamples:Number(metrics.TRANSITION_SAMPLE_COUNT)||0,
    regime:metrics.REGIME||"NEUTRAL",type:metrics.TYPE||"NEUTRAL",strength:Number.isFinite(strength)?strength:null,macroForce:finiteOrNull(metrics.macroForce),hierarchy:metrics.hierarchy||hierarchy,
    completedCandleTime:evaluation.completedCandleTime||active.at(-1)?.time||null,settings,
  };
}
