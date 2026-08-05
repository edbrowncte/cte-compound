import { readFile, writeFile, rm } from "node:fs/promises";

const sourceUrl=new URL("./test-nemotron-base.mjs",import.meta.url);
const generatedUrl=new URL("./.test-nemotron-generated.mjs",import.meta.url);
let source=await readFile(sourceUrl,"utf8");
const original='import { HtlEngine, __nemotronTest } from "../src/engine.js";';
const inherited='import { HtlEngine, __nemotronTest } from "../src/engine-nemotron-base.js";';
if(!source.includes(original))throw new Error("Nemotron test adaptation boundary is missing.");
source=source.replace(original,inherited);
await writeFile(generatedUrl,source,"utf8");
try{await import(`${generatedUrl.href}?run=${Date.now()}`);}finally{await rm(generatedUrl,{force:true});}
