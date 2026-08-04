import { readFile, writeFile, rm } from "node:fs/promises";

const sourceUrl=new URL("./test-horizon-platform-base.mjs",import.meta.url);
const generatedUrl=new URL("./.test-horizon-platform-generated.mjs",import.meta.url);
let source=await readFile(sourceUrl,"utf8");
const obsolete='["../public/platform-horizon-runtime.js","../public/platform-horizon-qualified-direction.js","../public/platform-horizon-candidate-context.js","../public/platform-horizon-execution-guard.js"]';
const served='["../public/platform-horizon-candidate-context.js","../public/platform-horizon-runtime.js","../public/platform-horizon-qualified-direction.js","../public/platform-horizon-execution-guard.js"]';
if(!source.includes(obsolete))throw new Error("Horizon browser load-order adaptation boundary is missing.");
source=source.replace(obsolete,served);
const narrow='assert.match((await result.json()).error,/latest completed OANDA candle/);';
const canonical='assert.match((await result.json()).error,/(?:not present in current completed OANDA history|not the latest completed OANDA candle)/);';
if(!source.includes(narrow))throw new Error("Historical-crossing rejection assertion boundary is missing.");
source=source.replace(narrow,canonical);
await writeFile(generatedUrl,source,"utf8");
try{await import(`${generatedUrl.href}?run=${Date.now()}`);}finally{await rm(generatedUrl,{force:true});}
