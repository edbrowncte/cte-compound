(function installIOIIOMPerformance(global){
  "use strict";

  const VERSION="CTE_IOI_IOM_PERFORMANCE_UI@1.0.1";
  const EXTRA=Object.freeze([
    {id:"IOI",label:"IOI · Indicator Only Indicator"},
    {id:"IOM",label:"IOM · Indicator Only Mean"}
  ]);
  const MACRO_TITLE="Macro: HTL Asset / DARE(N) / DARE / COMBO / NAI / APEX / IOI / IOM Performance";

  const finite=value=>value!==null&&value!==undefined&&value!==""&&Number.isFinite(Number(value));
  const fmt=(value,digits=2)=>finite(value)?Number(value).toFixed(digits):"—";
  const currentRecord=()=>typeof state!=="undefined"&&typeof scheduleKey==="function"?state.autoConfigurations.get(scheduleKey(state.selectedInstrument,state.selectedTimeframe)):null;
  const analyticalStrategies=()=>[...(typeof STRATEGIES!=="undefined"?STRATEGIES:[]),...EXTRA];

  function updateHeading(){
    if(typeof document==="undefined")return;
    for(const heading of document.querySelectorAll("#performancePanel h2"))if(String(heading.textContent||"").trim().startsWith("Macro:")){heading.textContent=MACRO_TITLE;break;}
  }

  function renderMacroRows(){
    const record=currentRecord();if(!record||record.source!=="COMPUTE_CONFIGURATION")return;
    const body=document.getElementById("macroPerformanceBody");if(!body)return;
    body.innerHTML=analyticalStrategies().map(strategy=>{
      const entry=record.config?.[strategy.id]||{},stats={...entry,...entry.grossPerformance},needsCompute=EXTRA.some(item=>item.id===strategy.id)&&!record.config?.[strategy.id];
      return `<tr data-strategy="${strategy.id}"><td>${strategy.label}</td><td>${needsCompute?"Recompute":stats.trades??"—"}</td><td>${finite(stats.wins)?`${stats.wins}/${stats.losses}/${stats.flats}`:"—"}</td><td class="${finite(stats.net)&&Number(stats.net)<0?"negative":"positive"}">${fmt(stats.net,1)}</td><td>${fmt(stats.average)}</td><td>${fmt(stats.mfeMae)}</td><td>${fmt(stats.maxDrawdown,1)}</td><td>${fmt(stats.profitFactor)}</td><td>${fmt(stats.recoveryFactor)}</td></tr>`;
    }).join("");
  }

  function appendConfigurationCards(){
    const container=document.getElementById("strategyConfiguration"),record=currentRecord();if(!container)return;
    for(const strategy of EXTRA){
      let card=container.querySelector(`[data-ioi-iom-config="${strategy.id}"]`);if(!card){card=document.createElement("section");card.className="config-card";card.dataset.ioiIomConfig=strategy.id;container.appendChild(card);}
      const config=record?.config?.[strategy.id]||{length:10,filter:0};
      card.innerHTML=`<h3>${strategy.label}${record?" · AUTO":""}</h3><label class="field"><span>Length</span><input type="number" value="${config.length??10}" disabled></label><label class="field"><span>Filter</span><input type="number" value="0" disabled></label>`;
    }
  }

  function appendOptimizerRows(){
    const body=document.getElementById("optimizerRegistryBody");if(!body||typeof state==="undefined")return;
    body.querySelectorAll("tr[data-ioi-iom-registry]").forEach(row=>row.remove());
    const rows=[];
    for(const [key,value] of state.autoConfigurations){const [pair,timeframe]=key.split("|");for(const strategy of EXTRA){const config=value.config?.[strategy.id];if(config)rows.push({pair,timeframe,strategy:strategy.label,source:value.source||"SERVER",computedAt:value.computedAt||null,range:value.range||null,...config,stamp:value.stamp});}}
    for(const row of rows.sort((a,b)=>a.pair.localeCompare(b.pair)||TIMEFRAMES.indexOf(a.timeframe)-TIMEFRAMES.indexOf(b.timeframe)||a.strategy.localeCompare(b.strategy))){const tr=document.createElement("tr");tr.dataset.ioiIomRegistry="true";tr.innerHTML=`<td>${formatPair(row.pair)}</td><td>${row.timeframe}</td><td>${row.strategy}</td><td>${row.length}</td><td>${row.filter}</td><td>${row.trades??"—"}</td><td>${finite(row.net)?Number(row.net).toFixed(1):"—"}</td><td>${finite(row.maxDrawdown)?Number(row.maxDrawdown).toFixed(1):"—"}</td><td>${finite(row.score)?Number(row.score).toFixed(2):"—"}</td><td>${row.source}${row.range?.bars?` · ${formatTime(row.range.firstCandle)}—${formatTime(row.range.lastCandle)} · ${row.range.bars} bars`:""}</td><td>${formatTime(row.stamp)}</td><td>${formatTime(row.computedAt)}</td>`;body.appendChild(tr);}
  }

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
    updateHeading();
    return true;
  }

  function install(){installRuntime();try{renderMacroRows();appendConfigurationCards();appendOptimizerRows();}catch(error){console.error("IOI/IOM performance UI initialization failed:",error);}}
  if(typeof document!=="undefined"){if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",install,{once:true});else queueMicrotask(install);}
  global.CTEIOIIOMPerformanceUI=Object.freeze({VERSION,EXTRA,MACRO_TITLE});
})(globalThis);
