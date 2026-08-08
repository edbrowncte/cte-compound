import fs from "node:fs";
const path="scripts/migrate-independent-chart-controls.mjs";
let text=fs.readFileSync(path,"utf8");
const bad="function configurationSnapshot(){return Object.fromEntries(Object.entries(STRATEGY_CONFIG).map(([id,value])=>[id,{...value}));}";
const good="function configurationSnapshot(){return Object.fromEntries(Object.entries(STRATEGY_CONFIG).map(([id,value])=>[id,{...value}]));}";
if(text.includes(bad))text=text.split(bad).join(good);
// Migration source/replacement bodies are template literals containing target-page ${...} syntax.
// Escape every target interpolation so Node does not evaluate it while running this one-time migration,
// then restore the two interpolations that belong to the migration script itself.
text=text.replace(/(?<!\\)\$\{/g,"\\${");
text=text.replace("Migration anchor missing: \\${label}","Migration anchor missing: ${label}");
text=text.replace("Applied independent chart-control migration (\\${changes} transformations).","Applied independent chart-control migration (${changes} transformations).");
fs.writeFileSync(path,text);
console.log("Prepared one-time chart migration anchors and literal template syntax.");
