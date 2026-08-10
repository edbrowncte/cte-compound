import {execFileSync,spawnSync} from "node:child_process";
import {fileURLToPath} from "node:url";

const RELEASE_CONTRACT="CTE_COMPOUND_CURRENT_RELEASE@2.0.0";
const required={
  GITHUB_ACTIONS:"true",
  GITHUB_REF:"refs/heads/main",
  CTE_PRODUCTION_DEPLOY_AUTHORITY:"GITHUB_MAIN_ONLY",
};

for(const [name,expected] of Object.entries(required)){
  if(process.env[name]!==expected)throw new Error(`Production deployment rejected: ${name} must equal ${expected}.`);
}
const sha=String(process.env.GITHUB_SHA||"").trim();
if(!/^[0-9a-f]{40}$/i.test(sha))throw new Error("Production deployment rejected: GITHUB_SHA is missing or invalid.");
const cwd=new URL("..",import.meta.url),head=execFileSync("git",["rev-parse","HEAD"],{cwd,encoding:"utf8"}).trim();
if(head!==sha)throw new Error(`Production deployment rejected: checked-out HEAD ${head} does not equal authorized main SHA ${sha}.`);
const dirty=execFileSync("git",["status","--porcelain"],{cwd,encoding:"utf8"}).trim();
if(dirty)throw new Error("Production deployment rejected: working tree is not clean.");
for(const name of ["CLOUDFLARE_API_TOKEN","CLOUDFLARE_ACCOUNT_ID"]){
  if(!String(process.env[name]||"").trim())throw new Error(`Production deployment rejected: ${name} is unavailable.`);
}
const executable=fileURLToPath(new URL(process.platform==="win32"?"../node_modules/.bin/wrangler.cmd":"../node_modules/.bin/wrangler",import.meta.url)),args=["deploy","--message",`cte-compound main ${sha}`,"--var",`CTE_RELEASE_SHA:${sha}`,"--var",`CTE_RELEASE_CONTRACT:${RELEASE_CONTRACT}`,"--var","CTE_RELEASE_ENFORCEMENT:ENFORCE_CURRENT_RELEASE"];
const result=spawnSync(executable,args,{cwd,stdio:"inherit",env:process.env});
if(result.error)throw result.error;
if(result.status!==0)throw new Error(`Wrangler deployment failed with exit code ${result.status}.`);
