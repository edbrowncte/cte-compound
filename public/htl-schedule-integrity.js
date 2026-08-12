(function installHtlScheduleIntegrity(global){
  "use strict";

  const VERSION="CTE_HTL_SCHEDULE_INTEGRITY@1.0.0";
  const MIN_DURATION_VALIDATION_SAMPLES=8;
  const MIN_COMPLETION_VALIDATION_SAMPLES=8;
  const MIN_OUTLIER_TRIM_SAMPLES=10;
  const MAD_SIGMA=1.4826;
  const MAD_LIMIT=4.5;

  const mean=values=>values.length?values.reduce((sum,value)=>sum+value,0)/values.length:null;
  const median=values=>{if(!values.length)return null;const ordered=[...values].sort((a,b)=>a-b),middle=Math.floor(ordered.length/2);return ordered.length%2?ordered[middle]:(ordered[middle-1]+ordered[middle])/2;};

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
    const center=median(values),absoluteDeviations=values.map(value=>Math.abs(value-center)),mad=median(absoluteDeviations);
    if(!Number.isFinite(mad)||mad<=0)return{retained:errors.slice(),excluded:[],threshold:null,medianError:center,mad};
    const threshold=center+(MAD_LIMIT*MAD_SIGMA*mad),retained=[],excluded=[];
    for(const item of errors)(item.errorBars<=threshold?retained:excluded).push(item);
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

  function install(){
    if(typeof buildEventRow!=="function")return false;
    const prior=buildEventRow;
    const wrapped=function(...args){return applyIntegrity(prior(...args));};
    buildEventRow=wrapped;global.buildEventRow=wrapped;return true;
  }

  global.CTEHtlScheduleIntegrity=Object.freeze({VERSION,MIN_DURATION_VALIDATION_SAMPLES,MIN_COMPLETION_VALIDATION_SAMPLES,MIN_OUTLIER_TRIM_SAMPLES,durationErrorSeries,trimDurationErrors,scheduleValidation,applyIntegrity});
  if(typeof document!=="undefined"){if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",install,{once:true});else queueMicrotask(install);}
})(globalThis);
