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

async function verifyFullAccountIdentity(env,state=gateState){
  const{token,configuredAccountId}=workerCredentials(env);
  const resolved=await resolveExactAccountAuthority({token,configuredAccountId,state});
  if(resolved.accountId!==configuredAccountId){const error=new Error("Resolved OANDA account does not exactly equal OANDA_ACCOUNT_ID.");error.status=401;error.code="ACCOUNT_IDENTITY_MISMATCH";error.stage="ACCOUNT_IDENTITY";throw error;}
  return resolved;
}

function authorityFailure(error){
  return new Response(JSON.stringify({error:String(error?.message||error),code:String(error?.code||"ACCOUNT_AUTHORITY_ERROR"),stage:String(error?.stage||"ACCOUNT_AUTHORITY"),retryable:false,accountAuthorityVersion:ACCOUNT_AUTHORITY_VERSION,exactAccountRequired:true}),{status:Number(error?.status)||401,headers:JSON_HEADERS});
}

export default{
  async fetch(request,env,ctx){
    const url=new URL(request.url);
    if(accountScopedPath(url.pathname)){
      try{await verifyFullAccountIdentity(env);}catch(error){return authorityFailure(error);}
    }
    return worker.fetch(request,env,ctx);
  },
  scheduled(event,env,ctx){return worker.scheduled(event,env,ctx);}
};

export const __workerExactAccountTest=Object.freeze({accountScopedPath,verifyFullAccountIdentity,workerCredentials});
