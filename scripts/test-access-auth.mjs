import assert from "node:assert/strict";
import {__accessTest,requireCloudflareAccess} from "../src/access-auth.js";

const encode=value=>Buffer.from(typeof value==="string"?value:JSON.stringify(value)).toString("base64url");
const keys=await crypto.subtle.generateKey({name:"RSASSA-PKCS1-v1_5",modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:"SHA-256"},true,["sign","verify"]);
const publicJwk=await crypto.subtle.exportKey("jwk",keys.publicKey);Object.assign(publicJwk,{kid:"cte-access-test",alg:"RS256",use:"sig"});
const issuer="https://cte-test.cloudflareaccess.com",prodAud="prod-audience",previewAud="preview-audience",prodJwks=`${issuer}/cdn-cgi/access/certs`,previewJwks=`${issuer}/cdn-cgi/access/preview-certs`;
const env={CF_ACCESS_PRODUCTION_AUD:prodAud,CF_ACCESS_PRODUCTION_JWKS_URL:prodJwks,CF_ACCESS_PREVIEW_AUD:previewAud,CF_ACCESS_PREVIEW_JWKS_URL:previewJwks};
const jwt=async aud=>{const header=encode({alg:"RS256",typ:"JWT",kid:publicJwk.kid}),payload=encode({iss:issuer,aud:[aud],email:"owner@example.com",sub:"owner",iat:Math.floor(Date.now()/1000)-5,exp:Math.floor(Date.now()/1000)+300}),input=`${header}.${payload}`,signature=await crypto.subtle.sign("RSASSA-PKCS1-v1_5",keys.privateKey,new TextEncoder().encode(input));return`${input}.${Buffer.from(signature).toString("base64url")}`;};
const originalFetch=globalThis.fetch;globalThis.fetch=async url=>{if(String(url)!==prodJwks&&String(url)!==previewJwks)throw new Error(`Unexpected JWK request ${url}`);return new Response(JSON.stringify({keys:[publicJwk]}),{status:200,headers:{"Content-Type":"application/json"}});};

try{
  __accessTest.clearCache();
  const prodToken=await jwt(prodAud),previewToken=await jwt(previewAud);
  const prod=await requireCloudflareAccess(new Request("https://cte-compound.thetestamony.workers.dev/api/engine/status",{headers:{"Cf-Access-Jwt-Assertion":prodToken}}),env);
  assert.equal(prod.enabled,true);assert.equal(prod.environment,"production");assert.equal(prod.email,"owner@example.com");
  const preview=await requireCloudflareAccess(new Request("https://abc123-cte-compound.thetestamony.workers.dev/",{headers:{"Cf-Access-Jwt-Assertion":previewToken}}),env);
  assert.equal(preview.environment,"preview");assert.equal(preview.subject,"owner");
  await assert.rejects(()=>requireCloudflareAccess(new Request("https://abc123-cte-compound.thetestamony.workers.dev/",{headers:{"Cf-Access-Jwt-Assertion":prodToken}}),env),error=>error.code==="CF_ACCESS_AUD_MISMATCH");
  await assert.rejects(()=>requireCloudflareAccess(new Request("https://cte-compound.thetestamony.workers.dev/"),env),error=>error.code==="CF_ACCESS_JWT_MISSING");
  await assert.rejects(()=>requireCloudflareAccess(new Request("https://cte-compound.thetestamony.workers.dev/"),{CF_ACCESS_PRODUCTION_AUD:prodAud}),error=>error.code==="CF_ACCESS_CONFIGURATION_INCOMPLETE");
  const disabled=await requireCloudflareAccess(new Request("https://localhost/"),{});assert.equal(disabled.enabled,false);
  assert.equal(__accessTest.ACCESS_HEADER,"cf-access-jwt-assertion");
  console.log("Cloudflare Access JWT signature, issuer, environment-specific AUD, missing-token, partial-config, and local-disabled behavior verified.");
}finally{globalThis.fetch=originalFetch;__accessTest.clearCache();}
