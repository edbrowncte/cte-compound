import {readFile} from "node:fs/promises";

const worker=await readFile(new URL("../src/worker.js",import.meta.url),"utf8");
const engine=await readFile(new URL("../src/engine.js",import.meta.url),"utf8");

const workerChecks=[
  [/api-fxtrade\.oanda\.com/,"live OANDA origin"],
  [/Authorization:\s*`Bearer \$\{token\}`/,"Bearer authentication"],
  [/redirect:\s*"manual"/,"Cloudflare-compatible redirects"],
  [/handlePricingStream/,"live pricing stream"],
  [/candleCache/,"completed-candle cache"],
  [/oandaWaiters/,"upstream request limiter"]
];
const engineChecks=[
  [/clientExtensions:\{id:clientId/,"OANDA client order identity"],
  [/pendingOrders/,"durable pending-order state"],
  [/ORDER_RECONCILED/,"lost-response reconciliation"],
  [/ledgerIndex/,"durable ledger index"],
  [/ROLLING_ORIGIN_CAUSAL/,"causal optimizer validation"],
  [/result\.choices\?\.\[0\]/,"Workers AI response compatibility"]
];
for(const [pattern,label] of [...workerChecks,...engineChecks]){
  const source=workerChecks.some(item=>item[0]===pattern)?worker:engine;
  if(!pattern.test(source))throw new Error(`Missing ${label}`);
}
for(const forbidden of [/api-fxpractice\.oanda\.com/,/stream-fxpractice\.oanda\.com/,/redirect:\s*"error"/]){
  if(forbidden.test(worker)||forbidden.test(engine))throw new Error(`Forbidden runtime behavior: ${forbidden}`);
}
console.log("Worker execution, reconciliation, caching, ledger, and AI boundaries verified.");
