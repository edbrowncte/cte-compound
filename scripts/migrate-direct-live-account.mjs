import fs from "node:fs";

const workerPath="src/worker-base.js",htmlPath="public/index.html";
let worker=fs.readFileSync(workerPath,"utf8"),html=fs.readFileSync(htmlPath,"utf8"),changes=0;
const replaceWorker=(from,to,label)=>{if(!worker.includes(from))throw new Error(`Missing worker anchor: ${label}`);worker=worker.replace(from,to);changes++;};
const replaceHtml=(from,to,label)=>{if(!html.includes(from))throw new Error(`Missing html anchor: ${label}`);html=html.replace(from,to);changes++;};

replaceWorker(
'  if(!/^[A-Za-z0-9-]{6,80}$/.test(accountId)) throw decorateError(new Error("OANDA_ACCOUNT_ID is not configured."),{status:503,code:"OANDA_ACCOUNT_ID_MISSING",stage:"CREDENTIALS",retryable:false});\n  return {token,accountId};',
'  if(!/^[A-Za-z0-9-]{6,80}$/.test(accountId)) throw decorateError(new Error("OANDA_ACCOUNT_ID is not configured."),{status:503,code:"OANDA_ACCOUNT_ID_MISSING",stage:"CREDENTIALS",retryable:false});\n  if(accountId.endsWith("-002")) throw decorateError(new Error("The configured -002 MT4 account is blocked from CTE Compound."),{status:403,code:"OANDA_MT4_ACCOUNT_BLOCKED",stage:"ACCOUNT_POLICY",retryable:false});\n  return {token,accountId};',
'block configured MT4 account');

replaceWorker(
'\nlet accountCache=null;\nasync function resolveAccount(token,configuredAccountId) {\n  if(accountCache&&accountCache.configuredAccountId===configuredAccountId&&accountCache.expires>Date.now()) return accountCache.id;\n  const payload=await oandaRequest("/v3/accounts",token,{stage:"ACCOUNT_LIST"});\n  const accounts=Array.isArray(payload.accounts)?payload.accounts:[];\n  const selected=accounts.find(account=>account.id===configuredAccountId&&!account.tags?.includes("MT4"));\n  if(!selected?.id) throw decorateError(new Error("Configured OANDA account is not authorized for this API token."),{status:401,code:"OANDA_ACCOUNT_ID_NOT_AUTHORIZED",stage:"ACCOUNT_SELECT",retryable:false});\n  accountCache={configuredAccountId,id:selected.id,expires:Date.now()+300000};\n  return selected.id;\n}\n',
'\n',
'remove account-list resolver');

replaceWorker(
'  const {token,accountId:configuredAccountId}=credentials(env),accountId=await resolveAccount(token,configuredAccountId),payload=await oandaRequest(`/v3/accounts/${encodeURIComponent(accountId)}/summary`,token,{stage:"ACCOUNT_SUMMARY"}),account=payload.account||{};',
'  const {token,accountId}=credentials(env),payload=await oandaRequest(`/v3/accounts/${encodeURIComponent(accountId)}/summary`,token,{stage:"ACCOUNT_SUMMARY"}),account=payload.account||{};',
'direct connect summary');

replaceWorker(
'  const {token,accountId}=credentials(env),payload=await oandaRequest("/v3/accounts",token,{stage:"ACCOUNT_LIST_DIAGNOSTIC",maxAttempts:1}),accounts=Array.isArray(payload.accounts)?payload.accounts:[];\n  return json({configuredSuffix:accountId.slice(-3),authorizedAccounts:accounts.map(account=>({suffix:String(account.id||"").slice(-3),selected:account.id===accountId,tags:account.tags||[]})),intendedAccountVisible:accounts.some(account=>account.id===accountId&&!account.tags?.includes("MT4"))});',
'  const {token,accountId}=credentials(env),payload=await oandaRequest("/v3/accounts",token,{stage:"ACCOUNT_LIST_DIAGNOSTIC",maxAttempts:1}),accounts=Array.isArray(payload.accounts)?payload.accounts:[];\n  return json({configuredSuffix:accountId.slice(-3),authorizedAccounts:accounts.map(account=>({suffix:String(account.id||"").slice(-3),selected:account.id===accountId,blocked:String(account.id||"").endsWith("-002"),tags:account.tags||[]})),configuredListed:accounts.some(account=>account.id===accountId),mt4BlockedSuffix:"002"});',
'informational account diagnostic');

replaceWorker(
'  const {token,accountId:configuredAccountId}=credentials(env),accountId=await resolveAccount(token,configuredAccountId);',
'  const {token,accountId}=credentials(env);',
'direct proxy account');
replaceWorker(
'  const {token,accountId:configuredAccountId}=credentials(env),accountId=await resolveAccount(token,configuredAccountId);',
'  const {token,accountId}=credentials(env);',
'direct manual order account');
replaceWorker(
'  const {token,accountId:configuredAccountId}=credentials(env),accountId=await resolveAccount(token,configuredAccountId),instruments=String(url.searchParams.get("instruments")||"").split(",").filter(Boolean);',
'  const {token,accountId}=credentials(env),instruments=String(url.searchParams.get("instruments")||"").split(",").filter(Boolean);',
'direct pricing stream account');

replaceWorker(
'  const accountList=credentialCheck.ok?await diagnosticStep("DIAGNOSTIC_ACCOUNT_LIST",async()=>{const payload=await oandaRequest("/v3/accounts",credentialValue.token,{stage:"DIAGNOSTIC_ACCOUNT_LIST",maxAttempts:1}),accounts=Array.isArray(payload.accounts)?payload.accounts:[],visible=accounts.some(account=>account.id===credentialValue.accountId&&!account.tags?.includes("MT4"));return{authorizedCount:accounts.length,nonMt4Count:accounts.filter(account=>!account.tags?.includes("MT4")).length,authorizedSuffixes:accounts.map(account=>String(account.id||"").slice(-3)),intendedAccountVisible:visible};}):skippedDiagnostic("DIAGNOSTIC_ACCOUNT_LIST","Credentials unavailable.");\n  const accountVisible=Boolean(accountList.ok&&accountList.value?.intendedAccountVisible);\n  const summary=accountVisible?await diagnosticStep("DIAGNOSTIC_ACCOUNT_SUMMARY",async()=>{const payload=await oandaRequest(`/v3/accounts/${encodeURIComponent(credentialValue.accountId)}/summary`,credentialValue.token,{stage:"DIAGNOSTIC_ACCOUNT_SUMMARY",maxAttempts:1}),account=payload.account||{};return{NAV:account.NAV||null,marginAvailable:account.marginAvailable||null,openPositionCount:account.openPositionCount||0};}):skippedDiagnostic("DIAGNOSTIC_ACCOUNT_SUMMARY",accountList.ok?"Configured account is not authorized by the current API token.":"Account list unavailable.");',
'  const accountList=credentialCheck.ok?await diagnosticStep("DIAGNOSTIC_ACCOUNT_LIST",async()=>{const payload=await oandaRequest("/v3/accounts",credentialValue.token,{stage:"DIAGNOSTIC_ACCOUNT_LIST",maxAttempts:1}),accounts=Array.isArray(payload.accounts)?payload.accounts:[];return{authorizedCount:accounts.length,authorizedSuffixes:accounts.map(account=>String(account.id||"").slice(-3)),configuredListed:accounts.some(account=>account.id===credentialValue.accountId),blockedMt4Present:accounts.some(account=>String(account.id||"").endsWith("-002")),mt4BlockedSuffix:"002"};}):skippedDiagnostic("DIAGNOSTIC_ACCOUNT_LIST","Credentials unavailable.");\n  const summary=credentialCheck.ok?await diagnosticStep("DIAGNOSTIC_ACCOUNT_SUMMARY",async()=>{const payload=await oandaRequest(`/v3/accounts/${encodeURIComponent(credentialValue.accountId)}/summary`,credentialValue.token,{stage:"DIAGNOSTIC_ACCOUNT_SUMMARY",maxAttempts:1}),account=payload.account||{};return{accountSuffix:String(account.id||credentialValue.accountId).slice(-3),NAV:account.NAV||null,marginAvailable:account.marginAvailable||null,openPositionCount:account.openPositionCount||0};}):skippedDiagnostic("DIAGNOSTIC_ACCOUNT_SUMMARY","Credentials unavailable.");\n  const accountVisible=Boolean(summary.ok);',
'diagnostic direct summary');

replaceWorker(
'  const required=[credentialCheck,accountList,summary,candles,engine],failures=required.filter(step=>!step.ok),tradingCritical=[credentialCheck,accountList,summary,candles],verdict=tradingCritical.some(step=>!step.ok)?"FAIL":engine.ok?"PASS":"DEGRADED",firstFailure=failures.find(step=>!step.skipped)||failures[0]||null;',
'  const required=[credentialCheck,summary,candles,engine],observations=[accountList,...required],failures=observations.filter(step=>!step.ok),tradingCritical=[credentialCheck,summary,candles],verdict=tradingCritical.some(step=>!step.ok)?"FAIL":engine.ok?"PASS":"DEGRADED",firstFailure=required.find(step=>!step.ok&&!step.skipped)||failures.find(step=>!step.skipped)||failures[0]||null;',
'diagnostic root-cause precedence');

replaceHtml(
'{label:"Authorized account",value:checks.accountList?.ok?(checks.accountList.value?.intendedAccountVisible?"Configured account verified":`Not found · authorized ${checks.accountList.value?.authorizedCount??0}`):(checks.accountList?.code||"Unavailable"),good:Boolean(checks.accountList?.ok&&checks.accountList.value?.intendedAccountVisible)}',
'{label:"Configured account",value:checks.summary?.ok?`Verified · ••••${checks.summary.value?.accountSuffix||server.oanda?.accountSuffix||"—"}${checks.accountList?.ok?` · token accounts ${checks.accountList.value?.authorizedSuffixes?.map(s=>`•••${s}`).join(", ")||checks.accountList.value?.authorizedCount||0}`:""}`:(checks.summary?.code||"Unavailable"),good:Boolean(checks.summary?.ok)}',
'browser configured account card');

fs.writeFileSync(workerPath,worker);fs.writeFileSync(htmlPath,html);console.log(`Applied direct configured-live-account migration (${changes} transformations).`);
