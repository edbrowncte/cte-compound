import worker from "./worker.js";
export { HtlEngine } from "./worker.js";
import { ACCOUNT_AUTHORITY_VERSION, resolveExactAccountAuthority } from "./account-authority.js";
import { requireCloudflareAccess } from "./access-auth.js";

const gateState={};
const JSON_HEADERS={"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store","X-Content-Type-Options":"nosniff"};
const LIVE_OANDA_STREAM_ORIGIN="https://stream-fxtrade.oanda.com";

function workerCredentials(env={}){
  const token=String(env.OANDA_API_KEY||"").trim(),configuredAccountId=String(env.OANDA_ACCOUNT_ID||"").trim();
  if(token.length<20){const error=new Error("OANDA_API_KEY is not configured.");error.status=503;error.code="OANDA_API_KEY_MISSING";error.stage="CREDENTIALS";throw error;}
  if(!configuredAccountId){const error=new Error("OANDA_ACCOUNT_ID is not configured.");error.status=503;error.code="OANDA_ACCOUNT_ID_MISSING";error.stage="CREDENTIALS";throw error;}
  return{token,configuredAccountId};
}

function accountScopedPath(pathname=""){
  return String(pathname).startsWith("/api/oanda/");
}
function diagnosticPath(pathname=""){
  return String(pathname)==="/api/platform/diagnostic";
}
function transactionStreamPath(pathname=""){
  return String(pathname)==="/api/oanda/transactions/stream";
}
function assertSameOrigin(request){
  const url=new URL(request.url),origin=request.headers.get("Origin"),site=request.headers.get("Sec-Fetch-Site");
  if(origin&&origin!==url.origin)throw Object.assign(new Error("Cross-origin request rejected."),{status:403,code:"CROSS_ORIGIN_REJECTED",stage:"REQUEST_ORIGIN"});
  if(!origin&&!site)throw Object.assign(new Error("Browser-origin request required."),{status:403,code:"BROWSER_ORIGIN_REQUIRED",stage:"REQUEST_ORIGIN"});
  if(site&&!['same-origin','same-site','none'].includes(site))throw Object.assign(new Error("Cross-site request rejected."),{status:403,code:"CROSS_SITE_REJECTED",stage:"REQUEST_ORIGIN"});
}

async function verifyFullAccountIdentity(env,state=gateState){
  const{token,configuredAccountId}=workerCredentials(env);
  const resolved=await resolveExactAccountAuthority({token,configuredAccountId,state});
  if(resolved.accountId!==configuredAccountId){const error=new Error("Resolved OANDA account does not exactly equal OANDA_ACCOUNT_ID.");error.status=401;error.code="ACCOUNT_IDENTITY_MISMATCH";error.stage="ACCOUNT_IDENTITY";throw error;}
  return resolved;
}

function authoritySnapshot(error){return{ok:false,stage:String(error?.stage||"ACCOUNT_AUTHORITY"),code:String(error?.code||"ACCOUNT_AUTHORITY_ERROR"),status:Number(error?.status)||401,retryable:false,error:String(error?.message||error),accountAuthorityVersion:ACCOUNT_AUTHORITY_VERSION,exactAccountRequired:true};}
function authorityFailure(error){return new Response(JSON.stringify(authoritySnapshot(error)),{status:Number(error?.status)||401,headers:JSON_HEADERS});}
function streamFailure(error){const status=Number(error?.status)||502;return new Response(JSON.stringify({error:String(error?.message||error),code:String(error?.code||"OANDA_TRANSACTION_STREAM_FAILURE"),stage:String(error?.stage||"OANDA_TRANSACTION_STREAM"),status,accountAuthorityVersion:ACCOUNT_AUTHORITY_VERSION,exactAccountRequired:true}),{status,headers:JSON_HEADERS});}

async function handleTransactionStream(request,env){
  if(request.method!=="GET")return new Response(JSON.stringify({error:"Method not allowed."}),{status:405,headers:{...JSON_HEADERS,Allow:"GET"}});
  try{
    await requireCloudflareAccess(request,env);assertSameOrigin(request);
    const{token}=workerCredentials(env),{accountId}=await verifyFullAccountIdentity(env);
    const upstream=await fetch(`${LIVE_OANDA_STREAM_ORIGIN}/v3/accounts/${encodeURIComponent(accountId)}/transactions/stream`,{method:"GET",headers:{Authorization:`Bearer ${token}`,Accept:"application/octet-stream"},redirect:"manual",cache:"no-store"});
    if(!upstream.ok){const payload=await upstream.json().catch(()=>({})),error=Object.assign(new Error(payload.errorMessage||payload.errorCode||`OANDA HTTP ${upstream.status}`),{status:upstream.status,code:payload.errorCode||`OANDA_HTTP_${upstream.status}`,stage:"OANDA_TRANSACTION_STREAM"});return streamFailure(error);}
    return new Response(upstream.body,{status:200,headers:{"Content-Type":"application/octet-stream","Cache-Control":"no-store","X-Content-Type-Options":"nosniff","X-CTE-Account-Stream":"OANDA_TRANSACTION_STREAM@1.0.0"}});
  }catch(error){return streamFailure(error);}
}

async function exactDiagnostic(request,env,ctx){
  const base=await worker.fetch(request,env,ctx),headers=new Headers(base.headers);headers.delete("Content-Length");headers.set("Cache-Control","no-store");
  let payload;try{payload=await base.json();}catch{return base;}
  payload.checks=payload.checks||{};
  try{
    const resolved=await verifyFullAccountIdentity(env),suffix=String(resolved.accountId||"").split("-").at(-1)||null;
    payload.checks.exactAccountAuthority={ok:true,stage:"EXACT_ACCOUNT_AUTHORITY",latencyMs:0,value:{verified:true,configuredMatchesResolved:true,configuredSuffix:suffix,resolvedSuffix:suffix,accountAuthorityVersion:ACCOUNT_AUTHORITY_VERSION,exactAccountRequired:true}};
    if(payload.oanda)payload.oanda.intendedAccountVisible=true;
  }catch(error){
    const failure=authoritySnapshot(error);payload.checks.exactAccountAuthority=failure;payload.verdict="FAIL";payload.effectiveVerdict="FAIL";payload.failure={stage:failure.stage,code:failure.code,error:failure.error,status:failure.status,retryable:false,diagnosticId:null};if(payload.oanda)payload.oanda.intendedAccountVisible=false;
  }
  return new Response(JSON.stringify(payload),{status:base.status,statusText:base.statusText,headers});
}

export default{
  async fetch(request,env,ctx){
    const url=new URL(request.url);
    if(diagnosticPath(url.pathname))return exactDiagnostic(request,env,ctx);
    if(transactionStreamPath(url.pathname))return handleTransactionStream(request,env);
    if(accountScopedPath(url.pathname)){
      try{await verifyFullAccountIdentity(env);}catch(error){return authorityFailure(error);}
    }
    return worker.fetch(request,env,ctx);
  },
  scheduled(event,env,ctx){return worker.scheduled(event,env,ctx);}
};

export const __workerExactAccountTest=Object.freeze({accountScopedPath,diagnosticPath,transactionStreamPath,assertSameOrigin,verifyFullAccountIdentity,workerCredentials,authoritySnapshot});
