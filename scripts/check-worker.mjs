import {readFile} from "node:fs/promises";

const workerFiles=["../src/worker.js","../src/worker-horizon-base.js","../src/worker-base.js"];
const engineFiles=["../src/engine.js","../src/engine-horizon-base.js","../src/engine-base.js"];
const worker=(await Promise.all(workerFiles.map(path=>readFile(new URL(path,import.meta.url),"utf8")))).join("\n");
const engine=(await Promise.all(engineFiles.map(path=>readFile(new URL(path,import.meta.url),"utf8")))).join("\n");
const contract=await readFile(new URL("../public/htl-horizon-contract.js",import.meta.url),"utf8");
const runtime=await readFile(new URL("../public/platform-horizon-runtime.js",import.meta.url),"utf8");

const workerChecks=[
  [/api-fxtrade\.oanda\.com/,"live OANDA origin"],
  [/Authorization:\s*`Bearer \$\{token\}`/,"Bearer authentication"],
  [/redirect:\s*"manual"/,"Cloudflare-compatible redirects"],
  [/handlePricingStream/,"live pricing stream"],
  [/candleCache/,"completed-candle cache"],
  [/oandaWaiters/,"upstream request limiter"],
  [/OANDA_REQUEST_TIMEOUT_MS/,"upstream timeout boundary"],
  [/requestCount/,"count-aware candle cache"],
  [/handlePlatformDiagnostic/,"platform diagnostic endpoint"],
  [/handlePlatformVersion/,"deployment version endpoint"],
  [/CF_VERSION_METADATA/,"Cloudflare version metadata binding"],
  [/oandaTelemetry/,"OANDA retry telemetry"],
  [/handleManualOrder/,"strict manual order route"],
  [/handleOpenTrades/,"open-trade retrieval route"],
  [/handleTradeAction/,"trade modify and close route"],
  [/handleCandidateOrder/,"A\/B\/C canonical candidate order route"],
  [/\/trades\/\$\{specifier\}/,"live trade revalidation"],
  [/units:\s*"ALL"/,"full trade close"],
  [/timeInForce:\s*"GTC"/,"GTC dependent orders"],
  [/\/orders\/@\$\{encodeURIComponent\(clientId\)\}/,"duplicate candidate lookup"],
  [/Optimizer records are server-managed/,"server-authoritative optimizer boundary"],
  [/api\/platform\/preferences/,"cross-device preference route"],
  [/api\/engine\/compute/,"authoritative Compute Configuration route"],
  [/platform-horizon-runtime\.js/,"platform Horizon browser runtime injection"]
];
const engineChecks=[
  [/clientExtensions:\{id:clientId/,"OANDA client order identity"],
  [/pendingOrders/,"durable pending-order state"],
  [/ORDER_RECONCILED/,"lost-response reconciliation"],
  [/ledgerIndex/,"durable ledger index"],
  [/HORIZON_RETROSPECTIVE_PLATFORM_PARITY/,"Horizon parity optimizer validation"],
  [/result\.choices\?\.\[0\]/,"Workers AI response compatibility"],
  [/configurationSource:"OPTIMIZED"/,"optimized runtime default"],
  [/await this\.reconcile\(requirements/,"full-position reconciliation"],
  [/optimizerScore/,"effective optimizer ledger attribution"],
  [/state\.requirements/,"durable optimized reconciliation context"],
  [/uiPreferences/,"durable UI preference storage"],
  [/candlesForRange/,"date-range Compute Configuration candles"],
  [/COMPUTE_CONFIGURATION/,"authoritative optimizer source"],
  [/MAX_COMPUTE_BARS/,"bounded optimization range"],
  [/OPTIMIZER_VERSION\s*=\s*5/,"Horizon optimizer version boundary"],
  [/stage="horizon-parity-optimization"/,"Horizon Compute Configuration error stage"],
  [/CTE_HORIZON_HTL/,"shared Horizon contract import"],
  [/calculationVersion/,"calculation version attribution"],
  [/crossingTime/,"crossing-time ledger evidence"],
  [/qualificationReason/,"post-cross qualification evidence"],
  [/nemotronRecommendedPair/,"Nemotron recommendation evidence"]
];
for(const[pattern,label]of workerChecks)if(!pattern.test(worker))throw new Error(`Missing ${label}`);
for(const[pattern,label]of engineChecks)if(!pattern.test(engine))throw new Error(`Missing ${label}`);
for(const[pattern,label]of [[/CTE_HORIZON_HTL_ASSET_CROSSING@1\.0\.0/,"versioned Horizon contract"],[/function assetCrossings/,"canonical Asset\/Inverse crossings"],[/crossingIdentity/,"canonical crossing identity"]])if(!pattern.test(contract))throw new Error(`Missing ${label}`);
for(const[pattern,label]of [[/chartConfigurationIdentity/,"main chart identity"],[/eventConfigurationIdentity/,"event chart identity"],[/horizonCompoundParity/,"Horizon\/Compound parity disclosure"],[/platformTradeManagement/,"automated trade management controls"],[/FORENSIC_FIELDS/,"forensic CSV fields"]])if(!pattern.test(runtime))throw new Error(`Missing ${label}`);
for(const forbidden of [/api-fxpractice\.oanda\.com/,/stream-fxpractice\.oanda\.com/,/redirect:\s*"error"/])if(forbidden.test(worker)||forbidden.test(engine))throw new Error(`Forbidden runtime behavior: ${forbidden}`);
console.log("Worker, shared Horizon crossing, trade management, reconciliation, ledger, and AI boundaries verified.");
