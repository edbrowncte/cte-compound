(function installCandidateContext(root){
  "use strict";
  if(typeof root.oandaPost!=="function")return;
  const prior=root.oandaPost;
  root.oandaPost=async function(path,body){
    const context=body?.cteContext;
    if(context&&typeof state!=="undefined"){
      const key=context.candidate||state.selectedDecisionCandidate,candidate=key?state.decisionCandidates?.[key]:null,signal=context.signalEnvelope||candidate?.signalEnvelope||null;
      if(signal)body={...body,cteContext:{...context,signalEnvelope:signal}};
    }
    return prior(path,body);
  };
  try{oandaPost=root.oandaPost;}catch{}
})(globalThis);
