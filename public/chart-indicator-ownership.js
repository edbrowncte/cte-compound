(function installChartIndicatorOwnership(global){
  "use strict";

  const VERSION="CTE_CHART_INDICATOR_OWNERSHIP@1.0.3";
  const MAX_VISIBLE_HISTORY=MAX_ANALYTICAL_HISTORY;

  function ownedDefinition(strategy){
    const selected=CHART_INDICATORS[strategy]||CHART_INDICATORS.ASSET;
    return{
      price:[...(selected.price||[])],
      z:[...(selected.z||[])],
      osc:[...(selected.osc||[])]
    };
  }

  function selectedCross(left,right,index){
    if(index<1||!Array.isArray(left)||!Array.isArray(right))return 0;
    const values=[left[index],right[index],left[index-1],right[index-1]];
    if(!values.every(Number.isFinite))return 0;
    if(left[index]>right[index]&&left[index-1]<=right[index-1])return 1;
    if(left[index]<right[index]&&left[index-1]>=right[index-1])return -1;
    return 0;
  }

  function selectedHtlCausal(data,length){
    const series=htlCore(data,length),families=[
      ["HL2_UPR",series?.hl2,series?.upr],
      ["MUI_UI",series?.mui,series?.ui],
      ["ZUI_IUZ",series?.zui,series?.iuz]
    ],validFamilies=families.filter(([,left,right])=>Array.isArray(left)&&Array.isArray(right)),crosses=new Map();
    if(!validFamilies.length)throw new Error("HTL source families are unavailable for the selected chart");
    if(validFamilies.length!==families.length){
      const missing=families.filter(([,left,right])=>!Array.isArray(left)||!Array.isArray(right)).map(([name])=>name);
      console.warn(`Selected HTL chart skipped unavailable source family: ${missing.join(", ")}`);
    }
    for(let index=1;index<data.length;index++){
      const vote=validFamilies.reduce((sum,[,left,right])=>sum+selectedCross(left,right,index),0);
      if(vote)crosses.set(index,{index,direction:Math.sign(vote)});
    }
    const asset=Array(data.length).fill(null),inverse=Array(data.length).fill(null),assetMean=Array(data.length).fill(null),sourceTotal=Array(data.length).fill(0);let active=null,total=0;
    const begin=event=>({index:event.index,direction:event.direction,price:event.direction>0?data[event.index]?.high:data[event.index]?.low,extremeIndex:event.index});
    const update=(episode,index)=>{const candle=data[index];if(!candle)return;const price=episode.direction>0?candle.high:candle.low;if(!Number.isFinite(price))return;if((episode.direction>0&&price>episode.price)||(episode.direction<0&&price<episode.price)){episode.price=price;episode.extremeIndex=index;}};
    const first=Math.max(1,length*3-1),denominator=length*(length+1)/2;
    for(let index=0;index<data.length;index++){
      const event=crosses.get(index);if(event){total++;if(!active||event.direction!==active.direction)active=begin(event);}
      if(active)update(active,index);sourceTotal[index]=total;if(index<first||!active||!Number.isFinite(active.price))continue;
      asset[index]=active.price;const start=index-length+1;if(start<0)continue;const window=asset.slice(start,index+1);
      if(window.length!==length||!window.every(Number.isFinite))continue;const current=asset[index],mean=window.reduce((sum,value,position)=>sum+(position+1)*value,0)/denominator,average=window.reduce((sum,value)=>sum+value,0)/length,deviation=Math.sqrt(window.reduce((sum,value)=>sum+(value-average)**2,0)/length);assetMean[index]=mean;inverse[index]=deviation>0?(2*mean)-current:null;
    }
    return{asset,inverse,assetMean,sourceTotal,series,causal:true};
  }

  function assetSignalSeries(candles,htl,filter=0){
    const data=Array.isArray(candles)?candles:[],asset=Array.isArray(htl?.asset)?htl.asset:[],inverse=Array.isArray(htl?.inverse)?htl.inverse:[],threshold=Math.max(0,Number(filter)||0),signals=[];let prior=0;
    for(let index=0;index<data.length;index++){
      const left=asset[index],right=inverse[index],spread=Number.isFinite(left)&&Number.isFinite(right)?left-right:NaN,direction=Number.isFinite(spread)?spread>threshold?1:spread<-threshold?-1:0:0;
      if(direction&&direction!==prior)signals.push({index,direction,time:data[index]?.time,price:data[index]?.close,current:false});
      prior=direction;
    }
    const lastIndex=data.length-1;if(prior&&lastIndex>=0&&signals.at(-1)?.index!==lastIndex)signals.push({index:lastIndex,direction:prior,time:data[lastIndex]?.time,price:data[lastIndex]?.close,current:true});
    return signals;
  }

  function selectedIndicatorSet(candles,length,strategy){
    const data=Array.isArray(candles)?candles:[],resolvedLength=clamp(Math.round(Number(length)||10),3,MAX_ANALYTICAL_LENGTH),id=CHART_INDICATORS[strategy]?strategy:"ASSET";
    if(!data.length)return normalizeUnifiedIndicators(data,{});
    const htl=selectedHtlCausal(data,resolvedLength),selected={};

    if(id==="ASSET"){
      selected.asset=htl.asset;
      selected.inverse=htl.inverse;
    }else if(id==="DARE"){
      const meanAsset=htlPairAverage(htl.asset,htl.inverse),meanCenter=htlSeriesWma(meanAsset,resolvedLength);
      selected.meanAsset=meanAsset;
      selected.meanInverse=meanAsset.map((value,index)=>Number.isFinite(value)&&Number.isFinite(meanCenter[index])?(2*meanCenter[index])-value:null);
    }else if(id==="DARE_N"){
      const meanAsset=htlPairAverage(htl.asset,htl.inverse),meanCenter=htlSeriesWma(meanAsset,resolvedLength),meanInverse=meanAsset.map((value,index)=>Number.isFinite(value)&&Number.isFinite(meanCenter[index])?(2*meanCenter[index])-value:null);
      selected.dareNAsset=htlNorm(meanAsset,meanCenter,htlSeriesStdev(meanAsset,resolvedLength));
      selected.dareNInverse=htlNorm(meanInverse,htlSeriesWma(meanInverse,resolvedLength),htlSeriesStdev(meanInverse,resolvedLength));
    }else if(id==="NAI"){
      selected.naiAsset=htlNorm(htl.asset,htlSeriesWma(htl.asset,resolvedLength),htlSeriesStdev(htl.asset,resolvedLength));
      selected.naiInverse=htlNorm(htl.inverse,htlSeriesWma(htl.inverse,resolvedLength),htlSeriesStdev(htl.inverse,resolvedLength));
    }else if(id==="APEX"){
      selected.zup=Array.isArray(htl.series?.zup)?htl.series.zup:[];
      selected.puz=Array.isArray(htl.series?.puz)?htl.series.puz:[];
    }else if(id==="COMBO"){
      const meanAsset=htlPairAverage(htl.asset,htl.inverse),meanCenter=htlSeriesWma(meanAsset,resolvedLength),meanInverse=meanAsset.map((value,index)=>Number.isFinite(value)&&Number.isFinite(meanCenter[index])?(2*meanCenter[index])-value:null);
      selected.meanAsset=meanAsset;
      selected.meanInverse=meanInverse;
      selected.naiAsset=htlNorm(htl.asset,htlSeriesWma(htl.asset,resolvedLength),htlSeriesStdev(htl.asset,resolvedLength));
      selected.naiInverse=htlNorm(htl.inverse,htlSeriesWma(htl.inverse,resolvedLength),htlSeriesStdev(htl.inverse,resolvedLength));
    }
    return normalizeUnifiedIndicators(data,selected);
  }

  CHART_INDICATORS.COMBO={
    price:[["meanAsset","COMBO DARE Mean","#7c3aed"],["meanInverse","COMBO DARE Mean Inverse","#db2777"]],
    z:[["naiAsset","COMBO NAI Asset","#0284c7"],["naiInverse","COMBO NAI Inverse","#a21caf"]],
    osc:[]
  };

  canonicalChartDefinition=function(strategy){return ownedDefinition(strategy);};

  function drawAuxiliarySurfaces(pair){
    try{drawOscillatorChart();}catch(error){console.error("MAS / IM auxiliary chart render failed:",error);}
    try{drawWeeklyCognition(pair,state.evalMasImMetrics);}catch(error){console.error("Weekly cognition auxiliary chart render failed:",error);}
  }

  function renderAssetOnlyChart({canvasId="chart",messageId="chartMessage",candles,pair,timeframe,length,filter,visibleBars,offsetBars,rightIndent,crosshairEnabled,crosshair,legendId="indicatorLegend"}){
    const data=Array.isArray(candles)?candles:[],resolvedLength=clamp(Math.round(Number(length)||10),3,MAX_ANALYTICAL_LENGTH),htl=selectedHtlCausal(data,resolvedLength),indicators={asset:htl.asset,inverse:htl.inverse},signals=assetSignalSeries(data,htl,filter),canvas=el(canvasId);
    if(!canvas||!globalThis.CTEUnifiedChart?.render)throw new Error("Unified chart renderer did not initialize");
    const definition=ownedDefinition("ASSET"),live=offsetBars===0?liveMid(pair):NaN,result=CTEUnifiedChart.render({canvas,candles:data,indicators,indicatorSet:definition,signals,visibleBars,offsetBars,leftIndent:state.leftIndent,rightIndent,crosshairEnabled,crosshair,livePrice:live,formatPrice:value=>formatPrice(value,pair)}),latestIndex=data.length-1,legend=el(legendId),message=el(messageId);
    if(legend)legend.innerHTML=(definition.price||[]).map(([key,label,color])=>{const value=indicators[key]?.[latestIndex];return`<span><i style="background:${color}"></i>${label} ${Number.isFinite(value)?Number(value).toFixed(5):"—"}</span>`;}).join("");
    if(message&&data.length)message.hidden=true;
    return{result,indicators,signals,htl};
  }

  function maximumVisibleBars(){return Math.max(30,Math.min(MAX_VISIBLE_HISTORY,state.chartCandles?.length||MAX_VISIBLE_HISTORY));}
  function setMaximumHistoryViewport(){state.visibleBars=maximumVisibleBars();state.offsetBars=0;updateChartSummary();drawChart();queuePlatformPreferenceSave();}
  function installMaximumHistoryControls(){
    state.visibleBars=MAX_VISIBLE_HISTORY;state.offsetBars=0;
    const replaceZoom=(id,factor)=>{const original=el(id);if(!original)return;const replacement=original.cloneNode(true);original.replaceWith(replacement);replacement.addEventListener("click",()=>{const max=maximumVisibleBars();state.visibleBars=clamp(Math.round(state.visibleBars*factor),30,max);state.offsetBars=clamp(state.offsetBars,0,Math.max(0,(state.chartCandles?.length||0)-state.visibleBars));updateChartSummary();drawChart();queuePlatformPreferenceSave();});};
    replaceZoom("zoomIn",.8);replaceZoom("zoomOut",1.25);
    const canvas=el("chart");if(canvas)canvas.addEventListener("wheel",event=>{event.preventDefault();event.stopImmediatePropagation();const max=maximumVisibleBars(),factor=event.deltaY>0?1.15:.87;state.visibleBars=clamp(Math.round(state.visibleBars*factor),30,max);state.offsetBars=clamp(state.offsetBars,0,Math.max(0,(state.chartCandles?.length||0)-state.visibleBars));updateChartSummary();drawChart();queuePlatformPreferenceSave();},{capture:true,passive:false});
  }

  drawChart=function(){
    const pair=state.selectedInstrument,timeframe=state.selectedTimeframe,strategy=state.selectedStrategy,length=clamp(Math.round(Number(el("chartLength")?.value)||10),3,MAX_ANALYTICAL_LENGTH),filter=Math.max(0,Number(el("chartFilter")?.value)||0);
    if(strategy==="ASSET")renderAssetOnlyChart({candles:state.chartCandles,pair,timeframe,length,filter,visibleBars:state.visibleBars,offsetBars:state.offsetBars,rightIndent:state.rightIndent,crosshairEnabled:state.crosshairEnabled,crosshair:state.crosshair});
    else{
      const indicators=selectedIndicatorSet(state.chartCandles,length,strategy),signals=indicatorSignalSeries(state.chartCandles,indicators,strategy,filter);
      drawCapitalizationChartSurface({canvasId:"chart",messageId:"chartMessage",candles:state.chartCandles,pair,timeframe,strategy,length,visibleBars:state.visibleBars,offsetBars:state.offsetBars,rightIndent:state.rightIndent,crosshairEnabled:state.crosshairEnabled,crosshair:state.crosshair,legendId:"indicatorLegend",indicators,signals});
    }
    drawAuxiliarySurfaces(pair);
  };

  drawEvalCharts=function(){
    const pair=el("evalChartPair")?.value||state.selectedInstrument,timeframe=el("evalChartTimeframe")?.value||state.selectedTimeframe,strategy=el("evalChartStrategy")?.value||state.evaluationSelectedStrategy||"ASSET",length=clamp(Math.round(Number(el("evalChartLength")?.value)||10),3,MAX_ANALYTICAL_LENGTH),filter=Math.max(0,Number(el("evalChartFilter")?.value)||0);
    if(strategy==="ASSET")renderAssetOnlyChart({canvasId:"evalChart",messageId:"evalChartMessage",candles:state.evalCandles,pair,timeframe,length,filter,visibleBars:state.evalVisibleBars,offsetBars:state.evalOffsetBars,rightIndent:state.evalRightIndent,crosshairEnabled:state.evalCrosshairEnabled,crosshair:state.evalCrosshair,legendId:"evalIndicatorLegend"});
    else{
      const indicators=selectedIndicatorSet(state.evalCandles,length,strategy),signals=indicatorSignalSeries(state.evalCandles,indicators,strategy,filter);
      drawCapitalizationChartSurface({canvasId:"evalChart",messageId:"evalChartMessage",candles:state.evalCandles,pair,timeframe,strategy,length,visibleBars:state.evalVisibleBars,offsetBars:state.evalOffsetBars,rightIndent:state.evalRightIndent,crosshairEnabled:state.evalCrosshairEnabled,crosshair:state.evalCrosshair,legendId:"evalIndicatorLegend",indicators,signals});
    }
    try{drawOscillatorChart();}catch(error){console.error("MAS / IM evaluation auxiliary render failed:",error);}
  };

  function synchronizeWeeklyBar(){
    const stage=el("chartStage"),canvas=el("weeklyCognitionCanvas"),aside=canvas?.closest("aside");
    if(!stage||!canvas||!aside)return;
    const height=Math.max(300,Math.round(stage.getBoundingClientRect().height||stage.clientHeight||400)),header=aside.querySelector(".panel-head"),body=canvas.parentElement,headerHeight=Math.max(0,Math.round(header?.getBoundingClientRect().height||0));
    aside.style.alignSelf="start";
    aside.style.height=`${height}px`;
    aside.style.minHeight="0";
    if(body){body.style.height=`${Math.max(120,height-headerHeight)}px`;body.style.minHeight="0";}
    canvas.style.height="100%";
    requestAnimationFrame(()=>{try{drawWeeklyCognition(state.selectedInstrument,state.evalMasImMetrics);}catch(error){console.error("Weekly cognition resize render failed:",error);}});
  }

  function removeDuplicateChartMetadataRow(){
    const panel=el("chartPanel");if(!panel)return false;
    const required=["CURRENCY PAIR","TIMEFRAME","STRATEGY","LENGTH","FILTER"];
    for(const node of [...panel.querySelectorAll("div")]){
      if(node.classList.contains("chart-toolbar")||node.classList.contains("chart-summary")||node.id==="indicatorLegend")continue;
      if(node.querySelector("select,input,button,canvas"))continue;
      const labels=[...node.querySelectorAll("span")].map(item=>String(item.textContent||"").trim().toUpperCase());
      if(!required.every(label=>labels.includes(label)))continue;
      node.remove();return true;
    }
    return false;
  }

  const legend=el("indicatorLegend");if(legend)legend.setAttribute("aria-label","Selected indicator legend and selected-indicator signals");
  const chartPanel=el("chartPanel"),subtitle=chartPanel?.querySelector(".panel-title p");if(subtitle)subtitle.textContent=`One synchronized ${MAX_VISIBLE_HISTORY.toLocaleString()}-completed-candle chart · selected indicator exclusively owns its overlay and BUY/SELL signals · attached price/time crosshair.`;
  removeDuplicateChartMetadataRow();
  synchronizeWeeklyBar();
  installMaximumHistoryControls();
  if(chartPanel&&typeof MutationObserver!=="undefined"){
    const metadataObserver=new MutationObserver(()=>removeDuplicateChartMetadataRow());metadataObserver.observe(chartPanel,{childList:true,subtree:true});
    global.addEventListener?.("pagehide",()=>metadataObserver.disconnect(),{once:true});
  }
  if(typeof ResizeObserver!=="undefined"){
    const observer=new ResizeObserver(synchronizeWeeklyBar),stage=el("chartStage");if(stage)observer.observe(stage);
    global.addEventListener?.("pagehide",()=>observer.disconnect(),{once:true});
  }
  document.addEventListener?.("fullscreenchange",synchronizeWeeklyBar);
  global.addEventListener?.("resize",synchronizeWeeklyBar);

  global.CTEChartIndicatorOwnership=Object.freeze({VERSION,MAX_VISIBLE_HISTORY,selectedIndicatorSet,selectedHtlCausal,assetSignalSeries,renderAssetOnlyChart,ownedDefinition,synchronizeWeeklyBar,removeDuplicateChartMetadataRow,setMaximumHistoryViewport});
})(globalThis);