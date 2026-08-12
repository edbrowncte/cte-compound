(function installHtlScheduleIntegrity(global){
  "use strict";

  const VERSION="CTE_HTL_SCHEDULE_INTEGRITY@1.1.0";
  const SURVIVAL_VERSION="CTE_HTL_EVENT_SURVIVAL@1.0.0";
  const MIN_DURATION_VALIDATION_SAMPLES=8;
  const MIN_COMPLETION_VALIDATION_SAMPLES=8;
  const MIN_OUTLIER_TRIM_SAMPLES=10;
  const MAD_SIGMA=1.4826;
  const MAD_LIMIT=4.5;
  const DEFAULT_ADDITIONAL_LIFE_BARS=5;
  const SURVIVAL_HORIZONS=Object.freeze([1,5,10,18]);

  const mean=values=>values.length?values.reduce((sum,value)=>sum+value,0)/values.length:null;
  const median=values=>{if(!values.length)return null;const ordered=[...values].sort((a,b)=>a-b),middle=Math.floor(ordered.length/2);return ordered.length%2?ordered[middle]:(ordered[middle-1]+ordered[middle])/2;};
  const quantile=(values,q)=>{if(!values.length)return null;const ordered=[...values].sort((a,b)=>a-b),position=(ordered.length-1)*q,base=Math.floor(position),fraction=position-base;return ordered[base+1]===undefined?ordered[base]:ordered[base]+fraction*(ordered[base+1]-ordered[base]);};
  const finiteNumber=value=>{const number=Number(value);return Number.isFinite(number)?number:null;};
  const formatNumber=(value,digits=2)=>Number.isFinite(Number(value))?Number(value).toFixed(digits):"—";
  const formatPercent=value=>Number.isFinite(Number(value))?`${(Number(value)*100).toFixed(1)}%`:"—";

  function durationErrorSeries(events){
    const completed=(events||[]).filter(event=>event?.status==="FINAL"),errors=[];
    for(let index=5;index<completed.length;index++){
      const prior=completed.slice(0,index),target=completed[index],matching=prior.filter(event=>event.direction===target.direction);
      if(matching.length<2)continue;
      const forecast=median(matching.map(event=>Number(event.bars)).filter(Number.isFinite));
      if(!Number.isFinite(forecast)||!Number.isFinite(Number(target.bars)))continue;
      errors.push({eventNumber:target.number??index+1,direction:target.direction,targetBars:Number(target.bars),forecastBars:forecast,errorBars:Math.abs(Number(target.bars)-forecast)});
    }
    return{completed,errors};
  }

  function trimDurationErrors(errors){
    const values=errors.map(item=>item.errorBars).filter(Number.isFinite);
    if(values.length<MIN_OUTLIER_TRIM_SAMPLES)return{retained:errors.slice(),excluded:[],threshold:null,medianError:median(values),mad:null};
    const center=median(values),absoluteDeviations=values.map(value=>Math.abs(value-center)),mad=median(absoluteDeviations),q1=quantile(values,.25),q3=quantile(values,.75),iqr=Number.isFinite(q1)&&Number.isFinite(q3)?q3-q1:null;
    const threshold=Number.isFinite(mad)&&mad>0?center+(MAD_LIMIT*MAD_SIGMA*mad):Number.isFinite(q3)?q3+(3*Math.max(Number(iqr)||0,1)):null;
    if(!Number.isFinite(threshold))return{retained:errors.slice(),excluded:[],threshold:null,medianError:center,mad};
    const retained=[],excluded=[];for(const item of errors)(item.errorBars<=threshold?retained:excluded).push(item);
    if(retained.length<MIN_DURATION_VALIDATION_SAMPLES)return{retained:errors.slice(),excluded:[],threshold:null,medianError:center,mad};
    return{retained,excluded,threshold,medianError:center,mad};
  }

  function scheduleValidation(events){
    const all=Array.isArray(events)?events:[],current=all.at(-1)||null,{completed,errors}=durationErrorSeries(all),trimmed=trimDurationErrors(errors),durationValidationN=trimmed.retained.length,durationMae=durationValidationN>=MIN_DURATION_VALIDATION_SAMPLES?mean(trimmed.retained.map(item=>item.errorBars)):null;
    const same=current?completed.filter(event=>event.direction===current.direction):[],eligible=current?same.filter(event=>Number(event.bars)>Number(current.bars)):[],completionValidationN=eligible.length;
    const completionProbability=horizon=>completionValidationN>=MIN_COMPLETION_VALIDATION_SAMPLES?eligible.filter(event=>Number(event.bars)-Number(current.bars)<=horizon).length/completionValidationN:null;
    return{
      completedEvents:completed.length,
      provisionalEvents:all.length-completed.length,
      durationValidationN,
      durationValidationRawN:errors.length,
      durationOutliersExcluded:trimmed.excluded.length,
      durationOutlierThresholdBars:trimmed.threshold,
      durationMae,
      completionValidationN,
      completionWithin5Bars:current?completionProbability(5):null,
      completionWithin10Bars:current?completionProbability(10):null,
      durationStatus:durationValidationN>=MIN_DURATION_VALIDATION_SAMPLES?"SUFFICIENT":"INSUFFICIENT_SAMPLE",
      completionStatus:completionValidationN>=MIN_COMPLETION_VALIDATION_SAMPLES?"SUFFICIENT":"INSUFFICIENT_SAMPLE",
      excludedDurationEvents:trimmed.excluded,
    };
  }

  function applyIntegrity(row){
    if(!row?.eventList)return row;
    const validation=scheduleValidation(row.eventList),forecast=row.forecast?{...row.forecast}:null;
    if(forecast){forecast.durationMae=validation.durationMae;forecast.validationN=validation.durationValidationN;forecast.prob5=validation.completionWithin5Bars;forecast.prob10=validation.completionWithin10Bars;forecast.integrity=validation;}
    return{...row,durationMae:validation.durationMae,p5:validation.completionWithin5Bars,p10:validation.completionWithin10Bars,forecast,durationValidationN:validation.durationValidationN,durationValidationRawN:validation.durationValidationRawN,durationOutliersExcluded:validation.durationOutliersExcluded,durationOutlierThresholdBars:validation.durationOutlierThresholdBars,completionValidationN:validation.completionValidationN,durationValidationStatus:validation.durationStatus,completionValidationStatus:validation.completionStatus,scheduleIntegrityVersion:VERSION};
  }

  function describe(row){
    if(!row)return"";
    const duration=`Duration validation ${row.durationValidationN??0}/${row.durationValidationRawN??0}${row.durationOutliersExcluded?` · ${row.durationOutliersExcluded} robust outlier${row.durationOutliersExcluded===1?"":"s"} excluded`:""}`;
    const completion=`Completion sample ${row.completionValidationN??0}`;
    return `${duration} · ${completion} · FINAL events only`;
  }

  function normalizedExcursion(event){
    const direction=Math.sign(Number(event?.direction)||0),up=finiteNumber(event?.upBps),down=finiteNumber(event?.downBps);
    if(!direction||up===null||down===null)return{favorable:null,adverse:null,up,down};
    return direction>0
      ?{favorable:Math.max(0,up),adverse:Math.max(0,-down),up,down}
      :{favorable:Math.max(0,-down),adverse:Math.max(0,up),up,down};
  }

  function survivalStatistics(events,currentEvent,additionalLifeBars=DEFAULT_ADDITIONAL_LIFE_BARS){
    const current=currentEvent||events?.at?.(-1)||null,age=Math.max(1,Math.trunc(Number(current?.bars)||0)),direction=Math.sign(Number(current?.direction)||0),additional=Math.max(1,Math.trunc(Number(additionalLifeBars)||DEFAULT_ADDITIONAL_LIFE_BARS));
    if(!current||!direction||!age)return{direction,ageBars:age||null,additionalLifeBars:additional,n:0,historicalSurvival:null,meanBars:null,medianBars:null,meanFavorableMoveBps:null,meanAdverseMoveBps:null,medianUltimateUpsideBps:null,medianUltimateDownsideBps:null,p25UltimateUpsideBps:null,p25UltimateDownsideBps:null,survivalCurve:SURVIVAL_HORIZONS.map(horizon=>({additionalLifeBars:horizon,historicalSurvival:null}))};
    const eligible=(Array.isArray(events)?events:[]).filter(event=>event?.status==="FINAL"&&Math.sign(Number(event.direction)||0)===direction&&Number(event.bars)>=age),bars=eligible.map(event=>Number(event.bars)).filter(Number.isFinite),excursions=eligible.map(normalizedExcursion),favorable=excursions.map(item=>item.favorable).filter(Number.isFinite),adverse=excursions.map(item=>item.adverse).filter(Number.isFinite),up=excursions.map(item=>item.up).filter(Number.isFinite),down=excursions.map(item=>item.down).filter(Number.isFinite),survival=horizon=>eligible.length?eligible.filter(event=>Number(event.bars)>=age+horizon).length/eligible.length:null;
    return{
      direction,
      ageBars:age,
      additionalLifeBars:additional,
      n:eligible.length,
      historicalSurvival:survival(additional),
      meanBars:mean(bars),
      medianBars:median(bars),
      meanFavorableMoveBps:mean(favorable),
      meanAdverseMoveBps:mean(adverse),
      medianUltimateUpsideBps:median(up),
      medianUltimateDownsideBps:median(down),
      p25UltimateUpsideBps:quantile(up,.25),
      p25UltimateDownsideBps:quantile(down,.25),
      survivalCurve:SURVIVAL_HORIZONS.map(horizon=>({additionalLifeBars:horizon,historicalSurvival:survival(horizon)})),
    };
  }

  function normalizeHorizons(horizons){
    const input=Array.isArray(horizons)?horizons:horizons===undefined?SURVIVAL_HORIZONS:[horizons];
    return [...new Set(input.map(value=>Math.max(1,Math.trunc(Number(value)||0))).filter(Number.isFinite))].sort((a,b)=>a-b);
  }

  function buildSurvivalRows(rows,horizons=SURVIVAL_HORIZONS){
    const resolvedHorizons=normalizeHorizons(horizons),timeframe=typeof document!=="undefined"?document.getElementById("eventTimeframe")?.value||null:null;
    return (Array.isArray(rows)?rows:[]).flatMap(row=>{
      const events=Array.isArray(row?.eventList)?row.eventList:[],current=events.at(-1)||null,stats=survivalStatistics(events,current,DEFAULT_ADDITIONAL_LIFE_BARS),curve=new Map(stats.survivalCurve.map(item=>[item.additionalLifeBars,item.historicalSurvival]));
      return resolvedHorizons.map(horizon=>({
        pair:row?.pair||null,
        timeframe,
        currentEvent:stats.direction>0?"BUY":stats.direction<0?"SELL":null,
        currentEventOpen:finiteNumber(current?.openPrice??row?.eventOpen),
        currentPrice:finiteNumber(row?.price),
        currentAgeBars:stats.ageBars,
        additionalEventLifeBars:horizon,
        historicalSurvival:curve.has(horizon)?curve.get(horizon):(stats.n?(events.filter(event=>event?.status==="FINAL"&&Math.sign(Number(event.direction)||0)===stats.direction&&Number(event.bars)>=stats.ageBars+horizon).length/stats.n):null),
        n:stats.n,
        meanBars:stats.meanBars,
        medianBars:stats.medianBars,
        meanFavorableMoveBps:stats.meanFavorableMoveBps,
        meanAdverseMoveBps:stats.meanAdverseMoveBps,
        medianUltimateUpsideBps:stats.medianUltimateUpsideBps,
        medianUltimateDownsideBps:stats.medianUltimateDownsideBps,
        p25UltimateUpsideBps:stats.p25UltimateUpsideBps,
        p25UltimateDownsideBps:stats.p25UltimateDownsideBps,
      }));
    }).filter(row=>row.pair);
  }

  function survivalExportPayload(){
    const appState=typeof state!=="undefined"?state:null,timeframe=typeof document!=="undefined"?document.getElementById("eventTimeframe")?.value||null:null,rows=buildSurvivalRows(appState?.eventRows||[],SURVIVAL_HORIZONS);
    return{facility:"HTL Event Survival",version:SURVIVAL_VERSION,scheduleIntegrityVersion:VERSION,exportedAt:new Date().toISOString(),timeframe,horizons:[...SURVIVAL_HORIZONS],pairCount:new Set(rows.map(row=>row.pair)).size,rowCount:rows.length,basis:"FINAL same-direction events with total bars greater than or equal to the current event age",units:{bars:"bars",moves:"basis points from event open"},rows};
  }

  function downloadSurvivalJson(){
    if(typeof document==="undefined"||typeof Blob==="undefined"||typeof URL==="undefined")return false;
    const payload=survivalExportPayload(),date=new Date().toISOString().replace(/[:.]/g,"-"),blob=new Blob([JSON.stringify(payload,(_key,value)=>typeof value==="number"&&!Number.isFinite(value)?String(value):value,2)],{type:"application/json;charset=utf-8"}),url=URL.createObjectURL(blob),link=document.createElement("a");
    link.href=url;link.download=`cte-compound-htl-event-survival-${date}.json`;document.body.appendChild(link);link.click();link.remove();URL.revokeObjectURL(url);return true;
  }

  function ensureSurvivalPanel(){
    if(typeof document==="undefined")return null;
    let panel=document.getElementById("eventSurvivalAnalysis");if(panel)return panel;
    const eventPanel=document.getElementById("eventPanel"),anchor=document.getElementById("eventScheduleInterpretation");if(!eventPanel||!anchor)return null;
    panel=document.createElement("details");panel.id="eventSurvivalAnalysis";panel.className="event-ledger";panel.open=true;
    panel.innerHTML=`<summary>Historical Event Survival · Current Event Maturity</summary><div class="head-controls" style="padding:7px 10px;justify-content:flex-start"><button id="exportEventSurvivalJson" type="button">Export JSON</button><span class="event-note" id="eventSurvivalBasis">FINAL same-direction events conditioned on having reached the current event age · horizons +1 / +5 / +10 / +18 bars.</span></div><div class="event-table-wrap"><table class="event-table" id="eventSurvivalTable"><thead><tr><th>Currency pair</th><th>Current event</th><th>Age (bars)</th><th>Additional event life</th><th>Historical survival</th><th>n</th><th>Mean bars</th><th>Median bars</th><th>Mean favorable move</th><th>Mean adverse move</th><th>Median ultimate upside</th><th>Median ultimate downside</th><th>25th-pctl upside</th><th>25th-pctl downside</th></tr></thead><tbody id="eventSurvivalBody"></tbody></table></div>`;
    anchor.insertAdjacentElement("afterend",panel);
    document.getElementById("exportEventSurvivalJson")?.addEventListener("click",downloadSurvivalJson);
    return panel;
  }

  function renderSurvivalTable(){
    const panel=ensureSurvivalPanel(),body=typeof document!=="undefined"?document.getElementById("eventSurvivalBody"):null,appState=typeof state!=="undefined"?state:null;if(!panel||!body||!appState)return;
    const rows=buildSurvivalRows(appState.eventRows||[],SURVIVAL_HORIZONS);
    body.innerHTML=rows.length?rows.map(row=>`<tr data-survival-pair="${row.pair}" data-survival-horizon="${row.additionalEventLifeBars}"><td>${typeof formatPair==="function"?formatPair(row.pair):String(row.pair).replace("_","/")}</td><td class="${row.currentEvent==="BUY"?"buy":row.currentEvent==="SELL"?"sell":""}">${row.currentEvent||"—"}</td><td>${row.currentAgeBars??"—"}</td><td>+${row.additionalEventLifeBars} bars</td><td>${formatPercent(row.historicalSurvival)}</td><td>${row.n}</td><td>${formatNumber(row.meanBars,2)}</td><td>${formatNumber(row.medianBars,2)}</td><td>${formatNumber(row.meanFavorableMoveBps,2)} bps</td><td>${formatNumber(row.meanAdverseMoveBps,2)} bps</td><td>${formatNumber(row.medianUltimateUpsideBps,2)} bps</td><td>${formatNumber(row.medianUltimateDownsideBps,2)} bps</td><td>${formatNumber(row.p25UltimateUpsideBps,2)} bps</td><td>${formatNumber(row.p25UltimateDownsideBps,2)} bps</td></tr>`).join(""):`<tr><td colspan="14">Load the HTL Schedule to calculate survival statistics for all 28 pairs.</td></tr>`;
  }

  function annotateSchedule(){
    const body=document.getElementById("eventScheduleBody"),appState=typeof state!=="undefined"?state:null;if(!body||!appState)return;
    for(const tr of body.querySelectorAll("tr[data-pair]")){
      const row=(appState.eventRows||[]).find(item=>item.pair===tr.dataset.pair);if(!row)continue;
      const cells=tr.children;
      if(cells[5])cells[5].title=`Completion ≤5 · ${describe(row)}`;
      if(cells[6])cells[6].title=`Completion ≤10 · ${describe(row)}`;
      if(cells[8])cells[8].title=`Duration MAE · ${describe(row)}`;
    }
  }

  function install(){
    if(typeof buildEventRow!=="function")return false;
    const priorBuild=buildEventRow,wrappedBuild=function(...args){return applyIntegrity(priorBuild(...args));};buildEventRow=wrappedBuild;global.buildEventRow=wrappedBuild;
    if(typeof renderEventSchedule==="function"){const priorRender=renderEventSchedule;renderEventSchedule=function(...args){const result=priorRender(...args);annotateSchedule();renderSurvivalTable();return result;};global.renderEventSchedule=renderEventSchedule;}
    if(typeof renderEventDetail==="function"){const priorDetail=renderEventDetail;renderEventDetail=function(row,...args){const result=priorDetail(row,...args),method=document.getElementById("eventMethod");if(method&&row&&!method.textContent.includes("Duration validation"))method.textContent+=` · ${describe(row)}`;return result;};global.renderEventDetail=renderEventDetail;}
    ensureSurvivalPanel();renderSurvivalTable();
    return true;
  }

  global.CTEHtlScheduleIntegrity=Object.freeze({VERSION,SURVIVAL_VERSION,MIN_DURATION_VALIDATION_SAMPLES,MIN_COMPLETION_VALIDATION_SAMPLES,MIN_OUTLIER_TRIM_SAMPLES,DEFAULT_ADDITIONAL_LIFE_BARS,SURVIVAL_HORIZONS,durationErrorSeries,trimDurationErrors,scheduleValidation,applyIntegrity,describe,normalizedExcursion,survivalStatistics,buildSurvivalRows,survivalExportPayload,renderSurvivalTable});
  if(typeof document!=="undefined"){if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",install,{once:true});else queueMicrotask(install);}
})(globalThis);