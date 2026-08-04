import {readFile,writeFile,unlink} from "node:fs/promises";

const replaceOnce=(source,search,replacement,label)=>{
  let count=0;
  if(search instanceof RegExp){
    source=source.replace(search,(...args)=>{count++;return typeof replacement==="function"?replacement(...args):replacement;});
  }else{
    const index=source.indexOf(search);
    if(index>=0){source=source.slice(0,index)+replacement+source.slice(index+search.length);count=1;}
  }
  if(count!==1)throw new Error(`${label}: expected one replacement, found ${count}`);
  return source;
};

let worker=await readFile("src/worker.js","utf8");
worker=replaceOnce(worker,
`async function handleProxy(request,env,url) {
  const method=request.method;
  if(method!=="GET") return json({error:"Method not allowed."},405,{Allow:"GET"});
  const {token,accountId:configuredAccountId}=credentials(env),accountId=await resolveAccount(token,configuredAccountId);
  const path=proxyPath(url.searchParams.get("path"),accountId,method);
  return json(await oandaRequest(path,token,{method}));
}
`,
`async function handleProxy(request,env,url) {
  const method=request.method;
  if(method!=="GET") return json({error:"Method not allowed."},405,{Allow:"GET"});
  const {token,accountId:configuredAccountId}=credentials(env),accountId=await resolveAccount(token,configuredAccountId);
  const path=proxyPath(url.searchParams.get("path"),accountId,method);
  return json(await oandaRequest(path,token,{method}));
}

function normalizeManualOrder(value) {
  const source=value?.order||{},instrument=String(source.instrument||"").toUpperCase(),units=Number(source.units);
  if(!INSTRUMENTS.has(instrument)) throw Object.assign(new Error("Invalid order instrument."),{status:400});
  if(!Number.isFinite(units)||!Number.isInteger(units)||units===0) throw Object.assign(new Error("Order units must be a non-zero integer."),{status:400});
  if(source.type!=="MARKET"||source.timeInForce!=="FOK"||source.positionFill!=="DEFAULT") throw Object.assign(new Error("Only MARKET FOK DEFAULT orders are permitted."),{status:400});
  return {order:{instrument,units:String(units),type:"MARKET",timeInForce:"FOK",positionFill:"DEFAULT"}};
}

async function handleManualOrder(request,env) {
  const {token,accountId:configuredAccountId}=credentials(env),accountId=await resolveAccount(token,configuredAccountId);
  const body=normalizeManualOrder(await request.json().catch(()=>null));
  return json(await oandaRequest(`/v3/accounts/${encodeURIComponent(accountId)}/orders`,token,{method:"POST",body:JSON.stringify(body)}));
}
`,
"worker manual order handler");

worker=replaceOnce(worker,
`        if(url.pathname==="/api/engine/optimizer"&&request.method==="PUT") return await env.HTL_ENGINE.getByName("live").fetch(new Request("https://engine/optimizer",{method:"PUT",headers:{"Content-Type":"application/json"},body:request.body}));
`,
`        if(url.pathname==="/api/engine/optimizer"&&request.method==="PUT") return json({error:"Optimizer records are server-managed."},405,{Allow:"GET"});
`,
"worker optimizer write closure");

worker=replaceOnce(worker,
`        if(url.pathname==="/api/oanda/proxy") return await handleProxy(request,env,url);
`,
`        if(url.pathname==="/api/oanda/order"&&request.method==="POST") return await handleManualOrder(request,env);
        if(url.pathname==="/api/oanda/proxy") return await handleProxy(request,env,url);
`,
"worker manual order route");
await writeFile("src/worker.js",worker);

let engine=await readFile("src/engine.js","utf8");
engine=replaceOnce(engine,
`DEFAULT_CONFIG={timeframe:"M15",htlLength:10,decisionMode:"EVENT",strategy:"ASSET",confirmationStrategy:"NONE",filter:0,configurationSource:"FIXED"}`,
`DEFAULT_CONFIG={timeframe:"M15",htlLength:10,decisionMode:"EVENT",strategy:"ASSET",confirmationStrategy:"NONE",filter:0,configurationSource:"OPTIMIZED"}`,
"engine optimized default");

engine=replaceOnce(engine,
`if(path==="/optimizer"&&request.method==="PUT")return response(await this.saveOptimizer(await request.json()));`,
`if(path==="/optimizer"&&request.method==="PUT")return response({error:"Optimizer records are server-managed."},405);`,
"engine optimizer write closure");

engine=replaceOnce(engine,
`  async saveOptimizer(value){const key=String(value.key||"");if(!/^[A-Z]{3}_[A-Z]{3}\\|(W|D|H4|H1|M30|M15|M5|M1|S30|S5)$/.test(key))throw new Error("Invalid optimizer key");const records=(await this.ctx.storage.get("optimizer"))||{};records[key]={version:OPTIMIZER_VERSION,stamp:value.stamp||new Date().toISOString(),config:value.config||{}};await this.ctx.storage.put("optimizer",records);return records[key];}
`,
`  async saveOptimizer(){throw Object.assign(new Error("Optimizer records are server-managed."),{status:405});}
`,
"engine optimizer saver closure");

engine=replaceOnce(engine,
`?{pair,event:{...row.event,direction,id:\`MTF:${direction}:${lastCandle}\`},confidence,count}:null;`,
`?{pair,event:{...row.event,direction,id:\`MTF:${direction}:${lastCandle}\`},confidence,count,configuration:row.configuration}:null;`,
"MTF configuration propagation");

engine=replaceOnce(engine,
`  closeRecord(fill,{pair,strategy,direction,event=null,message}){return{type:"POSITION_CLOSED",pair,strategy,direction,units:Math.abs(Number(fill.units)||0),price:fill.price||null,realizedPL:fill.pl??null,financing:fill.financing??null,commission:fill.commission??null,accountBalance:fill.accountBalance??null,transaction:fill.id||null,event,message};}
  async closePosition(pair,existing,longUnits,shortUnits,token,accountId,strategy,event,message){
    const body=existing>0?{longUnits:"ALL"}:{shortUnits:"ALL"},result=await callOanda(\`/v3/accounts/${accountId}/positions/${pair}/close\`,token,{method:"PUT",body:JSON.stringify(body)}),fill=result.longOrderFillTransaction||result.shortOrderFillTransaction;
    if(!fill){const rejected=result.longOrderRejectTransaction||result.shortOrderRejectTransaction,reason=rejected?.rejectReason||rejected?.reason||"OANDA returned no close fill";await this.write({type:"CLOSE_REJECTED",pair,strategy,direction:existing>0?"BUY":"SELL",units:existing>0?longUnits:shortUnits,transaction:rejected?.id||result.lastTransactionID||null,event,message:reason});return null;}
    await this.write(this.closeRecord(fill,{pair,strategy,direction:existing>0?"BUY":"SELL",event,message}));return fill;
  }
  async reconcile(directions,token,accountId,state,config){
    const payload=await callOanda(\`/v3/accounts/${accountId}/positions\`,token),positions=payload.positions||[];
    for(const position of positions){
      if(!PAIRS.includes(position.instrument))continue;
      const longUnits=Number(position.long?.units||0),shortUnits=Math.abs(Number(position.short?.units||0)),existing=longUnits>0?1:shortUnits>0?-1:0,required=Number(directions[position.instrument]||0);
      if(!existing||!required||existing===required)continue;
      await this.closePosition(position.instrument,existing,longUnits,shortUnits,token,accountId,config.strategy,state.events?.[position.instrument]||null,"Position opposed current strategy direction");
    }
  }
`,
`  decisionContext(candidate,config){const primary=candidate?.configuration?.primary||{length:config.htlLength,filter:config.filter,score:null,trades:null,net:null,maxDrawdown:null,winRate:null},confirmation=candidate?.configuration?.confirmation||null;return{strategy:config.strategy,confirmationStrategy:config.confirmationStrategy,decisionMode:config.decisionMode,timeframe:config.timeframe,htlLength:primary.length,filter:primary.filter,configurationSource:config.configurationSource,optimizerScore:primary.score??null,optimizerTrades:primary.trades??null,optimizerNet:primary.net??null,optimizerDrawdown:primary.maxDrawdown??null,optimizerWinRate:primary.winRate??null,confirmationHtlLength:confirmation?.length??null,confirmationFilter:confirmation?.filter??null};}
  closeRecord(fill,{pair,direction,event=null,message,context={}}){return{type:"POSITION_CLOSED",pair,direction,units:Math.abs(Number(fill.units)||0),price:fill.price||null,realizedPL:fill.pl??null,financing:fill.financing??null,commission:fill.commission??null,accountBalance:fill.accountBalance??null,transaction:fill.id||null,event,message,...context};}
  async closePosition(pair,existing,longUnits,shortUnits,token,accountId,event,message,context={}){
    const body=existing>0?{longUnits:"ALL"}:{shortUnits:"ALL"},result=await callOanda(\`/v3/accounts/${accountId}/positions/${pair}/close\`,token,{method:"PUT",body:JSON.stringify(body)}),fill=result.longOrderFillTransaction||result.shortOrderFillTransaction;
    if(!fill){const rejected=result.longOrderRejectTransaction||result.shortOrderRejectTransaction,reason=rejected?.rejectReason||rejected?.reason||"OANDA returned no close fill";await this.write({type:"CLOSE_REJECTED",pair,direction:existing>0?"BUY":"SELL",units:existing>0?longUnits:shortUnits,transaction:rejected?.id||result.lastTransactionID||null,event,message:reason,...context});return null;}
    await this.write(this.closeRecord(fill,{pair,direction:existing>0?"BUY":"SELL",event,message,context}));return fill;
  }
  async reconcile(requirements,token,accountId,state,config){
    const payload=await callOanda(\`/v3/accounts/${accountId}/positions\`,token),positions=payload.positions||[];
    for(const position of positions){
      if(!PAIRS.includes(position.instrument))continue;
      const longUnits=Number(position.long?.units||0),shortUnits=Math.abs(Number(position.short?.units||0)),existing=longUnits>0?1:shortUnits>0?-1:0,requirement=requirements[position.instrument],required=Number(requirement?.event?.direction??requirement??0);
      if(!existing||!required||existing===required)continue;
      const context=this.decisionContext(requirement&&typeof requirement==="object"?requirement:null,config),event=requirement?.event?.id||state.events?.[position.instrument]||null;
      await this.closePosition(position.instrument,existing,longUnits,shortUnits,token,accountId,event,"Position opposed current strategy direction",context);
    }
  }
`,
"engine reconciliation and context");

engine=replaceOnce(engine,
`      if(lastCandle===state.lastCandle){
        if(!state.directions){const rows=rotationTimeframe===config.timeframe?rotationRows:await this.scan(token,config,config.timeframe,optimizer);state.directions=Object.fromEntries(rows.map(row=>[row.pair,row.event.direction]));state.events=Object.fromEntries(rows.map(row=>[row.pair,row.event.id]));state.initialized=true;}
        state.lastRun=new Date().toISOString();state.lastError=null;return;
      }
`,
`      if(lastCandle===state.lastCandle){
        if(!state.directions){const rows=rotationTimeframe===config.timeframe?rotationRows:await this.scan(token,config,config.timeframe,optimizer);state.directions=Object.fromEntries(rows.map(row=>[row.pair,row.event.direction]));state.events=Object.fromEntries(rows.map(row=>[row.pair,row.event.id]));state.initialized=true;}
        await this.reconcile(state.directions,token,accountId,state,config);
        state.lastRun=new Date().toISOString();state.lastError=null;return;
      }
`,
"same-candle full reconciliation");

engine=replaceOnce(engine,
`      state.directions=Object.fromEntries(rows.map(row=>[row.pair,row.event.direction]));
      const mtfNow=this.mtfCandidates(state,rows,lastCandle,fingerprint);
`,
`      state.directions=Object.fromEntries(rows.map(row=>[row.pair,row.event.direction]));
      const requirements=Object.fromEntries(rows.map(row=>[row.pair,row])),mtfNow=this.mtfCandidates(state,rows,lastCandle,fingerprint);
      await this.reconcile(requirements,token,accountId,state,config);
`,
"new-candle full reconciliation");

engine=replaceOnce(engine,
`        const exitCandidates=decisionCandidates.filter(row=>row.pair!==candidate?.pair);if(exitCandidates.length)await this.reconcile(Object.fromEntries(exitCandidates.map(row=>[row.pair,row.event.direction])),token,accountId,state,config);
        if(candidate)await this.execute(candidate,token,accountId,state);
`,
`        if(candidate)await this.execute(candidate,token,accountId,state);
`,
"remove partial-only reconciliation");

engine=replaceOnce(engine,
`    const config=normalizeConfig(state.config);
`,
`    const config=normalizeConfig(state.config),context=this.decisionContext(candidate,config);
`,
"execution context");

engine=engine.replaceAll(
`strategy:config.strategy,direction,event:event.id`,
`direction,event:event.id,...context`
);
engine=engine.replaceAll(
`strategy:config.strategy,direction,transaction:found.order?.id||found.lastTransactionID||null,event:event.id`,
`direction,transaction:found.order?.id||found.lastTransactionID||null,event:event.id,...context`
);
engine=engine.replaceAll(
`{type:"NO_ORDER",pair,direction,message:"Existing position already matches event"}`,
`{type:"NO_ORDER",pair,direction,message:"Existing position already matches event",...context}`
);
engine=engine.replaceAll(
`this.closePosition(pair,existing,longUnits,shortUnits,token,accountId,config.strategy,event.id,"Opposite strategy event")`,
`this.closePosition(pair,existing,longUnits,shortUnits,token,accountId,event.id,"Opposite strategy event",context)`
);
engine=engine.replaceAll(
`{type:"NO_ORDER",pair,direction,message:"No margin available"}`,
`{type:"NO_ORDER",pair,direction,message:"No margin available",...context}`
);
engine=engine.replaceAll(
`{type:"NO_ORDER",pair,direction,message:"No directional units available"}`,
`{type:"NO_ORDER",pair,direction,message:"No directional units available",...context}`
);
engine=replaceOnce(engine,
`await this.write({type:"ORDER_REJECTED",pair,strategy:config.strategy,direction,units,transaction:rejected?.id||result.lastTransactionID||null,event:event.id,message:reason});`,
`await this.write({type:"ORDER_REJECTED",pair,direction,units,transaction:rejected?.id||result.lastTransactionID||null,event:event.id,message:reason,...context});`,
"order rejection context");
engine=replaceOnce(engine,
`await this.write({type:"ORDER_FILLED",pair,strategy:config.strategy,direction,units:Math.abs(Number(fill.units)||units),transaction:fill.id||result.lastTransactionID||null,clientOrderId:clientId,price:fill.price||null,accountBalance:fill.accountBalance??null,event:event.id,decisionMode:config.decisionMode,timeframe:config.timeframe,htlLength:config.htlLength,filter:config.filter,configurationSource:config.configurationSource});`,
`await this.write({type:"ORDER_FILLED",pair,direction,units:Math.abs(Number(fill.units)||units),transaction:fill.id||result.lastTransactionID||null,clientOrderId:clientId,price:fill.price||null,accountBalance:fill.accountBalance??null,event:event.id,...context});`,
"order fill context");
await writeFile("src/engine.js",engine);

let html=await readFile("public/index.html","utf8");
html=replaceOnce(html,`<button class="connect" id="connectButton" type="submit">Connect</button>`,`<button class="connect" id="connectButton" type="submit">TEST</button>`,"TEST button");
html=replaceOnce(html,`<button id="refreshChart" type="button" disabled>Load chart</button>`,`<button id="refreshChart" type="button" disabled>Refresh chart</button>`,"chart button label");
html=replaceOnce(html,`<option value="FIXED">Fixed controls</option><option value="OPTIMIZED">Pair × timeframe optimizer</option>`,`<option value="OPTIMIZED" selected>Pair × timeframe optimizer</option><option value="FIXED">Fixed controls</option>`,"optimizer option default");
html=replaceOnce(html,`<button id="applyConfiguration" type="button">Apply configuration</button><button id="computeConfiguration" type="button" disabled>Compute configuration</button>`,`<button id="applyConfiguration" type="button" hidden>Apply configuration</button><button id="computeConfiguration" type="button" disabled>Refresh optimizer</button>`,"server optimizer controls");
html=replaceOnce(html,`engineConfig:{timeframe:"M15",htlLength:10,decisionMode:"EVENT",strategy:"ASSET",confirmationStrategy:"NONE",filter:0,configurationSource:"FIXED"}`,`engineConfig:{timeframe:"M15",htlLength:10,decisionMode:"EVENT",strategy:"ASSET",confirmationStrategy:"NONE",filter:0,configurationSource:"OPTIMIZED"}`,"browser optimized default");
html=replaceOnce(html,`selectedStrategy:"COMBO",\n    selectedScheduleStrategy:"COMBO"`,`selectedStrategy:"ASSET",\n    selectedScheduleStrategy:"ASSET"`,"browser Asset defaults");
html=replaceOnce(html,`chartAnalysis:null,`,`chartAnalysis:null,\n    chartCache:new Map(),\n    chartCausalIndicators:null,\n    chartCausalSeries:[],\n    chartCausalToken:0,`,"chart causal state");
html=replaceOnce(html,
`  async function oandaPost(path,body) {
    const response=await fetch(\`/api/oanda/proxy?path=${encodeURIComponent(path)}\`,{method:"POST",headers:{"Accept":"application/json","Content-Type":"application/json"},credentials:"same-origin",cache:"no-store",body:JSON.stringify(body)});
`,
`  async function oandaPost(path,body) {
    if(!/\\/orders$/.test(path))throw new Error("Manual order route is not permitted.");
    const response=await fetch("/api/oanda/order",{method:"POST",headers:{"Accept":"application/json","Content-Type":"application/json"},credentials:"same-origin",cache:"no-store",body:JSON.stringify(body)});
`,
"browser manual order route");

html=replaceOnce(html,
`configurationSource:config?.configurationSource==="OPTIMIZED"?"OPTIMIZED":"FIXED"`,
`configurationSource:config?.configurationSource==="FIXED"?"FIXED":"OPTIMIZED"`,
"browser config fallback");

html=replaceOnce(html,/  async function connect\\(event\\) \\{[\\s\\S]*?\\n  \\}\\n\\n  function disconnect\\(\\) \\{/,
`  async function connect(event) {
    event?.preventDefault?.();
    const button=el("connectButton"),wasConnected=state.connected;
    button.disabled=true;button.textContent="TESTING…";
    setConnectionStatus(wasConnected?"Testing live OANDA connection…":"Connecting to live OANDA…");
    try {
      const response=await fetch("/api/oanda/connect",{headers:{"Accept":"application/json"},credentials:"same-origin",cache:"no-store"});
      const payload=await response.json().catch(()=>({error:\`HTTP ${response.status}\`}));
      if(!response.ok)throw new Error(payload.error||payload.message||\`HTTP ${response.status}\`);
      const accountId=payload.account?.id||"";
      el("oandaAccountId").value=accountId;applyAccountFacts(payload.account,accountId);
      el("oandaAccountState").textContent=payload.account?.alias||accountId||"Connected";
      el("oandaApiState").textContent="Connected through Worker";
      if(wasConnected){setConnectionStatus("Live OANDA connection test passed · active session retained","connected");void loadTradeCapacity();return;}
      state.connected=true;
      el("disconnectButton").disabled=false;el("refreshSchedule").disabled=false;el("refreshChart").disabled=false;el("loadEvents").disabled=false;
      el("accountFacts").hidden=false;el("positionsPanel").hidden=false;el("automationPanel").hidden=false;
      setConnectionStatus("Live OANDA connected · completed midpoint candles only","connected");
      startPositionMonitor();
      await Promise.all([loadEngineConfig().catch(error=>{el("automationStatus").textContent=error.message||"Configuration unavailable";}),loadOptimizerRecords()]);
      void loadTradingLedger();void loadEngineStatus();
      await Promise.all([loadTradeCapacity(),loadSchedule(),loadChart(),loadEventForecast()]);
    } catch (error) {
      if(wasConnected){setConnectionStatus(\`${error.message||"Connection test failed"} · active session retained\`,"error");}
      else{state.connected=false;el("accountFacts").hidden=true;el("positionsPanel").hidden=true;el("automationPanel").hidden=true;stopPositionMonitor();stopAdaptiveMonitor();setConnectionStatus(error.message||"OANDA connection failed.","error");}
    } finally {button.disabled=false;button.textContent="TEST";}
  }

  function disconnect() {`,
"non-disruptive TEST connection");

html=replaceOnce(html,
`  async function loadChart() {
    if (!state.connected) return;
    state.chartController?.abort();
    const controller=new AbortController(); state.chartController=controller;
    el("refreshChart").disabled=true; el("chartMessage").hidden=false; el("chartMessage").textContent="Loading completed OANDA candles…";
    try {
      const payload=await oanda(\`/v3/instruments/${encodeURIComponent(state.selectedInstrument)}/candles?price=M&granularity=${encodeURIComponent(state.selectedTimeframe)}&count=650\`,controller);
      const candles=completedCandles(payload);
      state.chartCandles=candles;
      const resolved=resolvedConfiguration(state.selectedInstrument,state.selectedTimeframe);
      state.chartAnalysis=analyzeWithConfiguration(candles,resolved,true);
      state.offsetBars=0; state.crosshair=null;
      el("chartMessage").hidden=true;
      updateChartSummary(); updateCompartments(); markSelectedRow(); drawChart(); renderStrategyConfiguration(); renderMacroPerformance();
    } catch (error) {
      if (error.name!=="AbortError") { el("chartMessage").hidden=false; el("chartMessage").textContent=error.message||"Chart load failed."; state.chartCandles=[]; state.chartAnalysis=null; updateChartSummary(); updateCompartments(); drawChart(); }
    } finally { if (!controller.signal.aborted) el("refreshChart").disabled=false; }
  }
`,
`  function applyChartDataset(instrument,timeframe,candles) {
    if(instrument!==state.selectedInstrument||timeframe!==state.selectedTimeframe)return;
    const resolved=resolvedConfiguration(instrument,timeframe);
    state.chartCandles=candles;state.chartAnalysis=analyzeWithConfiguration(candles,resolved,false);state.chartCausalIndicators=null;state.chartCausalSeries=[];state.offsetBars=0;state.crosshair=null;
    el("chartMessage").hidden=true;updateChartSummary();updateCompartments();markSelectedRow();drawChart();renderStrategyConfiguration();renderMacroPerformance();
    void refreshCausalChartAnalysis(instrument,timeframe,candles,resolved,state.selectedStrategy);
  }

  async function loadChart(instrument=state.selectedInstrument,timeframe=state.selectedTimeframe) {
    if (!state.connected) return;
    state.chartController?.abort();
    const controller=new AbortController(); state.chartController=controller;
    el("refreshChart").disabled=true;el("chartMessage").hidden=false;el("chartMessage").textContent="Loading completed OANDA candles…";
    try {
      const payload=await oanda(\`/v3/instruments/${encodeURIComponent(instrument)}/candles?price=M&granularity=${encodeURIComponent(timeframe)}&count=650\`,controller),candles=completedCandles(payload),key=scheduleKey(instrument,timeframe);
      state.chartCache.set(key,candles);state.scheduleCandles.set(key,candles);
      applyChartDataset(instrument,timeframe,candles);
    } catch (error) {
      if(error.name!=="AbortError"&&instrument===state.selectedInstrument&&timeframe===state.selectedTimeframe){el("chartMessage").hidden=false;el("chartMessage").textContent=error.message||"Chart load failed.";state.chartCandles=[];state.chartAnalysis=null;state.chartCausalIndicators=null;state.chartCausalSeries=[];updateChartSummary();updateCompartments();drawChart();}
    } finally {if(!controller.signal.aborted)el("refreshChart").disabled=false;}
  }
`,
"preloaded chart loader");

html=replaceOnce(html,
`  function selectChart(instrument,timeframe) {
    state.selectedInstrument=instrument||state.selectedInstrument;
    state.selectedTimeframe=timeframe||state.selectedTimeframe;
    el("chartPair").value=state.selectedInstrument; el("chartTimeframe").value=state.selectedTimeframe;
    markSelectedRow();
    if(state.connected)void startPositionStream(state.openPositions.map(position=>position.instrument));
    renderMtfForecast();
    el("chartPanel").scrollIntoView({behavior:"smooth",block:"start"});
  }
`,
`  function selectChart(instrument,timeframe) {
    state.selectedInstrument=instrument||state.selectedInstrument;state.selectedTimeframe=timeframe||state.selectedTimeframe;
    el("chartPair").value=state.selectedInstrument;el("chartTimeframe").value=state.selectedTimeframe;markSelectedRow();renderMtfForecast();
    const key=scheduleKey(state.selectedInstrument,state.selectedTimeframe),cached=state.chartCache.get(key)||state.scheduleCandles.get(key);
    if(cached?.length)try{applyChartDataset(state.selectedInstrument,state.selectedTimeframe,cached);}catch{}
    if(state.connected){void startPositionStream(state.openPositions.map(position=>position.instrument));void loadChart(state.selectedInstrument,state.selectedTimeframe);}
    el("chartPanel").scrollIntoView({behavior:"smooth",block:"start"});
  }
`,
"immediate chart selection");

html=replaceOnce(html,
`    const indicators=state.chartAnalysis?.indicatorSets?.[state.selectedStrategy]||state.chartAnalysis?.indicators||{};`,
`    const indicators=state.chartCausalIndicators||{};`,
"causal chart indicators");
html=replaceOnce(html,
`    const events=state.chartAnalysis?.series?.[state.selectedStrategy]||[];`,
`    const events=state.chartCausalSeries||[];`,
"causal chart events");

html=replaceOnce(html,
`  function htlCausal(data,length){
    const asset=Array(data.length).fill(null),inverse=Array(data.length).fill(null),sourceTotal=Array(data.length).fill(0),first=Math.max(1,length*3-1);
    for(let index=first;index<data.length;index++){const snapshot=htlBuild(data.slice(0,index+1),length);asset[index]=snapshot.asset.at(-1);inverse[index]=snapshot.inverse.at(-1);sourceTotal[index]=snapshot.sourceCrosses.length;}
    return {asset,inverse,sourceTotal,causal:true};
  }
`,
`  function htlCausal(data,length){
    const asset=Array(data.length).fill(null),inverse=Array(data.length).fill(null),sourceTotal=Array(data.length).fill(0),first=Math.max(1,length*3-1);
    for(let index=first;index<data.length;index++){const snapshot=htlBuild(data.slice(0,index+1),length);asset[index]=snapshot.asset.at(-1);inverse[index]=snapshot.inverse.at(-1);sourceTotal[index]=snapshot.sourceCrosses.length;}
    return {asset,inverse,sourceTotal,causal:true};
  }
  function causalIndicatorSet(data,length){const keys=["asset","inverse","meanAsset","meanInverse","dareNAsset","dareNInverse","naiAsset","naiInverse","zup","puz"],out=Object.fromEntries(keys.map(key=>[key,Array(data.length).fill(null)])),first=Math.max(2,length);for(let index=first;index<data.length;index++){const indicators=prepareIndicators(data.slice(0,index+1),{length});for(const key of keys)out[key][index]=indicators[key]?.at(-1)??null;}return out;}
  function causalDirection(indicators,index,strategy,filter=0){const relation=(left,right)=>Number.isFinite(left?.[index])&&Number.isFinite(right?.[index])?left[index]-right[index]>filter?1:left[index]-right[index]<-filter?-1:0:0;if(strategy==="ASSET")return relation(indicators.asset,indicators.inverse);if(strategy==="DARE")return relation(indicators.meanAsset,indicators.meanInverse);if(strategy==="DARE_N")return relation(indicators.dareNAsset,indicators.dareNInverse);if(strategy==="NAI")return relation(indicators.naiAsset,indicators.naiInverse);if(strategy==="APEX"){const z=indicators.zup?.[index],p=indicators.puz?.[index];return Number.isFinite(z)&&Number.isFinite(p)?z<=-filter&&p>=filter?1:z>=filter&&p<=-filter?-1:0:0;}return 0;}
  async function refreshCausalChartAnalysis(instrument,timeframe,candles,configuration,strategy){const token=++state.chartCausalToken;await new Promise(resolve=>requestAnimationFrame(resolve));const config=configuration?.[strategy]||STRATEGY_CONFIG[strategy]||STRATEGY_CONFIG.ASSET,primary=causalIndicatorSet(candles,config.length),sets=new Map([[config.length,primary]]);let series=[],prior=0;if(strategy==="COMBO"){const dareConfig=configuration?.DARE||STRATEGY_CONFIG.DARE,naiConfig=configuration?.NAI||STRATEGY_CONFIG.NAI,dare=sets.get(dareConfig.length)||causalIndicatorSet(candles,dareConfig.length),nai=dareConfig.length===naiConfig.length?dare:causalIndicatorSet(candles,naiConfig.length);for(let index=0;index<candles.length;index++){const d=causalDirection(dare,index,"DARE",dareConfig.filter),n=causalDirection(nai,index,"NAI",naiConfig.filter),direction=d&&d===n?d:0;if(direction&&direction!==prior)series.push({index,direction,confidence:.5,time:candles[index].time,price:candles[index].close});prior=direction;}state.chartCausalIndicators=dare;}else{for(let index=0;index<candles.length;index++){const direction=causalDirection(primary,index,strategy,config.filter);if(direction&&direction!==prior)series.push({index,direction,confidence:.5,time:candles[index].time,price:candles[index].close});prior=direction;}state.chartCausalIndicators=primary;}if(token!==state.chartCausalToken||instrument!==state.selectedInstrument||timeframe!==state.selectedTimeframe||strategy!==state.selectedStrategy)return;state.chartCausalSeries=series;drawChart();}
`,
"causal chart analysis");

html=replaceOnce(html,/  function renderMacroPerformance\\(\\)\\{[\\s\\S]*?\\}\\n  function applyConfiguration\\(\\)/,
`  function renderMacroPerformance(){const record=state.autoConfigurations.get(scheduleKey(state.selectedInstrument,state.selectedTimeframe)),configs=record?.config||{},fmt=(value,digits=2)=>Number.isFinite(value)?Number(value).toFixed(digits):"—";el("macroPerformanceBody").innerHTML=STRATEGIES.map(strategy=>{const stats=configs[strategy.id]||{},trades=Number(stats.trades)||0,wins=trades&&Number.isFinite(stats.winRate)?Math.round(trades*stats.winRate):0,losses=trades-wins,recovery=Number(stats.maxDrawdown)?Number(stats.net)/Number(stats.maxDrawdown):null;return \`<tr><td>${strategy.label}</td><td>${trades||"—"}</td><td>${trades?\`${wins}/${losses}/0\`:"—"}</td><td class="${Number(stats.net)>=0?"positive":"negative"}">${fmt(stats.net,1)}</td><td>${trades?fmt(Number(stats.net)/trades):"—"}</td><td>—</td><td>${fmt(stats.maxDrawdown,1)}</td><td>—</td><td>${fmt(recovery)}</td></tr>\`;}).join("");el("computeConfiguration").disabled=false;}
  function applyConfiguration()`,
"server causal macro performance");

html=replaceOnce(html,/  async function persistOptimizerRecord[\\s\\S]*?  function renderOptimizerRegistry\\(\\)/,
`  async function runAutomaticOptimization(){await loadOptimizerRecords();}
  function renderOptimizerRegistry()`,
"remove browser optimizer writes");

html=replaceOnce(html,/  async function computeConfiguration\\(\\)\\{[\\s\\S]*?\\}\\n  function selectFacility/,
`  async function computeConfiguration(){const button=el("computeConfiguration");button.disabled=true;button.textContent="Refreshing…";await loadOptimizerRecords();renderStrategyConfiguration();renderMacroPerformance();button.textContent="Refresh optimizer";button.disabled=false;}
  function selectFacility`,
"server optimizer refresh");

html=replaceOnce(html,
`    el("chartPair").addEventListener("change",event=>{ state.selectedInstrument=event.target.value; markSelectedRow();renderMtfForecast();if(state.connected)void startPositionStream(state.openPositions.map(position=>position.instrument)); });
    el("chartTimeframe").addEventListener("change",event=>{ state.selectedTimeframe=event.target.value;renderStrategyConfiguration(); });
    el("chartStrategy").addEventListener("change",event=>{ state.selectedStrategy=event.target.value; updateChartSummary(); drawChart(); });
`,
`    el("chartPair").addEventListener("change",event=>selectChart(event.target.value,state.selectedTimeframe));
    el("chartTimeframe").addEventListener("change",event=>selectChart(state.selectedInstrument,event.target.value));
    el("chartStrategy").addEventListener("change",event=>{state.selectedStrategy=event.target.value;updateChartSummary();drawChart();if(state.chartCandles.length)void refreshCausalChartAnalysis(state.selectedInstrument,state.selectedTimeframe,state.chartCandles,resolvedConfiguration(state.selectedInstrument,state.selectedTimeframe),state.selectedStrategy);});
`,
"immediate selector chart loads");

html=replaceOnce(html,
`const fields=[["Ledger ID","ledgerId"],["Time","time"],["Type","type"],["OANDA Type","transactionType"],["Pair","pair"],["Strategy","strategy"],["Side","direction"],["Units","units"],["Price","price"],["Realized P/L","realizedPL"],["Financing","financing"],["Commission","commission"],["Account Balance","accountBalance"],["Transaction ID","transaction"],["Client Order ID","clientOrderId"],["Event ID","event"],["Decision Mode","decisionMode"],["Timeframe","timeframe"],["HTL Length","htlLength"],["Filter","filter"],["Configuration Source","configurationSource"],["Reason","reason"],["Message","message"]]`,
`const fields=[["Ledger ID","ledgerId"],["Time","time"],["Type","type"],["OANDA Type","transactionType"],["Pair","pair"],["Strategy","strategy"],["Confirmation Strategy","confirmationStrategy"],["Side","direction"],["Units","units"],["Price","price"],["Realized P/L","realizedPL"],["Financing","financing"],["Commission","commission"],["Account Balance","accountBalance"],["Transaction ID","transaction"],["Client Order ID","clientOrderId"],["Event ID","event"],["Decision Mode","decisionMode"],["Timeframe","timeframe"],["HTL Length","htlLength"],["Filter","filter"],["Configuration Source","configurationSource"],["Optimizer Score","optimizerScore"],["Optimizer Trades","optimizerTrades"],["Optimizer Net","optimizerNet"],["Optimizer Drawdown","optimizerDrawdown"],["Optimizer Win Rate","optimizerWinRate"],["Confirmation HTL Length","confirmationHtlLength"],["Confirmation Filter","confirmationFilter"],["Reason","reason"],["Message","message"]]`,
"ledger forensic CSV fields");

await writeFile("public/index.html",html);

let pkg=JSON.parse(await readFile("package.json","utf8"));
pkg.scripts.check="node --check src/worker.js && node --check src/engine.js && node scripts/check-worker.mjs && node scripts/check-html.mjs && node scripts/test-runtime.mjs";
await writeFile("package.json",JSON.stringify(pkg,null,2)+"\n");

let checkHtml=await readFile("scripts/check-html.mjs","utf8");
checkHtml=replaceOnce(checkHtml,
`for(const required of ["Timeframe Signal Schedule","Interactive Analytical Chart","HTL Event Forecast","Trading Ledger","htlCausal(data,length)","resolvedConfiguration("]){`,
`for(const required of ["Timeframe Signal Schedule","Interactive Analytical Chart","HTL Event Forecast","Trading Ledger","htlCausal(data,length)","resolvedConfiguration(","refreshCausalChartAnalysis(","/api/oanda/order",">TEST</button>"]){`,
"HTML check coverage");
checkHtml=replaceOnce(checkHtml,
`console.log("HTML structure, causal forecast path, resolved configuration, and syntax verified.");`,
`if(/\\/api\\/engine\\/optimizer[^\\n]+method:"PUT"/.test(html))throw new Error("Browser optimizer writes remain enabled.");\nconsole.log("HTML structure, causal chart path, immediate chart loading, TEST connection, and syntax verified.");`,
"HTML behavioral contracts");
await writeFile("scripts/check-html.mjs",checkHtml);

let checkWorker=await readFile("scripts/check-worker.mjs","utf8");
checkWorker=replaceOnce(checkWorker,
`  [/oandaWaiters/,"upstream request limiter"]`,
`  [/oandaWaiters/,"upstream request limiter"],\n  [/handleManualOrder/,"strict manual order route"],\n  [/Optimizer records are server-managed/,"server-authoritative optimizer boundary"]`,
"worker check additions");
checkWorker=replaceOnce(checkWorker,
`  [/result\\.choices\\?\\.\\[0\\]/,"Workers AI response compatibility"]`,
`  [/result\\.choices\\?\\.\\[0\\]/,"Workers AI response compatibility"],\n  [/configurationSource:"OPTIMIZED"/,"optimized runtime default"],\n  [/await this\\.reconcile\\(requirements/,"full-position reconciliation"],\n  [/optimizerScore/,"effective optimizer ledger attribution"]`,
"engine check additions");
await writeFile("scripts/check-worker.mjs",checkWorker);

const runtimeTest=`import assert from "node:assert/strict";
import worker from "../src/worker.js";
import {HtlEngine} from "../src/engine.js";
import {readFile} from "node:fs/promises";

const accountId="001-001-1234567-001",token="x".repeat(32),origin="https://cte.example";
const browser=(path,init={})=>new Request(origin+path,{...init,headers:{Origin:origin,"Sec-Fetch-Site":"same-origin",...(init.headers||{})}});
let capturedOrder=null,closed=[];
const originalFetch=globalThis.fetch;
globalThis.fetch=async(url,init={})=>{
  const value=String(url);
  if(value.endsWith("/v3/accounts"))return new Response(JSON.stringify({accounts:[{id:accountId,tags:[]}]}),{status:200});
  if(value.endsWith(`/v3/accounts/${accountId}/summary`))return new Response(JSON.stringify({account:{id:accountId,balance:"1000",NAV:"1000",marginAvailable:"900"},lastTransactionID:"1"}),{status:200});
  if(value.endsWith(`/v3/accounts/${accountId}/orders`)&&init.method==="POST"){capturedOrder=JSON.parse(init.body);return new Response(JSON.stringify({orderFillTransaction:{id:"2",price:"1.1",units:capturedOrder.order.units},lastTransactionID:"2"}),{status:200});}
  if(value.includes("/candles?"))return new Response(JSON.stringify({candles:[{time:"2026-08-04T00:00:00Z",complete:true,mid:{o:"1",h:"1.2",l:".9",c:"1.1"},volume:10}]}),{status:200});
  if(value.endsWith(`/v3/accounts/${accountId}/positions`))return new Response(JSON.stringify({positions:[{instrument:"EUR_USD",long:{units:"10"},short:{units:"0"}}]}),{status:200});
  if(value.endsWith(`/v3/accounts/${accountId}/positions/EUR_USD/close`)){closed.push(JSON.parse(init.body));return new Response(JSON.stringify({longOrderFillTransaction:{id:"3",units:"-10",price:"1.09",pl:"1"}}),{status:200});}
  throw new Error(`Unexpected fetch: ${value}`);
};
const env={OANDA_API_KEY:token,OANDA_ACCOUNT_ID:accountId};
let response=await worker.fetch(browser("/api/oanda/order",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({order:{instrument:"EUR_USD",units:"25",type:"MARKET",timeInForce:"FOK",positionFill:"DEFAULT",unsafe:"removed"}})}),env);
assert.equal(response.status,200);assert.deepEqual(capturedOrder,{order:{instrument:"EUR_USD",units:"25",type:"MARKET",timeInForce:"FOK",positionFill:"DEFAULT"}});
response=await worker.fetch(browser("/api/oanda/order",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({order:{instrument:"BAD",units:"1",type:"MARKET",timeInForce:"FOK",positionFill:"DEFAULT"}})}),env);assert.equal(response.status,400);
response=await worker.fetch(browser("/api/oanda/proxy?path=x",{method:"POST"}),env);assert.equal(response.status,405);
response=await worker.fetch(browser("/api/engine/optimizer",{method:"PUT"}),env);assert.equal(response.status,405);
response=await worker.fetch(browser("/api/oanda/candles?instrument=EUR_USD&granularity=M15&count=60"),env);const candlePayload=await response.json();assert.equal(candlePayload.candles[0].mid.c,"1.1");assert.equal(candlePayload.candles[0].close,1.1);

class Storage{constructor(){this.map=new Map();}async get(key){if(Array.isArray(key))return new Map(key.map(item=>[item,this.map.get(item)]));return this.map.get(key);}async put(key,value){this.map.set(key,value);}async delete(key){if(Array.isArray(key))for(const item of key)this.map.delete(item);else this.map.delete(key);}async getAlarm(){return null;}async deleteAlarm(){}}
const ctx={storage:new Storage()},engine=new HtlEngine(ctx,env),config=await engine.config();
assert.equal(config.strategy,"ASSET");assert.equal(config.configurationSource,"OPTIMIZED");
engine.write=async entry=>{engine.lastWrite=entry;};
await engine.reconcile({EUR_USD:{pair:"EUR_USD",event:{direction:-1,id:"-1:t"},configuration:{primary:{length:20,filter:1,score:3,trades:8,net:12,maxDrawdown:2,winRate:.625},confirmation:null}}},token,accountId,{events:{}},config);
assert.equal(closed.length,1);assert.equal(engine.lastWrite.type,"POSITION_CLOSED");assert.equal(engine.lastWrite.htlLength,20);assert.equal(engine.lastWrite.optimizerScore,3);
response=await engine.fetch(new Request("https://engine/optimizer",{method:"PUT",headers:{"Content-Type":"application/json"},body:"{}"}));assert.equal(response.status,405);

const html=await readFile(new URL("../public/index.html",import.meta.url),"utf8");
assert.match(html,/id="connectButton"[^>]*>TEST<\\/button>/);assert.match(html,/selectedStrategy:"ASSET"/);assert.match(html,/configurationSource:"OPTIMIZED"/);assert.match(html,/selectChart\\(event\\.target\\.value,state\\.selectedTimeframe\\)/);assert.doesNotMatch(html,/\\/api\\/engine\\/optimizer[^\\n]+method:"PUT"/);
globalThis.fetch=originalFetch;
console.log("Runtime route, reconciliation, optimizer, forensic context, chart, and connection contracts verified.");
`;
await writeFile("scripts/test-runtime.mjs",runtimeTest);

await unlink("scripts/apply-intent-repairs.mjs").catch(()=>{});
await unlink(".github/workflows/apply-intent-repairs.yml").catch(()=>{});
