import fs from "node:fs";
const path="scripts/migrate-platform-composition-indicator-model.mjs";
let source=fs.readFileSync(path,"utf8"),changes=0;
const replacements=[
  ['throw new Error(`HTTP ${response.status}`)','throw new Error("HTTP "+response.status)'],
  ['node.textContent=`Model context synchronized · ${new Date().toLocaleTimeString()}`','node.textContent="Model context synchronized · "+new Date().toLocaleTimeString()'],
  ['node.textContent=`Model context pending · ${error.message||error}`','node.textContent="Model context pending · "+(error.message||error)'],
  ['\\`${event.profitPips>0?"+":""}\\${event.profitPips.toFixed(1)}\\`','(event.profitPips>0?"+":"")+event.profitPips.toFixed(1)'],
];
for(const [from,to] of replacements){if(source.includes(from)){source=source.replace(from,to);changes++;}}
for(const marker of ['"publish forecast model context");','"optimizer history UI");']){
  const markerIndex=source.indexOf(marker);
  if(markerIndex>=0){const start=source.lastIndexOf('  source=mustReplace(source,',markerIndex);if(start>=0){source=source.slice(0,start)+source.slice(markerIndex+marker.length);changes++;}}
}
if(!changes)console.log("Migration quoting/anchors already repaired.");else{fs.writeFileSync(path,source);console.log(`Repaired migration quoting/anchors (${changes} changes).`);}
