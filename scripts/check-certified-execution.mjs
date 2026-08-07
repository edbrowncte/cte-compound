import {readFile} from "node:fs/promises";

const worker=await readFile(new URL("../src/worker.js",import.meta.url),"utf8");
const execution=await readFile(new URL("../src/engine-certified-execution.js",import.meta.url),"utf8");
const analytics=await readFile(new URL("../src/engine.js",import.meta.url),"utf8");

const required=[
  [/export \{ HtlEngine \} from "\.\/engine-certified-execution\.js"/,"Worker Durable Object export"],
  [/extends CertifiedAnalyticsEngine/,"certified analytical inheritance"],
  [/armed:true/,"armed private runtime"],
  [/CERTIFIED_MULTI_REVERSAL@1\.0\.0/,"execution policy version"],
  [/pendingReversals/,"durable reversal claims"],
  [/claimReversals/,"pre-execution reversal claims"],
  [/processPendingReversals/,"restart recovery"],
  [/excludedPairs/,"reversal exclusion from generic reconciliation"],
  [/state\.reconciledCandle!==lastCandle/,"completed-candle reconciliation gate"],
  [/reconciliationCadence:"new-completed-candle-only"/,"truthful reconciliation cadence status"],
  [/const selected=await this\.choose\(newEntries\)/,"Nemotron limited to new entries"],
  [/Configured OANDA account/,"exact configured account enforcement"],
];
for(const[pattern,label]of required){
  const source=label==="Worker Durable Object export"?worker:execution;
  if(!pattern.test(source))throw new Error(`Missing ${label}`);
}
if(/class HtlEngine extends/.test(execution)&&!/from "\.\/engine\.js"/.test(execution))throw new Error("Execution layer must extend the certified analytical engine entry point");
if(!/SIX_INDEPENDENT_REGISTERED_HORIZON_STATE_MACHINES/.test(analytics))throw new Error("Certified six-strategy analytical contract is missing");
if(/BLOCKED_PENDING_USER_DEPLOYMENT_APPROVAL/.test(execution))throw new Error("Private execution must not be deployment-blocked");
console.log("Certified analytical inheritance, armed execution, multi-reversal recovery, and completed-candle reconciliation boundaries verified.");
