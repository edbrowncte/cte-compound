import worker from "./worker.js";
export { HtlEngine } from "./worker.js";
import { ACCOUNT_AUTHORITY_VERSION, resolveExactAccountAuthority } from "./account-authority.js";

const gateState={};
const JSON_HEADERS={"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store","X-Content-Type-Options":"nosniff"};

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

async function verifyFullAccountIdentity(env,state=gateState){
  const{token,configuredAccountId}=workerCredentials(env);
  const resolved=await resolveExactAccountAuthority({token,configuredAccountId,state});
  if(resolved.accountId!==configuredAccountId){const error=new Error("Resolved OANDA account does not exactly equal OANDA_ACCOUNT_ID.");error.status=401;error.code="ACCOUNT_IDENTITY_MISMATCH";error.stage="ACCOUNT_IDENTITY";throw error;}
  return resolved;
}

function authoritySnapshot(error){return{ok:false,stage:String(error?.stage||"ACCOUNT_AUTHORITY"),code:String(error?.code||"ACCOUNT_AUTHORITY_ERROR"),status:Number(error?.status)||401,retryable:false,error:String(error?.message||error),accountAuthorityVersion:ACCOUNT_AUTHORITY_VERSION,exactAccountRequired:true};}
function authorityFailure(error){return new Response(JSON.stringify(authoritySnapshot(error)),{status:Number(error?.status)||401,headers:JSON_HEADERS});}

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
    if(accountScopedPath(url.pathname)){
      try{await verifyFullAccountIdentity(env);}catch(error){return authorityFailure(error);}
    }
    return worker.fetch(request,env,ctx);
  },
  scheduled(event,env,ctx){return worker.scheduled(event,env,ctx);}
};

export const __workerExactAccountTest=Object.freeze({accountScopedPath,diagnosticPath,verifyFullAccountIdentity,workerCredentials,authoritySnapshot});
