(function installIOIIOMPerformance(global){
  "use strict";

  const VERSION="CTE_IOI_IOM_PERFORMANCE_UI@1.0.3";
  const EXTRA=Object.freeze([
    {id:"IOI",label:"IOI · Indicator Only Indicator"},
    {id:"IOM",label:"IOM · Indicator Only Mean"}
  ]);
  const MACRO_TITLE="Macro: HTL Asset / DARE(N) / DARE / COMBO / NAI / APEX / IOI / IOM Performance";
  let configurationObserver=null;

  const finite=value=>value!==null&&value!==undefined&&value!==""&&Number.isFinite(Number(value));
  const fmt=(value,digits=2)=>finite(value)?Number(value).toFixed(digits):"—";
  const currentRecord=()=>typeof state!=="undefined"&&typeof scheduleKey==="function"?state.autoConfigurations.get(scheduleKey(state.selectedInstrument,state.selectedTimeframe)):null;
  const analyticalIndicators=()=>[...(typeof STRATEGIES!=="undefined"?STRATEGIES:[]),...EXTRA];

  function updateHeading(){
    if(typeof document==="undefined")return;
    for(const heading of document.querySelectorAll("#performancePanel h2"))if(String(heading.textContent||"").trim().startsWith("Macro:")){heading.textContent=MACRO_TITLE;break;}
  }

  function performanceRow(record,label){return (Array.isArray(record?.grossPerformance)?record.grossPerformance:[]).find(row=>row?.Strategy===label)||null;}

  function renderMacroRows(){
    const record=currentRecord();if(!record||record.source!=="COMPUTE_CONFIGURATION")return;
    const body=document.getElementById("macroPerformanceBody");if(!body)return;
    body.innerHTML=analyticalIndicators().map(indicator=>{
      const row=performanceRow(record,indicator.label),needsCompute=!row,wlf=row?.["W/L/Flat"]||"—",net=row?.["Net pips"],avg=row?.Avg,mfeMae=row?.["MFE/MAE"],maxDd=row?.["Max DD"],profitFactor=row?.["Profit factor"],recoveryFactor=row?.["Recovery factor"];
      return `<tr data-indicator="${indicator.id}"><td>${indicator.label}</td><td>${needsCompute?"Recompute":row?.Trades??"—"}</td><td>${wlf}</td><td class="${finite(net)&&Number(net)<0?"negative":"positive"}">${fmt(net,1)}</td><td>${fmt(avg)}</td><td>${fmt(mfeMae)}</td><td>${fmt(maxDd,1)}</td><td>${fmt(profitFactor)}</td><td>${fmt(recoveryFactor)}</td></tr>`;
    }).join("");
  }

  function configurationSignature(indicator,record,config){return [indicator.id,record?.source||"",record?.computedAt||"",config?.length??10,config?.filter??0,config?.trades??"",config?.net??"",config?.score??""].join("|");}

  function appendConfigurationCards(){
    const container=document.getElementById("strategyConfiguration"),record=currentRecord();if(!container)return false;
    for(const indicator of EXTRA){
      const config=record?.config?.[indicator.id]||{length:10,filter:0},signature=configurationSignature(indicator,record,config);
      let card=container.querySelector(`[data-ioi-iom-config="${indicator.id}"]`);
      if(!card){card=document.createElement("section");card.className="config-card";card.dataset.ioiIomConfig=indicator.id;container.appendChild(card);}
      if(card.dataset.ioiIomSignature===signature)continue;
      card.dataset.ioiIomSignature=signature;
      const result=record?.config?.[indicator.id],resultLine=result?`<div class="runtime-value" style="margin-top:6px">Trades ${result.trades??"—"} · Net ${finite(result.net)?Number(result.net).toFixed(1):"—"} pips · Score ${finite(result.score)?Number(result.score).toFixed(2):"—"}</div>`:"";
      card.innerHTML=`<h3>${indicator.label}${record?" · AUTO":""}</h3><label class="field"><span>Length</span><input type="number" value="${config.length??10}" disabled></label><label class="field"><span>Filter</span><input type="number" value="${config.filter??0}" disabled></label>${resultLine}`;
    }
    return true;
  }

  function installConfigurationObserver(){
    const container=document.getElementById("strategyConfiguration");if(!container||configurationObserver||typeof MutationObserver==="undefined")return false;
    configurationObserver=new MutationObserver(()=>queueMicrotask(appendConfigurationCards));
    configurationObserver.observe(container,{childList:true});
    global.addEventListener?.("pagehide",()=>{configurationObserver?.disconnect();configurationObserver=null;},{once:true});
    return true;
  }

  function appendOptimizerRows(){
    const body=document.getElementById("optimizerRegistryBody");if(!body||typeof state==="undefined")return;
    body.querySelectorAll("tr[data-ioi-iom-registry]").forEach(row=>row.remove());
    const rows=[];
    for(const [key,value] of state.autoConfigurations){const [pair,timeframe]=key.split("|");for(const indicator of EXTRA){const config=value.config?.[indicator.id];if(config)rows.push({pair,timeframe,indicator:indicator.label,source:value.source||"SERVER",computedAt:value.computedAt||null,range:value.range||null,...config,stamp:value.stamp});}}
    for(const row of rows.sort((a,b)=>a.pair.localeCompare(b.pair)||TIMEFRAMES.indexOf(a.timeframe)-TIMEFRAMES.indexOf(b.timeframe)||a.indicator.localeCompare(b.indicator))){const tr=document.createElement("tr");tr.dataset.ioiIomRegistry="true";tr.innerHTML=`<td>${formatPair(row.pair)}</td><td>${row.timeframe}</td><td>${row.indicator}</td><td>${row.length}</td><td>${row.filter}</td><td>${row.trades??"—"}</td><td>${finite(row.net)?Number(row.net).toFixed(1):"—"}</td><td>${finite(row.maxDrawdown)?Number(row.maxDrawdown).toFixed(1):"—"}</td><td>${finite(row.score)?Number(row.score).toFixed(2):"—"}</td><td>${row.source}${row.range?.bars?` · ${formatTime(row.range.firstCandle)}—${formatTime(row.range.lastCandle)} · ${row.range.bars} bars`:""}</td><td>${formatTime(row.stamp)}</td><td>${formatTime(row.computedAt)}</td>`;body.appendChild(tr);}
  }

  function refreshAnalyticalResults(){updateHeading();renderMacroRows();appendConfigurationCards();appendOptimizerRows();}

  function installRuntime(){
    if(typeof renderMacroPerformance==="function"){
      const prior=renderMacroPerformance;renderMacroPerformance=function(){prior();updateHeading();renderMacroRows();};
    }
    if(typeof renderStrategyConfiguration==="function"){
      const prior=renderStrategyConfiguration;renderStrategyConfiguration=function(){prior();appendConfigurationCards();};
    }
    if(typeof renderOptimizerRegistry==="function"){
      const prior=renderOptimizerRegistry;renderOptimizerRegistry=function(){prior();appendOptimizerRows();};
    }
    if(typeof loadOptimizerRecords==="function"){
      const prior=loadOptimizerRecords;loadOptimizerRecords=async function(...args){const result=await prior(...args);refreshAnalyticalResults();return result;};
    }
    updateHeading();installConfigurationObserver();
    return true;
  }

  function install(){installRuntime();try{refreshAnalyticalResults();}catch(error){console.error("IOI/IOM performance UI initialization failed:",error);}}
  if(typeof document!=="undefined"){if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",install,{once:true});else queueMicrotask(install);}
  global.CTEIOIIOMPerformanceUI=Object.freeze({VERSION,EXTRA,MACRO_TITLE,performanceRow,appendConfigurationCards,refreshAnalyticalResults});
})(globalThis);
