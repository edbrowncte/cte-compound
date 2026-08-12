import {readFile,writeFile} from "node:fs/promises";

async function patch(path,replacements){
  let source=await readFile(path,"utf8");
  for(const [from,to,label] of replacements){
    const count=source.split(from).length-1;
    if(count!==1)throw new Error(`${path}: expected exactly one ${label}, found ${count}`);
    source=source.replace(from,to);
  }
  await writeFile(path,source);
}

await patch("src/worker-base.js",[
  ['const GRANULARITIES = new Set(["W","D","H4","H1","M30","M15","M5","M1","S30","S5"]);','const GRANULARITIES = new Set(["W","D","H4","H2","H1","M30","M15","M5","M1","S30","S5"]);',"10-timeframe Worker granularity registry"],
  ["// Retain the complete 28 × 10 schedule universe plus selected-chart history.","// Retain the complete 28 × 11 schedule universe plus selected-chart history.","28 × 10 Worker cache comment"],
  ['ttl={S5:4000,S30:15000,M1:30000,M5:120000,M15:300000,M30:600000,H1:1200000,H4:3600000,D:21600000,W:86400000}[granularity]||30000','ttl={S5:4000,S30:15000,M1:30000,M5:120000,M15:300000,M30:600000,H1:1200000,H2:2400000,H4:3600000,D:21600000,W:86400000}[granularity]||30000',"Worker candle TTL registry"],
]);

await patch("public/index.html",[
  ['id="optimizerServerStatus">0 / 280 datasets','id="optimizerServerStatus">0 / 308 datasets',"optimizer registry initial total"],
  ['${status.optimizerCoverage||0} / ${status.optimizerTotal||280} datasets','${status.optimizerCoverage||0} / ${status.optimizerTotal||INSTRUMENTS.length*TIMEFRAMES.length} datasets',"engine status optimizer total fallback"],
  ['${checks.engine.value?.optimizerCoverage??0} / ${checks.engine.value?.optimizerTotal??280} ·','${checks.engine.value?.optimizerCoverage??0} / ${checks.engine.value?.optimizerTotal??INSTRUMENTS.length*TIMEFRAMES.length} ·',"diagnostic optimizer total fallback"],
]);

const testPath="scripts/test-h2-timeframe.mjs";
let test=await readFile(testPath,"utf8");
const anchor='const index=fs.readFileSync(new URL("../public/index.html",import.meta.url),"utf8");';
if(!test.includes(anchor))throw new Error("H2 certification insertion anchor missing");
test=test.replace(anchor,`${anchor}\nconst worker=fs.readFileSync(new URL("../src/worker-base.js",import.meta.url),"utf8");`);
const end='assert.match(index,/el\\("eventTimeframe"\\)\\.innerHTML=el\\("chartTimeframe"\\)\\.innerHTML/,"HTL Schedule must inherit the shared chart timeframe selector including H2");';
if(!test.includes(end))throw new Error("H2 certification final assertion anchor missing");
test=test.replace(end,`${end}\nassert.match(worker,/const GRANULARITIES = new Set\\(\\["W","D","H4","H2","H1","M30","M15","M5","M1","S30","S5"\\]\\)/,"Worker candle gateway must accept H2 between H4 and H1");\nassert.match(worker,/H1:1200000,H2:2400000,H4:3600000/,"Worker candle cache must define an explicit H2 TTL between H1 and H4");\nassert.match(worker,/!GRANULARITIES\\.has\\(granularity\\)/,"Worker candle route must validate requests against the H2-capable shared gateway registry");\nassert.doesNotMatch(worker,/28 × 10 schedule universe/,"Worker cache contract must not retain the pre-H2 28×10 assumption");\nassert.doesNotMatch(index,/id="optimizerServerStatus">0 \\/ 280 datasets/,"browser optimizer registry must not initialize to the pre-H2 280-dataset total");`);
await writeFile(testPath,test);

console.log("H2 Worker candle gateway, cache TTL, browser totals, and regression certification patched.");
