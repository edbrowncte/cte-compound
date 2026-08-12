(function installIndicatorOnlyControls(global){
  "use strict";

  const VERSION="CTE_INDICATOR_ONLY_UI@2.0.0";
  const NORMAL_CONTROL_IDS=["engineTimeframe","engineStrategy","engineConfirmationStrategy","engineHtlLength","engineFilter","engineDecisionMode","engineConfigurationSource","saveEngineConfig","candidateA","candidateB","candidateC","candidateUnits","executeDecisionCandidate","tradePair","tradeUnits","tradeBuy","tradeSell"];
  const priorDisabled=new Map(),dirtyUnits=new Set();
  let root=null,busy=false,pollTimer=null,saveTimer=null;

  const el=id=>document.getElementById(id);
  const suffix=slot=>slot===1?"":String(slot);
  const id=(name,slot)=>`indicatorOnly${name}${suffix(slot)}`;
  const structuralIds=slot=>[id("Pair",slot),id("Timeframe",slot),id("Indicator",slot),id("Length",slot),id("Filter",slot)];
  const copyOptions=(source,target)=>{if(source&&target)target.innerHTML=[...source.options].map(option=>`<option value="${option.value}">${option.textContent}</option>`).join("");};
  function ticket(slot){return{slot,enabled:Boolean(el(id("Toggle",slot))?.checked),pair:el(id("Pair",slot))?.value||(slot===1?"EUR_USD":"GBP_USD"),timeframe:el(id("Timeframe",slot))?.value||"M1",indicator:el(id("Indicator",slot))?.value||"ASSET",length:Math.max(3,Math.min(200,Math.trunc(Number(el(id("Length",slot))?.value)||10))),filter:Math.max(0,Math.min(10,Number(el(id("Filter",slot))?.value)||0)),units:Math.max(1,Math.min(100000000,Math.trunc(Number(el(id("Units",slot))?.value)||100)))};}
  const currentTickets=()=>[ticket(1),ticket(2)];

  function lockNormal(active){const nodes=[...NORMAL_CONTROL_IDS.map(el).filter(Boolean),...document.querySelectorAll("#pairSelectorGrid button")];for(const node of nodes){if(active){if(!priorDisabled.has(node))priorDisabled.set(node,Boolean(node.disabled));node.disabled=true;}else if(priorDisabled.has(node)){node.disabled=priorDisabled.get(node);priorDisabled.delete(node);}}}
  function setTicketLocked(slot,enabled){for(const controlId of structuralIds(slot)){const node=el(controlId);if(node)node.disabled=enabled||busy;}const units=el(id("Units",slot));if(units)units.disabled=busy;}
  function applyTicket(io={},runtime={},slot){
    const enabled=Boolean(io.enabled),units=el(id("Units",slot)),focused=units&&document.activeElement===units;
    for(const [name,key] of [["Pair","pair"],["Timeframe","timeframe"],["Indicator","indicator"],["Length","length"],["Filter","filter"]]){const node=el(id(name,slot));if(node&&io[key]!==undefined)node.value=String(io[key]);}
    if(units&&io.units!==undefined&&!dirtyUnits.has(slot)&&!focused)units.value=String(io.units);
    const toggle=el(id("Toggle",slot));if(toggle)toggle.checked=enabled;setTicketLocked(slot,enabled);
    const label=el(id("ToggleLabel",slot));if(label){label.textContent=enabled?"ENGAGED":"OFF";label.style.color=enabled?"var(--buy,#48c78e)":"var(--muted,#8e9aab)";}
    const status=el(id("Status",slot));if(status){const signal=runtime.lastSignal?` · signal ${runtime.lastSignal}`:"",candle=runtime.lastCandle?` · candle ${new Date(runtime.lastCandle).toLocaleString()}`:"",event=runtime.eventStartTime?` · event ${new Date(runtime.eventStartTime).toLocaleString()}`:"",delay=Number.isFinite(runtime.executionDelayMs)?` · delay ${(runtime.executionDelayMs/1000).toFixed(1)}s`:"";status.textContent=enabled?`IO TICKET ${slot} ACTIVE · ${String(io.pair||"").replace("_","/")} · ${io.timeframe} · ${io.indicator} · L${io.length} · F${io.filter} · U${io.units}${signal}${candle}${event}${delay}`:`IO TICKET ${slot} OFF`;status.style.color=enabled?"var(--buy,#48c78e)":"var(--muted,#8e9aab)";}
  }
  function apply(payload={}){
    const source=Array.isArray(payload.indicatorOnlyTickets)?payload.indicatorOnlyTickets:[payload.indicatorOnly||{},{}],runtime=payload.indicatorOnlyTicketRuntime||{};
    applyTicket(source[0]||{},runtime[1]||payload.indicatorOnlyRuntime||{},1);applyTicket(source[1]||{},runtime[2]||{},2);lockNormal(source.some(item=>item?.enabled));
  }

  async function load(){if(busy)return;try{const response=await fetch("/api/control/status",{headers:{Accept:"application/json"},credentials:"same-origin",cache:"no-store"}),payload=await response.json().catch(()=>({}));if(response.ok)apply(payload);}catch{}}
  async function save(options={}){
    if(busy)return;busy=true;const changedSlot=Number(options.slot)||0,status=changedSlot?el(id("Status",changedSlot)):null;if(status)status.textContent=`Saving IO Ticket ${changedSlot}…`;let saved=false;
    try{const response=await fetch("/api/control/selectedPairs",{method:"POST",headers:{Accept:"application/json","Content-Type":"application/json"},credentials:"same-origin",cache:"no-store",body:JSON.stringify({indicatorOnlyTickets:currentTickets()})}),payload=await response.json().catch(()=>({}));if(!response.ok)throw new Error(payload.error||`HTTP ${response.status}`);if(changedSlot)dirtyUnits.delete(changedSlot);apply(payload);saved=true;}catch(error){if(status)status.textContent=error?.message||"Indicator Only ticket update failed";}
    finally{busy=false;for(const slot of [1,2])setTicketLocked(slot,Boolean(el(id("Toggle",slot))?.checked));lockNormal(currentTickets().some(item=>item.enabled));}
    if(saved)await load();
  }
  function scheduleUnitsSave(slot){dirtyUnits.add(slot);if(saveTimer)clearTimeout(saveTimer);const value=Number(el(id("Units",slot))?.value);if(!Number.isFinite(value)||value<1)return;saveTimer=setTimeout(()=>{saveTimer=null;void save({slot});},450);}

  function ticketMarkup(slot){const s=suffix(slot);return `<section data-io-ticket="${slot}" style="display:flex;flex-wrap:wrap;gap:7px;align-items:end;padding:${slot===2?"8px 0 0":"0"};${slot===2?"border-top:1px solid var(--line2,#3a4657);margin-top:4px;":""}"><label style="display:flex;align-items:center;gap:8px;min-height:36px;padding:7px 10px;border:1px solid var(--line2,#3a4657);background:#101923;font-weight:850;"><input id="indicatorOnlyToggle${s}" type="checkbox" style="width:16px;height:16px;"><span>IO Ticket ${slot}</span><strong id="indicatorOnlyToggleLabel${s}" style="font-size:9px;color:var(--muted,#8e9aab);">OFF</strong></label><label class="field"><span>Pair</span><select id="indicatorOnlyPair${s}"></select></label><label class="field"><span>Timeframe</span><select id="indicatorOnlyTimeframe${s}"></select></label><label class="field"><span>Indicator</span><select id="indicatorOnlyIndicator${s}"></select></label><label class="field"><span>Length</span><input id="indicatorOnlyLength${s}" type="number" min="3" max="200" value="10"></label><label class="field"><span>Filter</span><input id="indicatorOnlyFilter${s}" type="number" min="0" max="10" step="0.1" value="0"></label><label class="field"><span>Units</span><input id="indicatorOnlyUnits${s}" type="number" min="1" max="100000000" step="1" value="100"></label><div id="indicatorOnlyStatus${s}" role="status" aria-live="polite" style="flex-basis:100%;min-height:14px;font-size:9px;color:var(--muted,#8e9aab);">IO TICKET ${slot} OFF</div></section>`;}
  function install(){
    if(typeof document==="undefined")return false;if(root&&document.contains(root))return true;const panel=el("chartPanel"),anchor=panel?.querySelector(".panel-head"),toolbar=panel?.querySelector(".chart-toolbar");if(!panel||!anchor||!toolbar)return false;
    root=document.createElement("section");root.id="indicatorOnlyControls";root.setAttribute("aria-label","Dual Indicator Only automated trading tickets");root.dataset.controlScope="indicator-only-dual";root.style.cssText="border:1px solid var(--line2,#3a4657);background:#0a1017;padding:8px;margin:8px 14px 0;";root.innerHTML=`<div style="font-size:9px;font-weight:900;letter-spacing:.08em;text-transform:uppercase;margin-bottom:7px;">Indicator Only · Two Independent Execution Tickets</div>${ticketMarkup(1)}${ticketMarkup(2)}`;anchor.insertAdjacentElement("afterend",root);toolbar.dataset.chartControlAttachment="canonical-chart";toolbar.setAttribute("aria-label","Canonical chart controls");toolbar.style.padding="8px 14px";toolbar.style.borderBottom="1px solid var(--line,#2b3543)";root.insertAdjacentElement("afterend",toolbar);
    for(const slot of [1,2]){copyOptions(el("tradePair"),el(id("Pair",slot)));copyOptions(el("engineTimeframe"),el(id("Timeframe",slot)));copyOptions(el("engineStrategy"),el(id("Indicator",slot)));if(slot===1){if(el("tradePair"))el(id("Pair",slot)).value=el("tradePair").value;if(el("engineTimeframe"))el(id("Timeframe",slot)).value=el("engineTimeframe").value;if(el("engineStrategy"))el(id("Indicator",slot)).value=el("engineStrategy").value;if(el("engineHtlLength"))el(id("Length",slot)).value=el("engineHtlLength").value;if(el("engineFilter"))el(id("Filter",slot)).value=el("engineFilter").value;}else if(el(id("Pair",slot))?.options.length>1)el(id("Pair",slot)).selectedIndex=1;
      el(id("Toggle",slot)).addEventListener("change",()=>save({slot}));for(const controlId of structuralIds(slot))el(controlId).addEventListener("change",()=>save({slot}));const units=el(id("Units",slot));units.addEventListener("input",()=>scheduleUnitsSave(slot));units.addEventListener("change",()=>{if(saveTimer){clearTimeout(saveTimer);saveTimer=null;}if(dirtyUnits.has(slot))void save({slot});});units.addEventListener("blur",()=>{if(dirtyUnits.has(slot)&&!busy){if(saveTimer){clearTimeout(saveTimer);saveTimer=null;}void save({slot});}});}
    void load();pollTimer=setInterval(()=>{if(!document.hidden)void load();},5000);global.addEventListener?.("pagehide",()=>{if(pollTimer)clearInterval(pollTimer);if(saveTimer)clearTimeout(saveTimer);},{once:true});return true;
  }

  if(typeof document!=="undefined"){if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",install,{once:true});else queueMicrotask(install);}
  global.CTEIndicatorOnlyUI=Object.freeze({VERSION,install,currentTickets,__test:Object.freeze({ticket,currentTickets})});
})(globalThis);