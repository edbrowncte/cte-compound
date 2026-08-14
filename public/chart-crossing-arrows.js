(function installChartCrossingArrows(global){
  "use strict";

  const VERSION="CTE_CHART_CROSSING_ARROWS@1.0.0";
  const CROSSING_PRICE_BASIS="INDICATOR_CROSSING_CURRENT_INSTRUMENT_PRICE";
  const finite=value=>value!==null&&value!==undefined&&value!==""&&Number.isFinite(Number(value));
  const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
  const directionValue=value=>{const text=String(value||"").toUpperCase();return text.startsWith("BUY")?1:text.startsWith("SELL")?-1:Math.sign(Number(value)||0);};
  const sourceTime=signal=>signal?.sourceSignalTime||signal?.signalTime||signal?.sourceCrossingTime||signal?.time||null;

  function nearestSignalIndex(signal,candles=[]){
    const supplied=Math.trunc(Number(signal?.index));
    if(Number.isInteger(supplied)&&supplied>=0&&supplied<candles.length)return supplied;
    const target=Date.parse(sourceTime(signal)||"");if(!Number.isFinite(target))return-1;
    let best=-1,bestDistance=Infinity;
    for(let index=0;index<candles.length;index++){const time=Date.parse(candles[index]?.time||"");if(!Number.isFinite(time))continue;const distance=Math.abs(time-target);if(distance<bestDistance){best=index;bestDistance=distance;}}
    return best;
  }

  function sameCrossing(left,right,timeframe){
    const direction=directionValue(left?.direction);if(!direction||direction!==directionValue(right?.direction))return false;
    const a=Date.parse(sourceTime(left)||""),b=Date.parse(sourceTime(right)||"");if(!Number.isFinite(a)||!Number.isFinite(b))return false;
    const step=Number(global.CTERuntimeIntegrity?.TF_MS?.[String(timeframe||"").toUpperCase()])||0;
    return step?Math.floor(a/step)===Math.floor(b/step):a===b;
  }

  function crossingSignals(signals=[]){
    return(Array.isArray(signals)?signals:[]).filter(signal=>signal?.current!==true&&directionValue(signal?.direction)&&finite(signal?.price));
  }

  function executableSignals(canvas){
    const integrity=global.CTERuntimeIntegrity,context=integrity?.chartContext?.(canvas);
    if(!context?.pair||!context?.timeframe||typeof integrity?.liveExecutableSignals!=="function")return{context,signals:[]};
    return{context,signals:integrity.liveExecutableSignals(context.pair,context.timeframe)||[]};
  }

  function drawCrossingArrows(options={},geometry){
    const canvas=options.canvas,candles=Array.isArray(options.candles)?options.candles:[],pricePlot=geometry?.pricePlot;
    if(!canvas||!candles.length||!pricePlot||typeof geometry?.indexToX!=="function"||typeof geometry?.priceToY!=="function")return 0;
    const crossings=crossingSignals(options.signals),live=executableSignals(canvas),ctx=canvas.getContext("2d");if(!ctx||!crossings.length)return 0;
    let drawn=0;ctx.save();ctx.font="bold 8px ui-monospace,monospace";ctx.textAlign="center";ctx.textBaseline="middle";
    for(const signal of crossings){
      if(live.signals.some(item=>sameCrossing(signal,item,live.context?.timeframe)))continue;
      const absolute=nearestSignalIndex(signal,candles);if(absolute<geometry.visibleStart||absolute>=geometry.visibleEnd)continue;
      const direction=directionValue(signal.direction),price=Number(signal.price),x=geometry.indexToX(absolute-geometry.visibleStart),markerY=clamp(geometry.priceToY(price),pricePlot.y+6,pricePlot.y+pricePlot.h-6),size=5,shown=typeof options.formatPrice==="function"?options.formatPrice(price):String(price),label=`${direction>0?"BUY":"SELL"} @ ${shown}`;
      ctx.beginPath();if(direction>0){ctx.moveTo(x,markerY);ctx.lineTo(x-size,markerY+size*2);ctx.lineTo(x+size,markerY+size*2);}else{ctx.moveTo(x,markerY);ctx.lineTo(x-size,markerY-size*2);ctx.lineTo(x+size,markerY-size*2);}ctx.closePath();ctx.fillStyle=direction>0?"#48c78e":"#ef6b73";ctx.fill();const labelY=clamp(markerY+(direction>0?15:-15),pricePlot.y+7,pricePlot.y+pricePlot.h-7);ctx.fillText(label,x,labelY);drawn++;
    }
    ctx.restore();state.chartCrossingArrowCount=drawn;state.chartCrossingArrowVersion=VERSION;state.chartCrossingArrowPriceBasis=CROSSING_PRICE_BASIS;return drawn;
  }

  function install(){
    const chart=global.CTEUnifiedChart;if(!chart?.render||chart.__cteCrossingArrows)return false;
    const prior=chart.render.bind(chart),wrapped=Object.freeze({...chart,__cteCrossingArrows:true,render:options=>{const geometry=prior(options);try{drawCrossingArrows(options,geometry);}catch(error){console.error("Chart crossing arrow overlay failed:",error);}return geometry;}});global.CTEUnifiedChart=wrapped;return true;
  }

  global.CTEChartCrossingArrows=Object.freeze({VERSION,CROSSING_PRICE_BASIS,directionValue,sourceTime,nearestSignalIndex,sameCrossing,crossingSignals,executableSignals,drawCrossingArrows,install});
  if(typeof document!=="undefined"){if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",install,{once:true});else queueMicrotask(install);}
})(globalThis);
