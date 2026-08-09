import fs from "node:fs";

const path="public/index.html";
let html=fs.readFileSync(path,"utf8"),changes=0;
const replaceOnce=(from,to,label)=>{if(!html.includes(from))throw new Error(`Missing HTL schedule migration anchor: ${label}`);html=html.replace(from,to);changes++;};

replaceOnce(
'  function eventHistoryCount(length){return clamp(Math.max(650,(Math.max(3,length)*3)+120),650,MAX_ANALYTICAL_HISTORY);}',
'  function eventHistoryCount(){return MAX_ANALYTICAL_HISTORY;}',
'maximum event history');
replaceOnce(
'    const desired=clamp(Math.trunc(Number(requestedCount))||eventHistoryCount(length),60,MAX_ANALYTICAL_HISTORY),minimum=Math.min(desired,Math.max(180,(Math.max(3,length)*3)+5)),cached=eventCachedCandles(pair,timeframe);',
'    const desired=clamp(Math.trunc(Number(requestedCount))||eventHistoryCount(length),60,MAX_ANALYTICAL_HISTORY),minimum=Math.min(desired,Math.max(1200,(Math.max(3,length)*6)+240)),cached=eventCachedCandles(pair,timeframe);',
'causal fallback depth');

fs.writeFileSync(path,html);
console.log(`Applied HTL schedule maximum-history migration (${changes} transformations).`);
