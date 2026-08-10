(function installIndicatorOnlyControls(global){
  "use strict";

  const VERSION="CTE_INDICATOR_ONLY_UI@1.0.0";
  const NORMAL_CONTROL_IDS=["engineTimeframe","engineStrategy","engineConfirmationStrategy","engineHtlLength","engineFilter","engineDecisionMode","engineConfigurationSource","saveEngineConfig","candidateA","candidateB","candidateC","candidateUnits","executeDecisionCandidate","tradePair","tradeUnits","tradeBuy","tradeSell"];
  const priorDisabled=new Map();
  let root=null,busy=false,pollTimer=null;

  const el=id=>document.getElementById(id);
  const copyOptions=(source,target)=>{if(source&&target)target.innerHTML=[...source.options].map(option=>`<option value="${option.value}">${option.textContent}</option>`).join("");};
  const control=()=>({enabled:Boolean(el("indicatorOnlyToggle")?.checked),pair:el("indicatorOnlyPair")?.value||"EUR_USD",timeframe:el("indicatorOnlyTimeframe")?.value||"M1",indicator:el("indicatorOnlyIndicator")?.value||"ASSET",length:Math.max(3,Math.min(200,Math.trunc(Number(el("indicatorOnlyLength")?.value)||10))),filter:Math.max(0,Math.min(10,Number(el("indicatorOnlyFilter")?.value)||0))});

  function lockNormal(active){
    const nodes=[...NORMAL_CONTROL_IDS.map(el).filter(Boolean),...document.querySelectorAll("#pairSelectorGrid button")];
    for(const node of nodes){
      if(active){if(!priorDisabled.has(node))priorDisabled.set(node,Boolean(node.disabled));node.disabled=true;}
      else if(priorDisabled.has(node)){node.disabled=priorDisabled.get(node);priorDisabled.delete(node);}
    }
  }

  function apply(payload={}){
    const io=payload.indicatorOnly||{},runtime=payload.indicatorOnlyRuntime||{},enabled=Boolean(io.enabled);
    if(el("indicatorOnlyPair")&&io.pair)el("indicatorOnlyPair").value=io.pair;
    if(el("indicatorOnlyTimeframe")&&io.timeframe)el("indicatorOnlyTimeframe").value=io.timeframe;
    if(el("indicatorOnlyIndicator")&&io.indicator)el("indicatorOnlyIndicator").value=io.indicator;
    if(el("indicatorOnlyLength")&&io.length!==undefined)el("indicatorOnlyLength").value=String(io.length);
    if(el("indicatorOnlyFilter")&&io.filter!==undefined)el("indicatorOnlyFilter").value=String(io.filter);
    if(el("indicatorOnlyToggle"))el("indicatorOnlyToggle").checked=enabled;
    for(const id of ["indicatorOnlyPair","indicatorOnlyTimeframe","indicatorOnlyIndicator","indicatorOnlyLength","indicatorOnlyFilter"]){const node=el(id);if(node)node.disabled=enabled||busy;}
    lockNormal(enabled);
    const status=el("indicatorOnlyStatus");
    if(status){
      const signal=runtime.lastSignal?` · signal ${runtime.lastSignal}`:"",candle=runtime.lastCandle?` · ${new Date(runtime.lastCandle).toLocaleString()}`:"";
      status.textContent=enabled?`IO ACTIVE · ${String(io.pair||"").replace("_","/")} · ${io.timeframe} · ${io.indicator} · L${io.length} · F${io.filter}${signal}${candle}`:"IO OFF · normal certified automation active";
      status.style.color=enabled?"var(--buy,#48c78e)":"var(--muted,#8e9aab)";
    }
    const toggleLabel=el("indicatorOnlyToggleLabel");if(toggleLabel){toggleLabel.textContent=enabled?"ENGAGED":"OFF";toggleLabel.style.color=enabled?"var(--buy,#48c78e)":"var(--muted,#8e9aab)";}
  }

  async function load(){
    try{
      const response=await fetch("/api/control/status",{headers:{Accept:"application/json"},credentials:"same-origin",cache:"no-store"}),payload=await response.json().catch(()=>({}));
      if(response.ok)apply(payload);
    }catch{}
  }

  async function save(){
    if(busy)return;
    busy=true;
    const requested=control(),status=el("indicatorOnlyStatus");
    if(status)status.textContent=requested.enabled?"Engaging Indicator Only…":"Saving Indicator Only controls…";
    try{
      const response=await fetch("/api/control/selectedPairs",{method:"POST",headers:{Accept:"application/json","Content-Type":"application/json"},credentials:"same-origin",cache:"no-store",body:JSON.stringify({indicatorOnly:requested})}),payload=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(payload.error||`HTTP ${response.status}`);
      await load();
    }catch(error){if(status)status.textContent=error?.message||"Indicator Only control update failed";await load();}
    finally{busy=false;const active=Boolean(el("indicatorOnlyToggle")?.checked);for(const id of ["indicatorOnlyPair","indicatorOnlyTimeframe","indicatorOnlyIndicator","indicatorOnlyLength","indicatorOnlyFilter"]){const node=el(id);if(node)node.disabled=active;}lockNormal(active);}
  }

  function install(){
    if(typeof document==="undefined")return false;
    if(root&&document.contains(root))return true;
    const panel=el("automationPanel"),anchor=panel?.querySelector(".automation-controls");
    if(!panel||!anchor)return false;
    root=document.createElement("section");root.id="indicatorOnlyControls";root.setAttribute("aria-label","Indicator Only automated trading controls");root.style.cssText="grid-column:1/-1;border:1px solid var(--line2,#3a4657);background:#0a1017;padding:10px;display:flex;flex-wrap:wrap;gap:7px;align-items:end;";
    root.innerHTML=`
      <label style="display:flex;align-items:center;gap:8px;min-height:36px;padding:7px 10px;border:1px solid var(--line2,#3a4657);background:#101923;font-weight:850;"><input id="indicatorOnlyToggle" type="checkbox" style="width:16px;height:16px;"><span>Indicator Only (IO)</span><strong id="indicatorOnlyToggleLabel" style="font-size:9px;color:var(--muted,#8e9aab);">OFF</strong></label>
      <label class="field"><span>Pair</span><select id="indicatorOnlyPair"></select></label>
      <label class="field"><span>Timeframe</span><select id="indicatorOnlyTimeframe"></select></label>
      <label class="field"><span>Indicator</span><select id="indicatorOnlyIndicator"></select></label>
      <label class="field"><span>Length</span><input id="indicatorOnlyLength" type="number" min="3" max="200" value="10"></label>
      <label class="field"><span>Filter</span><input id="indicatorOnlyFilter" type="number" min="0" max="10" step="0.1" value="0"></label>
      <div id="indicatorOnlyStatus" role="status" aria-live="polite" style="flex-basis:100%;min-height:14px;font-size:9px;color:var(--muted,#8e9aab);">IO OFF · normal certified automation active</div>`;
    anchor.insertAdjacentElement("afterend",root);
    copyOptions(el("tradePair"),el("indicatorOnlyPair"));copyOptions(el("engineTimeframe"),el("indicatorOnlyTimeframe"));copyOptions(el("engineStrategy"),el("indicatorOnlyIndicator"));
    if(el("tradePair"))el("indicatorOnlyPair").value=el("tradePair").value;
    if(el("engineTimeframe"))el("indicatorOnlyTimeframe").value=el("engineTimeframe").value;
    if(el("engineStrategy"))el("indicatorOnlyIndicator").value=el("engineStrategy").value;
    if(el("engineHtlLength"))el("indicatorOnlyLength").value=el("engineHtlLength").value;
    if(el("engineFilter"))el("indicatorOnlyFilter").value=el("engineFilter").value;
    el("indicatorOnlyToggle").addEventListener("change",save);
    for(const id of ["indicatorOnlyPair","indicatorOnlyTimeframe","indicatorOnlyIndicator","indicatorOnlyLength","indicatorOnlyFilter"])el(id).addEventListener("change",save);
    void load();pollTimer=setInterval(()=>{if(!document.hidden)void load();},5000);
    global.addEventListener?.("pagehide",()=>{if(pollTimer)clearInterval(pollTimer);},{once:true});
    return true;
  }

  if(typeof document!=="undefined"){if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",install,{once:true});else queueMicrotask(install);}
  global.CTEIndicatorOnlyUI=Object.freeze({VERSION,install,__test:Object.freeze({control})});
})(globalThis);
