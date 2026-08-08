import fs from "node:fs";

const path="public/index.html";
let html=fs.readFileSync(path,"utf8"),changes=0;
const replace=(from,to,label)=>{if(!html.includes(from))throw new Error(`Missing cleanup anchor: ${label}`);html=html.replace(from,to);changes++;};

replace(
'  function pointerPosition(event) { const rect=el("chart").getBoundingClientRect(); return {x:event.clientX-rect.left,y:event.clientY-rect.top}; }',
`  function releaseBrowserSession(){
    state.connected=false;
    state.scheduleController?.abort();state.chartController?.abort();state.eventScheduleController?.abort();state.eventChartController?.abort();
    clearTimeout(state.progressiveScheduleTimer);state.progressiveScheduleTimer=null;
    state.scheduleLoading=false;state.scheduleMode="";state.chartLoading=false;state.eventScheduleLoading=false;state.eventChartLoading=false;
    state.scheduleCandles.clear();state.scheduleEvaluations.clear();state.chartCache.clear();state.candleQueue=[];state.candleInflight.clear();
    state.eventLoadedKey="";state.eventFailures.clear();state.eventIndicatorCache.clear();
    stopPositionMonitor();stopAdaptiveMonitor();
  }

  function pointerPosition(event) { const rect=el("chart").getBoundingClientRect(); return {x:event.clientX-rect.left,y:event.clientY-rect.top}; }`,
'browser lifecycle cleanup');

replace(
'  function bindEvents() {\n    el("saveEngineConfig").addEventListener("click",saveEngineConfig);',
'  function bindEvents() {\n    window.addEventListener("pagehide",releaseBrowserSession);\n    window.addEventListener("pageshow",event=>{if(event.persisted&&!state.connected)void connect();});\n    el("saveEngineConfig").addEventListener("click",saveEngineConfig);',
'lifecycle event binding');

fs.writeFileSync(path,html);
console.log(`Preserved automatic-session browser cleanup (${changes} transformations).`);
