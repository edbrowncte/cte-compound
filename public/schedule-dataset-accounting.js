(function installScheduleDatasetAccounting(root){
  "use strict";

  const VERSION="CTE_SCHEDULE_DATASET_ACCOUNTING@1.0.0";

  function compactFailure(key,value={}){
    return{
      key:String(key||""),
      instrument:value.instrument||null,
      timeframe:value.timeframe||null,
      error:String(value.error||"Schedule dataset failure"),
      attempts:Number(value.attempts||0),
    };
  }

  function scheduleFailureAccounting(failures,evaluations){
    const unresolved=[],refreshWarnings=[];
    if(failures&&typeof failures.entries==="function"){
      for(const [key,value] of failures.entries()){
        const record=compactFailure(key,value),available=Boolean(evaluations&&typeof evaluations.has==="function"&&evaluations.has(key));
        (available?refreshWarnings:unresolved).push(record);
      }
    }
    return{
      version:VERSION,
      rawFailureCount:unresolved.length+refreshWarnings.length,
      unresolvedFailureCount:unresolved.length,
      refreshFailureCount:refreshWarnings.length,
      unresolved,
      refreshWarnings,
    };
  }

  class ScheduleFailureMap extends Map{
    constructor(entries=[],evaluationsProvider=null){super(entries);this.evaluationsProvider=typeof evaluationsProvider==="function"?evaluationsProvider:()=>typeof state!=="undefined"?state.scheduleEvaluations:null;}
    accounting(){return scheduleFailureAccounting(this,this.evaluationsProvider());}
    get size(){return this.accounting().unresolvedFailureCount;}
    get rawSize(){return this.accounting().rawFailureCount;}
  }

  function installFailureMap(){
    if(typeof state==="undefined"||!(state.scheduleFailures instanceof Map)||state.scheduleFailures instanceof ScheduleFailureMap)return false;
    state.scheduleFailures=new ScheduleFailureMap(state.scheduleFailures,()=>state.scheduleEvaluations);
    return true;
  }

  function diagnosticAccounting(){
    if(typeof state==="undefined")return null;
    return scheduleFailureAccounting(state.scheduleFailures,state.scheduleEvaluations);
  }

  function augmentDiagnostic(){
    if(typeof state==="undefined"||!state.diagnosticLast)return false;
    const accounting=diagnosticAccounting();if(!accounting)return false;
    const diagnostic=state.diagnosticLast,assessment=diagnostic.server?.browserAssessment,schedule=assessment?.schedule;
    if(schedule){Object.assign(schedule,{datasetAccountingVersion:VERSION,rawFailureCount:accounting.rawFailureCount,unresolvedFailureCount:accounting.unresolvedFailureCount,refreshFailureCount:accounting.refreshFailureCount,unresolvedFailures:accounting.unresolved,refreshWarnings:accounting.refreshWarnings});}
    if(assessment?.failure?.stage==="BROWSER_SCHEDULE_DATA")assessment.failure.error=`${schedule?.coverage??0} / ${schedule?.total??0} datasets · ${accounting.unresolvedFailureCount} unresolved · ${accounting.refreshFailureCount} refresh warning${accounting.refreshFailureCount===1?"":"s"}${schedule?.loading?" · loading":""}`;
    const entry=diagnostic.entries?.find(item=>item.label==="Schedule datasets");
    if(entry)entry.value=`${schedule?.coverage??0} / ${schedule?.total??0} · ${accounting.unresolvedFailureCount} unresolved · ${accounting.refreshFailureCount} refresh warning${accounting.refreshFailureCount===1?"":"s"}${schedule?.loading?" · loading":""}`;
    const identities=[...accounting.unresolved,...accounting.refreshWarnings].map(item=>`${item.key} · ${item.error}`).join(" | ")||"None";
    const identityEntry={label:"Schedule failure identities",value:identities,good:accounting.unresolvedFailureCount===0};
    const existing=diagnostic.entries?.findIndex(item=>item.label===identityEntry.label)??-1;if(existing>=0)diagnostic.entries[existing]=identityEntry;else diagnostic.entries?.push(identityEntry);
    if(typeof diagnosticCards==="function")diagnosticCards(diagnostic.entries||[]);
    return true;
  }

  function installDiagnosticWrapper(){
    if(typeof runPlatformDiagnostic!=="function"||runPlatformDiagnostic?.cteScheduleDatasetAccounting)return false;
    const prior=runPlatformDiagnostic,wrapped=async function(...args){const result=await prior(...args);augmentDiagnostic();return result;};
    Object.defineProperty(wrapped,"cteScheduleDatasetAccounting",{value:true});
    root.runPlatformDiagnostic=wrapped;try{runPlatformDiagnostic=wrapped;}catch{}return true;
  }

  function install(){installFailureMap();installDiagnosticWrapper();}
  root.CTEScheduleDatasetAccounting=Object.freeze({VERSION,compactFailure,scheduleFailureAccounting,ScheduleFailureMap,diagnosticAccounting,augmentDiagnostic,installFailureMap,installDiagnosticWrapper,install});
  if(typeof document!=="undefined"){if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",install,{once:true});else queueMicrotask(install);}
})(typeof globalThis!=="undefined"?globalThis:self);
