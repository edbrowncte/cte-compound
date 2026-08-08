import fs from "node:fs";

const workerPath="src/worker-base.js",htmlPath="public/index.html";
let worker=fs.readFileSync(workerPath,"utf8"),html=fs.readFileSync(htmlPath,"utf8"),changes=0;
const replaceOnce=(source,from,to,label)=>{if(!source.includes(from))throw new Error(`Missing migration anchor: ${label}`);changes++;return source.replace(from,to);};
const replaceRegex=(source,pattern,to,label)=>{if(!pattern.test(source))throw new Error(`Missing migration regex anchor: ${label}`);changes++;return source.replace(pattern,to);};

worker=replaceOnce(worker,
'const oandaTelemetry={requests:0,retries:0,timeouts:0,failures:0,statuses:{}};\n\nconst json = (value,status=200,headers={}) => new Response(JSON.stringify(value),{status,headers:{...JSON_HEADERS,...headers}});',
`const oandaTelemetry={requests:0,retries:0,timeouts:0,networkFailures:0,failures:0,statuses:{},lastFailure:null};

const json = (value,status=200,headers={}) => new Response(JSON.stringify(value),{status,headers:{...JSON_HEADERS,...headers}});
const diagnosticId=()=>crypto.randomUUID();
function decorateError(error,{status,code,stage,retryable,upstreamStatus,attempts}={}){
  const target=error instanceof Error?error:new Error(String(error||"Request failed."));
  if(status!==undefined)target.status=status;if(code)target.code=code;if(stage)target.stage=stage;if(retryable!==undefined)target.retryable=retryable;if(upstreamStatus!==undefined)target.upstreamStatus=upstreamStatus;if(attempts!==undefined)target.attempts=attempts;
  if(!target.diagnosticId)target.diagnosticId=diagnosticId();return target;
}
function errorSnapshot(error){const target=decorateError(error,{stage:error?.stage||"WORKER",code:error?.code||"WORKER_INTERNAL_ERROR",status:Number(error?.status)||500,retryable:Boolean(error?.retryable)});return{error:target.message||"Request failed.",code:target.code,stage:target.stage,retryable:Boolean(target.retryable),diagnosticId:target.diagnosticId,upstreamStatus:Number(target.upstreamStatus)||undefined,attempts:Number(target.attempts)||undefined};}
function errorResponse(error){const snapshot=errorSnapshot(error);return json(snapshot,Number(error?.status)||500,{"X-CTE-Diagnostic-ID":snapshot.diagnosticId});}
function recordOandaFailure(error){const snapshot=errorSnapshot(error);oandaTelemetry.lastFailure={time:new Date().toISOString(),code:snapshot.code,stage:snapshot.stage,status:Number(error?.status)||500,diagnosticId:snapshot.diagnosticId};}
function skippedDiagnostic(stage,reason="Dependency not met."){return{ok:false,skipped:true,stage,code:"DEPENDENCY_NOT_MET",status:424,retryable:false,error:reason,latencyMs:0,diagnosticId:null};}
async function diagnosticStep(stage,fn){const started=Date.now();try{return{ok:true,stage,latencyMs:Date.now()-started,value:await fn()};}catch(error){const target=decorateError(error,{stage:error?.stage||stage});const snapshot=errorSnapshot(target);return{ok:false,stage:snapshot.stage,latencyMs:Date.now()-started,...snapshot,status:Number(target.status)||500};}}`,
'error classification helpers');

worker=replaceRegex(worker,/function credentials\(env\) \{[\s\S]*?\n\}/,
`function credentials(env) {
  const token=String(env.OANDA_API_KEY||"").trim();
  const accountId=String(env.OANDA_ACCOUNT_ID||"").trim();
  if(token.length<20) throw decorateError(new Error("OANDA_API_KEY is not configured."),{status:503,code:"OANDA_API_KEY_MISSING",stage:"CREDENTIALS",retryable:false});
  if(!/^[A-Za-z0-9-]{6,80}$/.test(accountId)) throw decorateError(new Error("OANDA_ACCOUNT_ID is not configured."),{status:503,code:"OANDA_ACCOUNT_ID_MISSING",stage:"CREDENTIALS",retryable:false});
  return {token,accountId};
}`,'credential classification');

worker=replaceRegex(worker,/let accountCache=null;\nasync function resolveAccount\(token,configuredAccountId\) \{[\s\S]*?\n\}/,
`let accountCache=null;
async function resolveAccount(token,configuredAccountId) {
  if(accountCache&&accountCache.configuredAccountId===configuredAccountId&&accountCache.expires>Date.now()) return accountCache.id;
  const payload=await oandaRequest("/v3/accounts",token,{stage:"ACCOUNT_LIST"});
  const accounts=Array.isArray(payload.accounts)?payload.accounts:[];
  const selected=accounts.find(account=>account.id===configuredAccountId&&!account.tags?.includes("MT4"));
  if(!selected?.id) throw decorateError(new Error("Configured OANDA account is not authorized for this API token."),{status:401,code:"OANDA_ACCOUNT_ID_NOT_AUTHORIZED",stage:"ACCOUNT_SELECT",retryable:false});
  accountCache={configuredAccountId,id:selected.id,expires:Date.now()+300000};
  return selected.id;
}`,'exact account resolution and keyed cache');

worker=replaceRegex(worker,/async function oandaRequest\(path,token,init=\{\}\) \{[\s\S]*?\n\}/,
`async function oandaRequest(path,token,init={}) {
  await acquireOandaSlot();
  const stage=String(init.stage||"OANDA_REQUEST"),maxAttempts=Math.max(1,Math.min(3,Math.trunc(Number(init.maxAttempts)||3)));
  try{
    let lastError=null;
    for(let attempt=0;attempt<maxAttempts;attempt++){
      const delay=Math.max(0,45-(Date.now()-oandaLastStart));if(delay)await new Promise(resolve=>setTimeout(resolve,delay));
      oandaLastStart=Date.now();oandaTelemetry.requests++;
      const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),OANDA_REQUEST_TIMEOUT_MS);
      try{
        const response=await fetch(LIVE_OANDA_ORIGIN+path,{method:init.method||"GET",headers:{Authorization:\`Bearer \${token}\`,Accept:"application/json",...(init.body?{"Content-Type":"application/json"}:{})},body:init.body,redirect:"manual",cache:"no-store",signal:controller.signal});
        const text=await response.text();let payload={};
        if(text){try{payload=JSON.parse(text);}catch{const retryable=response.status===429||response.status>=500;throw decorateError(new Error(response.ok?"OANDA returned a non-JSON response.":\`OANDA HTTP \${response.status} returned a non-JSON response.\`),{status:response.ok?502:response.status,code:response.ok?"OANDA_INVALID_RESPONSE":\`OANDA_HTTP_\${response.status}\`,stage,retryable,upstreamStatus:response.status});}}
        if(!response.ok){const retryable=response.status===429||response.status>=500,error=decorateError(new Error(payload.errorMessage||payload.errorCode||\`OANDA HTTP \${response.status}\`),{status:response.status,code:payload.errorCode||\`OANDA_HTTP_\${response.status}\`,stage,retryable,upstreamStatus:response.status});oandaTelemetry.statuses[response.status]=Number(oandaTelemetry.statuses[response.status]||0)+1;throw error;}
        return payload;
      }catch(error){
        if(controller.signal.aborted){oandaTelemetry.timeouts++;lastError=decorateError(new Error("OANDA request timed out."),{status:504,code:"OANDA_TIMEOUT",stage,retryable:true});}
        else if(Number(error?.status)){lastError=decorateError(error,{stage:error?.stage||stage});}
        else{oandaTelemetry.networkFailures++;lastError=decorateError(new Error(error?.message||"OANDA network request failed."),{status:502,code:"OANDA_NETWORK_FAILURE",stage,retryable:true});}
        lastError.attempts=attempt+1;
        if(!lastError.retryable||attempt===maxAttempts-1){oandaTelemetry.failures++;recordOandaFailure(lastError);throw lastError;}
        oandaTelemetry.retries++;await new Promise(resolve=>setTimeout(resolve,500*(2**attempt)+Math.floor(Math.random()*250)));
      }finally{clearTimeout(timer);}
    }
    throw lastError||decorateError(new Error("OANDA request failed."),{status:502,code:"OANDA_NETWORK_FAILURE",stage,retryable:true,attempts:maxAttempts});
  }finally{releaseOandaSlot();}
}`,'OANDA retry/classification core');

worker=replaceRegex(worker,/async function handleConnect\(env\) \{[\s\S]*?\n\}/,
`async function handleConnect(env) {
  const {token,accountId:configuredAccountId}=credentials(env),accountId=await resolveAccount(token,configuredAccountId),payload=await oandaRequest(\`/v3/accounts/\${encodeURIComponent(accountId)}/summary\`,token,{stage:"ACCOUNT_SUMMARY"}),account=payload.account||{};
  return json({account:{id:account.id||accountId,alias:account.alias||"",currency:account.currency||"",balance:account.balance||"0",NAV:account.NAV||"0",marginAvailable:account.marginAvailable||"0",marginUsed:account.marginUsed||"0",hedgingEnabled:Boolean(account.hedgingEnabled),openPositionCount:account.openPositionCount||0,lastTransactionID:payload.lastTransactionID||null},live:true,connection:{stage:"CONNECTED",accountSuffix:String(accountId).slice(-3)}});
}`,'staged connect response');

worker=replaceRegex(worker,/async function handleAccountDiagnostic\(env\) \{[\s\S]*?\n\}/,
`async function handleAccountDiagnostic(env) {
  const {token,accountId}=credentials(env),payload=await oandaRequest("/v3/accounts",token,{stage:"ACCOUNT_LIST_DIAGNOSTIC",maxAttempts:1}),accounts=Array.isArray(payload.accounts)?payload.accounts:[];
  return json({configuredSuffix:accountId.slice(-3),authorizedAccounts:accounts.map(account=>({suffix:String(account.id||"").slice(-3),selected:account.id===accountId,tags:account.tags||[]})),intendedAccountVisible:accounts.some(account=>account.id===accountId&&!account.tags?.includes("MT4"))});
}`,'account diagnostic classification');

worker=replaceRegex(worker,/async function handlePlatformDiagnostic\(env,url\)\{[\s\S]*?\n\}/,
`async function handlePlatformDiagnostic(env,url){
  const started=Date.now(),instrument=(url.searchParams.get("instrument")||"EUR_USD").toUpperCase(),granularity=(url.searchParams.get("granularity")||"M15").toUpperCase();
  if(!INSTRUMENTS.has(instrument)||!GRANULARITIES.has(granularity))return json({error:"Invalid diagnostic instrument or granularity."},400);
  let credentialValue=null;
  const credentialCheck=await diagnosticStep("CREDENTIALS",async()=>{const value=credentials(env);credentialValue=value;return{tokenConfigured:true,accountConfigured:true,configuredSuffix:value.accountId.slice(-3)};});
  const accountList=credentialCheck.ok?await diagnosticStep("DIAGNOSTIC_ACCOUNT_LIST",async()=>{const payload=await oandaRequest("/v3/accounts",credentialValue.token,{stage:"DIAGNOSTIC_ACCOUNT_LIST",maxAttempts:1}),accounts=Array.isArray(payload.accounts)?payload.accounts:[],visible=accounts.some(account=>account.id===credentialValue.accountId&&!account.tags?.includes("MT4"));return{authorizedCount:accounts.length,nonMt4Count:accounts.filter(account=>!account.tags?.includes("MT4")).length,authorizedSuffixes:accounts.map(account=>String(account.id||"").slice(-3)),intendedAccountVisible:visible};}):skippedDiagnostic("DIAGNOSTIC_ACCOUNT_LIST","Credentials unavailable.");
  const accountVisible=Boolean(accountList.ok&&accountList.value?.intendedAccountVisible);
  const summary=accountVisible?await diagnosticStep("DIAGNOSTIC_ACCOUNT_SUMMARY",async()=>{const payload=await oandaRequest(\`/v3/accounts/\${encodeURIComponent(credentialValue.accountId)}/summary\`,credentialValue.token,{stage:"DIAGNOSTIC_ACCOUNT_SUMMARY",maxAttempts:1}),account=payload.account||{};return{NAV:account.NAV||null,marginAvailable:account.marginAvailable||null,openPositionCount:account.openPositionCount||0};}):skippedDiagnostic("DIAGNOSTIC_ACCOUNT_SUMMARY",accountList.ok?"Configured account is not authorized by the current API token.":"Account list unavailable.");
  const candles=credentialCheck.ok?await diagnosticStep("DIAGNOSTIC_CANDLES",async()=>{const payload=await oandaRequest(\`/v3/instruments/\${instrument}/candles?price=M&granularity=\${granularity}&count=60&smooth=false\`,credentialValue.token,{stage:"DIAGNOSTIC_CANDLES",maxAttempts:1}),normalized=normalizeCandles(payload);return{completedCandles:normalized.length,lastCandle:normalized.at(-1)?.time||null};}):skippedDiagnostic("DIAGNOSTIC_CANDLES","Credentials unavailable.");
  const engine=await diagnosticStep("ENGINE_STATUS",async()=>{if(!env.HTL_ENGINE?.getByName)throw decorateError(new Error("HTL_ENGINE Durable Object binding is unavailable."),{status:503,code:"HTL_ENGINE_BINDING_MISSING",stage:"ENGINE_STATUS",retryable:false});const response=await env.HTL_ENGINE.getByName("live").fetch("https://engine/status"),payload=await response.json().catch(()=>({}));if(!response.ok)throw decorateError(new Error(payload.error||\`Engine HTTP \${response.status}\`),{status:response.status,code:"ENGINE_STATUS_FAILURE",stage:"ENGINE_STATUS",retryable:response.status>=500});return payload;});
  const required=[credentialCheck,accountList,summary,candles,engine],failures=required.filter(step=>!step.ok),verdict=failures.length===0?"PASS":credentialCheck.ok&&candles.ok&&engine.ok?"DEGRADED":"FAIL",firstFailure=failures.find(step=>!step.skipped)||failures[0]||null;
  return json({verdict,time:new Date().toISOString(),totalLatencyMs:Date.now()-started,deployment:deploymentMetadata(env),checks:{credentials:credentialCheck,accountList,summary,candles,engine},worker:{oandaActive,oandaQueued:oandaWaiters.length,maxConcurrency:OANDA_MAX_CONCURRENCY,requestTimeoutMs:OANDA_REQUEST_TIMEOUT_MS,candleCacheEntries:candleCache.size,candleCacheBars:candleCacheBarCount(),candleCacheMaxEntries:CANDLE_CACHE_MAX_ENTRIES,candleCacheMaxBars:CANDLE_CACHE_MAX_BARS,telemetry:oandaTelemetry},oanda:{accountSuffix:credentialValue?.accountId?.slice(-3)||null,intendedAccountVisible:accountVisible,summaryLatencyMs:summary.latencyMs,candleLatencyMs:candles.latencyMs,completedCandles:candles.value?.completedCandles||0,NAV:summary.value?.NAV||null,marginAvailable:summary.value?.marginAvailable||null,failure:firstFailure&&!firstFailure.stage.startsWith("ENGINE")?firstFailure:null},engine:engine.ok?{reachable:true,...engine.value}:{reachable:false,lastError:engine.error,code:engine.code,diagnosticId:engine.diagnosticId},failure:firstFailure?{stage:firstFailure.stage,code:firstFailure.code,error:firstFailure.error,status:firstFailure.status,retryable:firstFailure.retryable,diagnosticId:firstFailure.diagnosticId}:null,cloneAssessment:{structuredCloneCalls:0,applicable:false,verdict:"No structuredClone hot path exists in this repository."}});
}`,'partial forensic diagnostic');

worker=replaceOnce(worker,
'    } catch(error) {\n      return json({error:error?.message||"Request failed.",details:error?.payload||undefined},Number(error?.status)||500);\n    }',
'    } catch(error) {\n      return errorResponse(error);\n    }',
'structured Worker error response');

html=replaceOnce(html,
'  function setConnectionStatus(message,type="idle") {\n    el("connectionStatus").textContent=message;\n    el("statusDot").className=`status-dot ${type==="connected"?"connected":type==="error"?"error":""}`;\n  }',
`  function setConnectionStatus(message,type="idle") {
    el("connectionStatus").textContent=message;
    el("statusDot").className=\`status-dot \${type==="connected"?"connected":type==="error"?"error":""}\`;
  }
  async function readApiResponse(response){const text=await response.text(),headerId=response.headers.get("X-CTE-Diagnostic-ID")||response.headers.get("cf-ray")||"";let payload={};if(text){try{payload=JSON.parse(text);}catch{payload={error:\`HTTP \${response.status}\`,code:"NON_JSON_RESPONSE",stage:"EDGE_OR_RUNTIME",preview:text.replace(/\\s+/g," ").slice(0,160)};}}return{payload,diagnosticId:payload.diagnosticId||headerId};}
  function apiFailureMessage(response,payload={},id=""){const parts=[];if(payload.code)parts.push(payload.code);if(payload.stage)parts.push(payload.stage);if(payload.error&&!parts.includes(payload.error))parts.push(payload.error);if(!payload.code&&!payload.error)parts.push(\`HTTP \${response.status}\`);else if(response.status>=400)parts.push(\`HTTP \${response.status}\`);if(id)parts.push(\`ID \${id}\`);return parts.join(" · ")||"Request failed.";}`,
'forensic API response parsing');

const connectPattern=/  async function connect\(event\) \{[\s\S]*?\n  \}\n\n  function disconnect\(\) \{/;
const connectReplacement=`  async function connect(event) {
    event?.preventDefault?.();
    if(!state.preferencesLoaded)await loadPlatformPreferences();
    const button=el("connectButton"),wasConnected=state.connected;
    button.disabled=true;button.textContent="TESTING…";
    setConnectionStatus(wasConnected?"Testing live OANDA connection…":"Connecting to live OANDA…");
    try {
      const response=await fetch("/api/oanda/connect",{headers:{"Accept":"application/json"},credentials:"same-origin",cache:"no-store"}),{payload,diagnosticId}=await readApiResponse(response);
      if(!response.ok){const failure=new Error(apiFailureMessage(response,payload,diagnosticId));failure.payload=payload;failure.status=response.status;throw failure;}
      const accountId=payload.account?.id||"";
      state.connected=true;state.account=payload.account||null;state.accountId=accountId;state.accountCurrency=payload.account?.currency||"";state.streamRetry=0;
      el("accountFacts").hidden=false;el("positionsPanel").hidden=false;el("automationPanel").hidden=false;el("accountId").textContent=accountId?\`••••\${accountId.slice(-3)}\`:"—";el("accountCurrency").textContent=state.accountCurrency||"—";el("accountBalance").textContent=payload.account?.balance||"—";el("accountNav").textContent=payload.account?.NAV||"—";el("accountMargin").textContent=payload.account?.marginAvailable||"—";el("disconnectButton").disabled=false;setConnectionStatus(\`Connected · live OANDA · account ••••\${accountId.slice(-3)}\`,"connected");
      startPositionMonitor();startAdaptiveMonitor();startPricingStream();
      await Promise.all([loadEngineConfig().catch(error=>{el("automationStatus").textContent=error.message||"Configuration unavailable";}),loadOptimizerRecords(),loadControlStatus().catch(() => {})]);
      void loadTradingLedger();void loadEngineStatus();
      await loadTradeCapacity();await loadChart();void loadSchedule("focused");setTimeout(()=>{if(state.connected&&!state.chartLoading)void runPlatformDiagnostic(false);},5000);
    } catch (error) {
      if(wasConnected){setConnectionStatus(\`\${error.message||"Connection test failed"} · active session retained\`,"error");}
      else{state.connected=false;el("accountFacts").hidden=true;el("positionsPanel").hidden=true;el("automationPanel").hidden=true;stopPositionMonitor();stopAdaptiveMonitor();setConnectionStatus(error.message||"OANDA connection failed.","error");setTimeout(()=>{if(!state.connected)void runPlatformDiagnostic(true);},250);}
    } finally {button.disabled=false;button.textContent="TEST";}
  }

  function disconnect() {`;
html=replaceRegex(html,connectPattern,connectReplacement,'connection staged errors and automatic diagnostic');

html=replaceRegex(html,/  function diagnosticCards\(entries\)\{[^\n]*\}/,
`  function diagnosticCards(entries){const grid=el("platformDiagnosticGrid");grid.replaceChildren();for(const item of entries){const card=document.createElement("div"),label=document.createElement("span"),value=document.createElement("strong");card.className=\`diagnostic-card \${item.good===true?"good":item.good===false?"bad":""}\`;label.textContent=String(item.label??"");value.textContent=String(item.value??"");card.append(label,value);grid.append(card);}}`,
'safe diagnostic card rendering');

const diagnosticPattern=/  async function runPlatformDiagnostic\(open=true\)\{[\s\S]*?\n\n  function updateDateTime\(\)/;
const diagnosticReplacement=`  async function runPlatformDiagnostic(open=true){if(open)el("platformDiagnosticDetails").open=true;el("platformDiagnosticStatus").textContent="Scanning…";const started=performance.now();try{const response=await fetch(\`/api/platform/diagnostic?instrument=\${encodeURIComponent(state.selectedInstrument)}&granularity=\${encodeURIComponent(state.selectedTimeframe)}\`,{headers:{Accept:"application/json"},credentials:"same-origin",cache:"no-store"}),{payload:server,diagnosticId}=await readApiResponse(response);if(!response.ok)throw new Error(apiFailureMessage(response,server,diagnosticId));const browserLatency=Math.round(performance.now()-started),failures=state.scheduleFailures.size,telemetry=server.worker?.telemetry||{},deployment=server.deployment||{},checks=server.checks||{},failure=server.failure||null,entries=[{label:"Forensic verdict",value:server.verdict||"UNKNOWN",good:server.verdict==="PASS"},{label:"Browser → Worker",value:\`\${browserLatency} ms\`,good:browserLatency<5000},{label:"Worker deployment",value:deployment.versionTag||deployment.versionId||"metadata unavailable",good:Boolean(deployment.versionId)},{label:"Credentials",value:checks.credentials?.ok?\`Configured · account ••••\${checks.credentials.value?.configuredSuffix||"—"}\`:checks.credentials?.code||"Unavailable",good:Boolean(checks.credentials?.ok)},{label:"Authorized account",value:checks.accountList?.ok?(checks.accountList.value?.intendedAccountVisible?"Configured account verified":\`Not found · authorized \${checks.accountList.value?.authorizedCount??0}\`):(checks.accountList?.code||"Unavailable"),good:Boolean(checks.accountList?.ok&&checks.accountList.value?.intendedAccountVisible)},{label:"Failure stage",value:failure?\`\${failure.code||"ERROR"} · \${failure.stage||"unknown"}\`:"None",good:!failure},{label:"Diagnostic ID",value:failure?.diagnosticId||"—",good:!failure},{label:"Selected chart lane",value:\`\${state.candleActive} active · \${state.candleQueue.length} queued\`,good:state.candleQueue.filter(job=>job.priority>=80).length===0},{label:"Schedule datasets",value:\`\${state.scheduleEvaluations.size} / 280 · \${failures} unresolved\`,good:failures===0},{label:"Browser candle retries",value:\`\${state.candleStats.retries} retries · \${state.candleStats.timeouts} timeouts\`,good:state.candleStats.timeouts===0},{label:"Worker OANDA queue",value:\`\${server.worker?.oandaActive??"—"} active · \${server.worker?.oandaQueued??"—"} queued\`,good:Number(server.worker?.oandaQueued||0)<4},{label:"OANDA summary",value:checks.summary?.ok?\`\${checks.summary.latencyMs??"—"} ms\`:(checks.summary?.code||"Unavailable"),good:Boolean(checks.summary?.ok)},{label:"OANDA candles",value:checks.candles?.ok?\`\${checks.candles.value?.completedCandles??0} candles · \${checks.candles.latencyMs??"—"} ms\`:(checks.candles?.code||"Unavailable"),good:Boolean(checks.candles?.ok&&Number(checks.candles.value?.completedCandles)>0)},{label:"Engine",value:checks.engine?.ok?\`Reachable · \${checks.engine.value?.lastError||"no error"}\`:(checks.engine?.code||"Unreachable"),good:Boolean(checks.engine?.ok)&&!checks.engine?.value?.lastError},{label:"Optimizer",value:checks.engine?.ok?\`\${checks.engine.value?.optimizerCoverage??0} / \${checks.engine.value?.optimizerTotal??280} · \${checks.engine.value?.optimizerLastError||"no error"}\`:"Unavailable",good:Boolean(checks.engine?.ok)&&!checks.engine?.value?.optimizerLastError},{label:"Worker failures",value:\`\${telemetry.failures||0} failures · \${telemetry.networkFailures||0} network · \${telemetry.timeouts||0} timeouts\`,good:Number(telemetry.timeouts||0)===0&&Number(telemetry.networkFailures||0)===0},{label:"Candle cache",value:\`\${server.worker?.candleCacheEntries??0} entries · \${server.worker?.candleCacheBars??0} bars\`,good:Number(server.worker?.candleCacheBars||0)<=Number(server.worker?.candleCacheMaxBars||60000)},{label:"Cross-device state",value:state.preferenceSyncStatus||"Pending",good:/Synchronized/.test(state.preferenceSyncStatus||"")},{label:"JPY quote normalization",value:state.jpyReciprocalCorrections.size?[...state.jpyReciprocalCorrections].map(formatPair).join(", "):"Native OANDA quote scale",good:true}];state.diagnosticLast={server,entries,time:new Date().toISOString()};diagnosticCards(entries);el("platformDiagnosticStatus").textContent=\`\${server.verdict||"Completed"} · \${new Date().toLocaleTimeString()}\${failure?\` · \${failure.code||failure.stage||"failure"}\`:""}\`;}catch(error){diagnosticCards([{label:"Diagnostic transport failure",value:error.message||"Scan failed",good:false}]);el("platformDiagnosticStatus").textContent=error.message||"Diagnostic scan failed";}}

  function updateDateTime()`;
html=replaceRegex(html,diagnosticPattern,diagnosticReplacement,'forensic partial diagnostic UI');

fs.writeFileSync(workerPath,worker);fs.writeFileSync(htmlPath,html);console.log(`Applied forensic connection recovery migration (${changes} transformations).`);
