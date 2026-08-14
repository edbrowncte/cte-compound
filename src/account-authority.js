export const ACCOUNT_AUTHORITY_VERSION="EXACT_OANDA_ACCOUNT_AUTHORITY@1.0.0";
export const ACCOUNT_AUTHORITY_TTL_MS=60*60*1000;
const API="https://api-fxtrade.oanda.com";

function accountIsMt4(item={}){
  const tags=Array.isArray(item.tags)?item.tags.map(tag=>String(tag).toUpperCase()):[];
  const properties=String(JSON.stringify(item.properties||{})).toUpperCase();
  const id=String(item.id||"").toUpperCase();
  return id.includes("MT4")||tags.some(tag=>tag.includes("MT4"))||properties.includes("MT4");
}
function suffix(id){const value=String(id||"");return value?value.split("-").at(-1)||null:null;}
function authorityError(message,{code="ACCOUNT_AUTHORITY_ERROR",stage="ACCOUNT_AUTHORITY",status=null,path=null,cause=null,details=null}={}){
  const error=new Error(message);error.code=code;error.stage=stage;if(status!==null)error.status=status;if(path)error.path=path;if(cause)error.cause=cause;if(details)error.details=details;return error;
}

export async function oandaAuthorityRequest(path,token,init={}){
  const timeoutMs=Math.max(1000,Number(init.timeoutMs)||15000),controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs);
  try{
    const response=await fetch(API+path,{method:init.method||"GET",headers:{Authorization:`Bearer ${token}`,Accept:"application/json",...(init.body?{"Content-Type":"application/json"}:{})},body:init.body,redirect:"manual",cache:"no-store",signal:controller.signal});
    const payload=await response.json().catch(()=>({}));
    if(!response.ok){
      const brokerMessage=payload?.errorMessage||payload?.errorCode||`HTTP ${response.status}`;
      throw authorityError(`OANDA ${response.status} at ${path}: ${brokerMessage}`,{code:payload?.errorCode||`OANDA_HTTP_${response.status}`,stage:"OANDA_ACCOUNT_AUTHORITY",status:response.status,path,details:{brokerMessage}});
    }
    return payload;
  }catch(error){
    if(controller.signal.aborted)throw authorityError(`OANDA timeout at ${path} after ${timeoutMs} ms`,{code:"OANDA_TIMEOUT",stage:"OANDA_ACCOUNT_AUTHORITY",status:504,path,cause:error});
    if(error?.stage)throw error;
    throw authorityError(`OANDA transport failure at ${path}: ${String(error?.message||error)}`,{code:"OANDA_TRANSPORT_FAILURE",stage:"OANDA_ACCOUNT_AUTHORITY",path,cause:error});
  }finally{clearTimeout(timer);}
}

export function cachedAccountAuthority(state={},configuredAccountId,now=Date.now()){
  const authority=state?.accountAuthority;if(!authority||authority.version!==ACCOUNT_AUTHORITY_VERSION)return null;
  if(String(authority.configuredAccountId||"")!==String(configuredAccountId||""))return null;
  if(String(authority.accountId||"")!==String(configuredAccountId||""))return null;
  if(Number(authority.expiresAt||0)<=now)return null;
  return authority;
}

export async function resolveExactAccountAuthority({token,configuredAccountId,state={},writeLedger=null,now=Date.now(),force=false}={}){
  const configured=String(configuredAccountId||"").trim();if(!token||!configured)throw authorityError("OANDA account authority cannot be resolved without configured credentials",{code:"ACCOUNT_CREDENTIALS_UNAVAILABLE"});
  if(!force){const cached=cachedAccountAuthority(state,configured,now);if(cached){state.resolvedAccountId=configured;return{token,accountId:configured,cached:true,authority:cached};}}

  const listPath="/v3/accounts",list=await oandaAuthorityRequest(listPath,token),accounts=Array.isArray(list?.accounts)?list.accounts:[],exact=accounts.find(item=>String(item?.id||"")===configured);
  if(!exact){
    throw authorityError(`Configured OANDA account ${configured} is not present in the token-authorized account list`,{code:"ACCOUNT_IDENTITY_MISMATCH",stage:"ACCOUNT_IDENTITY",path:listPath,details:{configuredSuffix:suffix(configured),authorizedSuffixes:accounts.map(item=>suffix(item?.id)).filter(Boolean)}});
  }
  if(accountIsMt4(exact))throw authorityError(`Configured OANDA account ${configured} is MT4-linked and cannot be used by the v20 execution engine`,{code:"ACCOUNT_MT4_BLOCKED",stage:"ACCOUNT_IDENTITY",path:listPath});

  const summaryPath=`/v3/accounts/${encodeURIComponent(configured)}/summary`,summary=await oandaAuthorityRequest(summaryPath,token),account=summary?.account;
  if(!account)throw authorityError(`OANDA account summary missing for configured account ${configured}`,{code:"ACCOUNT_SUMMARY_MISSING",stage:"ACCOUNT_SUMMARY",path:summaryPath});
  if(account.state!==undefined&&account.state!=="OPEN")throw authorityError(`Configured OANDA account ${configured} is not OPEN`,{code:"ACCOUNT_NOT_OPEN",stage:"ACCOUNT_SUMMARY",path:summaryPath,details:{state:account.state}});

  const verifiedAt=new Date(now).toISOString(),authority={version:ACCOUNT_AUTHORITY_VERSION,source:"EXACT_CONFIGURED_ACCOUNT",configuredAccountId:configured,accountId:configured,verifiedAt,expiresAt:now+ACCOUNT_AUTHORITY_TTL_MS,configuredSuffix:suffix(configured),accountSuffix:suffix(configured)};
  const changed=state.resolvedAccountId!==configured||state?.accountAuthority?.accountId!==configured||state?.accountAuthority?.version!==ACCOUNT_AUTHORITY_VERSION;
  state.resolvedAccountId=configured;state.accountAuthority=authority;
  if(changed&&writeLedger)await writeLedger({type:"ACCOUNT_AUTHORITY_VERIFIED",accountAuthorityVersion:ACCOUNT_AUTHORITY_VERSION,accountSuffix:authority.accountSuffix,message:`Exact configured OANDA account authority verified · ••••${authority.accountSuffix}`});
  return{token,accountId:configured,cached:false,authority,summary:account};
}

export function accountAuthorityBackoff(error,state={},now=Date.now()){
  const code=String(error?.code||""),status=Number(error?.status||0),hard=code.startsWith("ACCOUNT_")||status===401||status===403;
  if(hard){const prior=state.accountResolveError||{count:0},count=Number(prior.count||0)+1,minutes=[2,4,8,15,30][Math.min(count-1,4)];state.accountResolveError={lastErrorAt:new Date(now).toISOString(),count,message:String(error?.message||error),code,stage:error?.stage||null,path:error?.path||null};state.backoffUntil=now+minutes*60*1000;return{hard:true,delayMs:minutes*60*1000,label:`${minutes} minutes`};}
  const prior=state.accountTransportError||{count:0},count=Number(prior.count||0)+1,seconds=[5,10,15,30,60][Math.min(count-1,4)];state.accountTransportError={lastErrorAt:new Date(now).toISOString(),count,message:String(error?.message||error),code,stage:error?.stage||null,path:error?.path||null};state.backoffUntil=now+seconds*1000;return{hard:false,delayMs:seconds*1000,label:`${seconds} seconds`};
}

export function clearAccountAuthorityBackoff(state={}){delete state.accountResolveError;delete state.accountTransportError;delete state.backoffUntil;delete state.lastBackoffLogged;}

export const __accountAuthorityTest=Object.freeze({accountIsMt4,suffix,authorityError});
