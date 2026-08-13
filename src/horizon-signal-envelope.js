export const SIGNAL_ENVELOPE_VERSION="CTE_HORIZON_SIGNAL_ENVELOPE@1.0.0";

const finite=Number.isFinite;
const STRATEGIES=new Set(["ASSET","DARE_N","DARE","COMBO","NAI","APEX"]);
const TIMEFRAMES=new Set(["W","D","H4","H2","H1","M30","M15","M5","M1","S30","S5"]);
const PAIR=/^[A-Z]{3}_[A-Z]{3}$/;

export function normalizeSignalEnvelope(value={}){
  const direction=Math.sign(Number(value.direction??value.rawDirection));
  return{
    version:String(value.version||SIGNAL_ENVELOPE_VERSION),
    calculationVersion:String(value.calculationVersion||""),
    qualificationVersion:String(value.qualificationVersion||""),
    pair:String(value.pair||"").toUpperCase(),
    timeframe:String(value.timeframe||"").toUpperCase(),
    strategy:String(value.strategy||"ASSET").toUpperCase(),
    length:Math.trunc(Number(value.length)),
    filter:Number(value.filter)||0,
    direction,
    crossingIdentity:String(value.crossingIdentity||""),
    crossingTime:String(value.crossingTime||""),
    completedCandleTime:String(value.completedCandleTime||value.crossingTime||""),
    priorAsset:finite(Number(value.priorAsset))?Number(value.priorAsset):null,
    priorInverse:finite(Number(value.priorInverse))?Number(value.priorInverse):null,
    currentAsset:finite(Number(value.currentAsset))?Number(value.currentAsset):null,
    currentInverse:finite(Number(value.currentInverse))?Number(value.currentInverse):null,
    qualificationResult:String(value.qualificationResult||"QUALIFIED").toUpperCase(),
    qualificationReason:String(value.qualificationReason||""),
  };
}

export function validateSignalEnvelope(value,{calculationVersion,qualificationVersion,pair,timeframe,strategy,length,filter,direction}={}){
  const signal=normalizeSignalEnvelope(value),errors=[];
  if(signal.version!==SIGNAL_ENVELOPE_VERSION)errors.push("SIGNAL_ENVELOPE_VERSION_MISMATCH");
  if(!PAIR.test(signal.pair))errors.push("INVALID_PAIR");
  if(!TIMEFRAMES.has(signal.timeframe))errors.push("INVALID_TIMEFRAME");
  if(!STRATEGIES.has(signal.strategy))errors.push("INVALID_STRATEGY");
  if(!Number.isInteger(signal.length)||signal.length<3||signal.length>500)errors.push("INVALID_LENGTH");
  if(!finite(signal.filter)||signal.filter<0||signal.filter>10)errors.push("INVALID_FILTER");
  if(![-1,1].includes(signal.direction))errors.push("INVALID_DIRECTION");
  if(!signal.crossingIdentity||!signal.crossingTime||!signal.completedCandleTime)errors.push("INCOMPLETE_CROSSING_IDENTITY");
  if(signal.qualificationResult!=="QUALIFIED")errors.push("SIGNAL_NOT_QUALIFIED");
  if(calculationVersion&&signal.calculationVersion!==calculationVersion)errors.push("CALCULATION_VERSION_MISMATCH");
  if(qualificationVersion&&signal.qualificationVersion!==qualificationVersion)errors.push("QUALIFICATION_VERSION_MISMATCH");
  if(pair&&signal.pair!==pair)errors.push("PAIR_MISMATCH");
  if(timeframe&&signal.timeframe!==timeframe)errors.push("TIMEFRAME_MISMATCH");
  if(strategy&&signal.strategy!==strategy)errors.push("STRATEGY_MISMATCH");
  if(Number.isFinite(Number(length))&&signal.length!==Math.trunc(Number(length)))errors.push("LENGTH_MISMATCH");
  if(Number.isFinite(Number(filter))&&signal.filter!==Number(filter))errors.push("FILTER_MISMATCH");
  if(Number.isFinite(Number(direction))&&signal.direction!==Math.sign(Number(direction)))errors.push("DIRECTION_MISMATCH");
  return{ok:errors.length===0,errors,signal};
}

export function signalEnvelopeContext(signalInput){
  const signal=normalizeSignalEnvelope(signalInput);
  return{
    signalEnvelope:signal,
    pair:signal.pair,
    timeframe:signal.timeframe,
    strategy:signal.strategy,
    configuredStrategy:signal.strategy,
    crossingStrategy:"ASSET",
    length:signal.length,
    filter:signal.filter,
    crossingIdentity:signal.crossingIdentity,
    crossingTime:signal.crossingTime,
    calculationVersion:signal.calculationVersion,
    qualificationVersion:signal.qualificationVersion,
    rawDirection:signal.direction,
    priorAsset:signal.priorAsset,
    priorInverse:signal.priorInverse,
    currentAsset:signal.currentAsset,
    currentInverse:signal.currentInverse,
    qualificationResult:signal.qualificationResult,
    qualificationReason:signal.qualificationReason,
  };
}
