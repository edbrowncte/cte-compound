(function installHorizonSignalEnvelope(root){
  "use strict";

  const VERSION="CTE_HORIZON_SIGNAL_ENVELOPE@1.0.0";
  const finite=Number.isFinite;
  const STRATEGIES=new Set(["ASSET","DARE_N","DARE","COMBO","NAI","APEX"]);

  function normalize(value={}){
    const direction=Math.sign(Number(value.direction??value.rawDirection));
    return{
      version:VERSION,
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

  function validate(value,{calculationVersion,qualificationVersion}={}){
    const signal=normalize(value),errors=[];
    if(signal.version!==VERSION)errors.push("SIGNAL_ENVELOPE_VERSION_MISMATCH");
    if(!/^[A-Z]{3}_[A-Z]{3}$/.test(signal.pair))errors.push("INVALID_PAIR");
    if(!signal.timeframe)errors.push("INVALID_TIMEFRAME");
    if(!STRATEGIES.has(signal.strategy))errors.push("INVALID_STRATEGY");
    if(!Number.isInteger(signal.length)||signal.length<3||signal.length>500)errors.push("INVALID_LENGTH");
    if(!finite(signal.filter)||signal.filter<0||signal.filter>10)errors.push("INVALID_FILTER");
    if(![-1,1].includes(signal.direction))errors.push("INVALID_DIRECTION");
    if(!signal.crossingIdentity||!signal.crossingTime||!signal.completedCandleTime)errors.push("INCOMPLETE_CROSSING_IDENTITY");
    if(signal.qualificationResult!=="QUALIFIED")errors.push("SIGNAL_NOT_QUALIFIED");
    if(calculationVersion&&signal.calculationVersion!==calculationVersion)errors.push("CALCULATION_VERSION_MISMATCH");
    if(qualificationVersion&&signal.qualificationVersion!==qualificationVersion)errors.push("QUALIFICATION_VERSION_MISMATCH");
    return{ok:errors.length===0,errors,signal};
  }

  function fromEvidence({pair,timeframe,strategy="ASSET",length,filter=0,crossing,qualification,calculationVersion,qualificationVersion,completedCandleTime}){
    if(!crossing)return null;
    return normalize({
      pair,timeframe,strategy,length,filter,
      direction:crossing.direction,
      crossingIdentity:crossing.identity||crossing.crossingIdentity,
      crossingTime:crossing.time,
      completedCandleTime:completedCandleTime||crossing.time,
      priorAsset:crossing.priorAsset,
      priorInverse:crossing.priorInverse,
      currentAsset:crossing.asset,
      currentInverse:crossing.inverse,
      calculationVersion,
      qualificationVersion,
      qualificationResult:qualification?.qualified===false?"REJECTED":"QUALIFIED",
      qualificationReason:qualification?.reason||"",
    });
  }

  root.CTE_HORIZON_SIGNAL_ENVELOPE=Object.freeze({VERSION,normalize,validate,fromEvidence});
})(typeof globalThis!=="undefined"?globalThis:self);
