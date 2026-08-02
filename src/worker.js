const LIVE_OANDA_ORIGIN = "https://api-fxtrade.oanda.com";

const INSTRUMENTS = new Set([
  "EUR_USD","GBP_USD","USD_JPY","USD_CAD","USD_CHF","AUD_USD","NZD_USD",
  "EUR_GBP","EUR_JPY","EUR_CHF","EUR_AUD","EUR_CAD","EUR_NZD",
  "GBP_JPY","GBP_CHF","GBP_AUD","GBP_CAD","GBP_NZD",
  "AUD_JPY","AUD_CHF","AUD_CAD","AUD_NZD",
  "NZD_JPY","NZD_CHF","NZD_CAD","CAD_JPY","CAD_CHF","CHF_JPY"
]);
const GRANULARITIES = new Set(["W","D","H4","H1","M30","M15","M5","M1","S30","S5"]);
const JSON_HEADERS = {"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store","X-Content-Type-Options":"nosniff"};

const json = (value,status=200,headers={}) => new Response(JSON.stringify(value),{status,headers:{...JSON_HEADERS,...headers}});

function credentials(env) {
  const token=String(env.OANDA_API_KEY||"").trim();
  const accountId=String(env.OANDA_ACCOUNT_ID||"").trim();
  if(token.length<20) throw Object.assign(new Error("OANDA_API_KEY is not configured."),{status:503});
  if(!/^[A-Za-z0-9-]{6,80}$/.test(accountId)) throw Object.assign(new Error("OANDA_ACCOUNT_ID is not configured."),{status:503});
  return {token,accountId};
}

function assertSameOrigin(request) {
  const url=new URL(request.url),origin=request.headers.get("Origin"),site=request.headers.get("Sec-Fetch-Site");
  if(origin&&origin!==url.origin) throw Object.assign(new Error("Cross-origin request rejected."),{status:403});
  if(site&&!['same-origin','same-site','none'].includes(site)) throw Object.assign(new Error("Cross-site request rejected."),{status:403});
}

async function oandaRequest(path,token,init={}) {
  const response=await fetch(LIVE_OANDA_ORIGIN+path,{
    method:init.method||"GET",
    headers:{Authorization:`Bearer ${token}`,Accept:"application/json",...(init.body?{"Content-Type":"application/json"}:{})},
    body:init.body,
    redirect:"manual",
    cache:"no-store"
  });
  const payload=await response.json().catch(()=>({}));
  if(!response.ok) throw Object.assign(new Error(payload.errorMessage||payload.errorCode||`OANDA HTTP ${response.status}`),{status:response.status,payload});
  return payload;
}

function normalizeCandles(payload) {
  return (payload.candles||[]).filter(c=>c.complete===true&&c.mid).map(c=>({
    time:c.time,open:Number(c.mid.o),high:Number(c.mid.h),low:Number(c.mid.l),close:Number(c.mid.c),volume:Number(c.volume||0),complete:true
  })).filter(c=>[c.open,c.high,c.low,c.close].every(Number.isFinite));
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
  const postRules=[new RegExp(`^/v3/accounts/${account}/orders$`)];
  const allowed=(method==="GET"?getRules:postRules).some(rule=>rule.test(path));
  if(!allowed) throw Object.assign(new Error("OANDA route is not permitted."),{status:403});
  if(path.includes("api-fxpractice")||path.includes("stream-fxpractice")) throw Object.assign(new Error("Practice endpoints are not available."),{status:403});
  return path;
}

function validateOrder(body) {
  const order=body?.order;
  if(!order||order.type!=="MARKET"||order.timeInForce!=="FOK"||order.positionFill!=="DEFAULT") throw Object.assign(new Error("Only live MARKET/FOK/DEFAULT orders are accepted."),{status:400});
  if(!INSTRUMENTS.has(order.instrument)||!Number.isFinite(Number(order.units))||Number(order.units)===0) throw Object.assign(new Error("Invalid instrument or units."),{status:400});
  return {order:{instrument:order.instrument,units:String(Math.trunc(Number(order.units))),type:"MARKET",timeInForce:"FOK",positionFill:"DEFAULT",clientExtensions:order.clientExtensions}};
}

async function handleConnect(env) {
  const {token,accountId}=credentials(env),payload=await oandaRequest(`/v3/accounts/${encodeURIComponent(accountId)}/summary`,token),account=payload.account||{};
  return json({account:{id:account.id||accountId,alias:account.alias||"",currency:account.currency||"",balance:account.balance||"0",NAV:account.NAV||"0",marginAvailable:account.marginAvailable||"0",marginUsed:account.marginUsed||"0",hedgingEnabled:Boolean(account.hedgingEnabled),openPositionCount:account.openPositionCount||0,lastTransactionID:payload.lastTransactionID||null},live:true});
}

async function handleProxy(request,env,url) {
  const {token,accountId}=credentials(env),method=request.method;
  if(!["GET","POST"].includes(method)) return json({error:"Method not allowed."},405,{Allow:"GET, POST"});
  const path=proxyPath(url.searchParams.get("path"),accountId,method);
  let body;
  if(method==="POST") body=JSON.stringify(validateOrder(await request.json()));
  return json(await oandaRequest(path,token,{method,body}));
}

async function handleCandles(env,url) {
  const {token}=credentials(env),instrument=(url.searchParams.get("instrument")||"").toUpperCase(),granularity=(url.searchParams.get("granularity")||"").toUpperCase();
  if(!INSTRUMENTS.has(instrument)||!GRANULARITIES.has(granularity)) return json({error:"Invalid instrument or granularity."},400);
  const count=Math.max(60,Math.min(1200,Math.trunc(Number(url.searchParams.get("count")))||650));
  const query=new URLSearchParams({price:"M",granularity,count:String(count),smooth:"false"});
  return json({instrument,granularity,candles:normalizeCandles(await oandaRequest(`/v3/instruments/${instrument}/candles?${query}`,token)),completedOnly:true});
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
        if(url.pathname==="/api/oanda/connect"&&request.method==="GET") return handleConnect(env);
        if(url.pathname==="/api/oanda/proxy") return handleProxy(request,env,url);
        if(url.pathname==="/api/oanda/candles"&&request.method==="GET") return handleCandles(env,url);
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
  }
};
