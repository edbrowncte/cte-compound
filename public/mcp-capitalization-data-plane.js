(()=>{
  "use strict";
  const VERSION="CTE_COMPOUND_MCP_CAPITALIZATION_CLIENT@1.1.0",CACHE_MS=4000,ALL_PAIRS="__ALL_PAIRS__",READY_RETRY_MS=1000,READY_RETRY_LIMIT=60;
  let snapshot=null,inflight=null,key="",loadedAt=0,installed=false,controlsInstalled=false,rendererInstalled=false,readyTimer=null,readyAttempts=0;

  const normalize=value=>String(value||"").trim().toUpperCase().replace(/[\s/-]+/g,"_");
  const pairLabel=pair=>String(pair||"").replace("_","/");
  const pairs=()=>typeof INSTRUMENTS!=="undefined"&&Array.isArray(INSTRUMENTS)?INSTRUMENTS:[];
  const selectedPair=()=>pairs().includes(state?.evaluationFacilityPair)?state.evaluationFacilityPair:ALL_PAIRS;
  const selectedTimeframe=()=>normalize(document.getElementById("evalTableTfFilter")?.value||state?.evaluationTableTimeframe||state?.engineConfig?.timeframe)||"H1";

  async function callTool(timeframe,strategy){
    const response=await fetch("/mcp",{method:"POST",headers:{"Content-Type":"application/json","Accept":"application/json"},credentials:"same-origin",cache:"no-store",body:JSON.stringify({jsonrpc:"2.0",id:`capitalization-${Date.now()}`,method:"tools/call",params:{name:"get_capitalization_snapshot",arguments:{timeframe,strategy}}})});
    const envelope=await response.json().catch(()=>null);
    if(!response.ok||envelope?.error)throw new Error(envelope?.error?.message||`MCP capitalization HTTP ${response.status}`);
    const text=envelope?.result?.content?.find?.(item=>item?.type==="text")?.text;
    if(!text)throw new Error("MCP capitalization returned no text content");
    return JSON.parse(text);
  }

  async function prime(timeframe,strategy){
    const tf=normalize(timeframe)||"H1",indicator=normalize(strategy)||"ASSET",nextKey=`${tf}|${indicator}`,now=Date.now();
    if(snapshot&&key===nextKey&&now-loadedAt<CACHE_MS)return snapshot;
    if(inflight&&key===nextKey)return inflight;
    key=nextKey;inflight=callTool(tf,indicator).then(value=>{snapshot=value;loadedAt=Date.now();return value;}).finally(()=>{inflight=null;});return inflight;
  }

  function publish(payload,timeframe){
    const rows=Array.isArray(payload?.rows)?payload.rows:[];
    state.evaluationTableTimeframe=timeframe;
    state.evaluationTableData=rows;
    syncTimeframeControls(timeframe);
    if(typeof renderEvaluationTable==="function")renderEvaluationTable();
    if(typeof renderFourSlotRotator==="function")renderFourSlotRotator();
    if(globalThis.CTEMarketMentor&&typeof evaluationRotatorSlots==="function")void CTEMarketMentor.update({rows:state.evaluationTableData,slots:evaluationRotatorSlots(),selectedPair:state.selectedInstrument,timeframe,connected:accountReady()});
    if(typeof queueModelContextPublish==="function")queueModelContextPublish();
    const scope=document.getElementById("rateFluctuationScope");
    if(scope&&payload)scope.dataset.mcpCapitalization=`${payload.coverage||0}/${payload.total||0}`;
    return rows;
  }

  function fieldSelect(id,caption,options){
    const label=document.createElement("label");label.className="field";label.dataset.capitalizationControl=id;const span=document.createElement("span");span.textContent=caption;const select=document.createElement("select");select.id=id;select.setAttribute("aria-label",caption);for(const option of options){const node=document.createElement("option");node.value=option.value;node.textContent=option.label;select.appendChild(node);}label.append(span,select);return{label,select};
  }

  function pairOptions(){return[{value:ALL_PAIRS,label:"All 28 pairs"},...pairs().map(pair=>({value:pair,label:pairLabel(pair)}))];}
  function timeframeOptions(){const source=document.getElementById("evalTableTfFilter");if(source?.options?.length)return[...source.options].map(option=>({value:option.value,label:option.textContent||option.value}));const values=typeof TIMEFRAMES!=="undefined"&&Array.isArray(TIMEFRAMES)?TIMEFRAMES:["H1"];return values.map(value=>({value,label:value}));}

  function syncPairControls(value=selectedPair()){
    const next=pairs().includes(value)?value:ALL_PAIRS;state.evaluationFacilityPair=next;
    for(const id of ["evalTablePairFilter","rateFluctuationPairFilter"]){const select=document.getElementById(id);if(select&&select.value!==next)select.value=next;}
    return next;
  }
  function syncTimeframeControls(value=selectedTimeframe()){
    const next=normalize(value)||"H1";
    for(const id of ["evalTableTfFilter","rateFluctuationTimeframeFilter"]){const select=document.getElementById(id);if(select&&select.value!==next&&[...select.options].some(option=>option.value===next))select.value=next;}
    return next;
  }

  function installRendererFilter(){
    if(rendererInstalled||typeof globalThis.renderEvaluationTable!=="function")return false;
    const prior=globalThis.renderEvaluationTable;if(prior.__cteCapitalizationPairFilter){rendererInstalled=true;return true;}
    const wrapped=function(...args){
      const original=state.evaluationTableData,pair=selectedPair();
      if(pair===ALL_PAIRS||!Array.isArray(original))return prior.apply(this,args);
      state.evaluationTableData=original.filter(row=>row?.pair===pair);
      try{return prior.apply(this,args);}finally{state.evaluationTableData=original;}
    };
    Object.defineProperty(wrapped,"__cteCapitalizationPairFilter",{value:true});globalThis.renderEvaluationTable=wrapped;try{renderEvaluationTable=wrapped;}catch{}rendererInstalled=true;return true;
  }

  function installControls(){
    if(typeof document==="undefined")return false;
    const evaluationControls=document.querySelector("#evaluationTableContainer .head-controls"),evaluationTf=document.getElementById("evalTableTfFilter"),rateControls=document.getElementById("rateFluctuationControls");
    if(!evaluationControls||!evaluationTf||!rateControls)return false;
    const tfCaption=evaluationTf.closest("label")?.querySelector("span");if(tfCaption)tfCaption.textContent="Timeframe";
    if(!document.getElementById("evalTablePairFilter")){const control=fieldSelect("evalTablePairFilter","Currency Pair",pairOptions());evaluationControls.insertBefore(control.label,evaluationTf.closest("label"));}
    if(!document.getElementById("rateFluctuationPairFilter")){const control=fieldSelect("rateFluctuationPairFilter","Currency Pair",pairOptions());rateControls.prepend(control.label);}
    if(!document.getElementById("rateFluctuationTimeframeFilter")){const control=fieldSelect("rateFluctuationTimeframeFilter","Timeframe",timeframeOptions());const pair=document.getElementById("rateFluctuationPairFilter")?.closest("label");pair?.insertAdjacentElement("afterend",control.label);}
    syncPairControls();syncTimeframeControls();
    for(const id of ["evalTablePairFilter","rateFluctuationPairFilter"]){const select=document.getElementById(id);if(select&&!select.dataset.capitalizationBound){select.dataset.capitalizationBound="true";select.addEventListener("change",()=>{syncPairControls(select.value);if(typeof renderEvaluationTable==="function")renderEvaluationTable();});}}
    for(const id of ["evalTableTfFilter","rateFluctuationTimeframeFilter"]){const select=document.getElementById(id);if(select&&!select.dataset.capitalizationBound){select.dataset.capitalizationBound="true";select.addEventListener("change",()=>{const timeframe=syncTimeframeControls(select.value);void loadSelected(timeframe,{force:true});});}}
    controlsInstalled=true;installRendererFilter();return true;
  }

  async function loadSelected(timeframe=selectedTimeframe(),{force=false}={}){
    if(typeof marketDataReady==="function"&&!marketDataReady())return false;
    const tf=syncTimeframeControls(timeframe),strategy=normalize(state.selectedScheduleStrategy)||"ASSET";
    if(force&&key===`${tf}|${strategy}`){snapshot=null;loadedAt=0;}
    try{
      const payload=await prime(tf,strategy);
      if(!Array.isArray(payload?.rows)||!payload.rows.length)throw new Error("MCP capitalization returned no rows");
      publish(payload,tf);
      const facilities=globalThis.CTEAnalyticalFacilities;
      if(typeof facilities?.hydrateRateFluctuationEventSupport==="function"){
        await facilities.hydrateRateFluctuationEventSupport(tf,{retryErrors:true});
        if(typeof renderEvaluationTable==="function")renderEvaluationTable();
      }
      return payload;
    }catch(error){
      console.error("MCP capitalization direct analytical load failed",error);return false;
    }
  }

  function scheduleReadyLoad(delay=0){
    if(readyTimer)clearTimeout(readyTimer);readyTimer=setTimeout(async()=>{readyTimer=null;installControls();if(typeof marketDataReady==="function"&&marketDataReady()){readyAttempts=0;await loadSelected();return;}if(readyAttempts++<READY_RETRY_LIMIT)scheduleReadyLoad(READY_RETRY_MS);},delay);
  }

  function install(){
    if(installed||typeof preloadEvaluationTimeframe!=="function")return false;
    installed=true;
    const fallback=preloadEvaluationTimeframe;
    preloadEvaluationTimeframe=async function(activeTf){
      if(typeof marketDataReady==="function"&&!marketDataReady())return;
      const timeframe=normalize(activeTf)||"H1",strategy=normalize(state.selectedScheduleStrategy)||"ASSET";
      try{
        const payload=await prime(timeframe,strategy);
        if(Array.isArray(payload?.rows)&&payload.rows.length){publish(payload,timeframe);return payload;}
        throw new Error("MCP capitalization returned no rows");
      }catch(error){
        console.error("MCP capitalization data plane failed; using bounded selected evaluation fallback",error);
        return fallback(timeframe);
      }
    };
    scheduleReadyLoad(0);return true;
  }

  globalThis.CTECompoundMcpCapitalization=Object.freeze({version:VERSION,ALL_PAIRS,prime,publish,loadSelected,installControls,syncPairControls,syncTimeframeControls,status:()=>({version:VERSION,loadedAt:loadedAt?new Date(loadedAt).toISOString():null,key,coverage:Number(snapshot?.coverage)||0,total:Number(snapshot?.total)||0,failures:Number(snapshot?.failureCount)||0,pair:selectedPair(),timeframe:selectedTimeframe(),controlsInstalled})});
  if(typeof document!=="undefined"){if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",install,{once:true});else queueMicrotask(install);}
})();
