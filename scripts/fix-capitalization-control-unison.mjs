import fs from "node:fs";

const path="src/engine-certified-execution.js";
let source=fs.readFileSync(path,"utf8");
if(source.includes('"DAREN"'))source=source.replace('"DAREN"','"DARE_N"');
else if(!source.includes('"DARE_N"'))throw new Error("Expected DARE_N strategy identifier was not found.");
fs.writeFileSync(path,source);
console.log("Capitalization unison strategy identifier normalized to DARE_N.");
