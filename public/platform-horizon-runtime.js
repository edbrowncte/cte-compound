(function installPlatformHorizonRuntime(root){
  "use strict";

  const H=root.CTE_HORIZON_HTL;
  if(!H)throw new Error("CTE Horizon HTL contract is unavailable.");
  const VERSION=H.VERSION;
  const LENGTH_GRID=[10,20,30,50];
  const FILTER_GRID={ASSET:[0],DARE_N:[0,.5,1,2],DARE:[0],COMBO:[0,.5,1,2],NAI:[0,.5,1,2],APEX:[0,1,2]};
  const byId=id=>document.getElementById(id);
  const finite=Number.isFinite;
  const strategyLabel=id=>typeof STRATEGIES!=="undefined"?(STRATEGIES.find(item=>item.id===id)?.label||id):id;
  const pairLabel=pair=>String(pair||"").replace("_","/");
  const escape=value=>String(value??"").replace(/[&<>"']/g,character=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[character]));

  function canonicalBuild(candles,length){return H.build(candles,length);}
  root.htlBuild=canonicalBuild;
  root.htlCausal=canonicalBuild;
  try{htlBuild=canonicalBuild;htlCausal=canonicalBuild;}catch{}

  const priorCausalDirection=typeof causalDirection==="function"?causalDirection:null;
  if(priorCausalDirection){
    root.causalDirection=function platformCausalDirection(indicators,index,strategy,filter=0){
      if(strategy==="ASSET"){
        const asset=indicators?.asset?.[index],inverse=indicators?.inverse?.[index];
        return finite(asset)&&finite(inverse)?asset>inverse?1:asset<inverse?-1:0:0;
      }
      return priorCausalDirection(indicators,index,strategy,filter);
    };
    try{causalDirection=root.causalDirection;}catch{}
  }

  function canonicalEventFeatures(data,htl){
    const crossings=Array.isArray(htl?.crossings)?htl.crossings:[];
    const events=[];
    crossings.forEach((crossing,position)=>{
      const end=position+1<crossings.length?crossings[position+1].index-1:data.length-1,status=position+1<crossings.length?"FINAL":"PROVISIONAL",segment=data.slice(crossing.index,end+1),spreads=htl.asset.slice(crossing.index,end+1).map((value,index)=>value-htl.inverse[crossing.index+index]).filter(finite),start=segment[0]?.close||0,high=segment.length?Math.max(...segment.map(candle=>candle.high)):null,low=segment.length?Math.min(...segment.map(candle=>candle.low)):null,mean=spreads.length?spreads.reduce((sum,value)=>sum+value,0)/spreads.length:0,variance=spreads.length?spreads.reduce((sum,value)=>sum+((value-mean)**2),0)/spreads.length:0;
      let slope=0;if(spreads.length>1){const xMean=(spreads.length-1)/2;let numerator=0,denominator=0;spreads.forEach((value,index)=>{numerator+=(index-xMean)*(value-mean);denominator+=(index-xMean)**2;});slope=denominator?numerator/denominator:0;}
      events.push({number:position+1,id:H.crossingIdentity({pair:state?.selectedInstrument||"UNKNOWN",timeframe:state?.selectedTimeframe||"UNKNOWN",strategy:"ASSET",length:htl.length,filter:0,crossing}),calculationVersion:VERSION,direction:crossing.direction,startIndex:crossing.index,endIndex:end,status,startTime:data[crossing.index]?.time,endTime:data[end]?.time,openPrice:start,bars:end-crossing.index+1,high,low,upBps:start&&finite(high)?((high/start)-1)*10000:0,downBps:start&&finite(low)?((low/start)-1)*10000:0,mean,variance,slope,area:spreads.reduce((sum,value)=>sum+Math.abs(value),0),sourceCrosses:Math.max(0,(htl.sourceTotal?.[end]||0)-(htl.sourceTotal?.[Math.max(0,crossing.index-1)]||0)),priorAsset:crossing.priorAsset,priorInverse:crossing.priorInverse,asset:crossing.asset,inverse:crossing.inverse});
    });
    return events;
  }
  root.eventFeatures=canonicalEventFeatures;
  try{eventFeatures=canonicalEventFeatures;}catch{}

  function installStyles(){
    if(byId("platformHorizonStyles"))return;
    const style=document.createElement("style");style.id="platformHorizonStyles";style.textContent=`
      .configuration-identity{display:grid;grid-template-columns:repeat(5,minmax(105px,1fr));gap:7px;margin:8px 12px;padding:8px;border:1px solid var(--line);background:var(--panel2);border-radius:7px}
      .configuration-identity .identity-field{min-width:0;padding:7px 8px;border:1px solid rgba(102,215,255,.18);background:rgba(12,17,27,.76);border-radius:6px}
      .configuration-identity span{display:block;color:var(--muted);font-size:8px;text-transform:uppercase;letter-spacing:.1em}
      .configuration-identity strong{display:block;margin-top:3px;color:var(--text);font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .horizon-parity{margin:0 12px 12px;border:1px solid var(--line);background:var(--panel2)}
      .horizon-parity summary{cursor:pointer;padding:10px 12px;color:var(--accent);font-size:11px;font-weight:850;letter-spacing:.06em;text-transform:uppercase}
      .parity-grid{display:grid;grid-template-columns:repeat(4,minmax(150px,1fr));gap:7px;padding:0 10px 10px}
      .parity-card{padding:8px;border:1px solid var(--line);background:rgba(12,17,27,.72)}
      .parity-card span{display:block;color:var(--muted);font-size:8px;text-transform:uppercase;letter-spacing:.08em}.parity-card strong{display:block;margin-top:4px;font-size:10px;line-height:1.4}
      .trade-management{grid-column:1/-1;display:grid;grid-template-columns:minmax(190px,1.35fr) repeat(2,minmax(120px,.75fr)) auto auto;gap:8px;align-items:end;padding:10px;border:1px solid var(--line);background:var(--panel2);border-radius:8px}
      .trade-management-status{grid-column:1/-1;min-height:17px;color:var(--muted);font-size:10px}.trade-management .modify-trade{border-color:rgba(102,215,255,.55);color:var(--accent)}.trade-management .close-trade{border-color:rgba(255,107,114,.55);color:var(--sell)}
      .horizon-version{color:var(--accent);font:9px ui-monospace,monospace}
      @media(max-width:920px){.configuration-identity{grid-template-columns:repeat(2,minmax(105px,1fr))}.parity-grid{grid-template-columns:1fr 1fr}.trade-management{grid-template-columns:1fr 1fr}.trade-management-status{grid-column:1/-1}}
    `;document.head.append(style);
  }

  function effectiveConfig(pair,timeframe,strategy){
    let configuration=null;
    try{configuration=typeof resolvedConfiguration==="function"?resolvedConfiguration(pair,timeframe):null;}catch{}
    const current=configuration?.[strategy]||((typeof STRATEGY_CONFIG!=="undefined")?STRATEGY_CONFIG[strategy]:null)||{};
    return{length:Math.max(3,Math.trunc(Number(current.length)||10)),filter:Math.max(0,Number(current.filter)||0),source:state?.autoConfigurations?.get?.(`${pair}|${timeframe}`)?.source||"ACTIVE"};
  }
  function identityHtml(pair,timeframe,strategy,length,filter){return[["Currency pair",pairLabel(pair)],["Timeframe",timeframe],["Strategy",strategyLabel(strategy)],["Length",length],["Filter",filter]].map(([label,value])=>`<div class="identity-field"><span>${escape(label)}</span><strong>${escape(value)}</strong></div>`).join("");}
  function ensureIdentity(id,anchor,position="afterend"){
    let target=byId(id);if(target)return target;target=document.createElement("div");target.id=id;target.className="configuration-identity";target.setAttribute("aria-label",id==="chartConfigurationIdentity"?"Analytical chart configuration identity":"Event chart configuration identity");anchor?.insertAdjacentElement(position,target);return target;
  }
  function renderIdentities(){
    if(typeof state==="undefined")return;
    const main=ensureIdentity("chartConfigurationIdentity",document.querySelector(".chart-summary")),pair=state.selectedInstrument,timeframe=state.selectedTimeframe,strategy=state.selectedStrategy,config=effectiveConfig(pair,timeframe,strategy);if(main)main.innerHTML=identityHtml(pair,timeframe,strategy,config.length,config.filter);
    const toolbar=document.querySelector(".event-chart-toolbar"),event=ensureIdentity("eventConfigurationIdentity",toolbar),eventPair=byId("eventPair")?.value||pair,eventTimeframe=byId("eventTimeframe")?.value||timeframe,eventStrategy=byId("eventStrategy")?.value||"ASSET",eventConfig=effectiveConfig(eventPair,eventTimeframe,eventStrategy),eventLength=Math.max(3,Math.trunc(Number(byId("eventLength")?.value)||eventConfig.length));if(event)event.innerHTML=identityHtml(eventPair,eventTimeframe,eventStrategy,eventLength,eventConfig.filter);
  }

  function currentOptimizerRecord(){if(typeof state==="undefined")return null;return state.autoConfigurations?.get?.(`${state.selectedInstrument}|${state.selectedTimeframe}`)||null;}
  function ensureParityDisclosure(){
    let details=byId("horizonCompoundParity");if(details)return details;const grid=byId("strategyConfiguration");if(!grid)return null;details=document.createElement("details");details.id="horizonCompoundParity";details.className="horizon-parity";details.open=true;details.innerHTML='<summary>Horizon vs. Compound Compute Configuration parity</summary><div class="parity-grid" id="horizonParityGrid"></div>';grid.insertAdjacentElement("afterend",details);return details;
  }
  function renderParity(){const details=ensureParityDisclosure(),target=byId("horizonParityGrid");if(!details||!target)return;const record=currentOptimizerRecord(),status=record?.calculationVersion===VERSION?"IDENTICAL CANONICAL ASSET / INVERSE / CROSSING":"AWAITING VERSION 5 COMPUTE CONFIGURATION",cards=[
    ["Canonical crossing",`${VERSION} · completed-candle Asset / recovered-inverse crossover and crossunder`],
    ["Candidate lengths",LENGTH_GRID.join(", ")],
    ["Candidate filters",Object.entries(FILTER_GRID).map(([key,values])=>`${key}: ${values.join("/")}`).join(" · ")],
    ["Validation / score",`${record?.validation||"HORIZON_RETROSPECTIVE_PLATFORM_PARITY"} · next-open entries · opposite-event exits · 1 pip estimated cost · score = net − 0.5 drawdown − uncertainty · ≥5 trades`],
    ["Original Horizon ownership","Shared assetLength across ASSET / DARE / DARE(N) / NAI / COMBO — disclosed, not imported"],
    ["Compound ownership","Strategy-scoped pair × timeframe immutable optimizer records"],
    ["Formula parity",status],
    ["Effective record",record?`${record.source||"SERVER"} · ${record.range?.bars||"—"} bars · ${record.computedAt?new Date(record.computedAt).toLocaleString():"—"}`:"No version-5 record loaded"]
  ];target.innerHTML=cards.map(([label,value])=>`<div class="parity-card"><span>${escape(label)}</span><strong>${escape(value)}</strong></div>`).join("");}

  function crossingFor(pair,direction,preferredTimeframe){
    if(typeof state==="undefined")return null;const timeframes=[preferredTimeframe,...((typeof TIMEFRAMES!=="undefined")?TIMEFRAMES:[])].filter((value,index,array)=>value&&array.indexOf(value)===index),candidates=[];
    for(const timeframe of timeframes){const candles=state.scheduleCandles?.get?.(`${pair}|${timeframe}`);if(!candles?.length)continue;const config=effectiveConfig(pair,timeframe,"ASSET"),built=H.build(candles,config.length),crossing=[...built.crossings].reverse().find(event=>event.direction===direction);if(!crossing)continue;candidates.push({timeframe,config,crossing,identity:H.crossingIdentity({pair,timeframe,strategy:"ASSET",length:config.length,filter:config.filter,crossing}),calculationVersion:VERSION});}
    return candidates.sort((left,right)=>Date.parse(right.crossing.time)-Date.parse(left.crossing.time))[0]||null;
  }
  function enrichDecisionCandidates(){if(typeof state==="undefined")return;for(const key of ["A","B","C"]){const candidate=state.decisionCandidates?.[key];if(!candidate)continue;const evidence=crossingFor(candidate.pair,candidate.direction,state.engineConfig?.timeframe||state.selectedTimeframe);if(evidence)Object.assign(candidate,{crossingIdentity:evidence.identity,calculationVersion:VERSION,crossingTime:evidence.crossing.time,crossingTimeframe:evidence.timeframe,length:evidence.config.length,filter:evidence.config.filter,priorAsset:evidence.crossing.priorAsset,priorInverse:evidence.crossing.priorInverse,currentAsset:evidence.crossing.asset,currentInverse:evidence.crossing.inverse,rawDirection:evidence.crossing.direction});const button=byId(`candidate${key}`),small=button?.querySelector("small");if(small&&evidence)small.textContent=`${button.classList.contains("recommended")?"Nemotron recommendation · ":""}${evidence.timeframe} crossing · ${VERSION.split("@")[1]}`;}
  }
  if(typeof updateDecisionDisplays==="function"){
    const originalUpdateDecisionDisplays=updateDecisionDisplays;
    root.updateDecisionDisplays=function platformDecisionDisplays(){const result=originalUpdateDecisionDisplays.apply(this,arguments);enrichDecisionCandidates();return result;};
    try{updateDecisionDisplays=root.updateDecisionDisplays;}catch{}
  }

  if(typeof oandaPost==="function"){
    const originalOandaPost=oandaPost;
    root.oandaPost=async function platformCandidateOrder(path,body){const key=typeof state!=="undefined"?state.selectedDecisionCandidate:null,candidate=key?state.decisionCandidates?.[key]:null;if(candidate?.crossingIdentity&&/\/orders$/.test(path)){body={...body,cteContext:{candidate:key,pair:candidate.pair,timeframe:candidate.crossingTimeframe||state.engineConfig?.timeframe||state.selectedTimeframe,strategy:state.engineConfig?.strategy||"ASSET",length:candidate.length,filter:candidate.filter,crossingIdentity:candidate.crossingIdentity,crossingTime:candidate.crossingTime,calculationVersion:VERSION,rawDirection:candidate.rawDirection,priorAsset:candidate.priorAsset,priorInverse:candidate.priorInverse,currentAsset:candidate.currentAsset,currentInverse:candidate.currentInverse,nemotronRecommendedPair:state.nemotronRecommendedPair||null,nemotronSelected:state.nemotronRecommendedPair===candidate.pair}};}return originalOandaPost(path,body);};
    try{oandaPost=root.oandaPost;}catch{}
  }

  function ensureTradeManagement(){let panel=byId("platformTradeManagement");if(panel)return panel;const automation=byId("automationPanel"),anchor=byId("decisionCandidateStrip");if(!automation||!anchor)return null;panel=document.createElement("div");panel.id="platformTradeManagement";panel.className="trade-management";panel.innerHTML=`
    <label class="field"><span>Open OANDA trade</span><select id="managedTrade"></select></label>
    <label class="field"><span>Stop loss</span><input id="managedStopLoss" type="number" step="0.00001" inputmode="decimal" placeholder="Retain current"></label>
    <label class="field"><span>Take profit</span><input id="managedTakeProfit" type="number" step="0.00001" inputmode="decimal" placeholder="Retain current"></label>
    <button class="modify-trade" id="modifyOpenTrade" type="button" disabled>Modify trade</button>
    <button class="close-trade" id="closeOpenTrade" type="button" disabled>Close trade</button>
    <div class="trade-management-status" id="tradeManagementStatus" role="status" aria-live="polite"><span class="horizon-version">${VERSION}</span></div>`;anchor.insertAdjacentElement("beforebegin",panel);byId("managedTrade").addEventListener("change",renderManagedTrade);byId("modifyOpenTrade").addEventListener("click",()=>submitTradeAction("MODIFY"));byId("closeOpenTrade").addEventListener("click",()=>submitTradeAction("CLOSE"));return panel;}
  const tradeState={trades:[],busy:false};
  function selectedTrade(){return tradeState.trades.find(trade=>String(trade.id)===String(byId("managedTrade")?.value||""))||null;}
  function renderManagedTrade(){const trade=selectedTrade(),disabled=!trade||tradeState.busy;byId("modifyOpenTrade").disabled=disabled;byId("closeOpenTrade").disabled=disabled;if(trade){byId("managedStopLoss").value=trade.stopLossOrder?.price||"";byId("managedTakeProfit").value=trade.takeProfitOrder?.price||"";}else{byId("managedStopLoss").value="";byId("managedTakeProfit").value="";}}
  async function loadOpenTrades(){ensureTradeManagement();if(tradeState.busy)return;try{const response=await fetch("/api/oanda/open-trades",{headers:{Accept:"application/json"},credentials:"same-origin",cache:"no-store"}),payload=await response.json().catch(()=>({}));if(!response.ok)throw new Error(payload.error||`HTTP ${response.status}`);const select=byId("managedTrade"),prior=select?.value;tradeState.trades=Array.isArray(payload.trades)?payload.trades:[];if(select){select.innerHTML=tradeState.trades.map(trade=>`<option value="${escape(trade.id)}">${escape(pairLabel(trade.instrument))} · ${Number(trade.currentUnits)>0?"BUY":"SELL"} · ${Math.abs(Number(trade.currentUnits)||0).toLocaleString()} · trade ${escape(trade.id)}</option>`).join("")||'<option value="">No open trades</option>';if(tradeState.trades.some(trade=>String(trade.id)===prior))select.value=prior;}renderManagedTrade();}catch(error){const status=byId("tradeManagementStatus");if(status)status.textContent=error.message||"Open trades unavailable.";}}
  async function submitTradeAction(action){const trade=selectedTrade();if(!trade||tradeState.busy)return;tradeState.busy=true;renderManagedTrade();const status=byId("tradeManagementStatus");status.textContent=`${action==="CLOSE"?"Revalidating and closing":"Revalidating and modifying"} ${pairLabel(trade.instrument)} trade ${trade.id}…`;try{const body={action,tradeId:String(trade.id),instrument:trade.instrument},stopLoss=byId("managedStopLoss").value.trim(),takeProfit=byId("managedTakeProfit").value.trim();if(action==="MODIFY"){if(stopLoss)body.stopLoss=stopLoss;if(takeProfit)body.takeProfit=takeProfit;if(!body.stopLoss&&!body.takeProfit)throw new Error("Enter a stop-loss or take-profit price.");}const response=await fetch("/api/oanda/trade",{method:"PUT",headers:{Accept:"application/json","Content-Type":"application/json"},credentials:"same-origin",cache:"no-store",body:JSON.stringify(body)}),payload=await response.json().catch(()=>({}));if(!response.ok)throw new Error(payload.error||`HTTP ${response.status}`);status.textContent=`${action==="CLOSE"?"Closed":"Modified"} ${pairLabel(trade.instrument)} trade ${trade.id} · transaction ${payload.transactionId||payload.lastTransactionID||"—"}`;await loadOpenTrades();if(typeof refreshOpenPositions==="function")await refreshOpenPositions();if(typeof loadTradingLedger==="function")await loadTradingLedger();}catch(error){status.textContent=error.message||"Trade management failed.";}finally{tradeState.busy=false;renderManagedTrade();}}

  const FORENSIC_FIELDS=[["Ledger ID","ledgerId"],["Time","time"],["Type","type"],["OANDA Type","transactionType"],["Pair","pair"],["Timeframe","timeframe"],["Strategy","strategy"],["Length","htlLength"],["Filter","filter"],["Calculation Version","calculationVersion"],["Configuration Hash","configurationHash"],["Crossing Time","crossingTime"],["Raw Direction","rawDirection"],["Prior Asset","priorAsset"],["Prior Inverse","priorInverse"],["Current Asset","currentAsset"],["Current Inverse","currentInverse"],["Qualification","qualificationResult"],["Qualification Reason","qualificationReason"],["Nemotron Recommendation","nemotronRecommendedPair"],["Nemotron Selected","nemotronSelected"],["Nemotron Status","nemotronStatus"],["Side","direction"],["Units","units"],["Price","price"],["Realized P/L","realizedPL"],["Trade ID","tradeId"],["Transaction ID","transaction"],["Client Order ID","clientOrderId"],["Event ID","event"],["Decision Mode","decisionMode"],["Configuration Source","configurationSource"],["Optimizer Score","optimizerScore"],["Optimizer Trades","optimizerTrades"],["Optimizer Net","optimizerNet"],["Optimizer Drawdown","optimizerDrawdown"],["Message","message"]];
  async function downloadForensicLedger(event){event.preventDefault();event.stopImmediatePropagation();const response=await fetch("/api/engine/ledger?limit=5000",{headers:{Accept:"application/json"},credentials:"same-origin",cache:"no-store"}),payload=await response.json().catch(()=>({}));if(!response.ok)throw new Error(payload.error||`HTTP ${response.status}`);const rows=Array.isArray(payload.ledger)?payload.ledger:[],csv=[FORENSIC_FIELDS.map(([label])=>label),...rows.map(row=>FORENSIC_FIELDS.map(([,key])=>row[key]??""))].map(values=>values.map(value=>`"${String(value).replaceAll('"','""')}"`).join(",")).join("\r\n"),url=URL.createObjectURL(new Blob(["\ufeff",csv],{type:"text/csv;charset=utf-8"})),link=document.createElement("a");link.href=url;link.download=`cte-compound-horizon-ledger-${new Date().toISOString().slice(0,10)}.csv`;link.click();URL.revokeObjectURL(url);}

  function augmentDiagnostic(){const grid=byId("platformDiagnosticGrid");if(!grid||grid.querySelector('[data-horizon-version]'))return;const card=document.createElement("div");card.className="diagnostic-card good";card.dataset.horizonVersion=VERSION;card.innerHTML=`<span>Canonical crossing</span><strong>${escape(VERSION)} · platform wide</strong>`;grid.append(card);}
  function bind(){installStyles();ensureTradeManagement();renderIdentities();renderParity();enrichDecisionCandidates();byId("downloadTradingLedger")?.addEventListener("click",event=>{downloadForensicLedger(event).catch(error=>{const status=byId("automationStatus");if(status)status.textContent=error.message||"Ledger download failed.";});},true);for(const id of ["chartPair","chartTimeframe","chartStrategy","eventPair","eventTimeframe","eventStrategy","eventLength","engineTimeframe","engineStrategy","engineHtlLength","engineFilter"]){byId(id)?.addEventListener("change",()=>{renderIdentities();renderParity();enrichDecisionCandidates();});}byId("runPlatformDiagnostic")?.addEventListener("click",()=>setTimeout(augmentDiagnostic,250));setInterval(()=>{renderIdentities();renderParity();enrichDecisionCandidates();augmentDiagnostic();if(typeof state!=="undefined"&&state.connected)void loadOpenTrades();},10000);if(typeof state!=="undefined"&&state.connected)void loadOpenTrades();}

  root.CTE_HORIZON_PLATFORM=Object.freeze({VERSION,LENGTH_GRID,FILTER_GRID,canonicalBuild,canonicalEventFeatures,effectiveConfig,renderIdentities,renderParity,enrichDecisionCandidates,loadOpenTrades,submitTradeAction,FORENSIC_FIELDS});
  bind();
})(globalThis);
