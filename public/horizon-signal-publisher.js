(function installHorizonSignalPublisher(root){
  "use strict";

  const H=root.CTE_HORIZON_HTL,S=root.CTE_HORIZON_STRATEGIES,E=root.CTE_HORIZON_SIGNAL_ENVELOPE,platform=root.CTE_HORIZON_PLATFORM;
  if(!H||!S||!E||!platform)return;
  const VERSION="CTE_HORIZON_SIGNAL_PUBLISHER@1.0.0";

  function latestSignal(candidate){
    if(!candidate||typeof state==="undefined")return null;
    const pair=candidate.pair,timeframe=state.engineConfig?.timeframe||state.selectedTimeframe,strategy=state.engineConfig?.strategy||"ASSET",config=platform.effectiveConfig(pair,timeframe,strategy),candles=state.scheduleCandles?.get?.(`${pair}|${timeframe}`);
    if(!candles?.length)return null;
    const indicators=S.buildIndicators(candles,config.length),crossing=indicators.horizon.latestCompletedCrossing;
    if(!crossing||crossing.direction!==candidate.direction)return null;
    const qualification=S.qualificationAt(indicators,crossing.index,strategy,config.filter,crossing.direction);
    if(!qualification.qualified)return null;
    const identity=H.crossingIdentity({pair,timeframe,strategy,length:config.length,filter:config.filter,crossing});
    return E.normalize({
      calculationVersion:H.VERSION,
      qualificationVersion:S.VERSION,
      pair,timeframe,strategy,length:config.length,filter:config.filter,
      direction:crossing.direction,
      crossingIdentity:identity,
      crossingTime:crossing.time,
      completedCandleTime:candles.at(-1)?.time||crossing.time,
      priorAsset:crossing.priorAsset,
      priorInverse:crossing.priorInverse,
      currentAsset:crossing.asset,
      currentInverse:crossing.inverse,
      qualificationResult:"QUALIFIED",
      qualificationReason:qualification.reason,
    });
  }

  function publishCandidateSignals(){
    if(typeof state==="undefined")return;
    for(const key of ["A","B","C"]){
      const candidate=state.decisionCandidates?.[key];
      if(!candidate)continue;
      candidate.signalEnvelope=latestSignal(candidate);
      candidate.signalEnvelopeVersion=E.VERSION;
    }
  }

  if(typeof root.updateDecisionDisplays==="function"){
    const prior=root.updateDecisionDisplays;
    root.updateDecisionDisplays=function(){const result=prior.apply(this,arguments);publishCandidateSignals();return result;};
    try{updateDecisionDisplays=root.updateDecisionDisplays;}catch{}
  }

  publishCandidateSignals();
  root.CTE_HORIZON_SIGNAL_PUBLISHER=Object.freeze({VERSION,latestSignal,publishCandidateSignals});
})(globalThis);
