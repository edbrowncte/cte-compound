const LIVE_OANDA_ORIGIN = "https://api-fxtrade.oanda.com";
const LIVE_OANDA_STREAM_ORIGIN = "https://stream-fxtrade.oanda.com";
export { HtlEngine } from "./engine.js";

const INSTRUMENTS = new Set([
  "EUR_USD","GBP_USD","USD_JPY","USD_CAD","USD_CHF","AUD_USD","NZD_USD",
  "EUR_GBP","EUR_JPY","EUR_CHF","EUR_AUD","EUR_CAD","EUR_NZD",
  "GBP_JPY","GBP_CHF","GBP_AUD","GBP_CAD","GBP_NZD",
  "AUD_JPY","AUD_CHF","AUD_CAD","AUD_NZD",
  "NZD_JPY","NZD_CHF","NZD_CAD","CAD_JPY","CAD_CHF","CHF_JPY"
]);
const GRANULARITIES = new Set(["W","D","H4","H1","M30","M15","M5","M1","S30","S5"]);
const JSON_HEADERS = {"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store","X-Content-Type-Options":"nosniff"};
const candleCache=new Map();
const OANDA_MAX_CONCURRENCY=3,OANDA_REQUEST_TIMEOUT_MS=15000;
let oandaActive=0,oandaLastStart=0;
const oandaWaiters=[];
const oandaTelemetry={requests:0,retries:0,timeouts:0,failures:0,statuses:{}};

const json = (value,status=200,headers={}) => new Response(JSON.stringify(value),{status,headers:{...JSON_HEADERS,...headers}});

function credentials(env) {
  const token=String(env.OANDA_API_KEY||"").trim();
  const accountId=String(env.OANDA_ACCOUNT_ID||"").trim();
  if(token.length<20) throw Object.assign(new Error("OANDA_API_KEY is not configured."),{status:503});
  if(!/^[A-Za-z0-9-]{6,80}$/.test(accountId)) throw Object.assign(new Error("OANDA_ACCOUNT_ID is not configured."),{status:503});
  return {token,accountId};
}

let accountCache=null;
async function resolveAccount(token,configuredAccountId) {
  if(accountCache&&accountCache.expires>Date.now()) return accountCache.id;
  const payload=await oandaRequest("/v3/accounts",token);
  const accounts=Array.isArray(payload.accounts)?payload.accounts:[];
  const selected=accounts.find(account=>account.id===configuredAccountId&&!account.tags?.includes("MT4"))||accounts.find(account=>String(account.id||"").endsWith("-001")&&!account.tags?.includes("MT4"));
  if(!selected?.id) throw Object.assign(new Error("The authorized non-MT4 OANDA account ending -001 was not found."),{status:401});
  accountCache={id:selected.id,expires:Date.now()+300000};
  return selected.id;
}

function assertSameOrigin(request) {
  const url=new URL(request.url),origin=request.headers.get("Origin"),site=request.headers.get("Sec-Fetch-Site");
  if(origin&&origin!==url.origin) throw Object.assign(new Error("Cross-origin request rejected."),{status:403});
  if(!origin&&!site) throw Object.assign(new Error("Browser-origin request required."),{status:403});
  if(site&&!['same-origin','same-site','none'].includes(site)) throw Object.assign(new Error("Cross-site request rejected."),{status:403});
}

async function acquireOandaSlot(){if(oandaActive<OANDA_MAX_CONCURRENCY){oandaActive++;return;}await new Promise(resolve=>oandaWaiters.push(resolve));}
function releaseOandaSlot(){const next=oandaWaiters.shift();if(next)next();else oandaActive=Math.max(0,oandaActive-1);}

async function oandaRequest(path,token,init={}) {
  await acquireOandaSlot();
  try{
    let lastError=null;
    for(let attempt=0;attempt<3;attempt++){
      const delay=Math.max(0,45-(Date.now()-oandaLastStart));
      if(delay)await new Promise(resolve=>setTimeout(resolve,delay));
      oandaLastStart=Date.now();oandaTelemetry.requests++;
      const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),OANDA_REQUEST_TIMEOUT_MS);
      try{
        const response=await fetch(LIVE_OANDA_ORIGIN+path,{method:init.method||"GET",headers:{Authorization:`Bearer ${token}`,Accept:"application/json",...(init.body?{"Content-Type":"application/json"}:{})},body:init.body,redirect:"manual",cache:"no-store",signal:controller.signal});
        const payload=await response.json().catch(()=>({}));
        if(!response.ok){const error=Object.assign(new Error(payload.errorMessage||payload.errorCode||`OANDA HTTP ${response.status}`),{status:response.status,payload});oandaTelemetry.statuses[response.status]=Number(oandaTelemetry.statuses[response.status]||0)+1;throw error;}
        return payload;
      }catch(error){
        const timedOut=controller.signal.aborted;if(timedOut){oandaTelemetry.timeouts++;lastError=Object.assign(new Error("OANDA request timed out."),{status:504});}else lastError=error;
        const status=Number(lastError?.status)||0,retryable=timedOut||status===429||status>=500;
        if(!retryable||attempt===2){oandaTelemetry.failures++;throw lastError;}
        oandaTelemetry.retries++;await new Promise(resolve=>setTimeout(resolve,500*(2**attempt)+Math.floor(Math.random()*250)));
      }finally{clearTimeout(timer);}
    }
    throw lastError||new Error("OANDA request failed.");
  }finally{releaseOandaSlot();}
}

function normalizeCandles(payload) {
  return (payload.candles||[]).filter(c=>c.complete===true&&c.mid).map(c=>{
    const open=Number(c.mid.o),high=Number(c.mid.h),low=Number(c.mid.l),close=Number(c.mid.c);
    return {
      time:c.time,
      open,
      high,
      low,
      close,
      mid:{o:String(c.mid.o),h:String(c.mid.h),l:String(c.mid.l),c:String(c.mid.c)},
      volume:Number(c.volume||0),
      complete:true
    };
  }).filter(c=>[c.open,c.high,c.low,c.close].every(Number.isFinite));
}

function proxyPath(raw,accountId,method) {
  const path=String(raw||"");
  const account=accountId.replace(/[.*+?^${}()|[\]\\]/g,"\\$&");
  const getRules=[
    new RegExp(`^/v3/accounts/${account}/summary$`),
    new RegExp(`^/v3/accounts/${account}/pricing\\?`),
    new RegExp(`^/v3/accounts/${account}/positions$`),
    /^\/v3\/instruments\/[A-Z]{3}_[A-Z]{3}\/candles\?/
  ];
  const allowed=method==="GET"&&getRules.some(rule=>rule.test(path));
  if(!allowed) throw Object.assign(new Error("OANDA route is not permitted."),{status:403});
  if(path.includes("api-fxpractice")||path.includes("stream-fxpractice")) throw Object.assign(new Error("Practice endpoints are not available."),{status:403});
  return path;
}

async function handleConnect(env) {
  const {token,accountId:configuredAccountId}=credentials(env),accountId=await resolveAccount(token,configuredAccountId),payload=await oandaRequest(`/v3/accounts/${encodeURIComponent(accountId)}/summary`,token),account=payload.account||{};
  return json({account:{id:account.id||accountId,alias:account.alias||"",currency:account.currency||"",balance:account.balance||"0",NAV:account.NAV||"0",marginAvailable:account.marginAvailable||"0",marginUsed:account.marginUsed||"0",hedgingEnabled:Boolean(account.hedgingEnabled),openPositionCount:account.openPositionCount||0,lastTransactionID:payload.lastTransactionID||null},live:true});
}

async function handleAccountDiagnostic(env) {
  const {token,accountId}=credentials(env),payload=await oandaRequest("/v3/accounts",token),accounts=Array.isArray(payload.accounts)?payload.accounts:[];
  return json({configuredSuffix:accountId.slice(-3),authorizedAccounts:accounts.map(account=>({suffix:String(account.id||"").slice(-3),selected:account.id===accountId,tags:account.tags||[]})),intendedAccountVisible:accounts.some(account=>account.id===accountId)});
}

async function handleProxy(request,env,url) {
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

async function handleCandles(env,url) {
  const {token}=credentials(env),instrument=(url.searchParams.get("instrument")||"").toUpperCase(),granularity=(url.searchParams.get("granularity")||"").toUpperCase();
  if(!INSTRUMENTS.has(instrument)||!GRANULARITIES.has(granularity)) return json({error:"Invalid instrument or granularity."},400);
  const count=Math.max(60,Math.min(1200,Math.trunc(Number(url.searchParams.get("count")))||650)),key=`${instrument}|${granularity}`,cached=candleCache.get(key),now=Date.now();
  const select=value=>({...value,candles:(value.candles||[]).slice(-count)});
  if(cached?.value&&cached.expires>now&&cached.count>=count)return json(select(cached.value));
  if(cached?.promise&&cached.count>=count)return json(select(await cached.promise));
  const requestCount=Math.max(count,cached?.count||0),query=new URLSearchParams({price:"M",granularity,count:String(requestCount),smooth:"false"}),ttl={S5:4000,S30:15000,M1:30000,M5:120000,M15:300000,M30:600000,H1:1200000,H4:3600000,D:21600000,W:86400000}[granularity]||30000;
  const promise=oandaRequest(`/v3/instruments/${instrument}/candles?${query}`,token).then(payload=>({instrument,granularity,candles:normalizeCandles(payload),completedOnly:true}));
  candleCache.set(key,{promise,count:requestCount,expires:0,value:cached?.value});
  try{const value=await promise;candleCache.set(key,{value,count:requestCount,expires:Date.now()+ttl});if(candleCache.size>400)candleCache.delete(candleCache.keys().next().value);return json(select(value));}catch(error){if(candleCache.get(key)?.promise===promise)candleCache.delete(key);throw error;}
}


function deploymentMetadata(env){const metadata=env.CF_VERSION_METADATA||{};return{worker:"cte-compound",versionId:metadata.id||null,versionTag:metadata.tag||null,versionTimestamp:metadata.timestamp||null};}
async function handlePlatformVersion(env){return json({deployment:deploymentMetadata(env)});}

async function handlePlatformDiagnostic(env,url){
  const started=Date.now(),instrument=(url.searchParams.get("instrument")||"EUR_USD").toUpperCase(),granularity=(url.searchParams.get("granularity")||"M15").toUpperCase();
  if(!INSTRUMENTS.has(instrument)||!GRANULARITIES.has(granularity))return json({error:"Invalid diagnostic instrument or granularity."},400);
  const {token,accountId:configuredAccountId}=credentials(env),accountId=await resolveAccount(token,configuredAccountId),summaryStart=Date.now();
  const summary=await oandaRequest(`/v3/accounts/${encodeURIComponent(accountId)}/summary`,token),summaryLatencyMs=Date.now()-summaryStart,candleStart=Date.now(),candles=await oandaRequest(`/v3/instruments/${instrument}/candles?price=M&granularity=${granularity}&count=60&smooth=false`,token),candleLatencyMs=Date.now()-candleStart,engineResponse=await env.HTL_ENGINE.getByName("live").fetch("https://engine/status"),engine=await engineResponse.json().catch(()=>({}));
  return json({deployment:deploymentMetadata(env),time:new Date().toISOString(),totalLatencyMs:Date.now()-started,worker:{oandaActive,oandaQueued:oandaWaiters.length,maxConcurrency:OANDA_MAX_CONCURRENCY,requestTimeoutMs:OANDA_REQUEST_TIMEOUT_MS,candleCacheEntries:candleCache.size,telemetry:oandaTelemetry},oanda:{accountSuffix:String(accountId).slice(-3),summaryLatencyMs,candleLatencyMs,completedCandles:normalizeCandles(candles).length,NAV:summary.account?.NAV||null,marginAvailable:summary.account?.marginAvailable||null},engine:{reachable:engineResponse.ok,armed:engine.armed,running:engine.running,lastRun:engine.lastRun,lastError:engine.lastError,optimizerCoverage:engine.optimizerCoverage,optimizerTotal:engine.optimizerTotal,optimizerLastError:engine.optimizerLastError,mtfCoverage:engine.mtfCoverage,pendingOrders:engine.pendingOrders},cloneAssessment:{structuredCloneCalls:0,applicable:false,verdict:"No structuredClone hot path exists in this repository."}});
}

async function handlePricingStream(env,url) {
  const {token,accountId:configuredAccountId}=credentials(env),accountId=await resolveAccount(token,configuredAccountId),instruments=String(url.searchParams.get("instruments")||"").split(",").filter(Boolean);
  if(!instruments.length||instruments.length>INSTRUMENTS.size||instruments.some(instrument=>!INSTRUMENTS.has(instrument))) return json({error:"Invalid instruments."},400);
  const query=new URLSearchParams({instruments:instruments.join(","),snapshot:"true"});
  const upstream=await fetch(`${LIVE_OANDA_STREAM_ORIGIN}/v3/accounts/${encodeURIComponent(accountId)}/pricing/stream?${query}`,{headers:{Authorization:`Bearer ${token}`,Accept:"application/octet-stream"},redirect:"manual",cache:"no-store"});
  if(!upstream.ok){const payload=await upstream.json().catch(()=>({}));return json({error:payload.errorMessage||payload.errorCode||`OANDA HTTP ${upstream.status}`},upstream.status);}
  return new Response(upstream.body,{status:200,headers:{"Content-Type":"application/octet-stream","Cache-Control":"no-store","X-Content-Type-Options":"nosniff"}});
}

function secureAsset(response,url) {
  const headers=new Headers(response.headers);
  headers.set("X-Content-Type-Options","nosniff");
  headers.set("Referrer-Policy","no-referrer");
  headers.set("Permissions-Policy","camera=(), microphone=(), geolocation=(), payment=(), usb=()");
  headers.set("Content-Security-Policy","default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; font-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
  if(url.pathname==="/"||url.pathname.endsWith(".html")) headers.set("Cache-Control","no-store");
  return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
}

export default {
  async fetch(request,env) {
    const url=new URL(request.url);
    try {
      if(url.pathname.startsWith("/api/")) {
        assertSameOrigin(request);
        if(url.pathname==="/api/oanda/connect"&&request.method==="GET") return await handleConnect(env);
        if(url.pathname==="/api/oanda/accounts"&&request.method==="GET") return await handleAccountDiagnostic(env);
        if(url.pathname==="/api/platform/version"&&request.method==="GET") return await handlePlatformVersion(env);
        if(url.pathname==="/api/platform/diagnostic"&&request.method==="GET") return await handlePlatformDiagnostic(env,url);
        if(url.pathname==="/api/platform/preferences"&&request.method==="GET") return await env.HTL_ENGINE.getByName("live").fetch("https://engine/preferences");
        if(url.pathname==="/api/platform/preferences"&&request.method==="PUT") return await env.HTL_ENGINE.getByName("live").fetch(new Request("https://engine/preferences",{method:"PUT",headers:{"Content-Type":"application/json"},body:request.body}));
        if(url.pathname==="/api/engine/status"&&request.method==="GET") return await env.HTL_ENGINE.getByName("live").fetch("https://engine/status");
        if(url.pathname==="/api/engine/config"&&request.method==="GET") return await env.HTL_ENGINE.getByName("live").fetch("https://engine/config");
        if(url.pathname==="/api/engine/config"&&request.method==="PUT") return await env.HTL_ENGINE.getByName("live").fetch(new Request("https://engine/config",{method:"PUT",headers:{"Content-Type":"application/json","CF-Connecting-IP":request.headers.get("CF-Connecting-IP")||"","User-Agent":request.headers.get("User-Agent")||""},body:request.body}));
        if(url.pathname==="/api/engine/optimizer"&&request.method==="GET") return await env.HTL_ENGINE.getByName("live").fetch("https://engine/optimizer");
        if(url.pathname==="/api/engine/compute"&&request.method==="POST") return await env.HTL_ENGINE.getByName("live").fetch(new Request("https://engine/compute",{method:"POST",headers:{"Content-Type":"application/json"},body:request.body}));
        if(url.pathname==="/api/engine/optimizer"&&request.method==="PUT") return json({error:"Optimizer records are server-managed."},405,{Allow:"GET"});
        if(url.pathname==="/api/engine/ledger"&&request.method==="GET") return await env.HTL_ENGINE.getByName("live").fetch("https://engine/ledger");
        if(url.pathname==="/api/control/selectedPairs"&&request.method==="POST") return await env.HTL_ENGINE.getByName("live").fetch(new Request("https://engine/control/selectedPairs",{method:"POST",headers:{"Content-Type":"application/json"},body:request.body}));
        if(url.pathname==="/api/control/status"&&request.method==="GET") return await env.HTL_ENGINE.getByName("live").fetch("https://engine/control/status");
        if(url.pathname==="/api/evaluation/log"&&request.method==="POST") return await env.HTL_ENGINE.getByName("live").fetch(new Request("https://engine/evaluation/log",{method:"POST",headers:{"Content-Type":"application/json"},body:request.body}));
        if(url.pathname==="/api/oanda/order"&&request.method==="POST") return await handleManualOrder(request,env);
        if(url.pathname==="/api/oanda/proxy") return await handleProxy(request,env,url);
        if(url.pathname==="/api/oanda/candles"&&request.method==="GET") return await handleCandles(env,url);
        if(url.pathname==="/api/oanda/stream"&&request.method==="GET") return await handlePricingStream(env,url);
        if(url.pathname==="/api/engine/health"&&request.method==="GET") {
          if(!env.OANDA_ENGINE) return json({error:"OANDA engine binding is not configured."},503);
          const downstream=await env.OANDA_ENGINE.fetch(new Request("https://internal/api/health"));
          const payload=await downstream.json().catch(()=>({}));
          return json({...payload,engineReachable:downstream.ok},downstream.ok?200:502);
        }
        return json({error:"API route not found."},404);
      }
      return secureAsset(await env.ASSETS.fetch(request),url);
    } catch(error) {
      return json({error:error?.message||"Request failed.",details:error?.payload||undefined},Number(error?.status)||500);
    }
  },
  async scheduled(_event,env,ctx){ctx.waitUntil(env.HTL_ENGINE.getByName("live").fetch(new Request("https://engine/tick",{method:"POST"})));}
};