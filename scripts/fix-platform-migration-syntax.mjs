import fs from "node:fs";
const path="scripts/migrate-platform-composition-indicator-model.mjs";
let source=fs.readFileSync(path,"utf8"),changes=0;
const replacements=[
  ['throw new Error(`HTTP ${response.status}`)','throw new Error("HTTP "+response.status)'],
  ['node.textContent=`Model context synchronized · ${new Date().toLocaleTimeString()}`','node.textContent="Model context synchronized · "+new Date().toLocaleTimeString()'],
  ['node.textContent=`Model context pending · ${error.message||error}`','node.textContent="Model context pending · "+(error.message||error)'],
];
for(const [from,to] of replacements){if(source.includes(from)){source=source.replace(from,to);changes++;}}
if(!changes)console.log("Migration quoting already repaired.");else{fs.writeFileSync(path,source);console.log(`Repaired migration quoting (${changes} changes).`);}
