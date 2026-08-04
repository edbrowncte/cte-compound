import { readFile, writeFile } from 'node:fs/promises';

function replaceOne(source, pattern, replacement, label) {
  const matches = source.match(pattern);
  if (!matches) throw new Error(`Missing transformation boundary: ${label}`);
  return source.replace(pattern, replacement);
}

function insertOnce(source, marker, addition, label) {
  if (source.includes(addition.trim())) return source;
  const index = source.indexOf(marker);
  if (index < 0) throw new Error(`Missing insertion boundary: ${label}`);
  return source.slice(0, index) + addition + source.slice(index);
}

let html = await readFile('public/index.html', 'utf8');
let engine = await readFile('src/engine.js', 'utf8');
let worker = await readFile('src/worker.js', 'utf8');
let packageJson = JSON.parse(await readFile('package.json', 'utf8'));

// Shared browser contract is loaded before the existing inline application.
html = replaceOne(
  html,
  /\n  <script>\n  "use strict";/,
  '\n  <script src="/htl-horizon-contract.js"></script>\n  <script>\n  "use strict";\n  const HORIZON_HTL=globalThis.CTE_HORIZON_HTL;\n  if(!HORIZON_HTL)throw new Error("CTE Horizon HTL contract failed to load.");',
  'browser shared contract loader',
);

// Horizon visual tokens and new configuration/trade-management surfaces.
html = replaceOne(
  html,
  /:root \{\s*--bg:#080b10; --panel:#10151d; --panel2:#151c26; --line:#2b3543; --line2:#3a4657;\s*--text:#e8edf4; --muted:#8e9aab; --accent:#d7a85c; --accent2:#7dc4ff;\s*--buy:#48c78e; --sell:#ef6b73; --hold:#778294; --warn:#f1c66f;/,
  ':root {\n      --bg:#0c111b; --panel:#131a27; --panel2:#0f1622; --line:#26324a; --line2:#34415b;\n      --text:#edf2ff; --muted:#9aa8bf; --accent:#66d7ff; --accent2:#fff7c7;\n      --buy:#52df8b; --sell:#ff6b72; --hold:#9aa8bf; --warn:#ffbd59;',
  'Horizon root palette',
);

html = insertOnce(
  html,
  '  </style>',
  `
    .configuration-identity{display:grid;grid-template-columns:repeat(5,minmax(110px,1fr));gap:7px;margin:8px 0;padding:8px;border:1px solid var(--line);background:var(--panel2);border-radius:7px}
    .configuration-identity .identity-field{min-width:0;padding:7px 8px;border:1px solid rgba(102,215,255,.14);background:rgba(12,17,27,.72);border-radius:6px}
    .configuration-identity span{display:block;color:var(--muted);font-size:9px;text-transform:uppercase;letter-spacing:.09em}
    .configuration-identity strong{display:block;margin-top:3px;color:var(--text);font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .trade-management{display:grid;grid-template-columns:minmax(190px,1.4fr) repeat(2,minmax(120px,.7fr)) auto auto;gap:8px;align-items:end;padding:10px;border:1px solid var(--line);background:var(--panel2);border-radius:8px;margin-top:8px}
    .trade-management-status{grid-column:1/-1;min-height:18px;color:var(--muted);font-size:12px}
    .trade-management .close-trade{border-color:rgba(255,107,114,.55);color:var(--sell)}
    .trade-management .modify-trade{border-color:rgba(102,215,255,.5);color:var(--accent)}
    @media(max-width:920px){.configuration-identity{grid-template-columns:repeat(2,minmax(110px,1fr))}.trade-management{grid-template-columns:1fr 1fr}.trade-management-status{grid-column:1/-1}}
`,
  'identity and trade management CSS',
);

html = replaceOne(
  html,
  /(<div class="automation-controls">[\s\S]*?<\/div>\s*)(<div class="decision-strip" id="decisionCandidateStrip")/,
  `$1<div class="trade-management" aria-label="Open trade modification and closure controls">
          <label class="field"><span>Open OANDA trade</span><select id="managedTrade"></select></label>
          <label class="field"><span>Stop loss</span><input id="managedStopLoss" type="number" step="0.00001" inputmode="decimal" placeholder="Leave blank to retain"></label>
          <label class="field"><span>Take profit</span><input id="managedTakeProfit" type="number" step="0.00001" inputmode="decimal" placeholder="Leave blank to retain"></label>
          <button class="modify-trade" id="modifyOpenTrade" type="button" disabled>Modify trade</button>
          <button class="close-trade" id="closeOpenTrade" type="button" disabled>Close trade</button>
          <div class="trade-management-status" id="tradeManagementStatus" role="status" aria-live="polite"></div>
        </div>
        $2`,
  'automated trade management controls',
);

html = replaceOne(
  html,
  /(<div class="chart-summary">[\s\S]*?<\/div>\s*)(<div class="indicator-legend" id="indicatorLegend")/,
  `$1<div class="configuration-identity" id="chartConfigurationIdentity" aria-label="Analytical chart configuration identity"></div>
        $2`,
  'main chart identity strip',
);

html = replaceOne(
  html,
  /(<div class="chart-toolbar event-chart-toolbar">[\s\S]*?<\/div>\s*)(<div class="indicator-legend" id="eventIndicatorLegend")/,
  `$1<div class="configuration-identity" id="eventConfigurationIdentity" aria-label="Event chart configuration identity"></div>
        $2`,
  'event chart identity strip',
);

// One formula implementation for browser chart, schedule, forecast and Compute Configuration.
html = replaceOne(
  html,
  /  function htlBuild\(data,length\)\{[\s\S]*?\n  function causalIndicatorSetFast/,
  `  function htlBuild(data,length){return HORIZON_HTL.build(data,length);}
  function htlCausal(data,length){return HORIZON_HTL.build(data,length);}
  function causalIndicatorSetFast`,
  'browser HTL builders',
);

html = html.replace(
  'if(strategy==="ASSET")return relation(indicators.asset,indicators.inverse);',
  'if(strategy==="ASSET")return relation(indicators.asset,indicators.inverse,0);',
);
html = html.replace(
  'Authoritative Compute Configuration result · rolling-origin causal validation · next-open entries · opposite-signal exits',
  'Authoritative Compute Configuration result · platform-wide CTE Horizon retrospective parity · next-open entries · opposite-signal exits',
);
html = html.replace(
  '// Build every historical point only from candles that existed at that point.',
  '// Build the platform-wide retrospective CTE Horizon Asset and recovered inverse.',
);

// Configuration identity uses the exact pair/timeframe optimizer record where available.
html = insertOnce(
  html,
  '  function renderStrategyConfiguration()',
  `  function resolvedIdentityConfiguration(pair,timeframe,strategyId){
    const automatic=state.autoConfigurations.get(scheduleKey(pair,timeframe));
    const configured=automatic?.config?.[strategyId]||STRATEGY_CONFIG[strategyId]||{length:10,filter:0};
    return{length:Number(configured.length)||10,filter:Number(configured.filter)||0,source:automatic?.source||"ACTIVE"};
  }
  function identityMarkup(pair,timeframe,strategyId,length,filter){
    const label=STRATEGIES.find(item=>item.id===strategyId)?.label||strategyId;
    return[["Currency pair",formatPair(pair)],["Timeframe",timeframe],["Strategy",label],["Length",String(length)],["Filter",String(filter)]].map(([key,value])=>`<div class="identity-field"><span>${key}</span><strong>${value}</strong></div>`).join("");
  }
  function renderChartConfigurationIdentity(){
    const config=resolvedIdentityConfiguration(state.selectedInstrument,state.selectedTimeframe,state.selectedStrategy);
    const target=el("chartConfigurationIdentity");if(target)target.innerHTML=identityMarkup(state.selectedInstrument,state.selectedTimeframe,state.selectedStrategy,config.length,config.filter);
  }
  function renderEventConfigurationIdentity(pair=el("eventPair")?.value||state.selectedInstrument,timeframe=el("eventTimeframe")?.value||state.selectedTimeframe,length=Number(el("eventLength")?.value)||10){
    const strategy=el("eventStrategy")?.value||"ASSET",config=resolvedIdentityConfiguration(pair,timeframe,strategy),target=el("eventConfigurationIdentity");
    if(target)target.innerHTML=identityMarkup(pair,timeframe,strategy,length||config.length,config.filter);
  }

`,
  'chart identity functions',
);

html = html.replace(
  '  function drawChart() {',
  '  function drawChart() {\n    renderChartConfigurationIdentity();',
);
html = html.replace(
  '  function eventDraw(data,htl,events){',
  '  function eventDraw(data,htl,events){\n    renderEventConfigurationIdentity();',
);
html = html.replace(
  '  function renderStrategyConfiguration(){',
  '  function renderStrategyConfiguration(){renderChartConfigurationIdentity();renderEventConfigurationIdentity();',
);
html = html.replace(
  'Completed midpoint candles · ${formatPair(row.pair)} · ${el("eventTimeframe").value} · HTL length ${row.length}',
  'Completed midpoint candles · ${formatPair(row.pair)} · ${el("eventTimeframe").value} · HTL length ${row.length} · ${HORIZON_HTL.VERSION}',
);

// Horizon chart colors.
for (const [from, to] of [
  ['#080c12','#0c111b'],['#1c2632','#26324a'],['#263242','#34415b'],['#8b98aa','#9aa8bf'],
  ['#48c78e','#52df8b'],['#ef6b73','#ff6b72'],['#d7a85c','#fff7c7'],['#8d72d8','#ef2fd0'],
]) html = html.split(from).join(to);

// Browser trade state and controls.
html = html.replace(
  '    openPositions:[],',
  '    openPositions:[],\n    openTrades:[],\n    tradeManagementBusy:false,',
);

html = insertOnce(
  html,
  '  async function refreshOpenPositions(){',
  `  function selectedManagedTrade(){return state.openTrades.find(trade=>String(trade.id)===String(el("managedTrade")?.value||""))||null;}
  function renderManagedTrades(){
    const select=el("managedTrade"),modify=el("modifyOpenTrade"),close=el("closeOpenTrade");if(!select)return;
    const prior=select.value;select.innerHTML=state.openTrades.map(trade=>`<option value="${trade.id}">${formatPair(trade.instrument)} · ${Number(trade.currentUnits)>0?"BUY":"SELL"} · ${Math.abs(Number(trade.currentUnits)).toLocaleString()} · trade ${trade.id}</option>`).join("")||'<option value="">No open trades</option>';
    if(state.openTrades.some(trade=>String(trade.id)===prior))select.value=prior;
    const trade=selectedManagedTrade(),disabled=!trade||state.tradeManagementBusy;modify.disabled=disabled;close.disabled=disabled;
    if(trade){el("managedStopLoss").value=trade.stopLossOrder?.price||"";el("managedTakeProfit").value=trade.takeProfitOrder?.price||"";}
    else{el("managedStopLoss").value="";el("managedTakeProfit").value="";}
  }
  async function manageOpenTrade(action){
    const trade=selectedManagedTrade();if(!state.connected||state.tradeManagementBusy||!trade)return;
    state.tradeManagementBusy=true;renderManagedTrades();el("tradeManagementStatus").textContent=`${action==="CLOSE"?"Closing":"Revalidating and modifying"} ${formatPair(trade.instrument)} trade ${trade.id}…`;
    try{
      const stopLoss=el("managedStopLoss").value.trim(),takeProfit=el("managedTakeProfit").value.trim(),body={action,tradeId:String(trade.id),instrument:trade.instrument};
      if(action==="MODIFY"){if(stopLoss)body.stopLoss=stopLoss;if(takeProfit)body.takeProfit=takeProfit;if(!body.stopLoss&&!body.takeProfit)throw new Error("Enter a stop-loss or take-profit price.");}
      const response=await fetch("/api/oanda/trade",{method:"PUT",headers:{Accept:"application/json","Content-Type":"application/json"},credentials:"same-origin",cache:"no-store",body:JSON.stringify(body)}),payload=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(payload.error||`HTTP ${response.status}`);
      el("tradeManagementStatus").textContent=`${action==="CLOSE"?"Closed":"Modified"} ${formatPair(trade.instrument)} trade ${trade.id} · transaction ${payload.transactionId||payload.lastTransactionID||"—"}`;
      await refreshOpenPositions();await loadTradingLedger();
    }catch(error){el("tradeManagementStatus").textContent=error.message||"Trade management failed.";}
    finally{state.tradeManagementBusy=false;renderManagedTrades();}
  }

`,
  'browser open trade management functions',
);

html = replaceOne(
  html,
  /  async function refreshOpenPositions\(\)\{[\s\S]*?\n  \}\n\n  function startPositionMonitor/,
  `  async function refreshOpenPositions(){
    if(!state.connected||state.positionsBusy)return;state.positionsBusy=true;
    try{
      const accountId=el("oandaAccountId").value.trim(),[positionsPayload,summaryPayload,tradesPayload]=await Promise.all([oanda(\`/v3/accounts/\${encodeURIComponent(accountId)}/positions\`),oanda(\`/v3/accounts/\${encodeURIComponent(accountId)}/summary\`),fetch("/api/oanda/open-trades",{headers:{Accept:"application/json"},credentials:"same-origin",cache:"no-store"}).then(async response=>{const payload=await response.json().catch(()=>({}));if(!response.ok)throw new Error(payload.error||\`HTTP \${response.status}\`);return payload;})]),positions=(positionsPayload.positions||[]).filter(position=>Number(position.long?.units||0)!==0||Number(position.short?.units||0)!==0),instruments=positions.map(position=>position.instrument);
      state.openPositions=positions;state.openTrades=Array.isArray(tradesPayload.trades)?tradesPayload.trades:[];applyAccountFacts(summaryPayload.account||{},accountId);
      if(instruments.length){const pricing=await oanda(\`/v3/accounts/\${encodeURIComponent(accountId)}/pricing?instruments=\${encodeURIComponent(instruments.join(","))}\`);for(const price of pricing.prices||[])setPositionPrice(price);}
      renderOpenPositions();renderManagedTrades();updateDecisionDisplays();void startPositionStream(instruments);
    }catch(error){el("positionsStreamStatus").textContent=error.message||"Position refresh failed";el("positionsStreamStatus").classList.remove("live");}
    finally{state.positionsBusy=false;}
  }

  function startPositionMonitor`,
  'refresh positions with live trades',
);

html = html.replace(
  'state.openPositions=[];state.positionPrices.clear();renderOpenPositions();',
  'state.openPositions=[];state.openTrades=[];state.positionPrices.clear();renderOpenPositions();renderManagedTrades();',
);

html = insertOnce(
  html,
  '    el("decisionCandidateStrip").addEventListener',
  `    el("managedTrade").addEventListener("change",renderManagedTrades);
    el("modifyOpenTrade").addEventListener("click",()=>manageOpenTrade("MODIFY"));
    el("closeOpenTrade").addEventListener("click",()=>manageOpenTrade("CLOSE"));
`,
  'trade management event bindings',
);

// Engine imports and consumes the identical browser asset contract.
engine = 'import "../public/htl-horizon-contract.js";\nconst HORIZON_HTL=globalThis.CTE_HORIZON_HTL;\nif(!HORIZON_HTL)throw new Error("CTE Horizon HTL contract failed to load.");\n' + engine;
engine = engine.replace('OPTIMIZER_VERSION=4','OPTIMIZER_VERSION=5');
engine = replaceOne(
  engine,
  /function htlBuild\(data,length\)\{[\s\S]*?\n\}\n\nfunction relationEvents/,
  `function htlBuild(data,length){
  const htl=HORIZON_HTL.build(data,length),meanAsset=pairAverage(htl.asset,htl.inverse),meanCenter=seriesWma(meanAsset,length),meanInverse=meanAsset.map((value,index)=>Number.isFinite(value)&&Number.isFinite(meanCenter[index])?(2*meanCenter[index])-value:null),assetCenter=seriesWma(htl.asset,length),inverseCenter=seriesWma(htl.inverse,length),naiAsset=norm(htl.asset,assetCenter,seriesStdev(htl.asset,length)),naiInverse=norm(htl.inverse,inverseCenter,seriesStdev(htl.inverse,length)),dareNAsset=norm(meanAsset,seriesWma(meanAsset,length),seriesStdev(meanAsset,length)),dareNInverse=norm(meanInverse,seriesWma(meanInverse,length),seriesStdev(meanInverse,length));
  return{...htl,meanAsset,meanInverse,naiAsset,naiInverse,dareNAsset,dareNInverse,zup:htl.series.zup,puz:htl.series.puz};
}

function relationEvents`,
  'engine HTL build',
);
engine = replaceOne(
  engine,
  /function htlCausal\(data,length\)\{[\s\S]*?\nfunction causalIndicatorSet/,
  `function htlCausal(data,length){return htlBuild(data,length);}
function causalIndicatorSet`,
  'engine HTL causal alias',
);
engine = engine.replaceAll('ROLLING_ORIGIN_CAUSAL','HORIZON_RETROSPECTIVE_PLATFORM_PARITY');
engine = engine.replaceAll('one causal optimization','one Horizon parity optimization');
engine = engine.replaceAll('causal optimizer evidence','platform-wide Horizon crossing evidence');

engine = replaceOne(
  engine,
  /function currentEvent\(data,length,strategy="ASSET",filter=0\)\{[\s\S]*?\n\}/,
  `function currentEvent(data,length,strategy="ASSET",filter=0){
  const htl=htlBuild(data,length),crosses=strategyEvents(data,length,strategy,filter);
  if(!crosses.length)return null;const current=crosses.at(-1),start=data[current.index],assetCross=strategy==="ASSET"?htl.crossings.find(event=>event.index===current.index&&event.direction===current.direction):null;
  return{direction:current.direction,startTime:start.time,openPrice:start.close,bars:data.length-current.index,id:[HORIZON_HTL.VERSION,strategy,length,filter,current.direction,start.time].join(":"),calculationVersion:HORIZON_HTL.VERSION,crossing:assetCross?{priorAsset:assetCross.priorAsset,priorInverse:assetCross.priorInverse,asset:assetCross.asset,inverse:assetCross.inverse,time:assetCross.time,direction:assetCross.direction}:null};
}`,
  'versioned current event',
);
engine = engine.replace(
  'configuration:row.configuration||null})),fallback=candidates[0],started=Date.now();',
  'configuration:row.configuration||null,calculationVersion:row.event.calculationVersion||HORIZON_HTL.VERSION,crossing:row.event.crossing||null})),fallback=candidates[0],started=Date.now();',
);

// Worker live trade revalidation and trade management.
worker = insertOnce(
  worker,
  'async function handleCandles',
  `async function handleOpenTrades(env){
  const {token,accountId:configuredAccountId}=credentials(env),accountId=await resolveAccount(token,configuredAccountId),payload=await oandaRequest(\`/v3/accounts/\${encodeURIComponent(accountId)}/openTrades\`,token);
  return json({trades:Array.isArray(payload.trades)?payload.trades:[],lastTransactionID:payload.lastTransactionID||null});
}

function normalizeTradeAction(value){
  const action=String(value?.action||"").toUpperCase(),tradeId=String(value?.tradeId||"").trim(),instrument=String(value?.instrument||"").toUpperCase();
  if(!["MODIFY","CLOSE"].includes(action))throw Object.assign(new Error("Invalid trade action."),{status:400});
  if(!/^[A-Za-z0-9@._-]{1,80}$/.test(tradeId))throw Object.assign(new Error("Invalid trade identifier."),{status:400});
  if(!INSTRUMENTS.has(instrument))throw Object.assign(new Error("Invalid trade instrument."),{status:400});
  const stopLoss=value?.stopLoss===undefined||value?.stopLoss===""?null:Number(value.stopLoss),takeProfit=value?.takeProfit===undefined||value?.takeProfit===""?null:Number(value.takeProfit);
  if(action==="MODIFY"&&!Number.isFinite(stopLoss)&&!Number.isFinite(takeProfit))throw Object.assign(new Error("A stop-loss or take-profit price is required."),{status:400});
  if((stopLoss!==null&&!Number.isFinite(stopLoss))||(takeProfit!==null&&!Number.isFinite(takeProfit)))throw Object.assign(new Error("Trade prices must be finite numbers."),{status:400});
  return{action,tradeId,instrument,stopLoss,takeProfit};
}

async function handleTradeAction(request,env){
  const {token,accountId:configuredAccountId}=credentials(env),accountId=await resolveAccount(token,configuredAccountId),action=normalizeTradeAction(await request.json().catch(()=>null)),specifier=encodeURIComponent(action.tradeId),live=await oandaRequest(\`/v3/accounts/\${encodeURIComponent(accountId)}/trades/\${specifier}\`,token),trade=live.trade;
  if(!trade||trade.state!=="OPEN")throw Object.assign(new Error("The selected OANDA trade is no longer open."),{status:409});
  if(trade.instrument!==action.instrument)throw Object.assign(new Error("The selected trade no longer matches the requested instrument."),{status:409});
  let result;
  if(action.action==="CLOSE")result=await oandaRequest(\`/v3/accounts/\${encodeURIComponent(accountId)}/trades/\${specifier}/close\`,token,{method:"PUT",body:JSON.stringify({units:"ALL"})});
  else{
    const body={};if(Number.isFinite(action.stopLoss))body.stopLoss={timeInForce:"GTC",price:String(action.stopLoss)};if(Number.isFinite(action.takeProfit))body.takeProfit={timeInForce:"GTC",price:String(action.takeProfit)};
    result=await oandaRequest(\`/v3/accounts/\${encodeURIComponent(accountId)}/trades/\${specifier}/orders\`,token,{method:"PUT",body:JSON.stringify(body)});
  }
  const transactionId=result.orderFillTransaction?.id||result.stopLossOrderTransaction?.id||result.takeProfitOrderTransaction?.id||result.lastTransactionID||null;
  try{await env.HTL_ENGINE.getByName("live").fetch(new Request("https://engine/manual-trade-action",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({type:action.action==="CLOSE"?"MANUAL_TRADE_CLOSE":"MANUAL_TRADE_MODIFY",pair:trade.instrument,direction:Number(trade.currentUnits)>0?"BUY":"SELL",units:Math.abs(Number(trade.currentUnits)||0),tradeId:String(trade.id),transaction:transactionId,message:action.action==="CLOSE"?"Open trade fully closed from automated control panel":"Open trade dependent orders modified from automated control panel",stopLoss:action.stopLoss,takeProfit:action.takeProfit})}));}catch{}
  return json({action:action.action,tradeId:String(trade.id),instrument:trade.instrument,transactionId,lastTransactionID:result.lastTransactionID||null,result});
}

`,
  'Worker open trade handlers',
);
worker = insertOnce(
  worker,
  '        if(url.pathname==="/api/oanda/order"&&request.method==="POST")',
  `        if(url.pathname==="/api/oanda/open-trades"&&request.method==="GET") return await handleOpenTrades(env);
        if(url.pathname==="/api/oanda/trade"&&request.method==="PUT") return await handleTradeAction(request,env);
`,
  'Worker trade routes',
);

// Durable ledger accepts sanitized manual trade-management results.
engine = insertOnce(
  engine,
  '      if(url.pathname==="/tick"',
  `      if(url.pathname==="/manual-trade-action"&&request.method==="POST"){const entry=await request.json().catch(()=>null);if(!entry||!["MANUAL_TRADE_CLOSE","MANUAL_TRADE_MODIFY"].includes(entry.type))return response({error:"Invalid manual trade action."},400);await this.write(entry);return response({ok:true});}
`,
  'engine manual trade action route',
);

// Tests and check contract.
packageJson.scripts.check = packageJson.scripts.check.includes('test-horizon-contract')
  ? packageJson.scripts.check
  : `${packageJson.scripts.check} && node scripts/test-horizon-contract.mjs`;

const horizonTest = `import '../public/htl-horizon-contract.js';
import assert from 'node:assert/strict';

const htl=globalThis.CTE_HORIZON_HTL;
assert.equal(htl.VERSION,'CTE_HORIZON_HTL_ASSET_CROSSING@1.0.0');
const candles=Array.from({length:180},(_,index)=>{
  const wave=Math.sin(index/8)*0.003+Math.sin(index/21)*0.0015,close=1.1+wave+(index*0.00001),open=close-Math.sin(index/3)*0.0002;
  return{time:new Date(Date.UTC(2026,0,1,0,index)).toISOString(),open,high:Math.max(open,close)+0.00035,low:Math.min(open,close)-0.00035,close,complete:true};
});
const first=htl.build(candles,10),second=htl.build(candles,10);
assert.deepEqual(first.asset,second.asset);
assert.deepEqual(first.inverse,second.inverse);
assert.deepEqual(first.crossings,second.crossings);
assert.ok(first.crossings.length>0,'fixture must produce Asset/Inverse crossings');
for(const event of first.crossings){
  const i=event.index;
  if(event.direction>0){assert.ok(first.asset[i]>first.inverse[i]);assert.ok(first.asset[i-1]<=first.inverse[i-1]);}
  else{assert.ok(first.asset[i]<first.inverse[i]);assert.ok(first.asset[i-1]>=first.inverse[i-1]);}
  assert.equal(event.time,candles[i].time);
}
const latest=first.crossings.at(-1),identity=htl.crossingIdentity({pair:'EUR_USD',timeframe:'M15',strategy:'ASSET',length:10,filter:0,crossing:latest});
assert.match(identity,/^CTE_HORIZON_HTL_ASSET_CROSSING@1\.0\.0:[0-9a-f]{8}$/);
console.log('Horizon contract parity verified:',first.crossings.length,'crossings');
`;
await writeFile('scripts/test-horizon-contract.mjs', horizonTest, 'utf8');

await writeFile('public/index.html', html, 'utf8');
await writeFile('src/engine.js', engine, 'utf8');
await writeFile('src/worker.js', worker, 'utf8');
await writeFile('package.json', `${JSON.stringify(packageJson,null,2)}\n`, 'utf8');
