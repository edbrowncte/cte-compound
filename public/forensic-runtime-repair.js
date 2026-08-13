(function installForensicRuntimeRepair(root){
  "use strict";

  const VERSION="CTE_FORENSIC_RUNTIME_REPAIR@1.0.0";
  const H=root.CTE_HORIZON_HTL;
  const finite=Number.isFinite;
  const mean=values=>values.length?values.reduce((sum,value)=>sum+value,0)/values.length:0;

  function pipScale(pair){return String(pair||"").endsWith("JPY")?100:10000;}

  function enrichedEventFeatures(data,htl,pair){
    const candles=Array.isArray(data)?data:[],crossings=Array.isArray(htl?.crossings)?htl.crossings:[],events=[],scale=pipScale(pair);
    crossings.forEach((crossing,position)=>{
      const end=position+1<crossings.length?crossings[position+1].index-1:candles.length-1;
      const status=position+1<crossings.length?"FINAL":"PROVISIONAL";
      const segment=candles.slice(crossing.index,end+1);
      if(!segment.length)return;
      const spreads=htl.asset.slice(crossing.index,end+1).map((value,index)=>value-htl.inverse[crossing.index+index]).filter(finite);
      const start=Number(segment[0]?.close),close=Number(segment.at(-1)?.close);
      const profitPips=finite(start)&&finite(close)?(close-start)*Number(crossing.direction||0)*scale:null;
      const result=status!=="FINAL"?"OPEN":finite(profitPips)?profitPips>.05?"WIN":profitPips<-.05?"LOSS":"FLAT":null;
      const highs=segment.map(candle=>Number(candle.high)).filter(finite),lows=segment.map(candle=>Number(candle.low)).filter(finite);
      const high=highs.length?Math.max(...highs):null,low=lows.length?Math.min(...lows):null,center=mean(spreads);
      const variance=spreads.length?mean(spreads.map(value=>(value-center)**2)):0;
      let slope=0;
      if(spreads.length>1){const xMean=(spreads.length-1)/2;let numerator=0,denominator=0;spreads.forEach((value,index)=>{numerator+=(index-xMean)*(value-center);denominator+=(index-xMean)**2;});slope=denominator?numerator/denominator:0;}
      events.push({
        number:position+1,
        calculationVersion:H?.VERSION||htl?.version||null,
        pair:pair||null,
        direction:crossing.direction,
        startIndex:crossing.index,
        endIndex:end,
        status,
        result,
        startTime:candles[crossing.index]?.time||crossing.time||null,
        endTime:candles[end]?.time||null,
        openPrice:finite(start)?start:null,
        closePrice:finite(close)?close:null,
        profitPips,
        bars:end-crossing.index+1,
        high,
        low,
        upBps:finite(start)&&start&&finite(high)?((high/start)-1)*10000:null,
        downBps:finite(start)&&start&&finite(low)?((low/start)-1)*10000:null,
        mean:center,
        variance,
        slope,
        area:spreads.reduce((sum,value)=>sum+Math.abs(value),0),
        sourceCrosses:Math.max(0,(htl.sourceTotal?.[end]||0)-(htl.sourceTotal?.[Math.max(0,crossing.index-1)]||0)),
        priorAsset:crossing.priorAsset??null,
        priorInverse:crossing.priorInverse??null,
        asset:crossing.asset??null,
        inverse:crossing.inverse??null,
      });
    });
    return events;
  }

  function normalizeSupportRecord(record){
    if(!record||typeof record!=="object")return record;
    const status=String(record.supportingStatus||""),bars=Number(record.supportingHistoryBars),target=Number(record.supportingHistoryTarget),finals=Number(record.supportingFinalEvents),magnitudes=Number(record.supportingMagnitudeEvents),gap=target-bars;
    if(status==="DEGRADED_HISTORY"&&!record.supportingError&&finite(bars)&&finite(target)&&gap>=0&&gap<=1&&finals>0&&magnitudes>0){
      return{...record,supportingStatus:"READY",corroborated:true,historyCompletion:"MAX_REQUEST_COMPLETED_CANDLES",historyCompletionGap:gap};
    }
    return record;
  }

  class RateFluctuationSupportMap extends Map{
    set(key,value){return super.set(key,normalizeSupportRecord(value));}
  }

  function installEventFeatures(){
    root.eventFeatures=enrichedEventFeatures;
    try{eventFeatures=enrichedEventFeatures;}catch{}
  }

  function installSupportCache(){
    if(typeof state==="undefined")return false;
    const replacement=new RateFluctuationSupportMap();
    const prior=state.rateFluctuationEventCache;
    if(prior instanceof Map)for(const[key,value]of prior)replacement.set(key,value);
    state.rateFluctuationEventCache=replacement;
    state.rateFluctuationSupportPromises=new Map();
    return true;
  }

  installEventFeatures();
  const install=()=>{installEventFeatures();installSupportCache();};
  root.CTEForensicRuntimeRepair=Object.freeze({VERSION,pipScale,enrichedEventFeatures,normalizeSupportRecord,RateFluctuationSupportMap,installEventFeatures,installSupportCache});
  if(typeof document!=="undefined"){if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",install,{once:true});else queueMicrotask(install);}
})(typeof globalThis!=="undefined"?globalThis:self);
