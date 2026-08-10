(function installMarketMentor(global){
  "use strict";

  const VERSION="CTE_MARKET_MENTOR@1.1.0";
  const MATERIAL_REGIMES=new Set(["TRANSITION","ANTAGONIST_DETERIORATING","ANTAGONIST_ACCELERATING"]);
  let previous=null,lastExternalFingerprint="",panel=null;

  const finite=value=>Number.isFinite(Number(value));
  const number=value=>finite(value)?Number(value):NaN;
  const fmt=(value,digits=3)=>Number.isFinite(value)?value.toFixed(digits):value===Infinity?"∞":"—";
  const pct=value=>Number.isFinite(value)?`${(value*100).toFixed(1)}%`:"—";
  const words=value=>String(value||"NEUTRAL").replaceAll("_"," ");
  const pair=value=>String(value||"—").replace("_","/");
  const side=value=>Number(value)>0?"BUY":Number(value)<0?"SELL":"HOLD";

  function ensurePanel(){
    if(typeof document==="undefined")return null;
    if(panel&&document.contains(panel))return panel;
    const modelBody=document.getElementById("modelCompositionBody"),anchor=modelBody||document.getElementById("fourSlotRotator")||document.getElementById("evalTableBody");
    if(!anchor)return null;
    panel=document.createElement("section");
    panel.id="cteMarketMentor";
    panel.setAttribute("aria-label","CTE Market Mentor");
    panel.style.cssText="margin-top:10px;border:1px solid #3a4657;background:linear-gradient(180deg,#111923,#0b1118);padding:12px;box-shadow:0 12px 30px rgba(0,0,0,.28);";
    panel.innerHTML=`
      <div style="display:flex;gap:8px;align-items:center;justify-content:space-between;flex-wrap:wrap;">
        <div><div style="font-size:11px;font-weight:900;letter-spacing:.08em;text-transform:uppercase;color:#7dc4ff;">CTE Market Mentor · Proactive</div><div id="mentorVersion" style="font-size:8px;color:#8e9aab;margin-top:2px;">${VERSION} · capitalization interpretation · pair-discretion context · no direct execution authority</div></div>
        <div style="display:flex;gap:6px;align-items:center;"><strong id="mentorAlertLevel" style="font-size:9px;color:#d7a85c;">OBSERVING</strong><button id="mentorNotifications" type="button" style="padding:5px 8px;font-size:9px;">Enable browser alerts</button></div>
      </div>
      <div id="mentorHeadline" style="font-size:14px;font-weight:850;margin-top:10px;line-height:1.25;">Waiting for synchronized Evaluation data.</div>
      <div style="display:grid;grid-template-columns:minmax(0,1.15fr) minmax(0,.85fr);gap:10px;margin-top:10px;">
        <div style="border:1px solid #2b3543;background:#0a1017;padding:10px;"><div style="font-size:8px;color:#8e9aab;text-transform:uppercase;letter-spacing:.08em;">What the market is saying</div><div id="mentorExplanation" style="font-size:10px;line-height:1.55;margin-top:5px;">—</div></div>
        <div style="border:1px solid #2b3543;background:#0a1017;padding:10px;"><div style="font-size:8px;color:#8e9aab;text-transform:uppercase;letter-spacing:.08em;">Posture</div><div id="mentorPosture" style="font-size:11px;font-weight:800;line-height:1.45;margin-top:5px;">—</div></div>
      </div>
      <div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin-top:10px;">
        <div style="border:1px solid #2b3543;padding:9px;"><div style="font-size:8px;color:#8e9aab;text-transform:uppercase;">Lesson</div><div id="mentorLesson" style="font-size:9px;line-height:1.5;margin-top:4px;">—</div></div>
        <div style="border:1px solid #2b3543;padding:9px;"><div style="font-size:8px;color:#8e9aab;text-transform:uppercase;">Watch next</div><div id="mentorWatch" style="font-size:9px;line-height:1.5;margin-top:4px;">—</div></div>
        <div style="border:1px solid #2b3543;padding:9px;"><div style="font-size:8px;color:#8e9aab;text-transform:uppercase;">Recommendation</div><div id="mentorRecommendation" style="font-size:9px;line-height:1.5;margin-top:4px;">—</div></div>
      </div>
      <div id="mentorRotation" style="margin-top:9px;color:#8e9aab;font-size:9px;line-height:1.45;">Four-card rotation commentary will appear after the first change.</div>`;
    if(modelBody)modelBody.appendChild(panel);else anchor.parentElement?.insertAdjacentElement("afterend",panel);
    const button=panel.querySelector("#mentorNotifications");
    if(button)button.addEventListener("click",async()=>{
      if(typeof Notification==="undefined"){button.textContent="Browser alerts unavailable";return;}
      const permission=await Notification.requestPermission();
      button.textContent=permission==="granted"?"Browser alerts enabled":permission==="denied"?"Browser alerts blocked":"Enable browser alerts";
    });
    return panel;
  }

  function aligned(row){return row?.regime==="TREND_ALIGNED";}
  function ratioText(row){
    if(row?.ratio===Infinity)return `IM/MAS is ∞ because MAS is effectively zero while IM remains ${fmt(row.im)}. That is denominator collapse, not infinite market strength.`;
    if(Number.isFinite(row?.ratio))return `IM/MAS is ${fmt(row.ratio,2)}: supporting pressure is ${row.ratio>=1?"greater than or equal to":"below"} measured antagonist pressure.`;
    return "The pressure ratio is not currently available.";
  }

  function postureFor(row){
    if(!row||!row.signal)return"Observe. The selected row does not yet contain a qualified directional signal.";
    if(aligned(row))return`Trend-aligned posture: follow the structure, but do not chase the ratio. Watch for IM decay, MAS reappearance, or loss of event power before treating continuation as durable.`;
    if(row.regime==="TRANSITION")return`Transition posture: the signal is challenging an opposing macro field and has reached the learned pressure threshold. Require confirmation from completed candles; treat this as a changing regime, not a guaranteed reversal.`;
    if(row.regime==="CHALLENGE")return`Challenge posture: lower-timeframe support is substantial, but macro opposition remains active. Watch the ratio trajectory and event power before upgrading the signal to transition.`;
    if(row.regime==="ANTAGONIST_DETERIORATING")return`Developing posture: antagonist pressure is deteriorating while supporting pressure improves. This is an early warning state; monitor whether IM/MAS continues toward its learned transition requirement.`;
    if(row.regime==="ANTAGONIST_ACCELERATING")return`Defensive posture: the antagonist field is strengthening. Treat the current signal as structurally disadvantaged until that acceleration weakens.`;
    if(row.regime==="REVERSION_PRESSURE")return`Reversion posture: macro opposition remains dominant. Treat the signal as a lower-timeframe excursion unless pressure and event power materially improve.`;
    return"Observe the next completed candle and the direction of MAS, IM, and Event Angle Z before changing posture.";
  }

  function lessonFor(row){
    if(row?.ratio===Infinity)return"Infinity is a diagnostic state, not a ranking score. A tiny IM over zero MAS produces ∞, while another pair can have much greater absolute support with a finite ratio. Compare MAS, IM, Event Angle Z, fit and regime together.";
    if(aligned(row))return"Transition probability answers whether opposition may flip. Once macro direction already agrees with the signal, transition is no longer the question; continuation quality is.";
    if(row?.regime==="TRANSITION")return"A transition state is strongest when three things agree: IM reaches the learned Required IM, Ratio ROC is non-negative, and Event Angle Z/convexity show that event power is not fading.";
    return"MAS measures signal-oriented antagonist pressure. IM measures supportive pressure through the reverse cadence of the same timestamp-synchronized hierarchy. The ratio describes pressure balance, not certainty.";
  }

  function explanationFor(row){
    if(!row)return"No selected Evaluation row is available yet.";
    const transition=aligned(row)?"No transition is required because the macro field is already aligned.":`Required IM is ${fmt(row.requiredIm)} and the historical transition estimate is ${pct(row.transitionProbability)}.`;
    return`${pair(row.pair)} ${row.timeframe} is a ${side(row.signal)} in ${words(row.regime)}. MAS ${fmt(row.mas)}, IM ${fmt(row.im)}. ${ratioText(row)} ${transition} Event Angle Z is ${fmt(row.eventAngleZ,2)}, convexity ${fmt(row.convexity,2)}, and R² ${fmt(row.r2,2)}.`;
  }

  function watchFor(row){
    if(!row)return"Wait for Evaluation data.";
    const items=[];
    if(Number.isFinite(row.masRoc))items.push(`MAS ROC ${fmt(row.masRoc,4)} (${row.masRoc<0?"antagonist easing":"antagonist firming"})`);
    if(Number.isFinite(row.imRoc))items.push(`IM ROC ${fmt(row.imRoc,4)} (${row.imRoc>0?"support building":"support fading"})`);
    if(Number.isFinite(row.ratioRoc))items.push(`Ratio ROC ${fmt(row.ratioRoc,4)}`);
    if(Number.isFinite(row.eventAngleZ))items.push(`Event Z ${fmt(row.eventAngleZ,2)}`);
    return items.join(" · ")||"Watch the next completed-candle pressure update.";
  }

  function recommendationFor(row){
    if(!row)return"Keep the Evaluation facility open until synchronized hierarchy data is available.";
    if(aligned(row)&&row.ratio===Infinity)return"Do not rank this pair above finite-ratio candidates merely because it displays ∞. Compare absolute IM, Event Angle Z, convexity, R² and the four-card composite strength.";
    if(aligned(row))return"Use the aligned state as context, then judge continuation quality from IM persistence, event power and fit. A weakening IM or reappearing MAS is the first reason to reduce confidence.";
    if(row.regime==="TRANSITION")return"Treat the transition as a hypothesis under confirmation. Look for persistence beyond the threshold on the next completed candle and for macro-force direction to actually follow.";
    return"Avoid promoting a countertrend signal on ratio alone. Require improving IM/MAS, non-deteriorating Event Angle Z and evidence that antagonist pressure is weakening.";
  }

  function leadersOf(slots){
    return (slots||[]).map(slot=>({title:String(slot?.title||""),pair:String(slot?.candidate?.pair||""),regime:String(slot?.candidate?.regime||""),strength:number(slot?.candidate?.strength),ratio:slot?.candidate?.ratio,eventAngleZ:number(slot?.candidate?.eventAngleZ)}));
  }

  function rotationText(currentLeaders,priorLeaders){
    if(!priorLeaders?.length)return"Four-card leaders established. Future rotations will be explained here rather than silently replacing a candidate.";
    const changes=[];
    for(let index=0;index<currentLeaders.length;index++){
      const current=currentLeaders[index],prior=priorLeaders[index];
      if(current?.pair&&prior?.pair&&current.pair!==prior.pair)changes.push(`${current.title}: ${pair(prior.pair)} → ${pair(current.pair)}. ${pair(current.pair)} won the slot on composite strength—not IM/MAS alone—with Event Z ${fmt(current.eventAngleZ,2)} and regime ${words(current.regime)}.`);
    }
    return changes.length?changes.join(" "):"No four-card leader changed on this update. The mentor is still monitoring pressure, event power and regime deterioration beneath the current leaders.";
  }

  function materialChange(snapshot,prior){
    if(!prior)return false;
    const row=snapshot.row,old=prior.row;
    if(row&&old&&row.pair===old.pair){
      if(row.regime!==old.regime&&(MATERIAL_REGIMES.has(row.regime)||MATERIAL_REGIMES.has(old.regime)))return true;
      const oldRatio=old.ratio===Infinity?20:number(old.ratio),newRatio=row.ratio===Infinity?20:number(row.ratio);
      if(Number.isFinite(oldRatio)&&Number.isFinite(newRatio)&&((oldRatio<1&&newRatio>=1)||(oldRatio>=1&&newRatio<1)))return true;
    }
    const leaders=leadersOf(snapshot.slots),oldLeaders=leadersOf(prior.slots);
    return leaders.some((leader,index)=>leader.pair&&oldLeaders[index]?.pair&&leader.pair!==oldLeaders[index].pair);
  }

  function fingerprint(snapshot){
    const row=snapshot.row||{};
    return JSON.stringify({pair:row.pair,timeframe:row.timeframe,regime:row.regime,ratio:row.ratio===Infinity?"INF":Number.isFinite(row.ratio)?Number(row.ratio).toFixed(2):null,leaders:leadersOf(snapshot.slots).map(item=>item.pair)});
  }

  async function sendExternalAlert(snapshot,narrative){
    if(!snapshot.connected||typeof fetch!=="function")return;
    const fp=fingerprint(snapshot);
    if(fp===lastExternalFingerprint)return;
    lastExternalFingerprint=fp;
    const row=snapshot.row||{};
    try{
      await fetch("/api/evaluation/log",{method:"POST",headers:{"Content-Type":"application/json"},credentials:"same-origin",body:JSON.stringify({
        type:"MENTOR_ALERT",pair:row.pair||null,direction:Number(row.signal)>0?"BUY":Number(row.signal)<0?"SELL":null,timeframe:row.timeframe||null,
        regime:row.regime||null,mas:Number.isFinite(row.mas)?row.mas:null,im:Number.isFinite(row.im)?row.im:null,imMasRatio:Number.isFinite(row.ratio)?row.ratio:null,eventAngleZ:Number.isFinite(row.eventAngleZ)?row.eventAngleZ:null,
        message:`${narrative.headline} ${narrative.posture}`
      })});
    }catch(error){console.error("Mentor notification failed:",error);}
  }

  function maybeBrowserAlert(narrative){
    if(typeof Notification==="undefined"||Notification.permission!=="granted")return;
    try{new Notification("CTE Market Mentor",{body:`${narrative.headline} ${narrative.posture}`.slice(0,220),tag:"cte-market-mentor"});}catch{}
  }

  function buildNarrative(snapshot){
    const rows=Array.isArray(snapshot?.rows)?snapshot.rows:[],selected=rows.find(row=>row.pair===snapshot.selectedPair&&row.timeframe===snapshot.timeframe)||rows.find(row=>row.pair===snapshot.selectedPair)||null;
    const leaders=leadersOf(snapshot?.slots),fallback=leaders.map(item=>rows.find(row=>row.pair===item.pair)).find(Boolean)||rows.find(row=>row.signal&&Number.isFinite(row.strength))||null,row=selected||fallback;
    const headline=row?`${pair(row.pair)} ${row.timeframe} ${side(row.signal)} · ${words(row.regime)} · MAS ${fmt(row.mas)} / IM ${fmt(row.im)}${row.ratio===Infinity?" · IM/MAS ∞ (MAS≈0)":Number.isFinite(row.ratio)?` · IM/MAS ${fmt(row.ratio,2)}`:""}`:"Waiting for synchronized market structure.";
    return{row,headline,explanation:explanationFor(row),posture:postureFor(row),lesson:lessonFor(row),watch:watchFor(row),recommendation:recommendationFor(row),rotation:rotationText(leaders,previous?leadersOf(previous.slots):null),alertLevel:row&&MATERIAL_REGIMES.has(row.regime)?"MATERIAL":row?.regime==="CHALLENGE"?"WATCH":"TEACHING"};
  }

  async function update(input={}){
    const root=ensurePanel();
    const snapshot={...input,rows:Array.isArray(input.rows)?input.rows:[],slots:Array.isArray(input.slots)?input.slots:[]};
    const narrative=buildNarrative(snapshot);
    snapshot.row=narrative.row;
    if(root){
      const set=(id,value)=>{const node=root.querySelector(`#${id}`);if(node)node.textContent=value;};
      set("mentorHeadline",narrative.headline);set("mentorExplanation",narrative.explanation);set("mentorPosture",narrative.posture);set("mentorLesson",narrative.lesson);set("mentorWatch",narrative.watch);set("mentorRecommendation",narrative.recommendation);set("mentorRotation",narrative.rotation);set("mentorAlertLevel",narrative.alertLevel);
    }
    const material=materialChange(snapshot,previous);
    if(material){maybeBrowserAlert(narrative);await sendExternalAlert(snapshot,narrative);}
    previous=snapshot;
    return narrative;
  }

  global.CTEMarketMentor=Object.freeze({VERSION,update,__test:Object.freeze({buildNarrative,materialChange,ratioText,postureFor,lessonFor,rotationText,leadersOf})});
})(globalThis);

(function installCandleFirstChartGuard(global){
  "use strict";

  const VERSION="CTE_CANDLE_FIRST_CHART_GUARD@1.0.0";
  const clampValue=(value,min,max)=>Math.max(min,Math.min(max,value));
  const finiteNumber=value=>Number.isFinite(Number(value));

  function renderCandles(options={}){
    const canvas=options.canvas,candles=Array.isArray(options.candles)?options.candles:[];
    if(!canvas)return null;
    const ctx=canvas.getContext?.("2d");
    if(!ctx)return null;
    const rect=canvas.getBoundingClientRect?.()||{},dpr=Math.max(1,Number(options.devicePixelRatio)||Number(global.devicePixelRatio)||1),width=Math.max(100,Number(rect.width)||Number(canvas.clientWidth)||Number(canvas.parentNode?.clientWidth)||0),height=Math.max(100,Number(rect.height)||Number(canvas.clientHeight)||Number(canvas.parentNode?.clientHeight)||0);
    canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);ctx.fillStyle="#080c12";ctx.fillRect(0,0,width,height);
    if(!candles.length)return{visibleStart:0,visibleEnd:0,visibleCandles:[],latestIndex:-1,rendered:false};

    const visibleBars=clampValue(Math.trunc(Number(options.visibleBars)||120),30,300),offset=clampValue(Math.trunc(Number(options.offsetBars)||0),0,Math.max(0,candles.length-visibleBars)),visibleEnd=candles.length-offset,visibleStart=Math.max(0,visibleEnd-visibleBars),visibleCandles=candles.slice(visibleStart,visibleEnd);
    if(!visibleCandles.length)return{visibleStart,visibleEnd,visibleCandles,latestIndex:candles.length-1,rendered:false};
    const valid=visibleCandles.filter(candle=>[candle?.open,candle?.high,candle?.low,candle?.close].every(finiteNumber));
    if(!valid.length)return{visibleStart,visibleEnd,visibleCandles,latestIndex:candles.length-1,rendered:false};

    const leftIndent=Math.max(0,Number(options.leftIndent)||0),rightIndent=Math.max(0,Number(options.rightIndent)||0),margin={top:20,right:60+rightIndent,bottom:28,left:40+leftIndent},plot={x:margin.left,y:margin.top,w:Math.max(80,width-margin.left-margin.right),h:Math.max(80,height-margin.top-margin.bottom)},gridEndX=width-60;
    const candleLow=Math.min(...valid.map(candle=>Number(candle.low))),candleHigh=Math.max(...valid.map(candle=>Number(candle.high))),live=finiteNumber(options.livePrice)?Number(options.livePrice):NaN,rawLow=Number.isFinite(live)?Math.min(candleLow,live):candleLow,rawHigh=Number.isFinite(live)?Math.max(candleHigh,live):candleHigh,span=Math.max(rawHigh-rawLow,Math.abs(rawHigh)*1e-6,1e-8),low=rawLow-span*.1,high=rawHigh+span*.1,priceToY=price=>plot.y+(high-Number(price))/(high-low)*plot.h,barWidth=plot.w/Math.max(1,visibleCandles.length),indexToX=index=>plot.x+(index+.5)*barWidth,format=typeof options.formatPrice==="function"?options.formatPrice:value=>Number(value).toFixed(5);

    ctx.strokeStyle="#1c2632";ctx.lineWidth=1;ctx.font="9px ui-monospace,monospace";ctx.textBaseline="middle";
    for(let index=0;index<=4;index++){
      const y=plot.y+plot.h*index/4,price=high-(high-low)*index/4;ctx.beginPath();ctx.moveTo(plot.x,y+.5);ctx.lineTo(gridEndX,y+.5);ctx.stroke();ctx.fillStyle="#8b98aa";ctx.textAlign="left";ctx.fillText(format(price),gridEndX+5,y);
    }
    for(let index=0;index<=6;index++){
      const x=plot.x+plot.w*index/6;ctx.strokeStyle="#151e29";ctx.beginPath();ctx.moveTo(x+.5,plot.y);ctx.lineTo(x+.5,plot.y+plot.h);ctx.stroke();const candle=visibleCandles[Math.min(visibleCandles.length-1,Math.floor(index/6*(visibleCandles.length-1)))];if(candle?.time){ctx.fillStyle="#7f8b9b";ctx.textAlign=index===0?"left":index===6?"right":"center";ctx.fillText(new Intl.DateTimeFormat(undefined,{month:"short",day:"2-digit",hour:"2-digit",minute:"2-digit"}).format(new Date(candle.time)),x,plot.y+plot.h+17);}
    }

    for(let index=0;index<visibleCandles.length;index++){
      const candle=visibleCandles[index],open=Number(candle?.open),highPrice=Number(candle?.high),lowPrice=Number(candle?.low),close=Number(candle?.close);if(![open,highPrice,lowPrice,close].every(Number.isFinite))continue;const x=indexToX(index),rising=close>=open,stroke=rising?"#48c78e":"#ef6b73";ctx.strokeStyle=stroke;ctx.fillStyle=stroke;ctx.beginPath();ctx.moveTo(x,priceToY(highPrice));ctx.lineTo(x,priceToY(lowPrice));ctx.stroke();const bodyTop=priceToY(Math.max(open,close)),bodyBottom=priceToY(Math.min(open,close)),bodyWidth=Math.max(1,Math.min(11,barWidth*.6));ctx.fillRect(x-bodyWidth/2,bodyTop,bodyWidth,Math.max(1,bodyBottom-bodyTop));
    }

    if(Number.isFinite(live)){
      const y=priceToY(live),label=format(live);ctx.strokeStyle="#7dc4ff";ctx.setLineDash?.([4,4]);ctx.beginPath();ctx.moveTo(plot.x,y);ctx.lineTo(gridEndX,y);ctx.stroke();ctx.setLineDash?.([]);ctx.fillStyle="#7dc4ff";ctx.fillRect(gridEndX,y-9,60,18);ctx.fillStyle="#080c12";ctx.textAlign="left";ctx.fillText(label,gridEndX+5,y);
    }

    const crosshair=options.crosshair;
    if(options.crosshairEnabled!==false&&crosshair&&finiteNumber(crosshair.x)){
      const localX=Number(crosshair.x),relative=clampValue(Math.floor((localX-plot.x)/Math.max(1,barWidth)),0,visibleCandles.length-1),candle=visibleCandles[relative],x=indexToX(relative),candidateY=finiteNumber(crosshair.y)?Number(crosshair.y):priceToY(Number(candle?.close)),y=clampValue(candidateY,plot.y,plot.y+plot.h),cursorPrice=high-((y-plot.y)/plot.h)*(high-low),timeLabel=candle?.time?new Intl.DateTimeFormat(undefined,{year:"numeric",month:"short",day:"2-digit",hour:"2-digit",minute:"2-digit",second:"2-digit"}).format(new Date(candle.time)):"—",priceLabel=format(cursorPrice);ctx.setLineDash?.([3,3]);ctx.strokeStyle="#a7b5c7";ctx.beginPath();ctx.moveTo(x,plot.y);ctx.lineTo(x,plot.y+plot.h);ctx.moveTo(plot.x,y);ctx.lineTo(gridEndX,y);ctx.stroke();ctx.setLineDash?.([]);ctx.fillStyle="#26384b";const textWidth=Math.max(80,Math.ceil(ctx.measureText?.(timeLabel)?.width||90)+10),timeX=clampValue(x-textWidth/2,plot.x,Math.max(plot.x,gridEndX-textWidth));ctx.fillRect(timeX,plot.y+plot.h+4,textWidth,18);ctx.fillStyle="#edf2ff";ctx.textAlign="left";ctx.fillText(timeLabel,timeX+5,plot.y+plot.h+13);ctx.fillStyle="#7dc4ff";ctx.fillRect(gridEndX,y-9,60,18);ctx.fillStyle="#080c12";ctx.fillText(priceLabel,gridEndX+5,y);
    }

    return{visibleStart,visibleEnd,visibleCandles,latestIndex:candles.length-1,pricePlot:plot,plot,indexToX,priceToY,rendered:true};
  }

  function install(){
    if(typeof document==="undefined"||typeof global.drawChart!=="function")return false;
    if(global.drawChart.__cteCandleFirstGuard)return true;
    const enrichedDraw=global.drawChart;
    const baseOptions=()=>{
      const pair=state.selectedInstrument,candles=state.chartCandles||[];let live=NaN;try{live=liveMid(pair);}catch{}
      return{canvas:document.getElementById("chart"),candles,pair,visibleBars:state.visibleBars,offsetBars:state.offsetBars,leftIndent:state.leftIndent,rightIndent:state.rightIndent,crosshairEnabled:state.crosshairEnabled,crosshair:state.crosshair,livePrice:live,formatPrice:value=>{try{return formatPrice(value,pair);}catch{return Number(value).toFixed(String(pair||"").endsWith("JPY")?3:5);}}};
    };
    const paintBase=()=>renderCandles(baseOptions());
    const retainCandles=error=>{
      if(!(state.chartCandles||[]).length)return;
      paintBase();
      const message=document.getElementById("chartMessage");if(message)message.hidden=true;
      const legend=document.getElementById("indicatorLegend");if(legend)legend.textContent=`Candles active · ${state.selectedStrategy||"indicator"} overlay unavailable${error?.message?` · ${error.message}`:""}`;
    };
    const guarded=function(...args){
      if((state.chartCandles||[]).length)paintBase();
      try{
        const result=enrichedDraw.apply(this,args),message=document.getElementById("chartMessage");
        if((state.chartCandles||[]).length&&message&&!message.hidden&&String(message.textContent||"").startsWith("Chart renderer failure"))retainCandles(new Error(String(message.textContent).replace(/^Chart renderer failure\s*·?\s*/,"")));
        return result;
      }catch(error){
        console.error("Forensic chart enrichment failed; retained completed OANDA candles:",error);retainCandles(error);try{drawOscillatorChart();}catch(auxError){console.error("MAS / IM chart enrichment failed:",auxError);}try{drawWeeklyCognition(state.selectedInstrument,state.evalMasImMetrics);}catch(auxError){console.error("Weekly cognition enrichment failed:",auxError);}return null;
      }
    };
    guarded.__cteCandleFirstGuard=true;guarded.__cteEnrichedDraw=enrichedDraw;global.drawChart=guarded;
    if((state.chartCandles||[]).length)guarded();
    return true;
  }

  if(typeof document!=="undefined"){
    if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",install,{once:true});else queueMicrotask(install);
  }
  global.CTEChartRuntimeGuard=Object.freeze({VERSION,install,__test:Object.freeze({renderCandles})});
})(globalThis);
