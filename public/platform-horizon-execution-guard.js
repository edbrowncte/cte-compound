(function installHorizonExecutionGuard(root){
  "use strict";
  const H=root.CTE_HORIZON_HTL,S=root.CTE_HORIZON_STRATEGIES,platform=root.CTE_HORIZON_PLATFORM;
  if(!H||!S||!platform)return;

  function latestEvidence(candidate){
    if(!candidate||typeof state==="undefined")return null;
    const pair=candidate.pair,timeframe=state.engineConfig?.timeframe||state.selectedTimeframe,strategy=state.engineConfig?.strategy||"ASSET",config=platform.effectiveConfig(pair,timeframe,strategy),candles=state.scheduleCandles?.get?.(`${pair}|${timeframe}`);
    if(!candles?.length)return null;
    const indicators=S.buildIndicators(candles,config.length),crossing=indicators.horizon.latestCompletedCrossing;
    if(!crossing||crossing.direction!==candidate.direction)return null;
    const qualification=S.qualificationAt(indicators,crossing.index,strategy,config.filter,crossing.direction);
    if(!qualification.qualified)return null;
    return{pair,timeframe,strategy,length:config.length,filter:config.filter,crossing,qualification,identity:H.crossingIdentity({pair,timeframe,strategy,length:config.length,filter:config.filter,crossing})};
  }

  function refreshCandidateEvidence(){
    if(typeof state==="undefined")return;
    for(const key of ["A","B","C"]){
      const candidate=state.decisionCandidates?.[key];if(!candidate)continue;
      for(const field of ["crossingIdentity","crossingTime","crossingTimeframe","length","filter","priorAsset","priorInverse","currentAsset","currentInverse","rawDirection","qualificationVersion","qualificationReason"])delete candidate[field];
      const evidence=latestEvidence(candidate),button=document.getElementById(`candidate${key}`),detail=button?.querySelector("small");
      candidate.latestCrossingEligible=Boolean(evidence);
      if(evidence)Object.assign(candidate,{crossingIdentity:evidence.identity,crossingTime:evidence.crossing.time,crossingTimeframe:evidence.timeframe,length:evidence.length,filter:evidence.filter,priorAsset:evidence.crossing.priorAsset,priorInverse:evidence.crossing.priorInverse,currentAsset:evidence.crossing.asset,currentInverse:evidence.crossing.inverse,rawDirection:evidence.crossing.direction,calculationVersion:H.VERSION,qualificationVersion:S.VERSION,qualificationReason:evidence.qualification.reason});
      if(detail)detail.textContent=evidence?`${button.classList.contains("recommended")?"Nemotron recommendation · ":""}${evidence.timeframe} latest crossing · ${evidence.strategy}`:"Awaiting latest completed-candle crossing";
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
        if(!evidence)throw new Error("The selected candidate does not have a qualified Asset/Inverse crossing on the latest completed OANDA candle.");
        body={...body,cteContext:{...(body?.cteContext||{}),candidate:selectedKey,pair:evidence.pair,timeframe:evidence.timeframe,strategy:evidence.strategy,configuredStrategy:evidence.strategy,crossingStrategy:"ASSET",length:evidence.length,filter:evidence.filter,crossingIdentity:evidence.identity,crossingTime:evidence.crossing.time,calculationVersion:H.VERSION,qualificationVersion:S.VERSION,rawDirection:evidence.crossing.direction,priorAsset:evidence.crossing.priorAsset,priorInverse:evidence.crossing.priorInverse,currentAsset:evidence.crossing.asset,currentInverse:evidence.crossing.inverse,qualificationResult:"QUALIFIED",qualificationReason:evidence.qualification.reason}};
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
