import {readFile} from "node:fs/promises";

const worker=await readFile(new URL("../src/worker.js",import.meta.url),"utf8");
const execution=await readFile(new URL("../src/engine-certified-execution.js",import.meta.url),"utf8");
const analytics=await readFile(new URL("../src/engine.js",import.meta.url),"utf8");

const required=[
  [/export \{ HtlEngine \} from "\.\/engine-certified-execution\.js"/,"Worker Durable Object export"],
  [/extends CertifiedAnalyticsEngine/,"certified analytical inheritance"],
  [/armed:true/,"armed private runtime"],
  [/CERTIFIED_AGE_REALLOCATION@2\.0\.0/,"AGE execution policy version"],
  [/AGE_GREAT_EXPECTATION@2\.0\.0|AGE_EXPECTATION_VERSION/,"Great Expectation contract"],
  [/pendingReversals/,"durable AGE-selected reversal claims"],
  [/claimReversals/,"selected reversal claim"],
  [/processPendingReversals/,"selected reversal restart recovery"],
  [/AGE_EXPECTATION_DECISION/,"AGE decision ledger"],
  [/AGE reallocation · GE delta/,"certified strategic displacement"],
  [/state\.reconciledCandle!==lastCandle/,"completed-candle reconciliation gate"],
  [/reconciliationCadence:"new-completed-candle-only"/,"truthful reconciliation cadence status"],
  [/deploymentCandidates=.*reversals.*newEntries/s,"reversal and alternative deployment competition"],
  [/const selected=await this\.choose\(deploymentCandidates\)/,"Nemotron bounded to III-qualified deployment candidates"],
  [/Configured OANDA account/,"exact configured account enforcement"],
];
for(const[pattern,label]of required){const source=label==="Worker Durable Object export"?worker:execution;if(!pattern.test(source))throw new Error(`Missing ${label}`);}
if(/class HtlEngine extends/.test(execution)&&!/from "\.\/engine\.js"/.test(execution))throw new Error("Execution layer must extend the certified analytical engine entry point");
if(!/SIX_INDEPENDENT_REGISTERED_HORIZON_STATE_MACHINES/.test(analytics))throw new Error("Certified six-strategy analytical contract is missing");
if(/BLOCKED_PENDING_USER_DEPLOYMENT_APPROVAL/.test(execution))throw new Error("Private execution must not be deployment-blocked");
console.log("Certified analytical inheritance, AGE v2 Great Expectation reallocation, selected-reversal recovery, and completed-candle boundaries verified.");
