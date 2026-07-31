import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";

const html = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
for (const required of ["Timeframe Signal Schedule","Interactive Analytical Chart","X-OANDA-Token","S5","W","COMBO · CSF"]) {
  if (!html.includes(required)) throw new Error(`Missing required HTML feature: ${required}`);
}
const script = html.match(/<script>([\s\S]*)<\/script>/)?.[1];
if (!script) throw new Error("Inline application script was not found.");
const check = spawnSync(process.execPath, ["--check", "-"], { input: script, encoding: "utf8" });
if (check.status !== 0) throw new Error(check.stderr || check.stdout || "Inline JavaScript syntax check failed.");
console.log("HTML requirements and inline JavaScript syntax verified.");
