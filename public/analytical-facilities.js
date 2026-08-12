(function installAnalyticalFacilities(global){
  "use strict";

  const VERSION="CTE_ANALYTICAL_FACILITIES@1.2.0",RATE_FLUCTUATION_VERSION="CTE_RATE_FLUCTUATION_RANKING@1.1.0",EVENT_LEDGER_FOLLOW="__FOLLOW_SELECTED__",RATE_FLUCTUATION_HISTORY_TARGET=5000,RATE_FLUCTUATION_SUPPORT_CONCURRENCY=2;
  let evaluationPreloadPromise=null,evaluationPreloadKey="";

  const safeName=value=>String(value||"").trim().toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"")||"data";
  const currentEventTimeframe=()=>document.getElementById("eventTimeframe")?.value||state.selectedTimeframe;
  const currentEventPair=()=>document.getElementById("eventPair")?.value||state.selectedInstrument;
  const eventOutcomeLedgerDetails=()=>typeof document==="undefined"?null:document.getElementById("eventLedger")?.closest("details.event-ledger")||null;
  const scheduleDatasetTotal=()=>((typeof INSTRUMENTS!=="undefined"&&Array.isArray(INSTRUMENTS)?INSTRUMENTS.length:0)*(typeof TIMEFRAMES!=="undefined"&&Array.isArray(TIMEFRAMES)?TIMEFRAMES.length:0));
  function scheduleCoverageReady(){const total=scheduleDatasetTotal();return total>0&&Number(state.scheduleEvaluations?.size||0)>=total&&!state.scheduleLoading&&Number(state.scheduleFailures?.size||0)===0;}

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

  function eventLedgerSelectedPair(){
    const selection=String(state.eventLedgerPairSelection||EVENT_LEDGER_FOLLOW);
    return typeof INSTRUMENTS!=="undefined"&&INSTRUMENTS.includes(selection)?selection:state.selectedInstrument;
  }

  function ensureEventLedgerPairControl(){
    if(typeof document==="undefined")return null;
    const ledger=eventOutcomeLedgerDetails();if(!ledger)return null;
    let controls=ledger.querySelector(":scope > .head-controls");
    if(!controls){controls=document.createElement("div");controls.className="head-controls";controls.style.padding="7px 10px";ledger.querySelector("summary")?.insertAdjacentElement("afterend",controls);}
    let select=document.getElementById("eventLedgerPairSelect");
    if(!select){
      const label=document.createElement("label");label.className="field";label.dataset.eventLedgerPairControl="true";
      label.innerHTML='<span>Ledger Pair</span><select id="eventLedgerPairSelect" aria-label="Event Ledger currency pair"></select>';controls.prepend(label);select=label.querySelector("select");
      select.innerHTML='<option value="'+EVENT_LEDGER_FOLLOW+'">Follow selected pair</option>'+INSTRUMENTS.map(pair=>'<option value="'+pair+'">'+formatPair(pair)+'</option>').join("");
      select.addEventListener("change",()=>{state.eventLedgerPairSelection=select.value;state.eventLedgerSelectedRow=null;void loadSelectedEventLedger();});
    }
    if(!state.eventLedgerPairSelection)state.eventLedgerPairSelection=EVENT_LEDGER_FOLLOW;
    select.value=INSTRUMENTS.includes(state.eventLedgerPairSelection)?state.eventLedgerPairSelection:EVENT_LEDGER_FOLLOW;
    return select;
  }

  async function loadSelectedEventLedger(){
    if(typeof marketDataReady==="function"&&!marketDataReady())return null;
    const pair=eventLedgerSelectedPair(),timeframe=state.selectedTimeframe||currentEventTimeframe(),config=optimizerAssetConfiguration(pair,timeframe),node=typeof document!=="undefined"?document.getElementById("optimizerEventLedgerScope"):null;
    ensureEventLedgerPairControl();
    if(!config.configured){state.eventLedgerSelectedRow=null;if(node)node.textContent=`Event outcomes unavailable · optimizer configuration unavailable · ${formatPair(pair)} ${timeframe}`;const ledger=typeof document!=="undefined"?document.getElementById("eventLedger"):null;if(ledger)ledger.innerHTML='<tr><td colspan="13">Optimizer configuration unavailable for selected ledger pair/timeframe.</td></tr>';return null;}
    const controller=new AbortController(),scope=`Optimizer v${state.optimizerRuntimeVersion||7} · ${timeframe} · HTL Asset length ${config.length}`;if(node)node.textContent=`Loading ${formatPair(pair)} ${timeframe} optimizer event outcomes…`;
    try{
      const requested=typeof MAX_ANALYTICAL_HISTORY==="number"?MAX_ANALYTICAL_HISTORY:null,row=await loadEventRow(pair,timeframe,config.length,controller,70,requested);
      state.eventLedgerPair=pair;state.eventLedgerTimeframe=timeframe;state.eventLedgerSelectedRow=row;renderEventLedgerRows(row,scope);return row;
    }catch(error){state.eventLedgerSelectedRow=null;if(node)node.textContent=`Event outcomes unavailable · ${error.message||error}`;const ledger=typeof document!=="undefined"?document.getElementById("eventLedger"):null;if(ledger)ledger.innerHTML=`<tr><td colspan="13">${error.message||"Event outcomes unavailable"}</td></tr>`;return null;}
  }

  function finiteMedian(values){
    const ordered=(values||[]).map(Number).filter(Number.isFinite).sort((a,b)=>a-b);if(!ordered.length)return null;const middle=Math.floor(ordered.length/2);return ordered.length%2?ordered[middle]:(ordered[middle-1]+ordered[middle])/2;
  }

  function rateFluctuationHistoryTarget(){
    return typeof MAX_ANALYTICAL_HISTORY==="number"&&Number.isFinite(MAX_ANALYTICAL_HISTORY)?Math.max(1,Math.trunc(MAX_ANALYTICAL_HISTORY)):RATE_FLUCTUATION_HISTORY_TARGET;
  }

  function rateFluctuationSupportCache(){
    if(!(state.rateFluctuationEventCache instanceof Map))state.rateFluctuationEventCache=new Map();
    return state.rateFluctuationEventCache;
  }

  function rateFluctuationSupportKey(pair,timeframe,config=optimizerAssetConfiguration(pair,timeframe)){
    const key=typeof scheduleKey==="function"?scheduleKey(pair,timeframe):`${pair}|${timeframe}`,lineage=config.stamp||config.computedAt||config.source||"UNAVAILABLE";
    return `${key}|${config.length}|${config.filter}|${lineage}`;
  }

  function emptyRateFluctuationSupport(pair,timeframe,config=optimizerAssetConfiguration(pair,timeframe)){
    return{supportingSource:"EVENT_OUTCOME_LEDGER_MAX_HISTORY",supportingEventMagnitudePips:null,supportingFinalEvents:null,supportingMagnitudeEvents:null,supportingHistoryBars:null,supportingHistoryTarget:rateFluctuationHistoryTarget(),eventLength:config.length,configurationSource:config.source,supportingConfigurationSource:config.source,supportingStatus:config.configured?"PENDING":"CONFIGURATION_UNAVAILABLE",supportingError:null,corroborated:false,pair,timeframe};
  }

  function rateFluctuationEventSupport(row,timeframe){
    const pair=row?.pair;if(!pair)return emptyRateFluctuationSupport(null,timeframe,{length:null,filter:null,source:"PAIR_UNAVAILABLE",configured:false});
    const config=optimizerAssetConfiguration(pair,timeframe),cache=rateFluctuationSupportCache(),cacheKey=rateFluctuationSupportKey(pair,timeframe,config);
    if(cache.has(cacheKey))return cache.get(cacheKey);
    const initial=emptyRateFluctuationSupport(pair,timeframe,config);cache.set(cacheKey,initial);return initial;
  }

  async function rateFluctuationSupportPool(items,worker){
    let cursor=0;const count=Math.min(RATE_FLUCTUATION_SUPPORT_CONCURRENCY,items.length);
    await Promise.all(Array.from({length:count},async()=>{while(cursor<items.length){const item=items[cursor++];await worker(item);}}));
  }

  async function hydrateRateFluctuationEventSupport(explicitTimeframe=null,{retryErrors=false}={}){
    const select=typeof document!=="undefined"?document.getElementById("evalTableTfFilter"):null,timeframe=explicitTimeframe||state.evaluationTableTimeframe||select?.value||null;
    if(!timeframe||typeof loadEventRow!=="function")return false;
    if(typeof marketDataReady==="function"&&!marketDataReady())return false;
    const evaluationRows=(state.evaluationTableData||[]).filter(row=>row.timeframe===timeframe&&row.pair);
    if(!evaluationRows.length)return false;
    if(!(state.rateFluctuationSupportPromises instanceof Map))state.rateFluctuationSupportPromises=new Map();
    const existing=state.rateFluctuationSupportPromises.get(timeframe);if(existing)return existing;
    const jobs=[];
    for(const row of evaluationRows){
      const config=optimizerAssetConfiguration(row.pair,timeframe),cache=rateFluctuationSupportCache(),cacheKey=rateFluctuationSupportKey(row.pair,timeframe,config),support=cache.get(cacheKey)||emptyRateFluctuationSupport(row.pair,timeframe,config);
      if(!config.configured){cache.set(cacheKey,{...support,supportingStatus:"CONFIGURATION_UNAVAILABLE",supportingError:"Optimizer configuration unavailable",supportingFinalEvents:null,supportingMagnitudeEvents:null,corroborated:false});continue;}
      if(support.supportingStatus==="PENDING"||(retryErrors&&support.supportingStatus==="ERROR"))jobs.push({row,config,cacheKey});
    }
    if(!jobs.length)return true;
    const promise=(async()=>{
      const target=rateFluctuationHistoryTarget();
      await rateFluctuationSupportPool(jobs,async({row,config,cacheKey})=>{
        const cache=rateFluctuationSupportCache(),base=cache.get(cacheKey)||emptyRateFluctuationSupport(row.pair,timeframe,config);cache.set(cacheKey,{...base,supportingStatus:"LOADING",supportingError:null});
        renderRateFluctuationRanking(false);
        try{
          const controller=new AbortController(),eventRow=await loadEventRow(row.pair,timeframe,config.length,controller,35,target),events=Array.isArray(eventRow?.eventList)?eventRow.eventList:[],finals=events.filter(event=>event?.status==="FINAL"),pnlFinals=finals.filter(event=>Number.isFinite(Number(event?.profitPips))),magnitudes=pnlFinals.map(event=>Math.abs(Number(event.profitPips))),historyBars=Number(eventRow?.data?.length??eventRow?.historyBars),degraded=Boolean(eventRow?.degradedHistory)||(Number.isFinite(historyBars)&&historyBars<target);
          const status=degraded?"DEGRADED_HISTORY":!finals.length?"NO_FINAL_EVENTS":!pnlFinals.length?"NO_FINITE_EVENT_PNL":"READY";
          cache.set(cacheKey,{...base,supportingSource:"EVENT_OUTCOME_LEDGER_MAX_HISTORY",supportingEventMagnitudePips:finiteMedian(magnitudes),supportingFinalEvents:finals.length,supportingMagnitudeEvents:pnlFinals.length,supportingHistoryBars:Number.isFinite(historyBars)?historyBars:null,supportingHistoryTarget:target,eventLength:config.length,configurationSource:config.source,supportingConfigurationSource:config.source,supportingStatus:status,supportingError:null,corroborated:status==="READY"&&pnlFinals.length>0,pair:row.pair,timeframe});
        }catch(error){
          cache.set(cacheKey,{...base,supportingStatus:"ERROR",supportingError:error?.message||String(error),supportingFinalEvents:null,supportingMagnitudeEvents:null,supportingHistoryBars:null,supportingHistoryTarget:target,corroborated:false,pair:row.pair,timeframe});
        }
        renderRateFluctuationRanking(false);
      });
      return true;
    })().finally(()=>{state.rateFluctuationSupportPromises.delete(timeframe);});
    state.rateFluctuationSupportPromises.set(timeframe,promise);return promise;
  }

  function rateFluctuationRows(explicitTimeframe=null){
    const select=typeof document!=="undefined"?document.getElementById("evalTableTfFilter"):null,timeframe=explicitTimeframe||state.evaluationTableTimeframe||select?.value||null;
    const rows=(state.evaluationTableData||[]).filter(row=>!timeframe||row.timeframe===timeframe).map(row=>{
      const signed=Number(row.pipsPerHour),pipsPerHour=Number.isFinite(signed)?signed:null,support=rateFluctuationEventSupport(row,timeframe||row.timeframe);
      return{pair:row.pair,timeframe:row.timeframe,signal:Number(row.signal)||0,regime:row.regime||"NEUTRAL",pipsPerHour,absolutePipsPerHour:pipsPerHour===null?null:Math.abs(pipsPerHour),supportingSource:support.supportingSource,supportingEventMagnitudePips:support.supportingEventMagnitudePips,supportingFinalEvents:support.supportingFinalEvents,supportingMagnitudeEvents:support.supportingMagnitudeEvents,supportingHistoryBars:support.supportingHistoryBars,supportingHistoryTarget:support.supportingHistoryTarget,eventLength:support.eventLength,configurationSource:support.configurationSource,supportingConfigurationSource:support.supportingConfigurationSource,supportingStatus:support.supportingStatus,supportingError:support.supportingError,corroborated:Boolean(support.corroborated)};
    });
    rows.sort((a,b)=>{const ar=Number.isFinite(a.absolutePipsPerHour)?a.absolutePipsPerHour:-Infinity,br=Number.isFinite(b.absolutePipsPerHour)?b.absolutePipsPerHour:-Infinity;if(br!==ar)return br-ar;const am=Number.isFinite(a.supportingEventMagnitudePips)?a.supportingEventMagnitudePips:-Infinity,bm=Number.isFinite(b.supportingEventMagnitudePips)?b.supportingEventMagnitudePips:-Infinity;if(bm!==am)return bm-am;return String(a.pair).localeCompare(String(b.pair));});
    return rows.map((row,index)=>({...row,rank:index+1}));
  }

  async function rateFluctuationExportPayload(){
    const select=typeof document!=="undefined"?document.getElementById("evalTableTfFilter"):null,timeframe=state.evaluationTableTimeframe||select?.value||null;
    await hydrateRateFluctuationEventSupport(timeframe,{retryErrors:true});
    const rows=rateFluctuationRows(timeframe),statusCounts={};for(const row of rows)statusCounts[row.supportingStatus]=(statusCounts[row.supportingStatus]||0)+1;
    return{facility:"Rate Fluctuation Ranking",version:RATE_FLUCTUATION_VERSION,analyticalFacilitiesVersion:VERSION,exportedAt:new Date().toISOString(),timeframe:rows[0]?.timeframe||timeframe,indicator:state.selectedScheduleStrategy||null,pairCount:typeof INSTRUMENTS!=="undefined"?INSTRUMENTS.length:rows.length,rowCount:rows.length,rankingRule:"Descending absolute Evaluation Table pips-per-hour; median absolute FINAL Event Outcome Ledger P/L breaks exact rate ties when available.",supportingEventMagnitudeDefinition:"Median absolute profitPips across FINAL HTL Asset Event Outcome Ledger records for the same pair/timeframe using the optimizer-backed HTL length and the maximum 5,000-candle analytical history path.",supportingHistoryContract:"Same loadEventRow path as Event Ledger · Result / Profit, requested at MAX_ANALYTICAL_HISTORY; shallow Evaluation priceCache is not used for corroboration.",corroboratedPairCount:rows.filter(row=>row.corroborated).length,supportStatusCounts:statusCounts,rows};
  }

  function ensureRateFluctuationFacility(){
    if(typeof document==="undefined")return null;
    const container=document.getElementById("evaluationTableContainer");if(!container)return null;let facility=document.getElementById("rateFluctuationRanking");
    if(!facility){facility=document.createElement("details");facility.id="rateFluctuationRanking";facility.className="data-details";facility.open=true;facility.innerHTML='<summary>Rate Fluctuation Ranking · 28 Currency Pairs</summary><div class="panel-head"><div class="panel-title"><h2>Rate Fluctuation Ranking</h2><p id="rateFluctuationScope">Awaiting Evaluation Table data.</p></div><div class="head-controls" id="rateFluctuationControls"></div></div><div class="performance-wrap"><table class="performance-table"><thead><tr><th>Rank</th><th>Pair</th><th>TF</th><th>Signal</th><th>Pips/Hr</th><th>|Pips/Hr|</th><th>Median |Event P/L|</th><th>FINAL events</th><th>P/L n</th><th>History</th><th>HTL length</th><th>Support</th><th>Regime</th></tr></thead><tbody id="rateFluctuationBody"><tr><td colspan="13">Awaiting Evaluation Table data.</td></tr></tbody></table></div>';container.appendChild(facility);}
    addExportButton(document.getElementById("rateFluctuationControls"),"exportRateFluctuationJson","rate-fluctuation-ranking",rateFluctuationExportPayload);return facility;
  }

  function renderRateFluctuationRanking(startHydration=true){
    ensureRateFluctuationFacility();if(typeof document==="undefined")return;const body=document.getElementById("rateFluctuationBody"),scope=document.getElementById("rateFluctuationScope");if(!body)return;
    const rows=rateFluctuationRows(),expected=typeof INSTRUMENTS!=="undefined"?INSTRUMENTS.length:rows.length,timeframe=rows[0]?.timeframe||state.evaluationTableTimeframe||document.getElementById("evalTableTfFilter")?.value||"—",fmt=(value,digits=1)=>Number.isFinite(value)?Number(value).toFixed(digits):"—",count=value=>Number.isFinite(Number(value))?String(Number(value)):"—",supportLabel=status=>String(status||"PENDING").replaceAll("_"," "),corroborated=rows.filter(row=>row.corroborated).length;
    if(scope)scope.textContent=`${timeframe} · ${rows.length} / ${expected} pairs · rank by |Pips/Hr| · ${corroborated} corroborated by maximum-history FINAL event outcomes`;
    body.innerHTML=rows.map(row=>{const waiting=row.supportingStatus==="PENDING"||row.supportingStatus==="LOADING",magnitude=waiting?"…":fmt(row.supportingEventMagnitudePips),history=Number.isFinite(row.supportingHistoryBars)?`${row.supportingHistoryBars}/${row.supportingHistoryTarget}`:`—/${row.supportingHistoryTarget}`;return `<tr><td><b>${row.rank}</b></td><td><b>${formatPair(row.pair)}</b></td><td>${row.timeframe}</td><td class="${typeof directionClass==="function"?directionClass(row.signal):""}">${typeof signalWord==="function"?signalWord(row.signal):(row.signal>0?"BUY":row.signal<0?"SELL":"HOLD")}</td><td>${fmt(row.pipsPerHour)}</td><td><b>${fmt(row.absolutePipsPerHour)}</b></td><td>${magnitude}</td><td>${count(row.supportingFinalEvents)}</td><td>${count(row.supportingMagnitudeEvents)}</td><td>${history}</td><td>${row.eventLength??"—"}</td><td title="${String(row.supportingError||"").replaceAll('"','&quot;')}">${supportLabel(row.supportingStatus)}</td><td>${String(row.regime||"NEUTRAL").replaceAll("_"," ")}</td></tr>`;}).join("")||'<tr><td colspan="13">Awaiting synchronized Evaluation Table data.</td></tr>';
    if(startHydration&&rows.some(row=>row.supportingStatus==="PENDING")&&typeof marketDataReady==="function"&&marketDataReady()&&scheduleCoverageReady())queueMicrotask(()=>void hydrateRateFluctuationEventSupport(timeframe));
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

  async function eventLedgerExportPayload(){
    const pair=eventLedgerSelectedPair(),timeframe=state.selectedTimeframe||currentEventTimeframe();let row=state.eventLedgerSelectedRow||null;
    if(!row||row.pair!==pair||state.eventLedgerTimeframe!==timeframe)row=await loadSelectedEventLedger();
    const config=optimizerAssetConfiguration(pair,timeframe),events=row?.eventList||[];
    return{facility:"Event Ledger",version:VERSION,exportedAt:new Date().toISOString(),pair,timeframe,pairSelection:state.eventLedgerPairSelection||EVENT_LEDGER_FOLLOW,length:row?.length??config.length,filter:row?.filter??config.filter,configurationSource:row?.configurationSource||config.source,configurationComputedAt:row?.configurationComputedAt||config.computedAt||null,events};
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
    ensureEventLedgerPairControl();ensureRateFluctuationFacility();
    addExportButton(document.querySelector("#evaluationTableContainer .head-controls"),"exportEvaluationJson","evaluation-table",evaluationExportPayload);
    addExportButton(document.querySelector("#platformDiagnosticDetails .date-range-controls"),"exportPlatformDiagnosticJson","platform-diagnostic",diagnosticExportPayload);
    const macroHeading=[...document.querySelectorAll("#performancePanel .panel-head")].find(node=>node.querySelector("h2")?.textContent.trim().startsWith("Macro:"));if(macroHeading){let controls=macroHeading.querySelector(".head-controls");if(!controls){controls=document.createElement("div");controls.className="head-controls";macroHeading.appendChild(controls);}addExportButton(controls,"exportMacroPerformanceJson","macro-performance",macroExportPayload);}
    const ledger=eventOutcomeLedgerDetails();if(ledger){let controls=ledger.querySelector(":scope > .head-controls");if(!controls){controls=document.createElement("div");controls.className="head-controls";controls.style.padding="7px 10px";ledger.querySelector("summary")?.insertAdjacentElement("afterend",controls);}addExportButton(controls,"exportEventLedgerJson","event-ledger",eventLedgerExportPayload);}
    addExportButton(document.querySelector("#htlScheduleComposition .event-controls")||document.querySelector("#eventPanel .event-controls"),"exportHtlScheduleJson","htl-schedule",htlScheduleExportPayload);
    addExportButton(document.getElementById("scheduleTitle")?.closest(".panel-head")?.querySelector(".head-controls"),"exportTimeframeSignalScheduleJson","timeframe-signal-schedule",timeframeSignalScheduleExportPayload);
  }

  async function preloadEvaluationTable(force=false){
    if(typeof marketDataReady!=="function"||!marketDataReady()||typeof preloadEvaluationTimeframe!=="function"||!scheduleCoverageReady())return false;
    const timeframe=document.getElementById("evalTableTfFilter")?.value||"H1";
    if(!force&&state.evaluationTableTimeframe===timeframe&&(state.evaluationTableData||[]).length===INSTRUMENTS.length)return true;
    if(evaluationPreloadPromise&&evaluationPreloadKey===timeframe)return evaluationPreloadPromise;
    evaluationPreloadKey=timeframe;evaluationPreloadPromise=(async()=>{await preloadEvaluationTimeframe(timeframe);return true;})().finally(()=>{evaluationPreloadPromise=null;});return evaluationPreloadPromise;
  }

  function installRuntime(){
    if(typeof loadOptimizerEventLedger==="function"){loadOptimizerEventLedger=async function(){return loadSelectedEventLedger();};}
    if(typeof renderEvaluationTable==="function"){const prior=renderEvaluationTable;renderEvaluationTable=function(){const result=prior();renderRateFluctuationRanking();return result;};}
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
      const prior=loadSchedule;loadSchedule=async function(mode="full"){const result=await prior(mode);if(scheduleCoverageReady())void preloadEvaluationTable();return result;};
    }
    document.getElementById("eventPair")?.addEventListener("change",()=>syncSelectedEventConfiguration());
    document.getElementById("eventTimeframe")?.addEventListener("change",()=>syncSelectedEventConfiguration());
  }

  function install(){ensureEventFilterControl();ensureEventScheduleHeaders();ensureEventLedgerPairControl();ensureRateFluctuationFacility();syncSelectedEventConfiguration();installRuntime();installExportButtons();renderRateFluctuationRanking();if(typeof marketDataReady==="function"&&marketDataReady()&&scheduleCoverageReady())void preloadEvaluationTable();}

  const api=Object.freeze({VERSION,RATE_FLUCTUATION_VERSION,optimizerAssetConfiguration,cleanEventScheduleRow,evaluationExportPayload,diagnosticExportPayload,macroExportPayload,eventLedgerExportPayload,htlScheduleExportPayload,timeframeSignalScheduleExportPayload,eventLedgerSelectedPair,rateFluctuationRows,rateFluctuationExportPayload,hydrateRateFluctuationEventSupport,scheduleDatasetTotal,scheduleCoverageReady,preloadEvaluationTable});
  global.CTEAnalyticalFacilities=api;
  if(typeof document!=="undefined"){if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",install,{once:true});else queueMicrotask(install);}
})(globalThis);