import { readFile, writeFile, rm } from "node:fs/promises";

const sourceUrl=new URL("./test-runtime-base.mjs",import.meta.url);
const generatedUrl=new URL("./.test-runtime-generated.mjs",import.meta.url);
let source=await readFile(sourceUrl,"utf8");
const marker='const html=await readFile(new URL("../public/index.html",import.meta.url),"utf8");';
if(!source.includes(marker))throw new Error("Runtime test adaptation boundary is missing.");
source=source.replace(marker,'const engineSource=(await Promise.all(["../src/engine.js","../src/engine-nemotron-base.js","../src/engine-horizon-base.js","../src/engine-base.js","../src/horizon-platform-engine.js","../src/horizon-registered-performance.js","../src/horizon-strategy-v1.js"].map(path=>readFile(new URL(path,import.meta.url),"utf8")))).join("\\n");\n'+marker);
source=source.replaceAll('await readFile(new URL("../src/engine.js",import.meta.url),"utf8")','engineSource');
source=source.replace('parsed.searchParams.get("count")==="650"','parsed.searchParams.get("count")==="3000"');
const oldReconcile=/await engine\.reconcile\(\{EUR_USD:[\s\S]*?assert\.equal\(engine\.lastWrite\.optimizerScore,3\);/;
if(!oldReconcile.test(source))throw new Error("Runtime reconciliation adaptation boundary is missing.");
source=source.replace(oldReconcile,'const reconciliation=await engine.reconcile({EUR_USD:{pair:"EUR_USD",event:{direction:-1,id:"-1:t"},configuration:{primary:{length:20,filter:1,score:3,trades:8,net:12,maxDrawdown:2,winRate:.625},confirmation:null}}},token,accountId,{events:{}},config);\nassert.deepEqual(reconciliation,{blocked:true,reason:"PENDING_USER_DEPLOYMENT_APPROVAL"});assert.equal(closed.length,0);assert.equal(engine.lastWrite.type,"ANALYTICAL_CERTIFICATION_BLOCK");');
await writeFile(generatedUrl,source,"utf8");
try{await import(`${generatedUrl.href}?run=${Date.now()}`);}finally{await rm(generatedUrl,{force:true});}
