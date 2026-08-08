import fs from "node:fs";
const path="public/index.html";
let source=fs.readFileSync(path,"utf8");
const pattern=/  async function connect\(event\) \{[\s\S]*?\n  \}\n\n  function disconnect\(\) \{/;
if(!pattern.test(source))throw new Error("Missing migrated connect() block.");
const replacement=`  async function connect(event) {
    event?.preventDefault?.();
    if(!state.preferencesLoaded)await loadPlatformPreferences();
    const button=el("connectButton"),wasConnected=state.connected;
    button.disabled=true;button.textContent="TESTING…";
    setConnectionStatus(wasConnected?"Testing live OANDA connection…":"Connecting to live OANDA…");
    try {
      const response=await fetch("/api/oanda/connect",{headers:{"Accept":"application/json"},credentials:"same-origin",cache:"no-store"}),{payload,diagnosticId}=await readApiResponse(response);
      if(!response.ok){const failure=new Error(apiFailureMessage(response,payload,diagnosticId));failure.payload=payload;failure.status=response.status;throw failure;}
      const accountId=payload.account?.id||"";
      el("oandaAccountId").value=accountId;applyAccountFacts(payload.account,accountId);
      el("oandaAccountState").textContent=payload.account?.alias||accountId||"Connected";
      el("oandaApiState").textContent="Connected through Worker";
      if(wasConnected){setConnectionStatus("Live OANDA connection test passed · active session retained","connected");void loadTradeCapacity();return;}
      state.connected=true;
      el("disconnectButton").disabled=false;el("refreshSchedule").disabled=false;el("refreshChart").disabled=false;el("refreshEventChart").disabled=false;el("loadEvents").disabled=false;
      el("accountFacts").hidden=false;el("positionsPanel").hidden=false;el("automationPanel").hidden=false;
      setConnectionStatus("Live OANDA connected · completed midpoint candles only","connected");
      startPositionMonitor();
      await Promise.all([loadEngineConfig().catch(error=>{el("automationStatus").textContent=error.message||"Configuration unavailable";}),loadOptimizerRecords(),loadControlStatus().catch(() => {})]);
      void loadTradingLedger();void loadEngineStatus();
      await loadTradeCapacity();await loadChart();void loadSchedule("focused");setTimeout(()=>{if(state.connected&&!state.chartLoading)void runPlatformDiagnostic(false);},5000);
    } catch (error) {
      if(wasConnected){setConnectionStatus(\`${'${'}error.message||"Connection test failed"} · active session retained\`,"error");}
      else{state.connected=false;el("accountFacts").hidden=true;el("positionsPanel").hidden=true;el("automationPanel").hidden=true;stopPositionMonitor();stopAdaptiveMonitor();setConnectionStatus(error.message||"OANDA connection failed.","error");setTimeout(()=>{if(!state.connected)void runPlatformDiagnostic(true);},250);}
    } finally {button.disabled=false;button.textContent="TEST";}
  }

  function disconnect() {`;
source=source.replace(pattern,replacement);fs.writeFileSync(path,source);console.log("Applied TEST connection UI parity correction.");
