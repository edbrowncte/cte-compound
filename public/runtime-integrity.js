(function installRuntimeIntegrity(global){
  "use strict";

  const VERSION="CTE_RUNTIME_INTEGRITY@1.2.0",REGRESSION_WINDOW=50,EXECUTABLE_BASIS="LIVE_OANDA_EXECUTABLE_SIDE_QUOTE_AT_REGISTRATION",ENGINE_SIGNAL_SYNC_VERSION="ENGINE_EXECUTABLE_SIGNAL_REGISTRY_SYNC@1.0.0",ENGINE_SIGNAL_WATCHDOG_MS=30000;
  const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
  const finite=value=>value!==null&&value!==undefined&&value!==""&&Number.isFinite(Number(value));
  let engineSignalSyncInFlight=null,engineSignalWatchdog=null;
  function normalCDF(x){const a1=.254829592,a2=-.284496736,a3=1.421413741,a4=-1.453152027,a5=1.061405429,p=.3275911,sign=x<0?-1:1,scaled=Math.abs(x)/Math.sqrt(2),t=1/(1+p*scaled),y=1-(((((a5*t+a4)*t+a3)*t+a2)*t+a1)*t*Math.exp(-scaled*scaled));return .5*(1+sign*y);}
  function regressionPFromR2(r2,n=REGRESSION_WINDOW){if(!Number.isFinite(r2)||r2<=0||n<=2)return 1;const bounded=clamp(r2,0,1),f=bounded>=1?Infinity:(bounded/(1-bounded))*(n-2),t=Math.sqrt(f),p=Number.isFinite(t)?clamp(2*(1-normalCDF(t)),0,1):0;return{fStat:f,tStat:t,pValue:p,n};}
  function repairEvaluationRows(rows=state.evaluationTableData||[]){let repaired=0,incomplete=0;for(const row of rows){if(!row)continue;row.integrityStatus="OK";const r2=Number(row.r2),p=Number(row.pValue),badHighFit=Number.isFinite(r2)&&r2>.05&&Number.isFinite(p)&&p>=.999999;if(badHighFit){const corrected=regressionPFromR2(r2);row.fStat=corrected.fStat;row.pValue=corrected.pValue;row.statIntegrityRepair={version:VERSION,reason:"R2_PVALUE_INCONSISTENCY",originalPValue:p,regressionWindow:corrected.n};row.integrityStatus="STAT_REPAIRED";repaired++;}const critical=[row.mas,row.im,row.r2,row.pValue];if(Number(row.signal)&&critical.some(value=>!Number.isFinite(Number(value)))){row.integrityStatus=row.integrityStatus==="STAT_REPAIRED"?"STAT_REPAIRED_WITH_INCOMPLETE_METRICS":"INCOMPLETE_METRICS";incomplete++;}}return{repaired,incomplete};}
  function activeIoTickets(){try{return global.CTEIndicatorOnlyUI?.currentTickets?.().filter(ticket=>ticket.enabled)||[];}catch{return[];}}
  function mentorAlignment(snapshot={}){const rows=Array.isArray(snapshot.rows)?snapshot.rows:[],selected=rows.find(row=>row.pair===snapshot.selectedPair&&row.timeframe===snapshot.timeframe)||rows.find(row=>row.pair===snapshot.selectedPair)||null;if(!selected)return{aligned:true,ticket:null,row:null};const ticket=activeIoTickets().find(item=>item.pair===selected.pair&&item.timeframe===selected.timeframe)||null;if(!ticket)return{aligned:true,ticket:null,row:selected};const evaluationIndicator=String(state.selectedScheduleStrategy||"");return{aligned:evaluationIndicator===ticket.indicator,ticket,row:selected,evaluationIndicator};}
  function installEvaluationGuard(){const prior=global.computeEvaluationResults;if(typeof prior!=="function"||prior.__cteIntegrityGuard)return false;const guarded=async function(...args){const result=await prior.apply(this,args),assessment=repairEvaluationRows();if(assessment.repaired||assessment.incomplete){try{renderEvaluationTable();renderFourSlotRotator();}catch(error){console.error("Evaluation integrity rerender failed:",error);}if(assessment.repaired)console.warn(`Evaluation statistical integrity repaired ${assessment.repaired} inconsistent R²/p-value row(s).`);if(assessment.incomplete)console.warn(`Evaluation data integrity flagged ${assessment.incomplete} incomplete metric row(s).`);}return result;};guarded.__cteIntegrityGuard=true;global.computeEvaluationResults=guarded;return true;}
  function installMentorGuard(){const prior=global.CTEMarketMentor;if(!prior?.update||prior.__cteIoAlignmentGuard)return false;const wrapped=Object.freeze({...prior,__cteIoAlignmentGuard:true,update:async input=>{const alignment=mentorAlignment(input);const guarded=alignment.aligned?input:{...input,connected:false};const narrative=await prior.update(guarded);if(!alignment.aligned){const node=document.getElementById("mentorVersion");if(node)node.textContent=`${prior.VERSION} · external alert withheld: Evaluation ${alignment.evaluationIndicator||"unknown"} ≠ IO Ticket ${alignment.ticket.slot} ${alignment.ticket.indicator}`;console.warn("MENTOR_ALERT withheld for IO-managed pair because Evaluation indicator does not match IO ticket",{pair:alignment.ticket.pair,timeframe:alignment.ticket.timeframe,evaluationIndicator:alignment.evaluationIndicator,ioIndicator:alignment.ticket.indicator,ticket:alignment.ticket.slot});}return narrative;}});global.CTEMarketMentor=wrapped;return true;}

  function chartContext(canvas){
    const eventChart=canvas?.id==="eventChart";
    const pair=eventChart?(document.getElementById("eventPair")?.value||state.selectedInstrument):state.selectedInstrument;
    const timeframe=eventChart?(document.getElementById("eventTimeframe")?.value||state.selectedTimeframe):state.selectedTimeframe;
    return{pair,timeframe};
  }
  function directionValue(value){const text=String(value||"").toUpperCase();return text.startsWith("BUY")?1:text.startsWith("SELL")?-1:Math.sign(Number(value)||0);}
  function executableSignalFromRecord(row,source="LEDGER"){
    if(!row||!row.pair||!row.timeframe)return null;
    const basis=row.sourcePriceBasis||row.signalPriceBasis;if(basis!==EXECUTABLE_BASIS||!finite(row.signalPrice))return null;
    const direction=directionValue(row.direction);if(!direction)return null;
    const id=String(row.executionEventId||row.event||row.ledgerId||`${row.pair}|${row.timeframe}|${row.signalQuoteTime||row.time}|${direction}`);
    return{direction,price:Number(row.signalPrice),time:row.marketSignalTime||row.signalQuoteTime||row.registeredAt||row.time||null,marketSignalTime:row.marketSignalTime||row.signalQuoteTime||row.registeredAt||row.time||null,signalQuoteTime:row.signalQuoteTime||null,priceBasis:basis,sourcePriceBasis:basis,marketPrice:true,current:false,executionEventId:id,signalPriceSide:row.signalPriceSide||null,sourceCandleClose:finite(row.sourceCandleClose)?Number(row.sourceCandleClose):null,signalRegistrySource:source};
  }
  function liveLedgerSignals(pair,timeframe){
    const rows=Array.isArray(state?.tradingLedger)?state.tradingLedger:[],seen=new Set(),signals=[];
    for(const row of rows){if(row?.type!=="SIGNAL_PROVENANCE_REGISTERED"||row?.pair!==pair||row?.timeframe!==timeframe)continue;const signal=executableSignalFromRecord(row,"LEDGER");if(!signal||seen.has(signal.executionEventId))continue;seen.add(signal.executionEventId);signals.push(signal);}
    return signals.sort((a,b)=>Date.parse(a.time||0)-Date.parse(b.time||0));
  }
  function liveEngineSignals(pair,timeframe){
    const rows=Array.isArray(state?.engineExecutableSignals)?state.engineExecutableSignals:[],seen=new Set(),signals=[];
    for(const row of rows){if(row?.pair!==pair||row?.timeframe!==timeframe)continue;const signal=executableSignalFromRecord(row,"ENGINE_REGISTRY");if(!signal||seen.has(signal.executionEventId))continue;seen.add(signal.executionEventId);signals.push(signal);}
    return signals.sort((a,b)=>Date.parse(a.time||0)-Date.parse(b.time||0));
  }
  function liveExecutableSignals(pair,timeframe){
    const seen=new Set(),signals=[];
    for(const signal of [...liveEngineSignals(pair,timeframe),...liveLedgerSignals(pair,timeframe)]){if(seen.has(signal.executionEventId))continue;seen.add(signal.executionEventId);signals.push(signal);}
    return signals.sort((a,b)=>Date.parse(a.time||0)-Date.parse(b.time||0));
  }
  function executableSignalSignature(rows=[]){return rows.map(row=>`${row.executionEventId||row.event||""}|${row.signalPrice??""}|${row.signalQuoteTime||row.marketSignalTime||""}`).join("\n");}
  async function refreshExecutableSignals(reason="MANUAL"){
    if(typeof fetch!=="function"||typeof state==="undefined")return false;
    if(engineSignalSyncInFlight)return engineSignalSyncInFlight;
    engineSignalSyncInFlight=(async()=>{
      try{
        const response=await fetch("/api/engine/status",{headers:{Accept:"application/json"},credentials:"same-origin",cache:"no-store"}),payload=await response.json().catch(()=>({}));
        if(!response.ok)throw new Error(payload.error||payload.message||`HTTP ${response.status}`);
        const next=Array.isArray(payload.recentExecutableSignals)?payload.recentExecutableSignals:[],before=executableSignalSignature(Array.isArray(state.engineExecutableSignals)?state.engineExecutableSignals:[]),after=executableSignalSignature(next);
        state.engineExecutableSignals=next;state.engineExecutableSignalsSyncedAt=new Date().toISOString();state.engineExecutableSignalsSyncReason=reason;state.engineExecutableSignalsError=null;state.engineExecutableSignalsVersion=ENGINE_SIGNAL_SYNC_VERSION;
        if(before!==after&&typeof global.drawChart==="function")global.drawChart();
        return true;
      }catch(error){state.engineExecutableSignalsError=String(error?.message||error);state.engineExecutableSignalsErrorAt=new Date().toISOString();return false;}
      finally{engineSignalSyncInFlight=null;}
    })();
    return engineSignalSyncInFlight;
  }
  function installSignalChartAuthority(){
    const chart=global.CTEUnifiedChart;if(!chart?.render||chart.__cteExecutableSignalAuthority)return false;
    const render=chart.render.bind(chart),wrapped=Object.freeze({...chart,__cteExecutableSignalAuthority:true,render:options=>{const context=chartContext(options?.canvas),live=context.pair&&context.timeframe?liveExecutableSignals(context.pair,context.timeframe):[];return render({...options,signals:live});}});
    global.CTEUnifiedChart=wrapped;
    queueMicrotask(()=>{try{if(typeof global.drawChart==="function")global.drawChart();}catch(error){console.error("Executable signal chart rerender failed:",error);}});
    return true;
  }
  function installExecutableSignalSync(){
    void refreshExecutableSignals("BOOTSTRAP");
    if(typeof document!=="undefined"&&!engineSignalWatchdog)engineSignalWatchdog=setInterval(()=>{if(!document.hidden)void refreshExecutableSignals("WATCHDOG");},ENGINE_SIGNAL_WATCHDOG_MS);
    return true;
  }

  function install(){installEvaluationGuard();installMentorGuard();installSignalChartAuthority();installExecutableSignalSync();if(Array.isArray(state?.evaluationTableData)&&state.evaluationTableData.length)repairEvaluationRows();}
  global.CTERuntimeIntegrity=Object.freeze({VERSION,REGRESSION_WINDOW,EXECUTABLE_BASIS,ENGINE_SIGNAL_SYNC_VERSION,ENGINE_SIGNAL_WATCHDOG_MS,regressionPFromR2,repairEvaluationRows,mentorAlignment,chartContext,executableSignalFromRecord,liveLedgerSignals,liveEngineSignals,liveExecutableSignals,refreshExecutableSignals,installSignalChartAuthority,installExecutableSignalSync,install});
  if(typeof document!=="undefined"){if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",install,{once:true});else queueMicrotask(install);}
})(globalThis);