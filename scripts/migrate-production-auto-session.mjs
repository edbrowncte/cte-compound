import fs from "node:fs";

const workerPath="src/worker-base.js",htmlPath="public/index.html",browserPath="scripts/test-browser.mjs",runtimePath="scripts/test-runtime-base.mjs",forensicPath="scripts/test-forensic-connect-recovery.mjs",checkHtmlPath="scripts/check-html.mjs";
let worker=fs.readFileSync(workerPath,"utf8"),html=fs.readFileSync(htmlPath,"utf8"),browser=fs.readFileSync(browserPath,"utf8"),runtime=fs.readFileSync(runtimePath,"utf8"),forensic=fs.readFileSync(forensicPath,"utf8"),checkHtml=fs.readFileSync(checkHtmlPath,"utf8"),changes=0;
const replace=(name,source,from,to)=>{if(!source.includes(from))throw new Error(`Missing ${name} anchor: ${from.slice(0,100)}`);changes++;return source.replace(from,to);};
const replaceRe=(name,source,pattern,to)=>{if(!pattern.test(source))throw new Error(`Missing ${name} regex: ${pattern}`);changes++;return source.replace(pattern,to);};

// OANDA production account resolution: one token, ignore/block MT4 -002, use the unique non-MT4 -001 returned by OANDA.
worker=replace("worker",worker,
`  return {token,accountId};
}


function assertSameOrigin(request) {`,
`  return {token,accountId};
}

function isBlockedMt4Account(account){const id=String(account?.id||"");return id.endsWith("-002")||Boolean(account?.tags?.includes?.("MT4"));}
function selectLiveAccount(accounts,configuredAccountId){
  const eligible=(Array.isArray(accounts)?accounts:[]).filter(account=>{const id=String(account?.id||"");return id.endsWith("-001")&&!isBlockedMt4Account(account);});
  const exact=eligible.find(account=>account.id===configuredAccountId);
  if(exact)return exact;
  if(eligible.length===1)return eligible[0];
  if(!eligible.length)throw decorateError(new Error("No authorized non-MT4 OANDA live account ending -001 was found."),{status:401,code:"OANDA_LIVE_ACCOUNT_NOT_FOUND",stage:"ACCOUNT_SELECT",retryable:false});
  throw decorateError(new Error("More than one authorized non-MT4 OANDA live account ending -001 was found."),{status:409,code:"OANDA_LIVE_ACCOUNT_AMBIGUOUS",stage:"ACCOUNT_SELECT",retryable:false});
}
let accountCache=null;
async function resolveAccount(token,configuredAccountId){
  if(accountCache&&accountCache.expires>Date.now())return accountCache.id;
  const payload=await oandaRequest("/v3/accounts",token,{stage:"ACCOUNT_LIST"}),selected=selectLiveAccount(payload.accounts,configuredAccountId);
  accountCache={id:selected.id,expires:Date.now()+300000};
  return selected.id;
}

function assertSameOrigin(request) {`);

worker=replace("worker",worker,
`async function handleConnect(env) {
  const {token,accountId}=credentials(env),payload=await oandaRequest(\`/v3/accounts/\${encodeURIComponent(accountId)}/summary\`,token,{stage:"ACCOUNT_SUMMARY"}),account=payload.account||{};
  return json({account:{id:account.id||accountId,alias:account.alias||"",currency:account.currency||"",balance:account.balance||"0",NAV:account.NAV||"0",marginAvailable:account.marginAvailable||"0",marginUsed:account.marginUsed||"0",hedgingEnabled:Boolean(account.hedgingEnabled),openPositionCount:account.openPositionCount||0,lastTransactionID:payload.lastTransactionID||null},live:true,connection:{stage:"CONNECTED",accountSuffix:String(accountId).slice(-3)}});
}`,
`async function handleConnect(env) {
  const {token,accountId:configuredAccountId}=credentials(env),accountId=await resolveAccount(token,configuredAccountId),payload=await oandaRequest(\`/v3/accounts/\${encodeURIComponent(accountId)}/summary\`,token,{stage:"ACCOUNT_SUMMARY"}),account=payload.account||{};
  return json({account:{id:account.id||accountId,alias:account.alias||"",currency:account.currency||"",balance:account.balance||"0",NAV:account.NAV||"0",marginAvailable:account.marginAvailable||"0",marginUsed:account.marginUsed||"0",hedgingEnabled:Boolean(account.hedgingEnabled),openPositionCount:account.openPositionCount||0,lastTransactionID:payload.lastTransactionID||null},live:true,connection:{stage:"CONNECTED",accountSuffix:String(accountId).slice(-3),mt4Blocked:true}});
}`);

worker=replace("worker",worker,
`async function handleAccountDiagnostic(env) {
  const {token,accountId}=credentials(env),payload=await oandaRequest("/v3/accounts",token,{stage:"ACCOUNT_LIST_DIAGNOSTIC",maxAttempts:1}),accounts=Array.isArray(payload.accounts)?payload.accounts:[];
  return json({configuredSuffix:accountId.slice(-3),authorizedAccounts:accounts.map(account=>({suffix:String(account.id||"").slice(-3),selected:account.id===accountId,blocked:String(account.id||"").endsWith("-002"),tags:account.tags||[]})),configuredListed:accounts.some(account=>account.id===accountId),mt4BlockedSuffix:"002"});
}`,
`async function handleAccountDiagnostic(env) {
  const {token,accountId:configuredAccountId}=credentials(env),payload=await oandaRequest("/v3/accounts",token,{stage:"ACCOUNT_LIST_DIAGNOSTIC",maxAttempts:1}),accounts=Array.isArray(payload.accounts)?payload.accounts:[],selected=selectLiveAccount(accounts,configuredAccountId);
  return json({configuredSuffix:configuredAccountId.slice(-3),selectedSuffix:String(selected.id).slice(-3),authorizedAccounts:accounts.map(account=>({suffix:String(account.id||"").slice(-3),selected:account.id===selected.id,blocked:isBlockedMt4Account(account),tags:account.tags||[]})),mt4BlockedSuffix:"002"});
}`);

worker=replace("worker",worker,
`  const {token,accountId}=credentials(env);
  const path=proxyPath(url.searchParams.get("path"),accountId,method);`,
`  const {token,accountId:configuredAccountId}=credentials(env),accountId=await resolveAccount(token,configuredAccountId);
  const path=proxyPath(url.searchParams.get("path"),accountId,method);`);
worker=replace("worker",worker,
`async function handleManualOrder(request,env) {
  const {token,accountId}=credentials(env);
  const body=normalizeManualOrder(await request.json().catch(()=>null));`,
`async function handleManualOrder(request,env) {
  const {token,accountId:configuredAccountId}=credentials(env),accountId=await resolveAccount(token,configuredAccountId);
  const body=normalizeManualOrder(await request.json().catch(()=>null));`);
worker=replace("worker",worker,
`async function handlePricingStream(env,url) {
  const {token,accountId}=credentials(env),instruments=String(url.searchParams.get("instruments")||"").split(",").filter(Boolean);`,
`async function handlePricingStream(env,url) {
  const {token,accountId:configuredAccountId}=credentials(env),accountId=await resolveAccount(token,configuredAccountId),instruments=String(url.searchParams.get("instruments")||"").split(",").filter(Boolean);`);

worker=replace("worker",worker,
`  const accountList=credentialCheck.ok?await diagnosticStep("DIAGNOSTIC_ACCOUNT_LIST",async()=>{const payload=await oandaRequest("/v3/accounts",credentialValue.token,{stage:"DIAGNOSTIC_ACCOUNT_LIST",maxAttempts:1}),accounts=Array.isArray(payload.accounts)?payload.accounts:[];return{authorizedCount:accounts.length,authorizedSuffixes:accounts.map(account=>String(account.id||"").slice(-3)),configuredListed:accounts.some(account=>account.id===credentialValue.accountId),blockedMt4Present:accounts.some(account=>String(account.id||"").endsWith("-002")),mt4BlockedSuffix:"002"};}):skippedDiagnostic("DIAGNOSTIC_ACCOUNT_LIST","Credentials unavailable.");
  const summary=credentialCheck.ok?await diagnosticStep("DIAGNOSTIC_ACCOUNT_SUMMARY",async()=>{const payload=await oandaRequest(\`/v3/accounts/\${encodeURIComponent(credentialValue.accountId)}/summary\`,credentialValue.token,{stage:"DIAGNOSTIC_ACCOUNT_SUMMARY",maxAttempts:1}),account=payload.account||{};return{accountSuffix:String(account.id||credentialValue.accountId).slice(-3),NAV:account.NAV||null,marginAvailable:account.marginAvailable||null,openPositionCount:account.openPositionCount||0};}):skippedDiagnostic("DIAGNOSTIC_ACCOUNT_SUMMARY","Credentials unavailable.");
  const accountVisible=Boolean(summary.ok);`,
`  let resolvedAccountId=null;
  const accountList=credentialCheck.ok?await diagnosticStep("DIAGNOSTIC_ACCOUNT_LIST",async()=>{const payload=await oandaRequest("/v3/accounts",credentialValue.token,{stage:"DIAGNOSTIC_ACCOUNT_LIST",maxAttempts:1}),accounts=Array.isArray(payload.accounts)?payload.accounts:[],selected=selectLiveAccount(accounts,credentialValue.accountId);resolvedAccountId=selected.id;return{authorizedCount:accounts.length,authorizedSuffixes:accounts.map(account=>String(account.id||"").slice(-3)),selectedSuffix:String(selected.id).slice(-3),blockedMt4Present:accounts.some(isBlockedMt4Account),mt4BlockedSuffix:"002"};}):skippedDiagnostic("DIAGNOSTIC_ACCOUNT_LIST","Credentials unavailable.");
  const summary=accountList.ok?await diagnosticStep("DIAGNOSTIC_ACCOUNT_SUMMARY",async()=>{const payload=await oandaRequest(\`/v3/accounts/\${encodeURIComponent(resolvedAccountId)}/summary\`,credentialValue.token,{stage:"DIAGNOSTIC_ACCOUNT_SUMMARY",maxAttempts:1}),account=payload.account||{};return{accountSuffix:String(account.id||resolvedAccountId).slice(-3),NAV:account.NAV||null,marginAvailable:account.marginAvailable||null,openPositionCount:account.openPositionCount||0};}):skippedDiagnostic("DIAGNOSTIC_ACCOUNT_SUMMARY","Live -001 account resolution unavailable.");
  const accountVisible=Boolean(summary.ok);`);
worker=replace("worker",worker,
`  const required=[credentialCheck,summary,candles,engine],observations=[accountList,...required],failures=observations.filter(step=>!step.ok),tradingCritical=[credentialCheck,summary,candles],verdict=tradingCritical.some(step=>!step.ok)?"FAIL":engine.ok?"PASS":"DEGRADED",firstFailure=required.find(step=>!step.ok&&!step.skipped)||failures.find(step=>!step.skipped)||failures[0]||null;`,
`  const required=[credentialCheck,accountList,summary,candles,engine],failures=required.filter(step=>!step.ok),tradingCritical=[credentialCheck,accountList,summary,candles],verdict=tradingCritical.some(step=>!step.ok)?"FAIL":engine.ok?"PASS":"DEGRADED",firstFailure=failures.find(step=>!step.skipped)||failures[0]||null;`);
worker=replace("worker",worker,
`oanda:{accountSuffix:credentialValue?.accountId?.slice(-3)||null,intendedAccountVisible:accountVisible,`,
`oanda:{accountSuffix:resolvedAccountId?.slice(-3)||credentialValue?.accountId?.slice(-3)||null,intendedAccountVisible:accountVisible,`);

// Production UI: no operator TEST/retest/disconnect workflow. Server-managed connection initializes automatically once.
html=replace("html",html,
`.credential-grid { display:grid; grid-template-columns:minmax(160px,.8fr) minmax(220px,1.25fr) auto auto; gap:8px; align-items:end; }`,
`.credential-grid { display:grid; grid-template-columns:minmax(160px,.8fr) minmax(220px,1.25fr); gap:8px; align-items:end; }`);
html=replace("html",html,
`.topbar.collapsed form,.topbar.collapsed .account-facts,.topbar.collapsed .positions-panel,.topbar.collapsed .automation-panel,.topbar.collapsed .subtitle { display:none; }`,
`.topbar.collapsed #connectionRuntime,.topbar.collapsed .account-facts,.topbar.collapsed .positions-panel,.topbar.collapsed .automation-panel,.topbar.collapsed .subtitle { display:none; }`);
html=replace("html",html,
`      <form id="credentialForm" autocomplete="off" novalidate>
        <div class="credential-grid">`,
`      <section id="connectionRuntime" aria-label="Server-managed live OANDA session">
        <div class="credential-grid">`);
html=replace("html",html,
`          <button class="connect" id="connectButton" type="submit">TEST</button>
          <button class="disconnect" id="disconnectButton" type="button" disabled>Disconnect</button>
          <div class="connection-line" role="status" aria-live="polite">
            <span class="status-dot" id="statusDot"></span>
            <span id="connectionStatus">Not connected</span>
          </div>
        </div>
      </form>`,
`          <div class="connection-line" role="status" aria-live="polite">
            <span class="status-dot" id="statusDot"></span>
            <span id="connectionStatus">Initializing server-managed live session…</span>
          </div>
        </div>
      </section>`);
html=replace("html",html,`    connected:false,`,`    connected:false,\n    connectionLoading:false,`);

html=replaceRe("html",html,/  async function connect\(event\) \{[\s\S]*?\n  \}\n\n  function disconnect\(\) \{[\s\S]*?\n  \}\n\n/,`  async function connect() {
    if(state.connected||state.connectionLoading)return;
    state.connectionLoading=true;
    if(!state.preferencesLoaded)await loadPlatformPreferences();
    setConnectionStatus("Initializing server-managed live OANDA session…");
    try {
      const response=await fetch("/api/oanda/connect",{headers:{"Accept":"application/json"},credentials:"same-origin",cache:"no-store"}),{payload,diagnosticId}=await readApiResponse(response);
      if(!response.ok){const failure=new Error(apiFailureMessage(response,payload,diagnosticId));failure.payload=payload;failure.status=response.status;throw failure;}
      const accountId=payload.account?.id||"";
      el("oandaAccountId").value=accountId;applyAccountFacts(payload.account,accountId);
      el("oandaAccountState").textContent=payload.account?.alias||accountId||"Live account";
      el("oandaApiState").textContent="Server managed · active";
      state.connected=true;
      el("refreshSchedule").disabled=false;el("refreshChart").disabled=false;el("refreshEventChart").disabled=false;el("loadEvents").disabled=false;
      el("accountFacts").hidden=false;el("positionsPanel").hidden=false;el("automationPanel").hidden=false;
      setConnectionStatus(\`Live OANDA · •••\${String(accountId).slice(-3)} · completed midpoint candles\`,"connected");
      startPositionMonitor();
      await Promise.all([loadEngineConfig().catch(error=>{el("automationStatus").textContent=error.message||"Configuration unavailable";}),loadOptimizerRecords(),loadControlStatus().catch(()=>{})]);
      void loadTradingLedger();void loadEngineStatus();
      await loadTradeCapacity();await loadChart();void loadSchedule("focused");
    } catch (error) {
      state.connected=false;el("accountFacts").hidden=true;el("positionsPanel").hidden=true;el("automationPanel").hidden=true;stopPositionMonitor();stopAdaptiveMonitor();
      el("oandaAccountState").textContent="Cloudflare secret";el("oandaApiState").textContent="Server managed";
      setConnectionStatus(error.message||"Live OANDA session unavailable.","error");
    } finally {state.connectionLoading=false;}
  }

`);
html=replace("html",html,`    el("credentialForm").addEventListener("submit",connect);\n`,"");
html=replace("html",html,`    el("disconnectButton").addEventListener("click",disconnect);\n`,"");

// Browser regression now certifies automatic production session initialization rather than clicking/retesting TEST.
browser=replace("browser",browser,`  .replace("CANDLE_TIMEOUT_MS=55000","CANDLE_TIMEOUT_MS=40")\n  .replace(/;\\s*void connect\\(\\);\\s*<\\/script>/,";</script>");`,`  .replace("CANDLE_TIMEOUT_MS=55000","CANDLE_TIMEOUT_MS=40");`);
browser=replace("browser",browser,`  document.getElementById("connectButton").click();\n`,"");
browser=replace("browser",browser,`\n  document.getElementById("connectButton").click();await waitFor(()=>document.getElementById("connectButton").textContent==="TEST","connection retest");\n  assert.equal(document.getElementById("accountFacts").hidden,false);assert.equal(document.getElementById("refreshChart").disabled,false);`,`\n  assert.equal(document.getElementById("accountFacts").hidden,false);assert.equal(document.getElementById("refreshChart").disabled,false);assert.equal(document.getElementById("connectButton"),null);`);
browser=replace("browser",browser,`  document.getElementById("disconnectButton")?.click();dom.window.close();`,`  dom.window.close();`);

runtime=replace("runtime",runtime,`assert.match(html,/id="connectButton"[^>]*>TEST<\\/button>/);`,`assert.doesNotMatch(html,/id="connectButton"|>TEST<\\/button>|TESTING…|Testing live OANDA connection/);assert.match(html,/id="connectionRuntime"/);assert.match(html,/Initializing server-managed live OANDA session/);`);

checkHtml=replace("check-html",checkHtml,`"/api/oanda/order",">TEST</button>","MAX_CANDLE_REQUESTS=2"`,`"/api/oanda/order","id=\\"connectionRuntime\\"","MAX_CANDLE_REQUESTS=2"`);
checkHtml=replace("check-html",checkHtml,`console.log("HTML structure, causal running-Asset chart path, independent HTL loading, bounded candle concurrency, TEST connection, and syntax verified.");`,`if(/id="connectButton"|>TEST<\\/button>|TESTING…|Testing live OANDA connection/.test(html))throw new Error("Operator-facing OANDA TEST/retest workflow remains present.");\nconsole.log("HTML structure, automatic server-managed live session, causal running-Asset chart path, independent HTL loading, bounded candle concurrency, and syntax verified.");`);

// Forensic account test now reproduces the proven historical path: token inventory -> exclude -002/MT4 -> unique -001 -> summary.
forensic=replaceRe("forensic",forensic,/try\{[\s\S]*?\n\}finally\{globalThis\.fetch=originalFetch;\}/,`try{
  // One OANDA REST token can expose both accounts. Production resolves the unique non-MT4 -001 returned by OANDA and blocks -002.
  mode="success";calls=[];
  const configuredAlias="001-001-9999999-001";
  let response=await worker.fetch(browser("/api/oanda/connect"),envFor(configuredAlias));assert.equal(response.status,200);let payload=await response.json();assert.equal(payload.account.id,liveAccount);assert.equal(payload.connection.stage,"CONNECTED");assert.equal(payload.connection.mt4Blocked,true);assert.ok(calls.some(value=>value.endsWith("/v3/accounts")),"Production bootstrap must inventory the token accounts before selecting the live lane.");assert.ok(calls.some(value=>value.endsWith(\`/v3/accounts/\${liveAccount}/summary\`)),"The unique non-MT4 -001 returned by OANDA must drive the account summary request.");assert.equal(calls.some(value=>value.includes(mt4Account)&&value.endsWith("/summary")),false,"The -002 MT4 account must never be queried for trading summary.");

  // The known -002 MT4 account is blocked locally before any OANDA account request.
  calls=[];response=await worker.fetch(browser("/api/oanda/connect"),envFor(mt4Account));assert.equal(response.status,403);payload=await response.json();assert.equal(payload.code,"OANDA_MT4_ACCOUNT_BLOCKED");assert.equal(payload.stage,"ACCOUNT_POLICY");assert.equal(calls.length,0);

  // Account-list failure is now the attributable production bootstrap failure because inventory is the proven working selection path.
  mode="list-network";calls=[];response=await worker.fetch(browser("/api/oanda/connect"),envFor(configuredAlias));assert.equal(response.status,502);payload=await response.json();assert.equal(payload.code,"OANDA_NETWORK_FAILURE");assert.equal(payload.stage,"ACCOUNT_LIST");assert.equal(payload.attempts,3);

  // Statusless summary fetch exceptions remain retryable/attributable after successful live-lane selection.
  mode="summary-network";calls=[];response=await worker.fetch(browser("/api/oanda/connect"),envFor(configuredAlias));assert.equal(response.status,502);payload=await response.json();assert.equal(payload.code,"OANDA_NETWORK_FAILURE");assert.equal(payload.stage,"ACCOUNT_SUMMARY");assert.equal(payload.retryable,true);assert.equal(payload.attempts,3);assert.ok(payload.diagnosticId);assert.equal(calls.filter(value=>value.endsWith(\`/v3/accounts/\${liveAccount}/summary\`)).length,3);

  // Non-JSON summary 5xx remains structured.
  mode="summary-nonjson500";calls=[];response=await worker.fetch(browser("/api/oanda/connect"),envFor(configuredAlias));assert.equal(response.status,500);payload=await response.json();assert.equal(payload.code,"OANDA_HTTP_500");assert.equal(payload.stage,"ACCOUNT_SUMMARY");assert.ok(payload.error.includes("non-JSON"));

  // Diagnostics mirror production selection and disclose both token accounts while marking -002 blocked.
  mode="success";calls=[];response=await worker.fetch(browser("/api/platform/diagnostic?instrument=EUR_USD&granularity=M15"),envFor(configuredAlias));assert.equal(response.status,200);payload=await response.json();assert.equal(payload.verdict,"PASS");assert.deepEqual(payload.checks.accountList.value.authorizedSuffixes,["001","002"]);assert.equal(payload.checks.accountList.value.selectedSuffix,"001");assert.equal(payload.checks.accountList.value.blockedMt4Present,true);assert.equal(payload.checks.summary.value.accountSuffix,"001");assert.equal(payload.checks.engine.ok,true);

  const html=await readFile(new URL("../public/index.html",import.meta.url),"utf8");assert.doesNotMatch(html,/id="connectButton"|>TEST<\\/button>|TESTING…|Testing live OANDA connection/);assert.match(html,/connectionRuntime/);assert.match(html,/void connect\(\)/);
  const workerSource=await readFile(new URL("../src/worker-base.js",import.meta.url),"utf8");assert.match(workerSource,/function selectLiveAccount/);assert.match(workerSource,/id\.endsWith\("-001"\)/);assert.match(workerSource,/id\.endsWith\("-002"\)/);assert.match(workerSource,/async function resolveAccount/);assert.match(workerSource,/OANDA_MT4_ACCOUNT_BLOCKED/);assert.match(workerSource,/tradingCritical=\[credentialCheck,accountList,summary,candles\]/);
  console.log("Automatic production session, one-token account inventory, unique non-MT4 -001 selection, and explicit -002 MT4 exclusion verified.");
}finally{globalThis.fetch=originalFetch;}`);

fs.writeFileSync(workerPath,worker);fs.writeFileSync(htmlPath,html);fs.writeFileSync(browserPath,browser);fs.writeFileSync(runtimePath,runtime);fs.writeFileSync(forensicPath,forensic);fs.writeFileSync(checkHtmlPath,checkHtml);
console.log(`Applied production auto-session migration (${changes} transformations).`);
