import { readFile, writeFile, rm } from "node:fs/promises";

const sourceUrl=new URL("./test-runtime-base.mjs",import.meta.url);
const generatedUrl=new URL("./.test-runtime-generated.mjs",import.meta.url);
let source=await readFile(sourceUrl,"utf8");
const marker='const html=await readFile(new URL("../public/index.html",import.meta.url),"utf8");';
if(!source.includes(marker))throw new Error("Runtime test adaptation boundary is missing.");
source=source.replace(marker,'const engineSource=(await Promise.all(["../src/engine.js","../src/engine-nemotron-base.js","../src/engine-horizon-base.js","../src/engine-base.js","../src/horizon-platform-engine.js","../src/horizon-registered-performance.js","../src/horizon-strategy-v1.js"].map(path=>readFile(new URL(path,import.meta.url),"utf8")))).join("\\n");\n'+marker);
source=source.replaceAll('await readFile(new URL("../src/engine.js",import.meta.url),"utf8")','engineSource');
source=source.replace('parsed.searchParams.get("count")==="650"','parsed.searchParams.get("count")==="3000"');
const authorityMarker='if(url.endsWith("/preferences"))return new Response(JSON.stringify({minimumUnits:1000}),{status:200});return new Response(JSON.stringify({ok:true}),{status:200});';
if(!source.includes(authorityMarker))throw new Error("Runtime Indicator Only authority mock boundary is missing.");
source=source.replace(authorityMarker,'if(url.endsWith("/control/indicatorOnly"))return new Response(JSON.stringify({indicatorOnly:{enabled:false,pair:"EUR_USD",timeframe:"M1",indicator:"ASSET",length:10,filter:0}}),{status:200});if(url.endsWith("/preferences"))return new Response(JSON.stringify({minimumUnits:1000}),{status:200});return new Response(JSON.stringify({ok:true}),{status:200});');
await writeFile(generatedUrl,source,"utf8");
try{await import(`${generatedUrl.href}?run=${Date.now()}`);}finally{await rm(generatedUrl,{force:true});}
