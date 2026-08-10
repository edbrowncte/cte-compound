(function installIOIIOMChartIndicators(global){
  "use strict";

  const VERSION="CTE_CHART_IOI_IOM@1.0.2";
  const CHART_ONLY_IDS=new Set(["IOI","IOM"]);
  const PREFERENCE_KEY="cte-compound.chart-only-indicator";
  const cache=new Map();

  const isFinite=value=>value!==null&&value!==undefined&&value!==""&&Number.isFinite(Number(value));

  function pairAverage(left=[],right=[]){
    const size=Math.max(left.length||0,right.length||0);
    return Array.from({length:size},(_,index)=>isFinite(left[index])&&isFinite(right[index])?(Number(left[index])+Number(right[index]))/2:null);
  }

  function rollingMeanStd(values=[],length=10){
    const size=values.length,period=Math.max(2,Math.trunc(Number(length)||10)),mean=Array(size).fill(null),std=Array(size).fill(null);
    let sum=0,sum2=0,bad=0;
    for(let index=0;index<size;index++){
      const incoming=values[index];
      if(isFinite(incoming)){const value=Number(incoming);sum+=value;sum2+=value*value;}else bad++;
      if(index>=period){const outgoing=values[index-period];if(isFinite(outgoing)){const value=Number(outgoing);sum-=value;sum2-=value*value;}else bad--;}
      if(index>=period-1&&!bad){const center=sum/period,variance=Math.max(0,sum2/period-center*center);mean[index]=center;std[index]=Math.sqrt(variance);}
    }
    return{mean,std};
  }

  function buildIoiIom(candles=[],htl={},length=10){
    const close=candles.map(candle=>isFinite(candle?.close)?Number(candle.close):null),asset=Array.isArray(htl?.asset)?htl.asset:[],inverse=Array.isArray(htl?.inverse)?htl.inverse:[];
    const ioi=pairAverage(close,asset),ioiInverse=pairAverage(close,inverse),ioiMean=pairAverage(ioi,ioiInverse),stats=rollingMeanStd(ioiMean,length),iomZ=ioiMean.map((value,index)=>isFinite(value)&&isFinite(stats.mean[index])&&isFinite(stats.std[index])&&Number(stats.std[index])>1e-12?(Number(value)-Number(stats.mean[index]))/Number(stats.std[index]):null),iomInverse=iomZ.map((z,index)=>isFinite(z)&&isFinite(stats.std[index])&&isFinite(stats.mean[index])?(-Number(z)*Number(stats.std[index]))+Number(stats.mean[index]):null);
    return{ioi,ioiInverse,ioiMean,iomCenter:stats.mean,iomStd:stats.std,iomZ,iomInverse};
  }

  function crossSignalSeries(candles=[],left=[],right=[],filter=0){
    const threshold=Math.max(0,Number(filter)||0),signals=[];let owner=0,current=0;
    for(let index=0;index<candles.length;index++){
      const spread=isFinite(left[index])&&isFinite(right[index])?Number(left[index])-Number(right[index]):NaN,direction=Number.isFinite(spread)?spread>threshold?1:spread<-threshold?-1:0:0;
      current=direction;
      if(direction&&direction!==owner){signals.push({index,direction,time:candles[index]?.time,price:candles[index]?.close,current:false});owner=direction;}
    }
    const lastIndex=candles.length-1;if(current&&lastIndex>=0&&signals.at(-1)?.index!==lastIndex)signals.push({index:lastIndex,direction:current,time:candles[lastIndex]?.time,price:candles[lastIndex]?.close,current:true});
    return signals;
  }

  function latestOutput(strategy,indicators,filter=0){
    const left=strategy==="IOI"?indicators.ioi:indicators.ioiMean,right=strategy==="IOI"?indicators.ioiInverse:indicators.iomInverse,threshold=Math.max(0,Number(filter)||0);let index=Math.max(left?.length||0,right?.length||0)-1;
    while(index>=0&&(!isFinite(left?.[index])||!isFinite(right?.[index])))index--;
    if(index<0)return{direction:0,score:0,confidence:null,regime:strategy==="IOI"?"IOI CROSS":"IOM CROSS",metrics:{}};
    const spread=Number(left[index])-Number(right[index]),direction=spread>threshold?1:spread<-threshold?-1:0;
    return{direction,score:spread,confidence:null,regime:strategy==="IOI"?"IOI CROSS":"IOM CROSS",metrics:strategy==="IOI"?{ioi:left[index],ioiInverse:right[index],spread}:{iomMean:left[index],iomInverse:right[index],iomZ:indicators.iomZ?.[index],spread}};
  }

  function buildSelected(candles,length,strategy,filter=0){
    const data=Array.isArray(candles)?candles:[],resolvedLength=Math.max(3,Math.min(Number(global.MAX_ANALYTICAL_LENGTH)||500,Math.trunc(Number(length)||10))),last=data.at(-1)?.time||"",key=`${strategy}|${resolvedLength}|${data.length}|${last}`;
    let indicators=cache.get(key);
    if(!indicators){
      const htl=global.CTEChartIndicatorOwnership?.selectedHtlCausal?.(data,resolvedLength);if(!htl)throw new Error("HTL Asset prerequisite is unavailable for IOI/IOM");
      indicators=buildIoiIom(data,htl,resolvedLength);cache.set(key,indicators);while(cache.size>8)cache.delete(cache.keys().next().value);
    }
    const left=strategy==="IOI"?indicators.ioi:indicators.ioiMean,right=strategy==="IOI"?indicators.ioiInverse:indicators.iomInverse,signals=crossSignalSeries(data,left,right,filter);
    return{indicators,signals,latest:latestOutput(strategy,indicators,filter)};
  }

  function installDefinitions(){
    if(typeof CHART_INDICATORS==="undefined")return false;
    CHART_INDICATORS.IOI={price:[["ioi","IOI","#d7a85c"],["ioiInverse","IOI Inverse","#7dc4ff"]],z:[],osc:[]};
    CHART_INDICATORS.IOM={price:[["ioiMean","IOM Mean","#7c3aed"],["iomInverse","IOM Inverse","#db2777"]],z:[],osc:[]};
    return true;
  }

  function installSelector(){
    if(typeof document==="undefined")return false;const selector=document.getElementById("chartStrategy");if(!selector)return false;
    for(const [value,label] of [["IOI","IOI · Indicator Only Indicator"],["IOM","IOM · Indicator Only Mean"]])if(!selector.querySelector(`option[value="${value}"]`)){const option=document.createElement("option");option.value=value;option.textContent=label;selector.appendChild(option);}
    try{const saved=global.localStorage?.getItem(PREFERENCE_KEY);if(CHART_ONLY_IDS.has(saved)){selector.value=saved;if(typeof state!=="undefined")state.selectedStrategy=saved;}}
    catch{}
    selector.addEventListener("change",()=>{try{if(CHART_ONLY_IDS.has(selector.value))global.localStorage?.setItem(PREFERENCE_KEY,selector.value);else global.localStorage?.removeItem(PREFERENCE_KEY);}catch{}});
    return true;
  }

  function renderChartOnly(strategy){
    const data=Array.isArray(state?.chartCandles)?state.chartCandles:[],pair=state.selectedInstrument,length=Math.max(3,Math.min(Number(global.MAX_ANALYTICAL_LENGTH)||500,Math.trunc(Number(document.getElementById("chartLength")?.value)||10))),filter=Math.max(0,Number(document.getElementById("chartFilter")?.value)||0),built=buildSelected(data,length,strategy,filter),canvas=document.getElementById("chart"),definition=CHART_INDICATORS[strategy],live=state.offsetBars===0?liveMid(pair):NaN;
    if(!canvas||!global.CTEUnifiedChart?.render)throw new Error("Unified chart renderer did not initialize");
    const result=global.CTEUnifiedChart.render({canvas,candles:data,indicators:built.indicators,indicatorSet:definition,signals:built.signals,visibleBars:state.visibleBars,offsetBars:state.offsetBars,leftIndent:state.leftIndent,rightIndent:state.rightIndent,crosshairEnabled:state.crosshairEnabled,crosshair:state.crosshair,livePrice:live,formatPrice:value=>formatPrice(value,pair)}),latestIndex=data.length-1,legend=document.getElementById("indicatorLegend"),message=document.getElementById("chartMessage");
    if(legend)legend.innerHTML=(definition.price||[]).map(([key,label,color])=>{const value=built.indicators[key]?.[latestIndex];return`<span><i style="background:${color}"></i>${label} ${isFinite(value)?Number(value).toFixed(5):"—"}</span>`;}).join("");
    if(message&&data.length)message.hidden=true;
    return{...built,result};
  }

  function installRuntime(){
    if(typeof drawChart!=="function"||typeof refreshCausalChartAnalysis!=="function")return false;
    const priorDraw=drawChart,priorRefresh=refreshCausalChartAnalysis;
    drawChart=function(){
      const strategy=state?.selectedStrategy;if(!CHART_ONLY_IDS.has(strategy))return priorDraw();
      try{renderChartOnly(strategy);}catch(error){const message=document.getElementById("chartMessage");console.error(`${strategy} chart render failed:`,error);if(message){message.hidden=false;message.textContent=`${strategy} overlay unavailable · ${error.message||error}`;}}
      try{drawOscillatorChart();}catch(error){console.error("MAS / IM auxiliary chart render failed:",error);}
      try{drawWeeklyCognition(state.selectedInstrument,state.evalMasImMetrics);}catch(error){console.error("Weekly cognition auxiliary chart render failed:",error);}
    };
    refreshCausalChartAnalysis=async function(instrument,timeframe,candles,configuration,strategy){
      if(!CHART_ONLY_IDS.has(strategy))return priorRefresh(instrument,timeframe,candles,configuration,strategy);
      const token=++state.chartCausalToken;await new Promise(resolve=>requestAnimationFrame(resolve));if(token!==state.chartCausalToken||instrument!==state.selectedInstrument||timeframe!==state.selectedTimeframe||strategy!==state.selectedStrategy)return;
      const length=Math.max(3,Math.min(Number(global.MAX_ANALYTICAL_LENGTH)||500,Math.trunc(Number(document.getElementById("chartLength")?.value)||10))),filter=Math.max(0,Number(document.getElementById("chartFilter")?.value)||0),built=buildSelected(candles,length,strategy,filter);
      state.chartAnalysis={latest:{[strategy]:built.latest}};state.chartCausalIndicators=built.indicators;state.chartCausalSeries=built.signals;updateChartSummary();updateCompartments();drawChart();
    };
    return true;
  }

  function install(){installDefinitions();installSelector();installRuntime();if(CHART_ONLY_IDS.has(state?.selectedStrategy)&&state?.chartCandles?.length){drawChart();void refreshCausalChartAnalysis(state.selectedInstrument,state.selectedTimeframe,state.chartCandles,null,state.selectedStrategy);}}

  if(typeof document!=="undefined"){if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",install,{once:true});else queueMicrotask(install);}
  global.CTEChartIOIIOM=Object.freeze({VERSION,CHART_ONLY_IDS,buildIoiIom,rollingMeanStd,pairAverage,crossSignalSeries,latestOutput});
})(globalThis);
