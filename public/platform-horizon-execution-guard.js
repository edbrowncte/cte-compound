(function installHorizonExecutionGuard(root){
  "use strict";
  const E=root.CTE_HORIZON_SIGNAL_ENVELOPE,publisher=root.CTE_HORIZON_SIGNAL_PUBLISHER,platform=root.CTE_HORIZON_PLATFORM;
  if(!E||!publisher||!platform)return;

  function latestEvidence(candidate){
    if(!candidate||typeof state==="undefined")return null;
    publisher.publishCandidateSignals();
    const pair=candidate.pair,timeframe=state.engineConfig?.timeframe||state.selectedTimeframe,strategy=state.engineConfig?.strategy||"ASSET",config=platform.effectiveConfig(pair,timeframe,strategy),candles=state.scheduleCandles?.get?.(`${pair}|${timeframe}`),envelope=candidate.signalEnvelope;
    if(!candles?.length||!envelope)return null;
    const validation=E.validate(envelope);
    if(!validation.ok)return null;
    const signal=validation.signal,latestCompletedTime=candles.at(-1)?.time||null;
    if(signal.pair!==pair||signal.timeframe!==timeframe||signal.strategy!==strategy)return null;
    if(signal.length!==config.length||signal.filter!==config.filter)return null;
    if(signal.direction!==Math.sign(Number(candidate.direction)))return null;
    if(!latestCompletedTime||signal.completedCandleTime!==latestCompletedTime||signal.crossingTime!==latestCompletedTime)return null;
    return{pair,timeframe,strategy,length:signal.length,filter:signal.filter,signal,identity:signal.crossingIdentity};
  }

  function refreshCandidateEvidence(){
    if(typeof state==="undefined")return;
    publisher.publishCandidateSignals();
    for(const key of ["A","B","C"]){
      const candidate=state.decisionCandidates?.[key];if(!candidate)continue;
      for(const field of ["crossingIdentity","crossingTime","crossingTimeframe","length","filter","priorAsset","priorInverse","currentAsset","currentInverse","rawDirection","calculationVersion","qualificationVersion","qualificationReason"])delete candidate[field];
      const evidence=latestEvidence(candidate),button=document.getElementById(`candidate${key}`),detail=button?.querySelector("small");
      candidate.latestCrossingEligible=Boolean(evidence);
      if(evidence){const signal=evidence.signal;Object.assign(candidate,{crossingIdentity:signal.crossingIdentity,crossingTime:signal.crossingTime,crossingTimeframe:signal.timeframe,length:signal.length,filter:signal.filter,priorAsset:signal.priorAsset,priorInverse:signal.priorInverse,currentAsset:signal.currentAsset,currentInverse:signal.currentInverse,rawDirection:signal.direction,calculationVersion:signal.calculationVersion,qualificationVersion:signal.qualificationVersion,qualificationReason:signal.qualificationReason});}
      if(detail)detail.textContent=evidence?`${button.classList.contains("recommended")?"Nemotron recommendation · ":""}${evidence.timeframe} latest signal · ${evidence.strategy}`:"Awaiting latest completed-candle signal envelope";
    }
  }

  if(typeof root.updateDecisionDisplays==="function"){
    const priorUpdate=root.updateDecisionDisplays;
    root.updateDecisionDisplays=function(){const result=priorUpdate.apply(this,arguments);refreshCandidateEvidence();return result;};
    try{updateDecisionDisplays=root.updateDecisionDisplays;}catch{}
  }

  if(typeof root.oandaPost==="function"){
    const priorPost=root.oandaPost;
    root.oandaPost=async function(path,body){
      const selectedKey=body?.cteContext?.candidate||state?.selectedDecisionCandidate;
      if(/\/orders$/.test(path)&&selectedKey){
        const candidate=state?.decisionCandidates?.[selectedKey],evidence=latestEvidence(candidate);
        if(!evidence)throw new Error("The selected candidate does not have a qualified signal envelope for the latest completed OANDA candle.");
        const signal=evidence.signal;
        body={...body,cteContext:{...(body?.cteContext||{}),candidate:selectedKey,signalEnvelope:signal,pair:signal.pair,timeframe:signal.timeframe,strategy:signal.strategy,configuredStrategy:signal.strategy,crossingStrategy:"ASSET",length:signal.length,filter:signal.filter,crossingIdentity:signal.crossingIdentity,crossingTime:signal.crossingTime,calculationVersion:signal.calculationVersion,qualificationVersion:signal.qualificationVersion,rawDirection:signal.direction,priorAsset:signal.priorAsset,priorInverse:signal.priorInverse,currentAsset:signal.currentAsset,currentInverse:signal.currentInverse,qualificationResult:signal.qualificationResult,qualificationReason:signal.qualificationReason}};
      }
      return priorPost(path,body);
    };
    try{oandaPost=root.oandaPost;}catch{}
  }

  document.getElementById("decisionCandidateStrip")?.addEventListener("click",()=>queueMicrotask(refreshCandidateEvidence),true);
  refreshCandidateEvidence();
  setInterval(refreshCandidateEvidence,5000);
  root.CTE_HORIZON_EXECUTION_GUARD=Object.freeze({latestEvidence,refreshCandidateEvidence});
})(globalThis);
