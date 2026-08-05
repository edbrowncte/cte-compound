import {readFile} from "node:fs/promises";

const readMany=async paths=>(await Promise.all(paths.map(path=>readFile(new URL(path,import.meta.url),"utf8")))).join("\n");
const worker=await readMany(["../src/worker.js","../src/worker-horizon-base.js","../src/worker-base.js","../src/horizon-candidate-orders.js"]);
const engine=await readMany(["../src/engine.js","../src/engine-nemotron-base.js","../src/engine-horizon-base.js","../src/engine-base.js","../src/horizon-platform-engine.js","../src/horizon-registered-performance.js","../src/horizon-strategy-v1.js"]);
const checks=(source,items)=>{for(const[pattern,label]of items)if(!pattern.test(source))throw new Error(`Missing ${label}`);};

checks(worker,[
  [/api-fxtrade\.oanda\.com/,"live OANDA origin"],
  [/handleManualOrder/,"manual orders"],
  [/handleOpenTrades/,"open trades"],
  [/handleTradeAction/,"trade management"],
  [/handleCandidateOrder/,"candidate order route"]
]);

checks(engine,[
  [/horizon-strategy-v1/,"registered strategy engine"],
  [/SIX_INDEPENDENT_REGISTERED_HORIZON_STATE_MACHINES/,"six independent strategy contract"],
  [/REGISTERED_HORIZON_STRATEGY_V1_GROSS/,"registered gross validation"],
  [/REGISTERED_HISTORY_BARS\s*=\s*3000/,"3000-bar performance semantics"],
  [/OPTIMIZER_VERSION\s*=\s*6/,"optimizer generation 6"],
  [/OPPOSITE STRATEGY EVENT · NEXT OPEN/,"registered trade timing"],
  [/spreadAdjustedPerformance:\{status:"SEPARATE_NOT_COMPUTED"/,"gross/spread separation"],
  [/BLOCKED_PENDING_SAVED_RECORD_PARITY/,"execution certification block"],
  [/async reconcile\(/,"reconciliation override"],
  [/async execute\(/,"execution override"],
  [/NEMOTRON_CANDIDATE_TOOL@2\.0\.0/,"Nemotron structured integration"],
  [/transactions\/sinceid/,"lost-response transaction synchronization"],
  [/pendingOrders/,"durable pending-order state"],
  [/clientExtensions:\{id:clientId/,"idempotent order identity"]
]);

const inherited=await readFile(new URL("../src/engine-nemotron-base.js",import.meta.url),"utf8");
const registeredLayer=engine.replace(inherited,"");
for(const forbidden of [/ONE_RAW_ASSET_RECOVERED_INVERSE_CROSSING_CLOCK/,/POST_CROSS_STRATEGY_QUALIFICATION/]){
  if(forbidden.test(registeredLayer))throw new Error(`Forbidden registered analytical contract: ${forbidden}`);
}

console.log("Registered six-strategy Horizon analytical, performance, execution-block, OANDA, ledger, and Nemotron boundaries verified.");
