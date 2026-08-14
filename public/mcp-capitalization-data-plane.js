(()=>{
  "use strict";
  const VERSION="CTE_COMPOUND_MCP_CAPITALIZATION_CLIENT@1.0.0",CACHE_MS=4000;
  let snapshot=null,inflight=null,key="",loadedAt=0,installed=false;

  const normalize=value=>String(value||"").trim().toUpperCase().replace(/[\s/-]+/g,"_");
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
    if(typeof renderEvaluationTable==="function")renderEvaluationTable();
    if(typeof renderFourSlotRotator==="function")renderFourSlotRotator();
    if(globalThis.CTEMarketMentor&&typeof evaluationRotatorSlots==="function")void CTEMarketMentor.update({rows:state.evaluationTableData,slots:evaluationRotatorSlots(),selectedPair:state.selectedInstrument,timeframe,connected:accountReady()});
    if(typeof queueModelContextPublish==="function")queueModelContextPublish();
    if(typeof renderRateFluctuationRanking==="function")renderRateFluctuationRanking();
    const scope=document.getElementById("rateFluctuationScope");
    if(scope&&payload)scope.dataset.mcpCapitalization=`${payload.coverage||0}/${payload.total||0}`;
    return rows;
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
    return true;
  }
  globalThis.CTECompoundMcpCapitalization=Object.freeze({version:VERSION,prime,publish,status:()=>({version:VERSION,loadedAt:loadedAt?new Date(loadedAt).toISOString():null,key,coverage:Number(snapshot?.coverage)||0,total:Number(snapshot?.total)||0,failures:Number(snapshot?.failureCount)||0})});
  if(typeof document!=="undefined"){if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",install,{once:true});else queueMicrotask(install);}
})();
