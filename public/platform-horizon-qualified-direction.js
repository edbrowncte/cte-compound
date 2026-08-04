(function installQualifiedDirection(root){
  "use strict";
  const strategies=root.CTE_HORIZON_STRATEGIES;
  if(!strategies)return;
  root.causalDirection=function(indicators,index,strategy,filter=0){return strategies.directionAt(indicators,index,strategy,filter);};
  try{causalDirection=root.causalDirection;}catch{}
  const fields=root.CTE_HORIZON_PLATFORM?.FORENSIC_FIELDS;
  if(Array.isArray(fields)&&!fields.some(([,key])=>key==="qualificationVersion")){const index=Math.max(0,fields.findIndex(([,key])=>key==="calculationVersion")+1);fields.splice(index,0,["Qualification Version","qualificationVersion"]);}
  const augment=()=>{const grid=document.getElementById("platformDiagnosticGrid");if(grid&&!grid.querySelector('[data-qualification-version]')){const card=document.createElement("div");card.className="diagnostic-card good";card.dataset.qualificationVersion=strategies.VERSION;card.innerHTML=`<span>Strategy qualification</span><strong>${strategies.VERSION} · one raw crossing clock</strong>`;grid.append(card);}};
  augment();new MutationObserver(augment).observe(document.documentElement,{subtree:true,childList:true});
})(globalThis);
