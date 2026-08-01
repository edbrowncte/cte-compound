import { readFile } from "node:fs/promises";

const worker = await readFile(new URL("../src/worker.js", import.meta.url), "utf8");

for (const required of ['redirect:"manual"',"OANDA_UNEXPECTED_REDIRECT","response.status>=300 && response.status<400"]) {
  if (!worker.includes(required)) throw new Error(`Missing safe OANDA redirect handling: ${required}`);
}

if (worker.includes('redirect:"error"')) {
  throw new Error('Cloudflare Workers does not support redirect:"error".');
}

if (worker.includes('"User-Agent":"cte-compound/1.0"')) {
  throw new Error("OANDA requests must use the proven minimal header set.");
}

console.log("OANDA redirect handling verified.");
