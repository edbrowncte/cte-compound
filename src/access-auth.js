const ACCESS_HEADER="cf-access-jwt-assertion";
const ACCESS_CLOCK_SKEW_SECONDS=30;
const ACCESS_JWKS_TTL_MS=5*60*1000;
const jwksCache=new Map();

function accessError(message,status=403,code="CF_ACCESS_DENIED"){
  return Object.assign(new Error(message),{status,code,stage:"CF_ACCESS"});
}

function base64UrlBytes(value){
  const normalized=String(value||"").replace(/-/g,"+").replace(/_/g,"/");
  const padded=normalized+"=".repeat((4-normalized.length%4)%4);
  const binary=atob(padded);
  return Uint8Array.from(binary,char=>char.charCodeAt(0));
}

function decodeJsonSegment(value){
  try{return JSON.parse(new TextDecoder().decode(base64UrlBytes(value)));}
  catch{throw accessError("Cloudflare Access JWT is malformed.",403,"CF_ACCESS_JWT_MALFORMED");}
}

function accessBindings(env={}){
  const values={
    productionAud:String(env.CF_ACCESS_PRODUCTION_AUD||"").trim(),
    productionJwks:String(env.CF_ACCESS_PRODUCTION_JWKS_URL||"").trim(),
    previewAud:String(env.CF_ACCESS_PREVIEW_AUD||"").trim(),
    previewJwks:String(env.CF_ACCESS_PREVIEW_JWKS_URL||"").trim(),
  };
  const configured=Object.values(values).filter(Boolean).length;
  if(!configured)return{enabled:false};
  if(configured!==4)throw accessError("Cloudflare Access bindings are partially configured; all production and preview AUD/JWKs values are required.",503,"CF_ACCESS_CONFIGURATION_INCOMPLETE");
  for(const key of ["productionJwks","previewJwks"]){
    let parsed;
    try{parsed=new URL(values[key]);}catch{throw accessError(`Cloudflare Access ${key} is not a valid URL.`,503,"CF_ACCESS_JWKS_URL_INVALID");}
    if(parsed.protocol!=="https:")throw accessError("Cloudflare Access JWKs URLs must use HTTPS.",503,"CF_ACCESS_JWKS_URL_INVALID");
  }
  return{enabled:true,...values};
}

function accessEnvironment(request,env){
  const bindings=accessBindings(env);
  if(!bindings.enabled)return{enabled:false,environment:"disabled"};
  const host=new URL(request.url).hostname.toLowerCase();
  const preview=host.includes("-cte-compound.")&&!host.startsWith("cte-compound.");
  const aud=preview?bindings.previewAud:bindings.productionAud;
  const jwksUrl=preview?bindings.previewJwks:bindings.productionJwks;
  const issuer=new URL(jwksUrl).origin;
  return{enabled:true,environment:preview?"preview":"production",aud,jwksUrl,issuer};
}

async function fetchJwks(url,force=false){
  const cached=jwksCache.get(url);
  if(!force&&cached&&cached.expires>Date.now())return cached.keys;
  const response=await fetch(url,{headers:{Accept:"application/json"},redirect:"follow",cache:"no-store"});
  if(!response.ok)throw accessError(`Cloudflare Access JWKs request failed with HTTP ${response.status}.`,502,"CF_ACCESS_JWKS_FETCH_FAILED");
  const payload=await response.json().catch(()=>null),keys=Array.isArray(payload?.keys)?payload.keys:[];
  if(!keys.length)throw accessError("Cloudflare Access JWKs response did not contain signing keys.",502,"CF_ACCESS_JWKS_INVALID");
  jwksCache.set(url,{keys,expires:Date.now()+ACCESS_JWKS_TTL_MS});
  return keys;
}

async function verifySignature(signingInput,signature,jwk){
  if(jwk?.kty!=="RSA")return false;
  const key=await crypto.subtle.importKey("jwk",jwk,{name:"RSASSA-PKCS1-v1_5",hash:"SHA-256"},false,["verify"]);
  return crypto.subtle.verify("RSASSA-PKCS1-v1_5",key,signature,new TextEncoder().encode(signingInput));
}

function validateClaims(payload,{aud,issuer},nowSeconds=Math.floor(Date.now()/1000)){
  const audiences=Array.isArray(payload?.aud)?payload.aud:[payload?.aud].filter(Boolean);
  if(!audiences.includes(aud))throw accessError("Cloudflare Access JWT audience does not match this CTE Compound environment.",403,"CF_ACCESS_AUD_MISMATCH");
  if(String(payload?.iss||"").replace(/\/$/,"")!==String(issuer).replace(/\/$/,""))throw accessError("Cloudflare Access JWT issuer is invalid.",403,"CF_ACCESS_ISSUER_MISMATCH");
  if(!Number.isFinite(Number(payload?.exp))||Number(payload.exp)<nowSeconds-ACCESS_CLOCK_SKEW_SECONDS)throw accessError("Cloudflare Access JWT has expired.",403,"CF_ACCESS_JWT_EXPIRED");
  if(Number.isFinite(Number(payload?.nbf))&&Number(payload.nbf)>nowSeconds+ACCESS_CLOCK_SKEW_SECONDS)throw accessError("Cloudflare Access JWT is not active yet.",403,"CF_ACCESS_JWT_NOT_ACTIVE");
  return payload;
}

async function verifyAccessJwt(token,configuration){
  const parts=String(token||"").split(".");
  if(parts.length!==3)throw accessError("Cloudflare Access JWT is missing or malformed.",403,"CF_ACCESS_JWT_MALFORMED");
  const header=decodeJsonSegment(parts[0]),payload=decodeJsonSegment(parts[1]);
  if(header?.alg!=="RS256"||!header?.kid)throw accessError("Cloudflare Access JWT signing metadata is invalid.",403,"CF_ACCESS_JWT_ALGORITHM");
  let keys=await fetchJwks(configuration.jwksUrl),jwk=keys.find(key=>key.kid===header.kid);
  if(!jwk){keys=await fetchJwks(configuration.jwksUrl,true);jwk=keys.find(key=>key.kid===header.kid);}
  if(!jwk)throw accessError("Cloudflare Access signing key was not found.",403,"CF_ACCESS_JWT_KEY_NOT_FOUND");
  const verified=await verifySignature(`${parts[0]}.${parts[1]}`,base64UrlBytes(parts[2]),jwk);
  if(!verified)throw accessError("Cloudflare Access JWT signature is invalid.",403,"CF_ACCESS_JWT_SIGNATURE");
  validateClaims(payload,configuration);
  return payload;
}

export async function requireCloudflareAccess(request,env){
  const configuration=accessEnvironment(request,env);
  if(!configuration.enabled)return{enabled:false,environment:"disabled",email:null,subject:null};
  const token=request.headers.get(ACCESS_HEADER);
  if(!token)throw accessError("Cloudflare Access JWT assertion is required.",403,"CF_ACCESS_JWT_MISSING");
  const payload=await verifyAccessJwt(token,configuration);
  return{enabled:true,environment:configuration.environment,email:typeof payload.email==="string"?payload.email:null,subject:typeof payload.sub==="string"?payload.sub:null,payload};
}

export const __accessTest=Object.freeze({ACCESS_HEADER,ACCESS_CLOCK_SKEW_SECONDS,accessBindings,accessEnvironment,validateClaims,verifyAccessJwt,clearCache:()=>jwksCache.clear()});
