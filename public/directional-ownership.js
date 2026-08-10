(function installDirectionalOwnership(global){
  "use strict";

  const VERSION="CTE_DIRECTIONAL_OWNERSHIP@1.0.0";

  function normalizeSignals(signals=[],candles=[]){
    const output=[];let owner=0,currentMarker=null;
    for(const raw of Array.isArray(signals)?signals:[]){
      const direction=Math.sign(Number(raw?.direction));
      const index=Number(raw?.index??raw?.signalIndex);
      if(!direction||!Number.isInteger(index))continue;
      if(raw?.current){currentMarker={...raw,index,direction,current:true};continue;}
      if(direction===owner)continue;
      output.push({...raw,index,direction,current:false});owner=direction;
    }
    if(currentMarker&&currentMarker.direction!==owner){output.push({...currentMarker,current:true});owner=currentMarker.direction;}
    const lastIndex=(candles?.length||0)-1;
    if(owner&&lastIndex>=0){
      const last=output.at(-1);
      if(last?.index===lastIndex&&last.direction===owner)last.current=true;
      else output.push({index:lastIndex,direction:owner,time:candles[lastIndex]?.time,price:candles[lastIndex]?.close,current:true,ownership:VERSION});
    }
    return output;
  }

  function wrapUnifiedRenderer(){
    const renderer=global.CTEUnifiedChart;if(!renderer?.render||renderer.__directionalOwnershipWrapped)return false;
    const prior=renderer.render.bind(renderer);
    const wrapped=Object.freeze({...renderer,render(options={}){return prior({...options,signals:normalizeSignals(options.signals,options.candles)});},__directionalOwnershipWrapped:true});
    global.CTEUnifiedChart=wrapped;
    return true;
  }

  function install(){wrapUnifiedRenderer();}
  if(typeof document!=="undefined"){if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",install,{once:true});else queueMicrotask(install);}
  else install();

  global.CTEDirectionalOwnership=Object.freeze({VERSION,normalizeSignals,wrapUnifiedRenderer});
})(globalThis);
