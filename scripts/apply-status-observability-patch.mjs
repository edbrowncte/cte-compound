import {readFile,writeFile} from "node:fs/promises";

async function patch(path,changes){
  let text=await readFile(path,"utf8");
  for(const {label,before,after,count=1} of changes){
    const found=text.split(before).length-1;
    if(found!==count)throw new Error(`${path} ${label}: expected ${count} matches, found ${found}`);
    text=text.split(before).join(after);
  }
  await writeFile(path,text);
}

await patch("src/engine-certified-execution.js",[
  {
    label:"live open position count",
    before:"        openPositions:state.openPositionsCount||0,",
    after:"        openPositions:Number.isFinite(Number(summary.openPositionCount))?Number(summary.openPositionCount):(state.openPositionsCount||0),"
  }
]);

await patch("src/worker-base.js",[
  {
    label:"open positions proxy allowlist",
    before:'    new RegExp(`^/v3/accounts/${account}/positions$`),',
    after:'    new RegExp(`^/v3/accounts/${account}/positions$`),\n    new RegExp(`^/v3/accounts/${account}/openPositions$`),'
  }
]);

await patch("public/index.html",[
  {
    label:"frontend open positions endpoint",
    before:"/positions`,null,3)",
    after:"/openPositions`,null,3)",
    count:2
  },
  {
    label:"Nemotron status rendering",
    before:'async function loadEngineStatus(){try{const response=await fetch("/api/engine/status",{headers:{Accept:"application/json"},credentials:"same-origin",cache:"no-store"}),status=await response.json();if(!response.ok)return;el("optimizerServerStatus").textContent=`${status.optimizerCoverage||0} / ${status.optimizerTotal||280} datasets${status.optimizerLastDataset?` · last ${status.optimizerLastDataset.replace("_","/")}`:""}${status.optimizerLastError?` · ${status.optimizerLastError}`:""}`;}catch{}}',
    after:'async function loadEngineStatus(){try{const response=await fetch("/api/engine/status",{headers:{Accept:"application/json"},credentials:"same-origin",cache:"no-store"}),status=await response.json();if(!response.ok)return;el("optimizerServerStatus").textContent=`${status.optimizerCoverage||0} / ${status.optimizerTotal||280} datasets${status.optimizerLastDataset?` · last ${status.optimizerLastDataset.replace("_","/")}`:""}${status.optimizerLastError?` · ${status.optimizerLastError}`:""}`;renderNemotronStatus(status.ai||{});}catch{}}'
  }
]);

await patch("scripts/test-runtime-base.mjs",[
  {
    label:"candidate open positions assertion",
    before:'assert.match(html,/positionsPayload=await oanda\\(`\\/v3\\/accounts\\/\\$\\{encodeURIComponent\\(accountId\\)\\}\\/positions`\\)/);',
    after:'assert.match(html,/positionsPayload=await oanda\\(`\\/v3\\/accounts\\/\\$\\{encodeURIComponent\\(accountId\\)\\}\\/openPositions`\\)/);'
  }
]);

await patch("scripts/test-browser.mjs",[
  {
    label:"browser open positions proxy mock",
    before:'if(upstream.endsWith("/positions"))return json({positions:[]});',
    after:'if(upstream.endsWith("/openPositions"))return json({positions:[]});'
  },
  {
    label:"browser Nemotron status assertion",
    before:'assert.equal(document.getElementById("minimumUnits").value,"1000");',
    after:'assert.equal(document.getElementById("minimumUnits").value,"1000");await waitFor(()=>document.getElementById("NemotronStatus").textContent==="Ready","Nemotron status rendering");'
  }
]);

console.log("Applied live open-position and Nemotron status observability migration");
