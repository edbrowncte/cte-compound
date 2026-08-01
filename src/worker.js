const LIVE_OANDA_ORIGIN = "https://api-fxtrade.oanda.com";

const INSTRUMENTS = new Set([
  "EUR_USD","GBP_USD","USD_JPY","USD_CAD","USD_CHF","AUD_USD","NZD_USD",
  "EUR_GBP","EUR_JPY","EUR_CHF","EUR_AUD","EUR_CAD","EUR_NZD",
  "GBP_JPY","GBP_CHF","GBP_AUD","GBP_CAD","GBP_NZD",
  "AUD_JPY","AUD_CHF","AUD_CAD","AUD_NZD",
  "NZD_JPY","NZD_CHF","NZD_CAD","CAD_JPY","CAD_CHF","CHF_JPY"
]);

const GRANULARITIES = new Set(["W","D","H4","H1","M30","M15","M5","M1","S30","S5"]);

const JSON_HEADERS = Object.freeze({
  "Content-Type":"application/json; charset=utf-8",
  "Cache-Control":"no-store, max-age=0",
  "Pragma":"no-cache",
  "X-Content-Type-Options":"nosniff",
  "Referrer-Policy":"no-referrer"
});

function json(payload,status=200,extraHeaders={}) {
  return new Response(JSON.stringify(payload),{status,headers:{...JSON_HEADERS,...extraHeaders}});
}

function assertSameOrigin(request) {
  const url=new URL(request.url);
  const origin=request.headers.get("Origin");
  if (origin && origin!==url.origin) throw Object.assign(new Error("Cross-origin requests are not allowed."),{status:403});
  const site=request.headers.get("Sec-Fetch-Site");
  if (site && !["same-origin","same-site","none"].includes(site)) throw Object.assign(new Error("Cross-site requests are not allowed."),{status:403});
}

function credentials(env) {
  const token=String(env.OANDA_API_KEY||"").trim();
  const accountId=String(env.OANDA_ACCOUNT_ID||"").trim();
  if (token.length<20) throw Object.assign(new Error("OANDA_API_KEY is not configured."),{status:503,code:"OANDA_API_KEY_MISSING"});
  if (!/^[A-Za-z0-9-]{6,80}$/.test(accountId)) throw Object.assign(new Error("OANDA_ACCOUNT_ID is not configured."),{status:503,code:"OANDA_ACCOUNT_ID_MISSING"});
  return {token,accountId};
}

function safeDiagnosticMessage(value) {
  return String(value||"")
    .replace(/https?:\/\/\S+/gi,"[url]")
    .replace(/Bearer\s+\S+/gi,"Bearer [redacted]")
    .replace(/\b\d{3}-\d{3}-\d{6,}-\d{3}\b/g,"[account]")
    .replace(/[A-Za-z0-9_-]{32,}/g,"[redacted]")
    .slice(0,180);
}

async function oandaFetch(path,token) {
  const startedAt=Date.now();
  let response;
  try {
    response=await fetch(LIVE_OANDA_ORIGIN+path,{
      method:"GET",
      headers:{"Authorization":"Bearer "+token,"Accept":"application/json"},
      redirect:"manual",
      signal:AbortSignal.timeout(15000)
    });
  } catch (error) {
    const timeout=error?.name==="TimeoutError"||error?.name==="AbortError";
    throw Object.assign(
      new Error(timeout?"OANDA request timed out.":"OANDA network request failed."),
      {
        status:timeout?504:502,
        code:timeout?"OANDA_UPSTREAM_TIMEOUT":"OANDA_NETWORK_FAILURE",
        diagnostic:{
          phase:"fetch",
          durationMs:Date.now()-startedAt,
          exceptionName:String(error?.name||"Error").slice(0,80),
          exceptionMessage:safeDiagnosticMessage(error?.message)
        }
      }
    );
  }
  if (response.status>=300 && response.status<400) {
    throw Object.assign(new Error("OANDA returned an unexpected redirect."),{
      status:502,
      code:"OANDA_UNEXPECTED_REDIRECT",
      diagnostic:{phase:"response",durationMs:Date.now()-startedAt,upstreamStatus:response.status}
    });
  }
  const payload=await response.json().catch(()=>({}));
  if (!response.ok) {
    const code=response.status===400
      ?"OANDA_BAD_REQUEST"
      :response.status===401
        ?"OANDA_AUTHORIZATION_FAILED"
        :response.status===403
          ?"OANDA_ACCESS_FORBIDDEN"
          :response.status===404
            ?"OANDA_ACCOUNT_OR_RESOURCE_NOT_FOUND"
            :response.status===405
              ?"OANDA_METHOD_REJECTED"
              :response.status===429
                ?"OANDA_RATE_LIMITED"
                :"OANDA_UPSTREAM_REJECTED";
    const status=response.status===401?401:502;
    const upstreamErrorCode=safeDiagnosticMessage(payload.errorCode||"");
    const message=payload.errorMessage||payload.errorCode||"OANDA request failed ("+response.status+").";
    throw Object.assign(new Error(message),{
      status,
      code,
      diagnostic:{
        phase:"response",
        durationMs:Date.now()-startedAt,
        upstreamStatus:response.status,
        upstreamErrorCode
      }
    });
  }
  return payload;
}

function normalizeCandles(payload) {
  return (payload.candles||[])
    .filter(candle=>candle.complete===true && candle.mid)
    .map(candle=>({
      time:candle.time,
      open:Number(candle.mid.o),
      high:Number(candle.mid.h),
      low:Number(candle.mid.l),
      close:Number(candle.mid.c),
      volume:Number(candle.volume||0),
      complete:true
    }))
    .filter(candle=>[candle.open,candle.high,candle.low,candle.close].every(Number.isFinite));
}

function boundedCount(value,fallback,max) {
  const parsed=Math.trunc(Number(value));
  return Number.isFinite(parsed)?Math.max(60,Math.min(max,parsed)):fallback;
}

async function candlesFor(instrument,granularity,count,token) {
  const query=new URLSearchParams({price:"M",granularity,count:String(count),smooth:"false"});
  const payload=await oandaFetch(`/v3/instruments/${instrument}/candles?${query.toString()}`,token);
  return normalizeCandles(payload);
}

async function mapLimit(items,limit,worker) {
  const output=new Array(items.length);
  let cursor=0;
  const runners=Array.from({length:Math.min(limit,items.length)},async()=>{
    while (cursor<items.length) {
      const index=cursor++;
      output[index]=await worker(items[index],index);
    }
  });
  await Promise.all(runners);
  return output;
}

async function handleConnect(env) {
  const {token,accountId}=credentials(env);
  const payload=await oandaFetch(`/v3/accounts/${encodeURIComponent(accountId)}/summary`,token);
  const account=payload.account||{};
  return json({account:{
    id:account.id||accountId,
    alias:account.alias||"",
    currency:account.currency||"",
    balance:account.balance||"0",
    NAV:account.NAV||"0",
    marginAvailable:account.marginAvailable||"0",
    openPositionCount:account.openPositionCount||0,
    openTradeCount:account.openTradeCount||0,
    pendingOrderCount:account.pendingOrderCount||0,
    lastTransactionID:payload.lastTransactionID||null
  }});
}

async function handleCandles(env,url) {
  const {token}=credentials(env);
  const instrument=(url.searchParams.get("instrument")||"").toUpperCase();
  const granularity=(url.searchParams.get("granularity")||"").toUpperCase();
  if (!INSTRUMENTS.has(instrument)) return json({error:"Instrument is not allowed."},400);
  if (!GRANULARITIES.has(granularity)) return json({error:"Granularity is not allowed."},400);
  const count=boundedCount(url.searchParams.get("count"),650,1200);
  const candles=await candlesFor(instrument,granularity,count,token);
  return json({instrument,granularity,candles,completedOnly:true});
}

async function handleSchedule(env,url) {
  const {token}=credentials(env);
  const granularity=(url.searchParams.get("granularity")||"").toUpperCase();
  if (!GRANULARITIES.has(granularity)) return json({error:"Granularity is not allowed."},400);
  const count=boundedCount(url.searchParams.get("count"),180,300);
  const list=[...INSTRUMENTS];
  const results=await mapLimit(list,7,async instrument=>{
    try { return {instrument,candles:await candlesFor(instrument,granularity,count,token)}; }
    catch (error) { return {instrument,error:error.message||"OANDA request failed."}; }
  });
  return json({granularity,count,results,completedOnly:true});
}

function secureAssetResponse(response,url) {
  const headers=new Headers(response.headers);
  headers.set("X-Content-Type-Options","nosniff");
  headers.set("Referrer-Policy","no-referrer");
  headers.set("Permissions-Policy","camera=(), microphone=(), geolocation=(), payment=(), usb=()");
  headers.set("Cross-Origin-Opener-Policy","same-origin");
  headers.set("Cross-Origin-Resource-Policy","same-origin");
  headers.set("Content-Security-Policy","default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; font-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
  if (url.pathname==="/"||url.pathname.endsWith(".html")) headers.set("Cache-Control","no-store, max-age=0");
  return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
}

export default {
  async fetch(request,env) {
    const url=new URL(request.url);
    const diagnosticId=crypto.randomUUID();
    try {
      if (url.pathname.startsWith("/api/")) {
        assertSameOrigin(request);
        if (request.method!=="GET") return json({error:"Method not allowed."},405,{"Allow":"GET"});
        if (url.pathname==="/api/engine/health") {
          if (!env.OANDA_ENGINE) return json({error:"OANDA engine service binding is not configured."},503);
          const downstream=await env.OANDA_ENGINE.fetch(new Request("https://internal/api/health",{method:"GET"}));
          const payload=await downstream.json().catch(()=>({}));
          if (!downstream.ok) return json({error:"OANDA engine health check failed.",status:downstream.status},502);
          return json({...payload,engine:"oanda-28pair-strategy",engineReachable:true});
        }
        if (url.pathname==="/api/oanda/connect") return await handleConnect(env);
        if (url.pathname==="/api/oanda/candles") return await handleCandles(env,url);
        if (url.pathname==="/api/oanda/schedule") return await handleSchedule(env,url);
        return json({error:"API route not found."},404);
      }
      const response=await env.ASSETS.fetch(request);
      return secureAssetResponse(response,url);
    } catch (error) {
      const status=Number(error?.status)||500;
      const errorCode=String(error?.code||(
        status===504?"OANDA_UPSTREAM_TIMEOUT":
        status===503?"OANDA_CONFIGURATION_ERROR":
        status===502?"OANDA_UPSTREAM_FAILURE":
        "REQUEST_FAILED"
      ));
      const diagnostic=error?.diagnostic||{};
      console.error(JSON.stringify({
        event:"oanda_request_failure",
        diagnosticId,
        route:url.pathname,
        status,
        errorCode,
        phase:diagnostic.phase||"handler",
        durationMs:Number.isFinite(diagnostic.durationMs)?diagnostic.durationMs:null,
        upstreamStatus:Number.isFinite(diagnostic.upstreamStatus)?diagnostic.upstreamStatus:null,
        upstreamErrorCode:diagnostic.upstreamErrorCode||null,
        exceptionName:diagnostic.exceptionName||null,
        exceptionMessage:safeDiagnosticMessage(diagnostic.exceptionMessage)
      }));
      const upstreamStatus=Number.isFinite(diagnostic.upstreamStatus)?diagnostic.upstreamStatus:null;
      const upstreamErrorCode=diagnostic.upstreamErrorCode||null;
      const publicDetail=upstreamStatus
        ?` · OANDA HTTP ${upstreamStatus}${upstreamErrorCode?` · ${upstreamErrorCode}`:""}`
        :"";
      const message=status>=500
        ?"The analytical compound could not complete the upstream request."+publicDetail
        :error.message||"Request failed.";
      return json({error:message,errorCode,diagnosticId,upstreamStatus,upstreamErrorCode},status);
    }
  }
};
