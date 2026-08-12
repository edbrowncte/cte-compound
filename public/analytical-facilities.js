(function installAnalyticalFacilities(global){
  "use strict";

  const VERSION="CTE_ANALYTICAL_FACILITIES@1.0.1";
  let evaluationPreloadPromise=null,evaluationPreloadKey="";

  const safeName=value=>String(value||"").trim().toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"")||"data";
  const currentEventTimeframe=()=>document.getElementById("eventTimeframe")?.value||state.selectedTimeframe;
  const currentEventPair=()=>document.getElementById("eventPair")?.value||state.selectedInstrument;

  function optimizerAssetConfiguration(pair,timeframe){
    const key=typeof scheduleKey==="function"?scheduleKey(pair,timeframe):`${pair}|${timeframe}`,record=state.autoConfigurations?.get?.(key),entry=record?.config?.ASSET||null,fallback=typeof STRATEGY_CONFIG!=="undefined"?STRATEGY_CONFIG.ASSET||{}:{};
    const rawLength=entry?.length??record?.settings?.assetLength??fallback.length??10,rawFilter=entry?.filter??fallback.filter??0,maxLength=Number(global.MAX_ANALYTICAL_LENGTH)||500;
    return{
      key,
      length:Math.max(3,Math.min(maxLength,Math.trunc(Number(rawLength)||10))),
      filter:Math.max(0,Math.min(10,Number(rawFilter)||0)),
      configured:Boolean(entry),
      source:entry?(record?.source||"OPTIMIZER"):"OPTIMIZER_UNAVAILABLE",
      computedAt:record?.computedAt||null,
      stamp:record?.stamp||null,
      recordVersion:record?.version??null,
    };
  }

  function ensureEventFilterControl(){
    const length=document.getElementById("eventLength"),controls=length?.closest(".event-controls");if(!length||!controls)return null;
    length.readOnly=true;length.setAttribute("aria-readonly","true");const lengthLabel=length.closest("label"),lengthCaption=lengthLabel?.querySelector("span");if(lengthCaption)lengthCaption.textContent="Length";
    let input=document.getElementById("eventFilter");if(!input){const label=document.createElement("label");label.className="field";label.dataset.optimizerEventFilter="true";label.innerHTML='<span>Filter</span><input id="eventFilter" type="number" min="0" max="10" step="0.1" value="0" readonly aria-readonly="true">';lengthLabel?.insertAdjacentElement("afterend",label);input=label.querySelector("input");}
    return input;
  }

  function syncSelectedEventConfiguration(pair=currentEventPair(),timeframe=currentEventTimeframe()){
    const config=optimizerAssetConfiguration(pair,timeframe),length=document.getElementById("eventLength"),filter=ensureEventFilterControl();
    if(length){length.value=String(config.length);length.title=`${config.source} · ${formatPair(pair)} ${timeframe}`;}
    if(filter){filter.value=String(config.filter);filter.title=`${config.source} · ${formatPair(pair)} ${timeframe}`;}
    return config;
  }

  function ensureEventScheduleHeaders(){
    const header=document.querySelector("#eventScheduleTable thead tr");if(!header)return false;
    if(!header.querySelector('[data-event-sort="length"]')){const th=document.createElement("th");th.innerHTML='<button type="button" data-event-sort="length">Length</button>';header.children[0]?.insertAdjacentElement("afterend",th);}
    if(!header.querySelector('[data-event-sort="filter"]')){const th=document.createElement("th");th.innerHTML='<button type="button" data-event-sort="filter">Filter</button>';const lengthHeader=header.querySelector('[data-event-sort="length"]')?.closest("th");lengthHeader?.insertAdjacentElement("afterend",th);}
    const note=document.getElementById("eventScheduleInterpretation");if(note&&!note.textContent.includes("Length and Filter resolve"))note.textContent+=`${note.textContent.trim().endsWith(".")?"":"."} Length and Filter resolve from each pair × timeframe optimizer record.`;
    return true;
  }

  function augmentEventScheduleRows(){
    ensureEventScheduleHeaders();
    const body=document.getElementById("eventScheduleBody");if(!body)return;
    for(const tr of body.querySelectorAll("tr[data-pair]")){
      tr.querySelectorAll("td[data-optimizer-event-config]").forEach(node=>node.remove());
      const row=(state.eventRows||[]).find(item=>item.pair===tr.dataset.pair),config=row?{length:row.length,filter:row.filter,source:row.configurationSource}:optimizerAssetConfiguration(tr.dataset.pair,currentEventTimeframe());
      const lengthCell=document.createElement("td");lengthCell.dataset.optimizerEventConfig="length";lengthCell.textContent=Number.isFinite(Number(config.length))?String(config.length):"—";lengthCell.title=config.source||"";
      const filterCell=document.createElement("td");filterCell.dataset.optimizerEventConfig="filter";filterCell.textContent=Number.isFinite(Number(config.filter))?String(config.filter):"—";filterCell.title=config.source||"";
      tr.children[0]?.insertAdjacentElement("afterend",lengthCell);lengthCell.insertAdjacentElement("afterend",filterCell);
    }
  }

  function cleanEventScheduleRow(row,timeframe=currentEventTimeframe()){
    if(!row)return null;
    const integrityVersion=row.scheduleIntegrityVersion||global.CTEHtlScheduleIntegrity?.VERSION||null,sourceIntegrity=row.forecast?.integrity||null;
    const durationValidationN=row.durationValidationN??sourceIntegrity?.durationValidationN??null,durationValidationRawN=row.durationValidationRawN??sourceIntegrity?.durationValidationRawN??null,durationOutliersExcluded=row.durationOutliersExcluded??sourceIntegrity?.durationOutliersExcluded??0,durationOutlierThresholdBars=row.durationOutlierThresholdBars??sourceIntegrity?.durationOutlierThresholdBars??null,durationValidationStatus=row.durationValidationStatus??sourceIntegrity?.durationStatus??null;
    const completionValidationN=row.completionValidationN??sourceIntegrity?.completionValidationN??null,completionValidationStatus=row.completionValidationStatus??sourceIntegrity?.completionStatus??null;
    return{
      pair:row.pair,
      timeframe,
      length:row.length,
      filter:row.filter,
      configurationSource:row.configurationSource||null,
      configurationComputedAt:row.configurationComputedAt||null,
      configurationStamp:row.configurationStamp||null,
      currentPrice:row.price,
      currentEvent:row.currentEvent,
      currentEventOpen:row.eventOpen,
      location:row.location,
      completionWithin5Bars:row.p5,
      completionWithin10Bars:row.p10,
      events:row.events,
      durationMaeBars:row.durationMae,
      durationValidationN,
      durationValidationRawN,
      durationOutliersExcluded,
      durationOutlierThresholdBars,
      durationValidationStatus,
      completionValidationN,
      completionValidationStatus,
      scheduleIntegrityVersion:integrityVersion,
      integrity:{
        version:integrityVersion,
        duration:{
          maeBars:row.durationMae,
          validationN:durationValidationN,
          rawValidationN:durationValidationRawN,
          outliersExcluded:durationOutliersExcluded,
          outlierThresholdBars:durationOutlierThresholdBars,
          status:durationValidationStatus,
        },
        completion:{
          validationN:completionValidationN,
          within5Bars:row.p5,
          within10Bars:row.p10,
          status:completionValidationStatus,
        },
        record:sourceIntegrity,
      },
      envelopeMaeBps:row.envelopeMae,
      onsetBrier:row.brier,
      historicalBrier:row.historicalBrier,
      nextHtlEvent:row.nextEvent,
      forecastEnvelopeLow:row.envelopeLow,
      forecastEnvelopeHigh:row.envelopeHigh,
      historyBars:row.data?.length??row.historyBars??null,
      degradedHistory:Boolean(row.degradedHistory),
    };
  }

  function evaluationExportPayload(){
    const timeframe=state.evaluationTableTimeframe||document.getElementById("evalTableTfFilter")?.value||null,rows=(state.evaluationTableData||[]).map(row=>{const {priceCache,...record}=row;return record;});
    return{facility:"Evaluation Table",version:VERSION,exportedAt:new Date().toISOString(),timeframe,indicator:state.selectedScheduleStrategy,rows};
  }

  function diagnosticExportPayload(){
    return{facility:"Platform Diagnostic",version:VERSION,exportedAt:new Date().toISOString(),diagnostic:state.diagnosticLast||null};
  }

  function macroExportPayload(){
    const pair=state.selectedInstrument,timeframe=state.selectedTimeframe,key=typeof scheduleKey==="function"?scheduleKey(pair,timeframe):`${pair}|${timeframe}`,record=state.autoConfigurations?.get?.(key)||null;
    return{facility:"Macro Performance",version:VERSION,exportedAt:new Date().toISOString(),pair,timeframe,source:record?.source||null,computedAt:record?.computedAt||null,range:record?.range||null,validation:record?.validation||null,directionalOwnershipVersion:record?.directionalOwnershipVersion||null,configuration:record?.config||null,rows:record?.grossPerformance||[]};
  }

  function eventLedgerExportPayload(){
    const pair=currentEventPair(),timeframe=currentEventTimeframe(),row=(state.eventRows||[]).find(item=>item.pair===pair)||null,events=row?.eventList||state.eventEvents||[];
    return{facility:"Event Ledger",version:VERSION,exportedAt:new Date().toISOString(),pair,timeframe,length:row?.length??(Number(document.getElementById("eventLength")?.value)||null),filter:row?.filter??(Number(document.getElementById("eventFilter")?.value)||0),configurationSource:row?.configurationSource||null,events};
  }

  function htlScheduleExportPayload(){
    const timeframe=currentEventTimeframe();return{facility:"HTL Schedule",version:VERSION,exportedAt:new Date().toISOString(),timeframe,scheduleIntegrityVersion:global.CTEHtlScheduleIntegrity?.VERSION||null,rows:(state.eventRows||[]).map(row=>cleanEventScheduleRow(row,timeframe))};
  }

  function timeframeSignalScheduleExportPayload(){
    const indicator=state.selectedScheduleStrategy,rows=[];
    for(const pair of INSTRUMENTS)for(const timeframe of TIMEFRAMES){
      const key=typeof scheduleKey==="function"?scheduleKey(pair,timeframe):`${pair}|${timeframe}`,analysis=state.scheduleEvaluations?.get?.(key),output=analysis?.latest?.[indicator]||null,candles=state.scheduleCandles?.get?.(key)||[],record=state.autoConfigurations?.get?.(key)||null,config=record?.config?.[indicator]||((typeof STRATEGY_CONFIG!=="undefined"&&STRATEGY_CONFIG[indicator])?STRATEGY_CONFIG[indicator]:null);
      rows.push({pair,timeframe,indicator,direction:Number(output?.direction)||0,signal:output?.direction>0?"BUY":output?.direction<0?"SELL":"HOLD",confidence:output?.confidence??null,regime:output?.regime??null,score:output?.score??null,metrics:output?.metrics??null,length:config?.length??null,filter:config?.filter??null,configurationSource:record?.source||null,completedCandle:candles.at(-1)?.time||null,bars:candles.length});
    }
    return{facility:"Timeframe Signal Schedule",version:VERSION,exportedAt:new Date().toISOString(),indicator,rows};
  }

  function jsonReplacer(_key,value){if(value instanceof Map)return Object.fromEntries(value);if(value instanceof Set)return[...value];if(typeof value==="number"&&!Number.isFinite(value))return String(value);return value;}
  function downloadJson(slug,payload){
    const date=new Date().toISOString().replace(/[:.]/g,"-");const blob=new Blob([JSON.stringify(payload,jsonReplacer,2)],{type:"application/json;charset=utf-8"}),url=URL.createObjectURL(blob),link=document.createElement("a");
    link.href=url;link.download=`cte-compound-${safeName(slug)}-${date}.json`;document.body.appendChild(link);link.click();link.remove();URL.revokeObjectURL(url);
  }

  function addExportButton(container,id,slug,builder,{before=null}={}){
    if(!container||document.getElementById(id))return null;const button=document.createElement("button");button.id=id;button.type="button";button.textContent="Export JSON";button.dataset.exportJson=slug;
    button.addEventListener("click",async()=>{const prior=button.textContent;button.disabled=true;button.textContent="Exporting…";try{if(slug==="platform-diagnostic"&&!state.diagnosticLast&&typeof runPlatformDiagnostic==="function")await runPlatformDiagnostic(false);downloadJson(slug,await builder());}catch(error){console.error(`${slug} JSON export failed:`,error);button.textContent="Export failed";setTimeout(()=>{button.textContent=prior;button.disabled=false;},1200);return;}button.textContent=prior;button.disabled=false;});
    if(before)container.insertBefore(button,before);else container.appendChild(button);return button;
  }

  function installExportButtons(){
    addExportButton(document.querySelector("#evaluationTableContainer .head-controls"),"exportEvaluationJson","evaluation-table",evaluationExportPayload);
    addExportButton(document.querySelector("#platformDiagnosticDetails .date-range-controls"),"exportPlatformDiagnosticJson","platform-diagnostic",diagnosticExportPayload);
    const macroHeading=[...document.querySelectorAll("#performancePanel .panel-head")].find(node=>node.querySelector("h2")?.textContent.trim().startsWith("Macro:"));if(macroHeading){let controls=macroHeading.querySelector(".head-controls");if(!controls){controls=document.createElement("div");controls.className="head-controls";macroHeading.appendChild(controls);}addExportButton(controls,"exportMacroPerformanceJson","macro-performance",macroExportPayload);}
    const ledger=document.querySelector(".event-ledger");if(ledger){let controls=ledger.querySelector(":scope > .head-controls");if(!controls){controls=document.createElement("div");controls.className="head-controls";controls.style.padding="7px 10px";ledger.querySelector("summary")?.insertAdjacentElement("afterend",controls);}addExportButton(controls,"exportEventLedgerJson","event-ledger",eventLedgerExportPayload);}
    addExportButton(document.querySelector("#htlScheduleComposition .event-controls")||document.querySelector("#eventPanel .event-controls"),"exportHtlScheduleJson","htl-schedule",htlScheduleExportPayload);
    addExportButton(document.getElementById("scheduleTitle")?.closest(".panel-head")?.querySelector(".head-controls"),"exportTimeframeSignalScheduleJson","timeframe-signal-schedule",timeframeSignalScheduleExportPayload);
  }

  async function preloadEvaluationTable(force=false){
    if(typeof marketDataReady!=="function"||!marketDataReady()||typeof preloadEvaluationTimeframe!=="function")return false;
    const timeframe=document.getElementById("evalTableTfFilter")?.value||"H1";
    if(!force&&state.evaluationTableTimeframe===timeframe&&(state.evaluationTableData||[]).length===INSTRUMENTS.length)return true;
    if(evaluationPreloadPromise&&evaluationPreloadKey===timeframe)return evaluationPreloadPromise;
    evaluationPreloadKey=timeframe;evaluationPreloadPromise=(async()=>{await preloadEvaluationTimeframe(timeframe);return true;})().finally(()=>{evaluationPreloadPromise=null;});return evaluationPreloadPromise;
  }

  function installRuntime(){
    if(typeof renderEventSchedule==="function"){
      const prior=renderEventSchedule;renderEventSchedule=function(){const result=prior();augmentEventScheduleRows();return result;};
    }
    if(typeof loadEventRow==="function"){
      const prior=loadEventRow;loadEventRow=async function(pair,timeframe,_length,controller,priority=60,requestedCount=null){const config=optimizerAssetConfiguration(pair,timeframe);if(!config.configured)throw new Error(`Optimizer configuration unavailable · ${formatPair(pair)} ${timeframe}`);const row=await prior(pair,timeframe,config.length,controller,priority,requestedCount);return{...row,length:config.length,filter:config.filter,configurationSource:config.source,configurationComputedAt:config.computedAt,configurationStamp:config.stamp,optimizerConfigured:true};};
    }
    if(typeof renderEventDetail==="function"){
      const prior=renderEventDetail;renderEventDetail=function(row){if(row){const length=document.getElementById("eventLength"),filter=ensureEventFilterControl();if(length)length.value=String(row.length??optimizerAssetConfiguration(row.pair,currentEventTimeframe()).length);if(filter)filter.value=String(row.filter??0);}const result=prior(row);const method=document.getElementById("eventMethod");if(method&&row&&!method.textContent.includes("optimizer"))method.textContent+=` · filter ${row.filter??0} · ${row.configurationSource||"optimizer"}`;return result;};
    }
    if(typeof loadEventForecast==="function"){
      const prior=loadEventForecast;loadEventForecast=async function(){if(typeof loadOptimizerRecords==="function")await loadOptimizerRecords();syncSelectedEventConfiguration();return prior();};
    }
    if(typeof refreshSelectedEventChart==="function"){
      const prior=refreshSelectedEventChart;refreshSelectedEventChart=async function(){syncSelectedEventConfiguration();return prior();};
    }
    if(typeof loadOptimizerRecords==="function"){
      const prior=loadOptimizerRecords;loadOptimizerRecords=async function(){const result=await prior();syncSelectedEventConfiguration();if(state.eventRows?.length)renderEventSchedule();return result;};
    }
    if(typeof loadSchedule==="function"){
      const prior=loadSchedule;loadSchedule=async function(mode="full"){const result=await prior(mode);if(mode==="focused"||mode==="full")void preloadEvaluationTable();return result;};
    }
    document.getElementById("eventPair")?.addEventListener("change",()=>syncSelectedEventConfiguration());
    document.getElementById("eventTimeframe")?.addEventListener("change",()=>syncSelectedEventConfiguration());
  }

  function install(){ensureEventFilterControl();ensureEventScheduleHeaders();syncSelectedEventConfiguration();installRuntime();installExportButtons();if(typeof marketDataReady==="function"&&marketDataReady())void preloadEvaluationTable();}

  const api=Object.freeze({VERSION,optimizerAssetConfiguration,cleanEventScheduleRow,evaluationExportPayload,diagnosticExportPayload,macroExportPayload,eventLedgerExportPayload,htlScheduleExportPayload,timeframeSignalScheduleExportPayload,preloadEvaluationTable});
  global.CTEAnalyticalFacilities=api;
  if(typeof document!=="undefined"){if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",install,{once:true});else queueMicrotask(install);}
})(globalThis);
