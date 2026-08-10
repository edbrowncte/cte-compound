import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import worker from "../src/worker.js";

const workflow=await readFile(new URL("../.github/workflows/deploy.yml",import.meta.url),"utf8");
const deploy=await readFile(new URL("./deploy-current-main.mjs",import.meta.url),"utf8");
const pkg=JSON.parse(await readFile(new URL("../package.json",import.meta.url),"utf8"));
const wrangler=await readFile(new URL("../wrangler.toml",import.meta.url),"utf8");
const workerSource=await readFile(new URL("../src/worker-base.js",import.meta.url),"utf8");

assert.equal(pkg.scripts.deploy,"node scripts/deploy-current-main.mjs");
assert.match(workflow,/github\.ref == 'refs\/heads\/main'/);
assert.match(workflow,/ref: main/);
assert.match(workflow,/fetch-depth: 0/);
assert.match(workflow,/npm ci/);
assert.match(workflow,/CTE_PRODUCTION_DEPLOY_AUTHORITY: GITHUB_MAIN_ONLY/);
assert.doesNotMatch(workflow,/wrangler-action/);
for(const token of ["GITHUB_ACTIONS","refs/heads/main","GITHUB_SHA","git","rev-parse","status","--porcelain","CTE_RELEASE_SHA","CTE_RELEASE_CONTRACT"]){assert.ok(deploy.includes(token),`Deployment authority is missing ${token}`);}
assert.match(wrangler,/CTE_RELEASE_CONTRACT = "CTE_COMPOUND_CAPITALIZATION_CHARTS@1\.0\.0"/);
assert.match(wrangler,/CTE_RELEASE_ENFORCEMENT = "ENFORCE_CURRENT_RELEASE"/);
assert.match(workerSource,/RELEASE_CONTRACT="CTE_COMPOUND_CAPITALIZATION_CHARTS@1\.0\.0"/);
assert.match(workerSource,/LEGACY_RELEASE_REJECTED/);
assert.match(workerSource,/releaseAuthorized\(env\)/);
const assets={fetch:async()=>new Response("current")},request=new Request("https://cte-compound.thetestamony.workers.dev/");
let response=await worker.fetch(request,{ASSETS:assets,CTE_RELEASE_ENFORCEMENT:"ENFORCE_CURRENT_RELEASE",CTE_RELEASE_CONTRACT:"CTE_COMPOUND_CAPITALIZATION_CHARTS@1.0.0"});
assert.equal(response.status,503);assert.equal((await response.json()).code,"LEGACY_RELEASE_REJECTED");
response=await worker.fetch(request,{ASSETS:assets,CTE_RELEASE_ENFORCEMENT:"ENFORCE_CURRENT_RELEASE",CTE_RELEASE_CONTRACT:"CTE_COMPOUND_CAPITALIZATION_CHARTS@1.0.0",CTE_RELEASE_SHA:"a".repeat(40)});
assert.equal(response.status,200);assert.equal(await response.text(),"current");
console.log("Production deployment is restricted to the verified current main SHA and the Worker fails closed without the current release contract.");
