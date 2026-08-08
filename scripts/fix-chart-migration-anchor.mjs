import fs from "node:fs";
const path="scripts/migrate-independent-chart-controls.mjs";
let text=fs.readFileSync(path,"utf8");
const bad="function configurationSnapshot(){return Object.fromEntries(Object.entries(STRATEGY_CONFIG).map(([id,value])=>[id,{...value}));}";
const good="function configurationSnapshot(){return Object.fromEntries(Object.entries(STRATEGY_CONFIG).map(([id,value])=>[id,{...value}]));}";
if(!text.includes(bad))throw new Error("Expected migration anchor typo not found");
text=text.split(bad).join(good);
fs.writeFileSync(path,text);
console.log("Corrected migration anchor in working tree.");
