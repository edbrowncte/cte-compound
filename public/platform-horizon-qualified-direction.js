(function installQualifiedDirection(root){
  "use strict";
  const strategies=root.CTE_HORIZON_STRATEGIES;
  if(!strategies)return;
  const finite=value=>Number.isFinite(value);
  const relation=(left,right,index,filter=0)=>{
    const a=left?.[index],b=right?.[index],threshold=Math.max(0,Number(filter)||0);
    return finite(a)&&finite(b)?a-b>threshold?1:a-b<-threshold?-1:0:0;
  };
  function chartDirection(indicators,index,strategy="ASSET",filter=0){
    if(strategy==="ASSET")return relation(indicators?.asset,indicators?.inverse,index,filter);
    if(strategy==="DARE")return relation(indicators?.assetMean||indicators?.meanAsset,indicators?.assetMeanInverse||indicators?.meanInverse,index,filter);
    if(strategy==="DARE_N")return relation(indicators?.dareNAsset,indicators?.dareNInverse,index,filter);
    if(strategy==="NAI")return relation(indicators?.naiAsset,indicators?.naiInverse,index,filter);
    if(strategy==="APEX"){
      const z=indicators?.zup?.[index],p=indicators?.puz?.[index],threshold=Math.max(0,Number(filter)||0);
      return finite(z)&&finite(p)?z<=-threshold&&p>=threshold?1:z>=threshold&&p<=-threshold?-1:0:0;
    }
    if(strategy==="COMBO"){
      const dare=chartDirection(indicators,index,"DARE",filter),nai=chartDirection(indicators,index,"NAI",filter);
      return dare&&dare===nai?dare:0;
    }
    return 0;
  }
  function hasCanonicalQualification(indicators){
    return Array.isArray(indicators?.asset)&&Array.isArray(indicators?.inverse)&&Array.isArray(indicators?.horizon?.crossings);
  }
  root.causalDirection=function(indicators,index,strategy,filter=0){
    return hasCanonicalQualification(indicators)?strategies.directionAt(indicators,index,strategy,filter):chartDirection(indicators,index,strategy,filter);
  };
  try{causalDirection=root.causalDirection;}catch{}
  const fields=root.CTE_HORIZON_PLATFORM?.FORENSIC_FIELDS;
  if(Array.isArray(fields)&&!fields.some(([,key])=>key==="qualificationVersion")){const index=Math.max(0,fields.findIndex(([,key])=>key==="calculationVersion")+1);fields.splice(index,0,["Qualification Version","qualificationVersion"]);}

  function diagnosticState(){try{return typeof state!=="undefined"?state?.diagnosticLast||null:null;}catch{return null;}}
  function cardByLabel(grid,label){return [...grid.querySelectorAll(".diagnostic-card")].find(card=>card.querySelector("span")?.textContent===label)||null;}
  function setCard(grid,label,value,good){const card=cardByLabel(grid,label);if(!card)return;const strong=card.querySelector("strong");if(strong&&strong.textContent!==value)strong.textContent=value;card.classList.toggle("good",good===true);card.classList.toggle("bad",good===false);}
  function setDiagnosticEntry(last,label,value,good){const entry=last?.entries?.find(item=>item?.label===label);if(!entry)return;entry.value=value;entry.good=good;}
  function exactAuthority(last){return last?.server?.engine?.accountAuthority||last?.server?.checks?.engine?.value?.accountAuthority||null;}
  function reconcileExactAccountDiagnostic(){
    const document=root.document,grid=document?.getElementById("platformDiagnosticGrid"),last=diagnosticState();if(!grid||!last)return;
    const engine=last.server?.engine||last.server?.checks?.engine?.value||null,authority=exactAuthority(last);if(!engine?.accountAuthorityVersion||!authority)return;
    const suffix=authority.configuredSuffix||authority.resolvedSuffix||"—",verified=authority.verified===true&&authority.configuredMatchesResolved===true;
    if(verified){const value=`Exact identity verified · ••••${suffix}`;setCard(grid,"Configured account",value,true);setDiagnosticEntry(last,"Configured account",value,true);return;}
    const source=authority.lastResolveError||{},code=source.code||"ACCOUNT_AUTHORITY_UNVERIFIED",stage=source.stage||"ACCOUNT_IDENTITY",message=source.message||"Exact configured OANDA account authority is not verified",failure={stage,code,error:message,status:409,retryable:false,diagnosticId:null};
    const accountValue="Exact identity mismatch · configured account is not token-authorized";
    setCard(grid,"Forensic verdict","FAIL",false);setCard(grid,"Configured account",accountValue,false);setCard(grid,"Failure stage",`${code} · ${stage}`,false);
    setDiagnosticEntry(last,"Forensic verdict","FAIL",false);setDiagnosticEntry(last,"Configured account",accountValue,false);setDiagnosticEntry(last,"Failure stage",`${code} · ${stage}`,false);
    if(last.server){last.server.browserAssessment={...(last.server.browserAssessment||{}),verdict:"FAIL",failure};last.server.effectiveVerdict="FAIL";}
    const status=document.getElementById("platformDiagnosticStatus");if(status&&!String(status.textContent||"").startsWith("FAIL"))status.textContent=`FAIL · exact account authority · ${code}`;
  }

  const augment=()=>{const document=root.document;if(!document)return;const grid=document.getElementById("platformDiagnosticGrid");if(grid&&!grid.querySelector('[data-qualification-version]')){const card=document.createElement("div");card.className="diagnostic-card good";card.dataset.qualificationVersion=strategies.VERSION;card.innerHTML=`<span>Strategy qualification</span><strong>${strategies.VERSION} · one raw crossing clock</strong>`;grid.append(card);}reconcileExactAccountDiagnostic();};
  root.CTEQualifiedDirection=Object.freeze({chartDirection,hasCanonicalQualification});
  root.CTEExactAccountDiagnostic={reconcile:reconcileExactAccountDiagnostic};
  augment();
  const document=root.document,Observer=root.MutationObserver;
  if(document?.documentElement&&typeof Observer==="function")new Observer(augment).observe(document.documentElement,{subtree:true,childList:true});
})(globalThis);
