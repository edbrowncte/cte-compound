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
text=text.replace("Migration anchor missing: \\${label}","Migration anchor missing: ${label}");
text=text.replace("Applied independent chart-control migration (\\${changes} transformations).","Applied independent chart-control migration (${changes} transformations).");
// Avoid a template literal entirely for the sanity check because its ${id} is migration-time, not target-page syntax.
text=text.split("\n").map(line=>line.includes("Missing required chart control")?`  if(!html.includes('id="'+id+'"'))throw new Error("Missing required chart control "+id);`:line).join("\n");
fs.writeFileSync(path,text);
console.log("Prepared one-time chart migration anchors and literal template syntax.");
