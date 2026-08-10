(function installChartIndicatorOwnership(global){
  "use strict";

  const VERSION="CTE_CHART_INDICATOR_OWNERSHIP@1.0.1";

  function ownedDefinition(strategy){
    const selected=CHART_INDICATORS[strategy]||CHART_INDICATORS.ASSET;
    return{
      price:[...(selected.price||[])],
      z:[...(selected.z||[])],
      osc:[...(selected.osc||[])]
    };
  }

  function selectedIndicatorSet(candles,length,strategy){
    const data=Array.isArray(candles)?candles:[],resolvedLength=clamp(Math.round(Number(length)||10),3,MAX_ANALYTICAL_LENGTH),id=CHART_INDICATORS[strategy]?strategy:"ASSET";
    if(!data.length)return normalizeUnifiedIndicators(data,{});
    const htl=htlCausal(data,resolvedLength),selected={};

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

  // COMBO owns its own composite display. HTL Asset is no longer carried into COMBO or any other selection.
  CHART_INDICATORS.COMBO={
    price:[["meanAsset","COMBO DARE Mean","#7c3aed"],["meanInverse","COMBO DARE Mean Inverse","#db2777"]],
    z:[["naiAsset","COMBO NAI Asset","#0284c7"],["naiInverse","COMBO NAI Inverse","#a21caf"]],
    osc:[]
  };

  canonicalChartDefinition=function(strategy){return ownedDefinition(strategy);};

  drawChart=function(){
    const pair=state.selectedInstrument,timeframe=state.selectedTimeframe,strategy=state.selectedStrategy,length=clamp(Math.round(Number(el("chartLength")?.value)||10),3,MAX_ANALYTICAL_LENGTH),filter=Math.max(0,Number(el("chartFilter")?.value)||0),indicators=selectedIndicatorSet(state.chartCandles,length,strategy),signals=indicatorSignalSeries(state.chartCandles,indicators,strategy,filter);
    drawCapitalizationChartSurface({canvasId:"chart",messageId:"chartMessage",candles:state.chartCandles,pair,timeframe,strategy,length,visibleBars:state.visibleBars,offsetBars:state.offsetBars,rightIndent:state.rightIndent,crosshairEnabled:state.crosshairEnabled,crosshair:state.crosshair,legendId:"indicatorLegend",indicators,signals});
    drawOscillatorChart();
    drawWeeklyCognition(pair,state.evalMasImMetrics);
  };

  drawEvalCharts=function(){
    const pair=el("evalChartPair")?.value||state.selectedInstrument,timeframe=el("evalChartTimeframe")?.value||state.selectedTimeframe,strategy=el("evalChartStrategy")?.value||state.evaluationSelectedStrategy||"ASSET",length=clamp(Math.round(Number(el("evalChartLength")?.value)||10),3,MAX_ANALYTICAL_LENGTH),filter=Math.max(0,Number(el("evalChartFilter")?.value)||0),indicators=selectedIndicatorSet(state.evalCandles,length,strategy),signals=indicatorSignalSeries(state.evalCandles,indicators,strategy,filter);
    drawCapitalizationChartSurface({canvasId:"evalChart",messageId:"evalChartMessage",candles:state.evalCandles,pair,timeframe,strategy,length,visibleBars:state.evalVisibleBars,offsetBars:state.evalOffsetBars,rightIndent:state.evalRightIndent,crosshairEnabled:state.evalCrosshairEnabled,crosshair:state.evalCrosshair,legendId:"evalIndicatorLegend",indicators,signals});
    drawOscillatorChart();
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
    requestAnimationFrame(()=>drawWeeklyCognition(state.selectedInstrument,state.evalMasImMetrics));
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
  const chartPanel=el("chartPanel"),subtitle=chartPanel?.querySelector(".panel-title p");if(subtitle)subtitle.textContent="One synchronized completed-candle chart · selected indicator exclusively owns its overlay and BUY/SELL signals · attached price/time crosshair.";
  removeDuplicateChartMetadataRow();
  synchronizeWeeklyBar();
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

  global.CTEChartIndicatorOwnership=Object.freeze({VERSION,selectedIndicatorSet,ownedDefinition,synchronizeWeeklyBar,removeDuplicateChartMetadataRow});
})(globalThis);
