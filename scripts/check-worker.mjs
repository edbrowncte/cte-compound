import { readFile } from "node:fs/promises";

const worker = await readFile(new URL("../src/worker.js", import.meta.url), "utf8");

for (const required of [
  'method:"GET"',
  'headers:{Authorization:"Bearer "+token,Accept:"application/json"}',
  'redirect:"manual"',
  'cache:"no-store"',
  'encodeURIComponent(accountId)}/summary'
]) {
  if (!worker.includes(required)) throw new Error(`Missing direct OANDA connection behavior: ${required}`);
}

for (const forbidden of [
  'oandaFetch("/v3/accounts",token)',
  "OANDA_ACCOUNT_ID_NOT_AUTHORIZED",
  "diagnosticId",
  "upstreamErrorCode",
  "OANDA_ACCESS_FORBIDDEN",
  "AbortSignal.timeout",
  '"User-Agent"'
]) {
  if (worker.includes(forbidden)) throw new Error(`Unrequested OANDA wrapper behavior remains: ${forbidden}`);
}

console.log("Direct OANDA connection verified.");
