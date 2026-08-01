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

for (const required of ["OANDA_BAD_REQUEST","OANDA_METHOD_REJECTED","upstreamErrorCode","upstreamStatus"]) {
  if (!worker.includes(required)) throw new Error(`Missing safe OANDA diagnostic: ${required}`);
}

for (const required of ['cache:"no-store"',"encodeURIComponent(accountId)}/summary"]) {
  if (!worker.includes(required)) throw new Error(`Missing direct OANDA connection behavior: ${required}`);
}

if (worker.includes('oandaFetch("/v3/accounts",token)') || worker.includes("OANDA_ACCOUNT_ID_NOT_AUTHORIZED")) {
  throw new Error("OANDA connection must not run an account-discovery preflight.");
}

if (worker.includes("AbortSignal.timeout")) {
  throw new Error("OANDA request options must match the proven browser connection.");
}

console.log("OANDA redirect handling verified.");
