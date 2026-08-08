import fs from "node:fs";
const path="scripts/migrate-independent-chart-controls.mjs";
let text=fs.readFileSync(path,"utf8");
const bad="function configurationSnapshot(){return Object.fromEntries(Object.entries(STRATEGY_CONFIG).map(([id,value])=>[id,{...value}));}";
const good="function configurationSnapshot(){return Object.fromEntries(Object.entries(STRATEGY_CONFIG).map(([id,value])=>[id,{...value}]));}";
if(text.includes(bad))text=text.split(bad).join(good);
// Migration source/replacement bodies are template literals containing target-page ${...} syntax.
// Escape target-page interpolation so Node does not evaluate it while running the one-time migration.
text=text.replace(/(?<!\\)\$\{/g,"\\${");
// Restore interpolations that belong to the migration script itself rather than the target HTML/JS.
for(const [escaped,live] of [
  ["Migration anchor missing: \\${label}","Migration anchor missing: ${label}"],
  ["Applied independent chart-control migration (\\${changes} transformations).","Applied independent chart-control migration (${changes} transformations)."],
  ["id=\\\"\\${id}\\\"","id=\\\"${id}\\\""],
  ["Missing required chart control \\${id}","Missing required chart control ${id}"]
])text=text.split(escaped).join(live);
fs.writeFileSync(path,text);
console.log("Prepared one-time chart migration anchors and literal template syntax.");
