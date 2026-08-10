(function installUnifiedChart(global){
  "use strict";

  const VERSION="CTE_UNIFIED_EVALUATION_CHART@1.0.0";
  const finite=value=>value!==null&&value!==undefined&&value!==""&&Number.isFinite(Number(value));
  const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));

  function drawSeries(ctx,values,start,end,indexToX,valueToY,color,width=1.8){
    if(!Array.isArray(values)||!values.length)return;
    ctx.beginPath();let drawing=false;
    for(let absolute=start;absolute<end;absolute++){
      const value=values[absolute];
      if(!finite(value)){drawing=false;continue;}
      const x=indexToX(absolute-start),y=valueToY(Number(value));
      if(!drawing){ctx.moveTo(x,y);drawing=true;}else ctx.lineTo(x,y);
    }
    ctx.strokeStyle=color;ctx.lineWidth=width;ctx.stroke();
  }

  function drawSignals(ctx,signals,candles,start,end,indexToX,priceToY,pricePlot){
    if(!Array.isArray(signals)||!signals.length)return;
    ctx.save();ctx.font="bold 8px ui-monospace,monospace";ctx.textAlign="center";ctx.textBaseline="middle";
    for(const signal of signals){
      const absolute=Math.trunc(Number(signal?.index)),direction=Math.sign(Number(signal?.direction)||0);
      if(!direction||absolute<start||absolute>=end)continue;
      const candle=candles[absolute];if(!candle)continue;
      const x=indexToX(absolute-start),anchor=direction>0?Number(candle.low):Number(candle.high);if(!finite(anchor))continue;
      const candleY=priceToY(anchor),markerY=clamp(candleY+(direction>0?11:-11),pricePlot.y+9,pricePlot.y+pricePlot.h-9),size=5;
      ctx.beginPath();
      if(direction>0){ctx.moveTo(x,markerY-size);ctx.lineTo(x-size,markerY+size);ctx.lineTo(x+size,markerY+size);}
      else{ctx.moveTo(x,markerY+size);ctx.lineTo(x-size,markerY-size);ctx.lineTo(x+size,markerY-size);}
      ctx.closePath();ctx.fillStyle=direction>0?"#48c78e":"#ef6b73";ctx.fill();
      const labelY=clamp(markerY+(direction>0?12:-12),pricePlot.y+7,pricePlot.y+pricePlot.h-7);
      ctx.fillText(`${direction>0?"BUY":"SELL"}${signal.current?" ACTIVE":""}`,x,labelY);
    }
    ctx.restore();
  }

  function render(options={}){
    const canvas=options.canvas;
    const candles=Array.isArray(options.candles)?options.candles:[];
    if(!canvas)return null;
    const ctx=canvas.getContext("2d"),rect=canvas.getBoundingClientRect(),dpr=global.devicePixelRatio||1;
    const width=Math.max(100,rect.width||canvas.clientWidth||canvas.parentNode?.clientWidth||0),height=Math.max(100,rect.height||canvas.clientHeight||canvas.parentNode?.clientHeight||0);
    canvas.width=width*dpr;canvas.height=height*dpr;ctx.setTransform(dpr,0,0,dpr,0,0);ctx.fillStyle="#080c12";ctx.fillRect(0,0,width,height);
    if(!candles.length)return{visibleStart:0,visibleEnd:0,visibleCandles:[],latestIndex:-1};

    const visibleBars=clamp(Math.trunc(Number(options.visibleBars)||120),30,300),offset=clamp(Math.trunc(Number(options.offsetBars)||0),0,Math.max(0,candles.length-visibleBars)),visibleEnd=candles.length-offset,visibleStart=Math.max(0,visibleEnd-visibleBars),visibleCandles=candles.slice(visibleStart,visibleEnd);
    if(!visibleCandles.length)return{visibleStart,visibleEnd,visibleCandles,latestIndex:candles.length-1};

    const indicatorSet=options.indicatorSet||{price:[],z:[],osc:[]},indicators=options.indicators||{},hasOscillator=Boolean(indicatorSet.osc?.length),leftIndent=Math.max(0,Number(options.leftIndent)||0),rightIndent=Math.max(0,Number(options.rightIndent)||0),rightAxisWidth=60+rightIndent,margin={top:20,right:rightAxisWidth,bottom:28,left:40+leftIndent},plot={x:margin.left,y:margin.top,w:Math.max(80,width-margin.left-margin.right),h:Math.max(80,height-margin.top-margin.bottom)},pricePlot=hasOscillator?{...plot,h:plot.h*.72}:plot,oscPlot=hasOscillator?{x:plot.x,y:plot.y+plot.h*.78,w:plot.w,h:plot.h*.22}:null,gridEndX=width-60;
    const candleLow=Math.min(...visibleCandles.map(c=>Number(c.low))),candleHigh=Math.max(...visibleCandles.map(c=>Number(c.high))),candleSpan=Math.max(candleHigh-candleLow,Math.abs(candleHigh)*1e-6),plausiblePrice=value=>finite(value)&&Number(value)>=Math.max(Number.EPSILON,candleLow-candleSpan*2)&&Number(value)<=candleHigh+candleSpan*2;
    const priceValues=(indicatorSet.price||[]).flatMap(([key])=>(indicators[key]||[]).slice(visibleStart,visibleEnd).filter(plausiblePrice).map(Number)),live=finite(options.livePrice)?Number(options.livePrice):NaN;
    let low=Math.min(candleLow,...priceValues,...(finite(live)?[live]:[])),high=Math.max(candleHigh,...priceValues,...(finite(live)?[live]:[]));
    if(!finite(low)||!finite(high)){low=0;high=1;}const pad=(high-low)*.1||Math.max(Math.abs(high)*1e-6,.00001);low-=pad;high+=pad;
    const priceToY=price=>pricePlot.y+(high-price)/(high-low)*pricePlot.h,barWidth=pricePlot.w/Math.max(1,visibleCandles.length),indexToX=index=>pricePlot.x+(index+.5)*barWidth;

    ctx.strokeStyle="#1c2632";ctx.lineWidth=1;ctx.font="9px ui-monospace,monospace";ctx.textBaseline="middle";
    for(let i=0;i<=4;i++){
      const y=pricePlot.y+pricePlot.h*i/4,price=high-(high-low)*i/4;ctx.beginPath();ctx.moveTo(pricePlot.x,y+.5);ctx.lineTo(gridEndX,y+.5);ctx.stroke();ctx.fillStyle="#8b98aa";ctx.textAlign="left";ctx.fillText(typeof options.formatPrice==="function"?options.formatPrice(price):String(price),gridEndX+5,y);
    }
    for(let i=0;i<=6;i++){
      const x=pricePlot.x+pricePlot.w*i/6;ctx.strokeStyle="#151e29";ctx.beginPath();ctx.moveTo(x+.5,pricePlot.y);ctx.lineTo(x+.5,pricePlot.y+pricePlot.h);ctx.stroke();const candle=visibleCandles[Math.min(visibleCandles.length-1,Math.floor(i/6*(visibleCandles.length-1)))];if(candle){ctx.fillStyle="#7f8b9b";ctx.textAlign=i===0?"left":i===6?"right":"center";ctx.fillText(new Intl.DateTimeFormat(undefined,{month:"short",day:"2-digit",hour:"2-digit",minute:"2-digit"}).format(new Date(candle.time)),x,plot.y+plot.h+17);}
    }
    ctx.textAlign="left";

    visibleCandles.forEach((c,index)=>{const x=indexToX(index),rising=Number(c.close)>=Number(c.open),stroke=rising?"#48c78e":"#ef6b73";ctx.strokeStyle=stroke;ctx.fillStyle=stroke;ctx.beginPath();ctx.moveTo(x,priceToY(Number(c.high)));ctx.lineTo(x,priceToY(Number(c.low)));ctx.stroke();const bodyTop=priceToY(Math.max(Number(c.open),Number(c.close))),bodyBottom=priceToY(Math.min(Number(c.open),Number(c.close))),bodyWidth=Math.max(1,Math.min(11,barWidth*.6));ctx.fillRect(x-bodyWidth/2,bodyTop,bodyWidth,Math.max(1,bodyBottom-bodyTop));});

    for(const [key,,color] of indicatorSet.price||[])drawSeries(ctx,(indicators[key]||[]).map(value=>plausiblePrice(value)?value:null),visibleStart,visibleEnd,indexToX,priceToY,color,1.8);
    drawSignals(ctx,options.signals,candles,visibleStart,visibleEnd,indexToX,priceToY,pricePlot);

    const zDefinitions=indicatorSet.z||[],zValues=zDefinitions.flatMap(([key])=>(indicators[key]||[]).slice(visibleStart,visibleEnd).filter(finite).map(Number));
    if(zValues.length){const zMax=Math.max(1,...zValues.map(value=>Math.abs(value)))*1.08,zToY=value=>pricePlot.y+(zMax-value)/(zMax*2)*pricePlot.h;ctx.font="9px ui-monospace,monospace";ctx.textAlign="right";for(let i=0;i<=4;i++){const value=zMax-i*zMax/2,y=zToY(value);ctx.strokeStyle=value===0?"#415267":"#1c2632";ctx.setLineDash(value===0?[4,4]:[]);ctx.beginPath();ctx.moveTo(pricePlot.x,y+.5);ctx.lineTo(gridEndX,y+.5);ctx.stroke();ctx.setLineDash([]);ctx.fillStyle="#68aee8";ctx.fillText(value.toFixed(2),pricePlot.x-7,y);}ctx.textAlign="left";for(const [key,,color] of zDefinitions)drawSeries(ctx,indicators[key],visibleStart,visibleEnd,indexToX,zToY,color,1.8);}

    if(oscPlot){const oscDefinitions=indicatorSet.osc||[],oscValues=oscDefinitions.flatMap(([key])=>(indicators[key]||[]).slice(visibleStart,visibleEnd).filter(finite).map(Number));if(oscValues.length){let oscLow=Math.min(...oscValues),oscHigh=Math.max(...oscValues);if(oscLow===oscHigh){oscLow-=1;oscHigh+=1;}else{const oscPad=(oscHigh-oscLow)*.08;oscLow-=oscPad;oscHigh+=oscPad;}const oscToY=value=>oscPlot.y+(oscHigh-value)/(oscHigh-oscLow)*oscPlot.h;ctx.fillStyle="#0a1017";ctx.fillRect(oscPlot.x,oscPlot.y,oscPlot.w,oscPlot.h);ctx.strokeStyle="#283443";ctx.beginPath();ctx.moveTo(oscPlot.x,oscPlot.y+.5);ctx.lineTo(gridEndX,oscPlot.y+.5);ctx.stroke();for(const [key,,color] of oscDefinitions)drawSeries(ctx,indicators[key],visibleStart,visibleEnd,indexToX,oscToY,color,1.8);ctx.fillStyle="#8b98aa";ctx.font="9px ui-monospace,monospace";ctx.fillText(oscHigh.toFixed(2),oscPlot.x+4,oscPlot.y+5);ctx.fillText(oscLow.toFixed(2),oscPlot.x+4,oscPlot.y+oscPlot.h-5);}}

    const crosshair=options.crosshair,crosshairEnabled=options.crosshairEnabled!==false;
    if(crosshairEnabled&&crosshair!==null&&crosshair!==undefined){let cx=null,cy=null;if(typeof crosshair==="number"&&crosshair>=0&&crosshair<visibleCandles.length)cx=indexToX(crosshair);else if(typeof crosshair==="object"&&finite(crosshair.x)){cx=Number(crosshair.x);if(finite(crosshair.y))cy=Number(crosshair.y);}if(cx!==null&&cx>=pricePlot.x&&cx<=pricePlot.x+pricePlot.w){const relative=clamp(Math.floor((cx-pricePlot.x)/Math.max(1,barWidth)),0,visibleCandles.length-1),candle=visibleCandles[relative],snappedX=indexToX(relative),resolvedY=cy!==null&&cy>=pricePlot.y&&cy<=pricePlot.y+pricePlot.h?cy:priceToY(Number(candle?.close)),cursorPrice=high-((resolvedY-pricePlot.y)/pricePlot.h)*(high-low),priceLabel=typeof options.formatPrice==="function"?options.formatPrice(cursorPrice):String(cursorPrice),timeLabel=candle?new Intl.DateTimeFormat(undefined,{year:"numeric",month:"short",day:"2-digit",hour:"2-digit",minute:"2-digit",second:"2-digit"}).format(new Date(candle.time)):"—";ctx.setLineDash([3,3]);ctx.strokeStyle="#a7b5c7";ctx.beginPath();ctx.moveTo(snappedX,pricePlot.y);ctx.lineTo(snappedX,pricePlot.y+pricePlot.h);ctx.moveTo(pricePlot.x,resolvedY);ctx.lineTo(gridEndX,resolvedY);ctx.stroke();ctx.setLineDash([]);ctx.font="9px ui-monospace,monospace";const timeWidth=Math.ceil(ctx.measureText(timeLabel).width)+10,timeX=clamp(snappedX-timeWidth/2,pricePlot.x,gridEndX-timeWidth);ctx.fillStyle="#26384b";ctx.fillRect(timeX,pricePlot.y+pricePlot.h+4,timeWidth,18);ctx.fillStyle="#edf2ff";ctx.textAlign="left";ctx.fillText(timeLabel,timeX+5,pricePlot.y+pricePlot.h+13);ctx.fillStyle="#7dc4ff";ctx.fillRect(gridEndX,resolvedY-9,60,18);ctx.fillStyle="#080c12";ctx.fillText(priceLabel,gridEndX+5,resolvedY);}}

    if(finite(live)){const yy=priceToY(live),label=typeof options.formatPrice==="function"?options.formatPrice(live):String(live);ctx.strokeStyle="#7dc4ff";ctx.setLineDash([4,4]);ctx.beginPath();ctx.moveTo(pricePlot.x,yy);ctx.lineTo(gridEndX,yy);ctx.stroke();ctx.setLineDash([]);ctx.fillStyle="#7dc4ff";ctx.fillRect(gridEndX,yy-9,60,18);ctx.fillStyle="#080c12";ctx.fillText(label,gridEndX+5,yy+4);}

    return{visibleStart,visibleEnd,visibleCandles,latestIndex:candles.length-1,pricePlot,plot,indexToX,priceToY};
  }

  global.CTEUnifiedChart=Object.freeze({VERSION,render});
})(globalThis);
