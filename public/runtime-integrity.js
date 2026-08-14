(function installRuntimeIntegrity(global){
  "use strict";

  const VERSION="CTE_RUNTIME_INTEGRITY@1.3.1",REGRESSION_WINDOW=50,EXECUTABLE_BASIS="LIVE_OANDA_EXECUTABLE_SIDE_QUOTE_AT_REGISTRATION",ENGINE_SIGNAL_SYNC_VERSION="ENGINE_EXECUTABLE_SIGNAL_REGISTRY_SYNC@1.1.0",ENGINE_SIGNAL_WATCHDOG_MS=30000,CHART_STREAMING_VERSION="OANDA_SELECTED_CHART_FORMING_CANDLE@1.0.0",MAX_STREAMING_BARS=240;
  const TF_MS=Object.freeze({S5:5000,S30:30000,M1:60000,M5:300000,M15:900000,M30:1800000,H1:3600000,H2:7200000,H4:14400000,D:86400000,W:604800000});
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
  function latestIsoMs(value){const matches=String(value||"").match(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z/g)||[],values=matches.map(item=>Date.parse(item)).filter(Number.isFinite);return values.length?Math.max(...values):null;}
  function sourceSignalTime(row={}){const direct=row.signalTime||row.sourceCrossingTime||null;if(Number.isFinite(Date.parse(direct||"")))return direct;const parsed=latestIsoMs(row.sourceEventId||row.executionEventId||row.event);return parsed===null?null:new Date(parsed).toISOString();}
  function signalChronologyKey(signal={}){return `${signal.pair||""}|${signal.timeframe||""}|${signal.indicator||""}|${signal.indicatorOnlyTicket??""}`;}
  function monotonicExecutableSignals(signals=[]){
    const ordered=[...(Array.isArray(signals)?signals:[])].sort((a,b)=>{const left=Date.parse(a.registeredAt||a.time||""),right=Date.parse(b.registeredAt||b.time||"");return(Number.isFinite(left)?left:0)-(Number.isFinite(right)?right:0);}),latestByKey=new Map(),kept=[],quarantined=[];
    for(const signal of ordered){const source=Date.parse(signal.sourceSignalTime||""),key=signalChronologyKey(signal),prior=latestByKey.get(key);if(Number.isFinite(source)&&Number.isFinite(prior)&&source<=prior){quarantined.push(signal);continue;}if(Number.isFinite(source))latestByKey.set(key,source);kept.push(signal);}
    return{kept,quarantined};
  }
  function executableSignalFromRecord(row,source="LEDGER"){
    if(!row||!row.pair||!row.timeframe)return null;
    const basis=row.sourcePriceBasis||row.signalPriceBasis;if(basis!==EXECUTABLE_BASIS||!finite(row.signalPrice))return null;
    const direction=directionValue(row.direction);if(!direction)return null;
    const id=String(row.executionEventId||row.event||row.ledgerId||`${row.pair}|${row.timeframe}|${row.signalQuoteTime||row.time}|${direction}`),sourceTime=sourceSignalTime(row);
    return{pair:row.pair,timeframe:row.timeframe,indicator:row.indicator||row.strategy||null,indicatorOnlyTicket:row.indicatorOnlyTicket??null,direction,price:Number(row.signalPrice),time:row.marketSignalTime||row.signalQuoteTime||row.registeredAt||row.time||null,marketSignalTime:row.marketSignalTime||row.signalQuoteTime||row.registeredAt||row.time||null,signalQuoteTime:row.signalQuoteTime||null,registeredAt:row.registeredAt||row.time||row.signalQuoteTime||null,sourceSignalTime:sourceTime,priceBasis:basis,sourcePriceBasis:basis,marketPrice:true,current:false,executionEventId:id,signalPriceSide:row.signalPriceSide||null,sourceCandleClose:finite(row.sourceCandleClose)?Number(row.sourceCandleClose):null,signalRegistrySource:source};
  }
  function liveLedgerSignals(pair,timeframe){
    const rows=Array.isArray(state?.tradingLedger)?state.tradingLedger:[],seen=new Set(),signals=[];
    for(const row of rows){if(row?.type!=="SIGNAL_PROVENANCE_REGISTERED"||row?.pair!==pair||row?.timeframe!==timeframe)continue;const signal=executableSignalFromRecord(row,"LEDGER");if(!signal||seen.has(signal.executionEventId))continue;seen.add(signal.executionEventId);signals.push(signal);}
    return signals;
  }
  function liveEngineSignals(pair,timeframe){
    const rows=Array.isArray(state?.engineExecutableSignals)?state.engineExecutableSignals:[],seen=new Set(),signals=[];
    for(const row of rows){if(row?.pair!==pair||row?.timeframe!==timeframe)continue;const signal=executableSignalFromRecord(row,"ENGINE_REGISTRY");if(!signal||seen.has(signal.executionEventId))continue;seen.add(signal.executionEventId);signals.push(signal);}
    return signals;
  }
  function liveExecutableSignals(pair,timeframe){
    const seen=new Set(),signals=[];
    for(const signal of [...liveEngineSignals(pair,timeframe),...liveLedgerSignals(pair,timeframe)]){if(seen.has(signal.executionEventId))continue;seen.add(signal.executionEventId);signals.push(signal);}
    const chronology=monotonicExecutableSignals(signals);state.chartExecutableSignalQuarantine=chronology.quarantined;return chronology.kept.sort((a,b)=>Date.parse(a.time||0)-Date.parse(b.time||0));
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
        state.engineExecutableSignals=next;state.engineExecutableSignalsSyncedAt=new Date().toISOString();state.engineExecutableSignalsSyncReason=reason;state.engineExecutableSignalsError=null;state.engineExecutableSignalsVersion=ENGINE_SIGNAL_SYNC_VERSION;state.engineQuarantinedExecutableSignalCount=Number(payload.quarantinedExecutableSignalCount)||0;
        if(before!==after&&typeof global.drawChart==="function")global.drawChart();
        return true;
      }catch(error){state.engineExecutableSignalsError=String(error?.message||error);state.engineExecutableSignalsErrorAt=new Date().toISOString();return false;}
      finally{engineSignalSyncInFlight=null;}
    })();
    return engineSignalSyncInFlight;
  }
  function installPositionSignalHook(){
    const prior=global.refreshOpenPositions;if(typeof prior!=="function"||prior.__cteExecutableSignalSync)return false;
    const wrapped=async function(...args){const result=await prior.apply(this,args);void refreshExecutableSignals("POSITION_TRUTH_REFRESH");return result;};Object.defineProperty(wrapped,"__cteExecutableSignalSync",{value:true});global.refreshOpenPositions=wrapped;try{refreshOpenPositions=wrapped;}catch{}return true;
  }
  function installLedgerSignalHook(){
    const prior=global.renderTradingLedger;if(typeof prior!=="function"||prior.__cteExecutableSignalSync)return false;
    const wrapped=function(...args){const result=prior.apply(this,args);void refreshExecutableSignals("LEDGER_REFRESH");if(typeof global.drawChart==="function")global.drawChart();return result;};Object.defineProperty(wrapped,"__cteExecutableSignalSync",{value:true});global.renderTradingLedger=wrapped;try{renderTradingLedger=wrapped;}catch{}return true;
  }
  function installSignalChartAuthority(){
    const chart=global.CTEUnifiedChart;if(!chart?.render||chart.__cteExecutableSignalAuthority)return false;
    const render=chart.render.bind(chart),wrapped=Object.freeze({...chart,__cteExecutableSignalAuthority:true,render:options=>{const context=chartContext(options?.canvas),live=context.pair&&context.timeframe?liveExecutableSignals(context.pair,context.timeframe):[];return render({...options,signals:live});}});
    global.CTEUnifiedChart=wrapped;
    queueMicrotask(()=>{try{if(typeof global.drawChart==="function")global.drawChart();}catch(error){console.error("Executable signal chart rerender failed:",error);}});
    return true;
  }

  function streamingPrice(pair){const price=state?.positionPrices?.get?.(pair),bid=Number(price?.bid),ask=Number(price?.ask);if(!Number.isFinite(bid)||!Number.isFinite(ask))return null;return{mid:(bid+ask)/2,time:price?.time||new Date().toISOString(),bid,ask,priceBasis:price?.priceBasis||"LIVE_OANDA_BID_ASK"};}
  function streamingBucketStart(lastCompletedTime,tickTime,timeframe){const step=TF_MS[String(timeframe||"").toUpperCase()],last=Date.parse(lastCompletedTime||""),tick=Date.parse(tickTime||"");if(!step||!Number.isFinite(last)||!Number.isFinite(tick)||tick<=last)return null;const intervals=Math.max(1,Math.floor((tick-last)/step));return last+(intervals*step);}
  function streamingChartCandles(candles,pair,timeframe){
    const data=Array.isArray(candles)?candles:[],last=data.at(-1),price=streamingPrice(pair);if(!last||!price||!finite(last.close))return data;
    const lastCompletedMs=Date.parse(last.time||""),bucket=streamingBucketStart(last.time,price.time,timeframe);if(bucket===null||bucket<=lastCompletedMs)return data;
    if(!(state.chartStreamingBars instanceof Map))state.chartStreamingBars=new Map();const prefix=`${pair}|${timeframe}|`;
    for(const storedKey of [...state.chartStreamingBars.keys()]){if(!storedKey.startsWith(prefix))continue;const storedBucket=Number(storedKey.slice(prefix.length));if(!Number.isFinite(storedBucket)||storedBucket<=lastCompletedMs)state.chartStreamingBars.delete(storedKey);}
    const existing=[...state.chartStreamingBars.entries()].filter(([storedKey])=>storedKey.startsWith(prefix)).map(([,bar])=>bar).sort((a,b)=>Date.parse(a.time)-Date.parse(b.time)),key=`${prefix}${bucket}`,same=state.chartStreamingBars.get(key),previous=existing.at(-1),open=same?.open??Number(previous?.close??last.close),close=Number(price.mid),high=Math.max(Number(same?.high??open),close),low=Math.min(Number(same?.low??open),close),bar={time:new Date(bucket).toISOString(),open,high,low,close,volume:Number(same?.volume||0),complete:false,streaming:true,bid:price.bid,ask:price.ask,priceBasis:"LIVE_OANDA_BID_ASK_MID",streamTime:price.time};state.chartStreamingBars.set(key,bar);
    let streamBars=[...state.chartStreamingBars.entries()].filter(([storedKey])=>storedKey.startsWith(prefix)).sort((a,b)=>Number(a[0].slice(prefix.length))-Number(b[0].slice(prefix.length)));if(streamBars.length>MAX_STREAMING_BARS){for(const [storedKey] of streamBars.slice(0,streamBars.length-MAX_STREAMING_BARS))state.chartStreamingBars.delete(storedKey);streamBars=streamBars.slice(-MAX_STREAMING_BARS);}const extras=streamBars.map(([,value])=>value);
    state.chartLiveCandle=bar;state.chartStreamingVersion=CHART_STREAMING_VERSION;state.chartStreamingAt=price.time;state.chartStreamingBarCount=extras.length;return[...data,...extras];
  }
  function installStreamingChartAuthority(){
    const prior=global.drawChart;if(typeof prior!=="function"||prior.__cteStreamingCandleAuthority)return false;
    const wrapped=function(...args){const original=state.chartCandles,display=streamingChartCandles(original,state.selectedInstrument,state.selectedTimeframe);if(display===original)return prior.apply(this,args);state.chartDisplayCandles=display;state.chartCandles=display;try{return prior.apply(this,args);}finally{state.chartCandles=original;}};Object.defineProperty(wrapped,"__cteStreamingCandleAuthority",{value:true});global.drawChart=wrapped;try{drawChart=wrapped;}catch{}return true;
  }

  function installExecutableSignalSync(){
    void refreshExecutableSignals("BOOTSTRAP");installPositionSignalHook();installLedgerSignalHook();if(typeof setTimeout==="function")setTimeout(()=>{installPositionSignalHook();installLedgerSignalHook();},0);
    if(typeof document!=="undefined"&&!engineSignalWatchdog)engineSignalWatchdog=setInterval(()=>{if(!document.hidden)void refreshExecutableSignals("WATCHDOG");},ENGINE_SIGNAL_WATCHDOG_MS);
    return true;
  }

  function install(){installEvaluationGuard();installMentorGuard();installSignalChartAuthority();installStreamingChartAuthority();installExecutableSignalSync();if(Array.isArray(state?.evaluationTableData)&&state.evaluationTableData.length)repairEvaluationRows();}
  global.CTERuntimeIntegrity=Object.freeze({VERSION,REGRESSION_WINDOW,EXECUTABLE_BASIS,ENGINE_SIGNAL_SYNC_VERSION,ENGINE_SIGNAL_WATCHDOG_MS,CHART_STREAMING_VERSION,MAX_STREAMING_BARS,TF_MS,regressionPFromR2,repairEvaluationRows,mentorAlignment,chartContext,directionValue,latestIsoMs,sourceSignalTime,signalChronologyKey,monotonicExecutableSignals,executableSignalFromRecord,liveLedgerSignals,liveEngineSignals,liveExecutableSignals,refreshExecutableSignals,installPositionSignalHook,installLedgerSignalHook,installSignalChartAuthority,streamingPrice,streamingBucketStart,streamingChartCandles,installStreamingChartAuthority,installExecutableSignalSync,install});
  if(typeof document!=="undefined"){if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",install,{once:true});else queueMicrotask(install);}
})(globalThis);
