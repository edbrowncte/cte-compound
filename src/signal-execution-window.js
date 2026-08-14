export const SIGNAL_EXECUTION_WINDOW_VERSION="IMMUTABLE_SIGNAL_EXECUTION_WINDOW@1.0.0";

const TF_MS=Object.freeze({S5:5000,S30:30000,M1:60000,M5:300000,M15:900000,M30:1800000,H1:3600000,H2:7200000,H4:14400000,D:86400000,W:604800000});
const MAX_ACTIVATION_DELAY_MS=15*60*1000;
const OBSERVATION_GRACE_MS=15*1000;

export function timeframeMs(timeframe){return Number(TF_MS[String(timeframe||"").toUpperCase()]||0);}
export function signalObservedAt(sourceTime,timeframe){const start=Date.parse(sourceTime||""),duration=timeframeMs(timeframe);return Number.isFinite(start)&&duration?start+duration:null;}
export function executionWindowMs(timeframe){const duration=timeframeMs(timeframe);return duration?Math.min(duration*2,MAX_ACTIVATION_DELAY_MS)+OBSERVATION_GRACE_MS:MAX_ACTIVATION_DELAY_MS+OBSERVATION_GRACE_MS;}
export function executionOpportunity(sourceTime,timeframe,now=Date.now()){
  const observedAt=signalObservedAt(sourceTime,timeframe),windowMs=executionWindowMs(timeframe),ageMs=observedAt===null?null:now-observedAt,opensAt=observedAt===null?null:new Date(observedAt).toISOString(),closesAt=observedAt===null?null:new Date(observedAt+windowMs).toISOString();
  const open=ageMs!==null&&ageMs>=-OBSERVATION_GRACE_MS&&ageMs<=windowMs;
  return{version:SIGNAL_EXECUTION_WINDOW_VERSION,open,sourceTime:sourceTime||null,timeframe:String(timeframe||"").toUpperCase()||null,observedAt:opensAt,closesAt,ageMs,windowMs,reason:observedAt===null?"SIGNAL_TIME_UNAVAILABLE":open?"CONTEMPORANEOUS":"EXECUTION_WINDOW_ELAPSED"};
}

export const __signalExecutionWindowTest=Object.freeze({TF_MS,MAX_ACTIVATION_DELAY_MS,OBSERVATION_GRACE_MS});