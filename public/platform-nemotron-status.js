(function installPlainNemotronStatus(root){
  "use strict";
  const byId=id=>document.getElementById(id);
  const pair=value=>String(value||"").replace("_","/");
  function render(ai={}){
    const last=ai.last||{},daily=ai.daily||{},working=last.status==="SELECTED",unavailable=last.status==="AI_BINDING_UNAVAILABLE"||ai.binding===false,status=last.userStatus||(working?"Working":unavailable?"Unavailable":last.status?"Fallback used":ai.binding?"Ready":"Unavailable");
    if(typeof state!=="undefined")state.nemotronRecommendedPair=working?last.selectedPair||null:null;
    byId("nemotronModel").textContent="Nemotron 3 Super";
    byId("nemotronStatus").textContent=status;
    byId("nemotronSelection").textContent=working&&last.selectedPair?pair(last.selectedPair):last.selectedPair?`${pair(last.selectedPair)} · fallback`:"—";
    byId("nemotronLatency").textContent=Number.isFinite(last.latencyMs)&&last.latencyMs>0?`${last.latencyMs} ms`:"—";
    byId("nemotronDaily").textContent=`${daily.selections||0} model selections · ${daily.fallbacks||0} fallback`;
    byId("nemotronTotal").textContent=`${ai.totalSelections||0} model selections · ${ai.totalFallbacks||0} fallback`;
    const reason=byId("nemotronReason");
    if(reason){
      if(working)reason.textContent=`Nemotron selected ${pair(last.selectedPair)} from ${(last.candidates||[]).length} eligible alternatives. ${last.reason||""}`.trim();
      else if(unavailable)reason.textContent="Nemotron is unavailable. The deterministic trading rules remain in control.";
      else if(last.status==="INTEGRATION_UPGRADED")reason.textContent="Structured Nemotron selection is ready. Counters restarted after the response-contract repair.";
      else reason.textContent=`Nemotron's answer was not usable, so the deterministic rules selected ${last.selectedPair?pair(last.selectedPair):"the first ranked candidate"}. No AI choice was accepted.`;
    }
    if(typeof renderDecisionCandidates==="function")renderDecisionCandidates();
  }
  root.renderNemotronStatus=render;
  try{renderNemotronStatus=render;}catch{}
})(globalThis);
