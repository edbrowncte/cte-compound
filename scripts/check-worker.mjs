import { readFile } from "node:fs/promises";

const worker = await readFile(new URL("../src/worker.js", import.meta.url), "utf8");

for (const required of ['redirect:"manual"',"OANDA_UNEXPECTED_REDIRECT","response.status>=300 && response.status<400"]) {
  if (!worker.includes(required)) throw new Error(`Missing safe OANDA redirect handling: ${required}`);
}

if (worker.includes('redirect:"error"')) {
  throw new Error('Cloudflare Workers does not support redirect:"error".');
}

console.log("OANDA redirect handling verified.");
