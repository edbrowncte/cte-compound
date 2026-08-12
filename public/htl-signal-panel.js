(function installHtlSignalPanel(global){
  "use strict";

  const VERSION="CTE_HTL_SIGNAL_PANEL@1.0.0";
  const FALLBACK_TIMEFRAMES=["W","D","H4","H1","M30","M15","M5","M1","S30","S5"];
  const FALLBACK_INDICATORS=["ASSET","DARE_N","DARE","COMBO","NAI","APEX","IOI","IOM"];
  const LABELS={ASSET:"HTL Asset",DARE_N:"DARE(N)",DARE:"DARE",COMBO:"COMBO · CSF",NAI:"NAI",APEX:"APEX",IOI:"IOI",IOM:"IOM"};
  const COLUMNS=[
    ["pair","Pair"],["timeframe","TF"],["indicator","Indicator"],["length","Length"],["filter","Filter"],["htlEvent","HTL Event"],["signal","Signal"],["agreement","Agreement"],["confidence","Confidence"],["regime","Regime"],["eventOpen","Event Open"],["currentPrice","Current Price"],["gainPips","Gain (pips)"],["completion5","≤5 bars"],["completion10","≤10 bars"],["durationMae","Duration MAE"],["durationValidationN","Duration n"],["nextEvent","Next HTL"],["completedCandle","Completed Candle"]
  ];
  let panelRows=[],sortKey="gainPips",sortDirection=-1,externalRows=null,observerQueued=false;

  const finite=value=>Number.isFinite(Number(value))?Number(value):null;
  const pct=value=>finite(value)==null?"—":`${(Number(value)*100).toFixed(1)}%`;
  const fixed=(value,digits=2)=>finite(value)==null?"—":Number(value).toFixed(digits);
  const pipScale=pair=>String(pair||"").endsWith("JPY")?100:10000;
  const formatPairLocal=pair=>typeof formatPair==="function"?formatPair(pair):String(pair||"").replace("_","/");
  const signalWordLocal=value=>{const n=Number(value);return n>0?"BUY":n<0?"SELL":"HOLD";};
  const directionFromWord=value=>String(value||"").toUpperCase().startsWith("BUY")?1:String(value||"").toUpperCase().startsWith("SELL")?-1:0;
  const appState=()=>typeof state!=="undefined"?state:null;
  const scheduleKeyLocal=(pair,timeframe)=>typeof scheduleKey==="function"?scheduleKey(pair,timeframe):`${pair}|${timeframe}`;

  function directionalGain(pair,currentPrice,eventOpen,eventDirection){
    const price=finite(currentPrice),open=finite(eventOpen),direction=Number(eventDirection)||0;
    return price==null||open==null||!direction?null:(price-open)*pipScale(pair)*direction;
  }

  function joinRows(htlRows,signalRows,{indicator=null,timeframe=null}={}){
    const signalIndex=new Map();
    for(const raw of signalRows||[]){
      const pair=raw?.pair,time=raw?.timeframe;if(!pair||!time)continue;
      if(indicator&&raw.indicator&&raw.indicator!==indicator)continue;
      signalIndex.set(`${pair}|${time}`,raw);
    }
    return (htlRows||[]).filter(row=>row?.pair&&(!timeframe||!row.timeframe||row.timeframe===timeframe)).map(row=>{
      const tf=row.timeframe||timeframe||null,signal=signalIndex.get(`${row.pair}|${tf}`)||{},htlDirection=directionFromWord(row.currentEvent||row.htlEvent),signalDirection=Number(signal.direction)||directionFromWord(signal.signal),gainPips=directionalGain(row.pair,row.currentPrice??row.price,row.currentEventOpen??row.eventOpen,htlDirection);
      const agreement=!htlDirection||!signalDirection?"—":htlDirection===signalDirection?"MATCH":"OPPOSED";
      return{
        pair:row.pair,timeframe:tf,indicator:signal.indicator||indicator||null,length:row.length??signal.length??null,filter:row.filter??signal.filter??null,
        htlEvent:row.currentEvent||row.htlEvent||"—",signal:signal.signal||signalWordLocal(signalDirection),agreement,confidence:signal.confidence??null,regime:signal.regime??null,
        eventOpen:row.currentEventOpen??row.eventOpen??null,currentPrice:row.currentPrice??row.price??null,gainPips,
        completion5:row.completionWithin5Bars??row.p5??null,completion10:row.completionWithin10Bars??row.p10??null,durationMae:row.durationMaeBars??row.durationMae??null,
        durationValidationN:row.durationValidationN??row.forecast?.integrity?.durationValidationN??null,nextEvent:row.nextHtlEvent??row.nextEvent??"—",completedCandle:signal.completedCandle??null,
        configurationSource:row.configurationSource??signal.configurationSource??null,completionValidationN:row.completionValidationN??row.forecast?.integrity?.completionValidationN??null,
        durationOutliersExcluded:row.durationOutliersExcluded??row.forecast?.integrity?.durationOutliersExcluded??0,historyBars:row.historyBars??row.data?.length??null,
      };
    });
  }

  function normalizeFromTwoExports(htlScheduleExport,timeframeSignalScheduleExport,options={}){
    const indicator=options.indicator||timeframeSignalScheduleExport?.indicator||null,timeframe=options.timeframe||htlScheduleExport?.timeframe||null;
    return joinRows(htlScheduleExport?.rows||[],timeframeSignalScheduleExport?.rows||[],{indicator,timeframe});
  }

  function liveHtlRows(timeframe){
    const s=appState();if(!s)return[];
    const existing=(s.eventRows||[]).filter(row=>row?.pair&&(!row.timeframe||row.timeframe===timeframe));
    const existingByPair=new Map(existing.map(row=>[row.pair,row]));
    const pairs=Array.isArray(global.INSTRUMENTS)?global.INSTRUMENTS:(typeof INSTRUMENTS!=="undefined"?INSTRUMENTS:[]),rows=[];
    for(const pair of pairs){
      let row=existingByPair.get(pair)||null;
      if(!row){
        const candles=s.scheduleCandles?.get?.(scheduleKeyLocal(pair,timeframe))||[],config=global.CTEAnalyticalFacilities?.optimizerAssetConfiguration?.(pair,timeframe)||null;
        if(candles.length&&config?.configured&&typeof buildEventRow==="function"){
          try{row=buildEventRow(pair,candles,config.length);row={...row,timeframe,length:config.length,filter:config.filter,configurationSource:config.source,historyBars:candles.length};}catch{}
        }
      }else row={...row,timeframe:row.timeframe||timeframe};
      if(row)rows.push(row);
    }
    return rows;
  }

  function liveSignalRows(timeframe,indicator){
    const s=appState();if(!s)return[];
    const pairs=Array.isArray(global.INSTRUMENTS)?global.INSTRUMENTS:(typeof INSTRUMENTS!=="undefined"?INSTRUMENTS:[]),rows=[];
    for(const pair of pairs){
      const key=scheduleKeyLocal(pair,timeframe),analysis=s.scheduleEvaluations?.get?.(key),output=analysis?.latest?.[indicator]||null,candles=s.scheduleCandles?.get?.(key)||[],record=s.autoConfigurations?.get?.(key)||null,config=record?.config?.[indicator]||null;
      rows.push({pair,timeframe,indicator,direction:Number(output?.direction)||0,signal:signalWordLocal(output?.direction),confidence:output?.confidence??null,regime:output?.regime??null,length:config?.length??null,filter:config?.filter??null,configurationSource:record?.source||null,completedCandle:candles.at(-1)?.time||null});
    }
    return rows;
  }

  function normalizeFromLiveState(timeframe,indicator){return joinRows(liveHtlRows(timeframe),liveSignalRows(timeframe,indicator),{timeframe,indicator});}

  function rowValue(row,key){const value=row?.[key];return value==null?null:value;}
  function sortedRows(rows){return [...rows].sort((a,b)=>{const av=rowValue(a,sortKey),bv=rowValue(b,sortKey),am=av==null||Number.isNaN(av),bm=bv==null||Number.isNaN(bv);if(am!==bm)return am?1:-1;if(am&&bm)return 0;return sortDirection*(typeof av==="number"&&typeof bv==="number"?av-bv:String(av).localeCompare(String(bv)));});}
  function gainClass(value){const n=finite(value);return n==null||Math.abs(n)<0.005?"hsap-flat":n>0?"hsap-positive":"hsap-negative";}
  function sideClass(value){return String(value||"").startsWith("BUY")?"hsap-buy":String(value||"").startsWith("SELL")?"hsap-sell":"hsap-flat";}
  function cell(row,key){
    if(key==="pair")return formatPairLocal(row.pair);
    if(key==="indicator")return LABELS[row.indicator]||row.indicator||"—";
    if(key==="confidence")return pct(row.confidence);
    if(key==="completion5"||key==="completion10")return pct(row[key]);
    if(key==="gainPips")return finite(row.gainPips)==null?"—":`${row.gainPips>=0?"+":""}${row.gainPips.toFixed(1)}`;
    if(key==="durationMae")return finite(row.durationMae)==null?"—":`${Number(row.durationMae).toFixed(2)} bars`;
    if(key==="eventOpen"||key==="currentPrice")return finite(row[key])==null?"—":typeof formatPrice==="function"?formatPrice(row[key],row.pair):String(row[key]);
    if(key==="completedCandle")return row.completedCandle?new Date(row.completedCandle).toLocaleString():"—";
    return String(row[key]??"—");
  }

  function ensureStyles(){if(document.getElementById("htlSignalPanelStyles"))return;const style=document.createElement("style");style.id="htlSignalPanelStyles";style.textContent=`
    #htlSignalPanel{margin:0;border:1px solid var(--line2,#3a4657);background:linear-gradient(180deg,var(--panel,#10151d),#0b1017);box-shadow:var(--shadow,0 16px 42px rgba(0,0,0,.34))}
    #htlSignalPanel .hsap-head{display:flex;align-items:flex-end;justify-content:space-between;gap:12px;padding:12px 14px;border-bottom:1px solid var(--line,#2b3543);flex-wrap:wrap}
    #htlSignalPanel .hsap-title h2{margin:0;font-size:15px;letter-spacing:.06em;text-transform:uppercase}#htlSignalPanel .hsap-title p{margin:3px 0 0;color:var(--muted,#8e9aab);font-size:10px}
    #htlSignalPanel .hsap-controls{display:flex;gap:8px;align-items:end;flex-wrap:wrap}#htlSignalPanel .hsap-field{display:grid;gap:4px;min-width:120px}#htlSignalPanel .hsap-field span{color:var(--muted,#8e9aab);font-size:8px;text-transform:uppercase;letter-spacing:.08em;font-weight:800}
    #htlSignalPanel .hsap-wrap{overflow:auto;max-height:52vh;background:#080c12}#htlSignalPanel table{width:max-content;min-width:100%;border-collapse:separate;border-spacing:0;font-size:9px}
    #htlSignalPanel th,#htlSignalPanel td{padding:5px 7px;height:29px;border-right:1px solid #202834;border-bottom:1px solid #202834;text-align:right;white-space:nowrap}#htlSignalPanel th:first-child,#htlSignalPanel td:first-child{text-align:left;position:sticky;left:0;background:#111923;z-index:4}
    #htlSignalPanel th{position:sticky;top:0;background:#171f2a;z-index:3}#htlSignalPanel th:first-child{z-index:5}#htlSignalPanel .hsap-sort{border:0;background:transparent;color:#c9d2de;padding:0;font:inherit;font-weight:850;cursor:pointer;white-space:nowrap}
    #htlSignalPanel .hsap-positive{color:var(--buy,#48c78e);background:rgba(72,199,142,.10)}#htlSignalPanel .hsap-negative{color:var(--sell,#ef6b73);background:rgba(239,107,115,.10)}#htlSignalPanel .hsap-flat{color:var(--muted,#8e9aab)}#htlSignalPanel .hsap-buy{color:var(--buy,#48c78e);font-weight:850}#htlSignalPanel .hsap-sell{color:var(--sell,#ef6b73);font-weight:850}
    #htlSignalPanel .hsap-match{color:var(--buy,#48c78e);font-weight:850}#htlSignalPanel .hsap-opposed{color:var(--sell,#ef6b73);font-weight:850}#htlSignalPanel .hsap-foot{display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;padding:8px 12px;color:var(--muted,#8e9aab);font-size:9px;border-top:1px solid var(--line,#2b3543)}
  `;document.head.appendChild(style);}

  function ensurePanel(){
    let root=document.getElementById("htlSignalPanel");if(root)return root;const analysis=document.getElementById("analysisPanel");if(!analysis)return null;const firstFacility=analysis.querySelector(":scope > details.facility-details");
    root=document.createElement("section");root.id="htlSignalPanel";root.className="panel";root.innerHTML=`<div class="hsap-head"><div class="hsap-title"><h2>HTL / Signal Alignment</h2><p>Client-side join of HTL Schedule and Timeframe Signal Schedule · directional gain is measured from the active HTL event open.</p></div><div class="hsap-controls"><label class="hsap-field"><span>Timeframe</span><select id="htlSignalPanelTimeframe"></select></label><label class="hsap-field"><span>Indicator</span><select id="htlSignalPanelIndicator"></select></label><button id="htlSignalPanelRefresh" type="button">Refresh</button><button id="htlSignalPanelExport" type="button">Export JSON</button></div></div><div class="hsap-wrap"><table aria-label="HTL and timeframe signal alignment"><thead><tr id="htlSignalPanelHead"></tr></thead><tbody id="htlSignalPanelBody"><tr><td>Awaiting schedule data.</td></tr></tbody></table></div><div class="hsap-foot"><span id="htlSignalPanelStatus">Awaiting schedule data.</span><span>Gain: green favorable · red adverse · gray unavailable/flat</span></div>`;
    firstFacility?.insertAdjacentElement("afterend",root);ensureStyles();
    const tf=document.getElementById("htlSignalPanelTimeframe"),indicator=document.getElementById("htlSignalPanelIndicator"),times=(typeof TIMEFRAMES!=="undefined"&&Array.isArray(TIMEFRAMES)?TIMEFRAMES:FALLBACK_TIMEFRAMES),strategies=FALLBACK_INDICATORS;
    tf.innerHTML=times.map(item=>`<option value="${item}">${item}</option>`).join("");indicator.innerHTML=strategies.map(item=>`<option value="${item}">${LABELS[item]||item}</option>`).join("");
    const s=appState();tf.value=s?.selectedTimeframe&&times.includes(s.selectedTimeframe)?s.selectedTimeframe:(document.getElementById("chartTimeframe")?.value||"M15");indicator.value=s?.selectedScheduleStrategy&&strategies.includes(s.selectedScheduleStrategy)?s.selectedScheduleStrategy:(document.getElementById("scheduleStrategy")?.value||"ASSET");
    document.getElementById("htlSignalPanelHead").innerHTML=COLUMNS.map(([key,label])=>`<th><button class="hsap-sort" type="button" data-hsap-sort="${key}">${label}<span data-hsap-arrow="${key}"></span></button></th>`).join("");
    root.querySelectorAll("[data-hsap-sort]").forEach(button=>button.addEventListener("click",()=>{const key=button.dataset.hsapSort;if(sortKey===key)sortDirection*=-1;else{sortKey=key;sortDirection=1;}render();}));
    tf.addEventListener("change",()=>{externalRows=null;render();});indicator.addEventListener("change",()=>{externalRows=null;render();});document.getElementById("htlSignalPanelRefresh")?.addEventListener("click",()=>{externalRows=null;render();});document.getElementById("htlSignalPanelExport")?.addEventListener("click",exportJson);
    return root;
  }

  function renderRows(rows){
    const body=document.getElementById("htlSignalPanelBody");if(!body)return;const sorted=sortedRows(rows);body.innerHTML=sorted.length?sorted.map(row=>`<tr data-pair="${row.pair}">${COLUMNS.map(([key])=>{const value=cell(row,key),klass=key==="gainPips"?gainClass(row.gainPips):(key==="htlEvent"||key==="signal"||key==="nextEvent")?sideClass(value):key==="agreement"?(value==="MATCH"?"hsap-match":value==="OPPOSED"?"hsap-opposed":"hsap-flat"):"";return `<td class="${klass}">${value}</td>`;}).join("")}</tr>`).join(""):`<tr><td colspan="${COLUMNS.length}">Awaiting HTL and timeframe schedule data.</td></tr>`;
    document.querySelectorAll("[data-hsap-arrow]").forEach(node=>{node.textContent=node.dataset.hsapArrow===sortKey?(sortDirection>0?" ↑":" ↓"):"";});
  }

  function render(){
    if(!ensurePanel())return[];const tf=document.getElementById("htlSignalPanelTimeframe")?.value||"M15",indicator=document.getElementById("htlSignalPanelIndicator")?.value||"ASSET";panelRows=externalRows||normalizeFromLiveState(tf,indicator);renderRows(panelRows);const status=document.getElementById("htlSignalPanelStatus"),loaded=panelRows.length,aligned=panelRows.filter(row=>row.agreement==="MATCH").length,opposed=panelRows.filter(row=>row.agreement==="OPPOSED").length;if(status)status.textContent=`${tf} · ${LABELS[indicator]||indicator} · ${loaded} pairs · ${aligned} aligned · ${opposed} opposed`;return panelRows;
  }

  function exportPayload(){const tf=document.getElementById("htlSignalPanelTimeframe")?.value||null,indicator=document.getElementById("htlSignalPanelIndicator")?.value||null;return{facility:"HTL / Signal Alignment",version:VERSION,exportedAt:new Date().toISOString(),timeframe:tf,indicator,sort:{key:sortKey,direction:sortDirection>0?"ascending":"descending"},rows:panelRows};}
  function exportJson(){const payload=exportPayload(),blob=new Blob([JSON.stringify(payload,null,2)],{type:"application/json;charset=utf-8"}),url=URL.createObjectURL(blob),link=document.createElement("a");link.href=url;link.download=`cte-compound-htl-signal-alignment-${new Date().toISOString().replace(/[:.]/g,"-")}.json`;document.body.appendChild(link);link.click();link.remove();URL.revokeObjectURL(url);}
  function renderFromExports(htlScheduleExport,timeframeSignalScheduleExport,options={}){ensurePanel();const tf=options.timeframe||htlScheduleExport?.timeframe||document.getElementById("htlSignalPanelTimeframe")?.value||"M15",indicator=options.indicator||timeframeSignalScheduleExport?.indicator||document.getElementById("htlSignalPanelIndicator")?.value||"ASSET";document.getElementById("htlSignalPanelTimeframe").value=tf;document.getElementById("htlSignalPanelIndicator").value=indicator;externalRows=normalizeFromTwoExports(htlScheduleExport,timeframeSignalScheduleExport,{timeframe:tf,indicator});return render();}

  function scheduleRender(){if(observerQueued)return;observerQueued=true;queueMicrotask(()=>{observerQueued=false;externalRows=null;render();});}
  function install(){
    if(!ensurePanel())return false;render();
    const matrix=document.getElementById("signalMatrix"),events=document.getElementById("eventScheduleBody");if(typeof MutationObserver!=="undefined"){const observer=new MutationObserver(scheduleRender);if(matrix)observer.observe(matrix,{childList:true,subtree:true});if(events)observer.observe(events,{childList:true,subtree:true});}
    document.getElementById("scheduleStrategy")?.addEventListener("change",()=>{const selected=document.getElementById("scheduleStrategy")?.value,control=document.getElementById("htlSignalPanelIndicator");if(control&&FALLBACK_INDICATORS.includes(selected)){control.value=selected;scheduleRender();}});
    global.addEventListener?.("cte:optimizer-updated",scheduleRender);return true;
  }

  global.CTEHtlSignalPanel=Object.freeze({VERSION,directionalGain,joinRows,normalizeFromTwoExports,normalizeFromLiveState,renderFromExports,render,exportPayload});
  if(typeof document!=="undefined"){if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",install,{once:true});else queueMicrotask(install);}
})(globalThis);
