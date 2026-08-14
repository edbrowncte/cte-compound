import {readFile} from "node:fs/promises";

const worker=await readFile(new URL("../src/worker.js",import.meta.url),"utf8");
const execution=await readFile(new URL("../src/engine-certified-execution.js",import.meta.url),"utf8");
const executionBase=await readFile(new URL("../src/engine-certified-execution-base.js",import.meta.url),"utf8").catch(()=>"");
const accountAuthority=await readFile(new URL("../src/account-authority.js",import.meta.url),"utf8").catch(()=>"");
const indicatorOnly=await readFile(new URL("../src/engine-indicator-only.js",import.meta.url),"utf8").catch(()=>"");
const indicatorOnlyUnits=await readFile(new URL("../src/engine-indicator-only-units.js",import.meta.url),"utf8").catch(()=>"");
const indicatorOnlyDual=await readFile(new URL("../src/engine-indicator-only-dual.js",import.meta.url),"utf8").catch(()=>"");
const closeRetry=await readFile(new URL("../src/engine-close-retry.js",import.meta.url),"utf8").catch(()=>"");
const signalProvenance=await readFile(new URL("../src/engine-signal-provenance.js",import.meta.url),"utf8").catch(()=>"");
const liveSignalPrice=await readFile(new URL("../src/engine-live-signal-price.js",import.meta.url),"utf8").catch(()=>"");
const analytics=await readFile(new URL("../src/engine.js",import.meta.url),"utf8");
const executionContract=`${execution}\n${executionBase}`;

const directExport=/export \{ HtlEngine \} from "\.\/engine-certified-execution\.js"/.test(worker);
const ioExport=/export \{ HtlEngine \} from "\.\/engine-indicator-only\.js"/.test(worker);
const ioUnitsExport=/export \{ HtlEngine \} from "\.\/engine-indicator-only-units\.js"/.test(worker);
const ioDualExport=/export \{ HtlEngine \} from "\.\/engine-indicator-only-dual\.js"/.test(worker);
const closeRetryExport=/export \{ HtlEngine \} from "\.\/engine-close-retry\.js"/.test(worker);
const signalProvenanceExport=/export \{ HtlEngine \} from "\.\/engine-signal-provenance\.js"/.test(worker);
const liveSignalPriceExport=/export \{ HtlEngine \} from "\.\/engine-live-signal-price\.js"/.test(worker);
if(!directExport&&!ioExport&&!ioUnitsExport&&!ioDualExport&&!closeRetryExport&&!signalProvenanceExport&&!liveSignalPriceExport)throw new Error("Missing Worker Durable Object certified execution export");
if(ioExport||ioUnitsExport||ioDualExport||closeRetryExport||signalProvenanceExport||liveSignalPriceExport){
  if(!/import \{ HtlEngine as CertifiedHtlEngine \} from "\.\/engine-certified-execution\.js"/.test(indicatorOnly))throw new Error("Indicator Only wrapper must import the certified execution engine");
  if(!/class HtlEngine extends CertifiedHtlEngine/.test(indicatorOnly))throw new Error("Indicator Only Worker must extend the certified execution engine");
  if(!/if\(!control\.enabled\)return super\.tick\(\)/.test(indicatorOnly))throw new Error("Indicator Only disabled state must fall through exactly to the certified engine tick");
  if(!/if\(normalizeIndicatorOnly\(state\?\.indicatorOnly\)\.enabled\)return;/.test(indicatorOnly))throw new Error("Indicator Only active state must suppress normal reconciliation");
}
if(ioUnitsExport||ioDualExport||closeRetryExport||signalProvenanceExport||liveSignalPriceExport){
  if(!/import \{ HtlEngine as IndicatorOnlyEngine/.test(indicatorOnlyUnits))throw new Error("IO units wrapper must import the existing exclusive Indicator Only engine");
  if(!/class HtlEngine extends IndicatorOnlyEngine/.test(indicatorOnlyUnits))throw new Error("IO units Worker must extend the existing exclusive Indicator Only engine");
  if(!/executeIndicatorOnlyUnits/.test(indicatorOnlyUnits))throw new Error("IO units wrapper must provide an isolated unit-aware execution path");
}
if(ioDualExport||closeRetryExport||signalProvenanceExport||liveSignalPriceExport){
  if(!/import \{ HtlEngine as IndicatorOnlyUnitsEngine/.test(indicatorOnlyDual))throw new Error("Dual IO wrapper must import the certified IO units wrapper");
  if(!/class HtlEngine extends IndicatorOnlyUnitsEngine/.test(indicatorOnlyDual))throw new Error("Dual IO Worker must extend the IO units wrapper");
  if(!/if\(!eventIsFresh\(event\)\)/.test(indicatorOnlyDual))throw new Error("Dual IO must reject stale directional state before execution");
  if(!/if\(activeTickets\(state\)\.length\)return;/.test(indicatorOnlyDual))throw new Error("Dual IO active state must suppress normal reconciliation");
}
if(closeRetryExport||signalProvenanceExport||liveSignalPriceExport){
  if(!/import \{ HtlEngine as DualIndicatorOnlyEngine \} from "\.\/engine-indicator-only-dual\.js"/.test(closeRetry))throw new Error("Close retry wrapper must import the certified dual IO engine");
  if(!/class HtlEngine extends DualIndicatorOnlyEngine/.test(closeRetry))throw new Error("Close retry Worker must extend the certified dual IO engine");
  if(!/longOrderCancelTransaction\|\|payload\.shortOrderCancelTransaction/.test(closeRetry))throw new Error("Position closeout must inspect OANDA cancel transactions");
  if(!/MAX_CLOSE_ATTEMPTS=5/.test(closeRetry)||!/CLOSE_RETRY_EXHAUSTED/.test(closeRetry))throw new Error("Position closeout must have a bounded retry circuit");
}
if(signalProvenanceExport||liveSignalPriceExport){
  if(!/import \{ HtlEngine as CloseRetryEngine \} from "\.\/engine-close-retry\.js"/.test(signalProvenance))throw new Error("Signal provenance wrapper must import the bounded close-retry engine");
  if(!/class HtlEngine extends CloseRetryEngine/.test(signalProvenance))throw new Error("Signal provenance Worker must extend the bounded close-retry engine");
  if(!/SIGNAL_PROVENANCE_REGISTERED/.test(signalProvenance))throw new Error("Execution signal provenance must be durably registered before order submission");
  if(!/sourcePriceBasis: "COMPLETED_SOURCE_CANDLE_CLOSE"/.test(signalProvenance)||!/fillPriceBasis: "OANDA_ORDER_FILL_PRICE_SEPARATE"/.test(signalProvenance))throw new Error("Signal source price and OANDA fill price provenance must remain distinct");
  if(!/executionClockParentProbeObserved/.test(signalProvenance)||!/executionClockEarlyProbeStatus/.test(signalProvenance))throw new Error("Execution clock authority wrapper must expose parent-probe and early-probe observability");
}
if(liveSignalPriceExport){
  if(!/HtlEngine as SignalProvenanceEngine/.test(liveSignalPrice)||!/class HtlEngine extends SignalProvenanceEngine/.test(liveSignalPrice))throw new Error("Live signal-price wrapper must extend the certified signal-provenance engine");
  if(!/LIVE_OANDA_EXECUTABLE_SIDE_QUOTE_AT_REGISTRATION/.test(liveSignalPrice))throw new Error("Live signal-price wrapper must declare executable-side OANDA quote authority");
  if(!/sourceCandleClose/.test(liveSignalPrice)||!/signalPriceSide/.test(liveSignalPrice))throw new Error("Live signal-price wrapper must retain source-candle close while identifying BID/ASK signal side");
  if(!/persistSignalRegistration/.test(liveSignalPrice)||!/SIGNAL_PROVENANCE_REGISTERED/.test(liveSignalPrice))throw new Error("Live signal price must remain inside durable signal-provenance registration before order submission");
  if(!/resolveIndicatorOnlyAccount/.test(liveSignalPrice)||!/resolveExactAccountAuthority/.test(liveSignalPrice))throw new Error("Terminal IO execution must use exact configured-account authority");
}

const authorityWrapper=/engine-certified-execution-base\.js/.test(execution)&&/class HtlEngine extends CertifiedExecutionBase/.test(execution);
if(authorityWrapper){
  if(!/from "\.\/engine\.js"/.test(executionBase)||!/extends CertifiedAnalyticsEngine/.test(executionBase))throw new Error("Certified execution base must retain direct analytical inheritance");
  if(!/resolveExactAccountAuthority/.test(execution)||!/EXACT_OANDA_ACCOUNT_AUTHORITY/.test(accountAuthority))throw new Error("Certified execution wrapper must enforce exact configured-account authority");
  if(!/cachedAccountAuthority/.test(accountAuthority)||!/expiresAt/.test(accountAuthority))throw new Error("Configured account authority must be durably cacheable instead of rediscovered every tick");
  if(!/ACCOUNT_IDENTITY_MISMATCH/.test(accountAuthority)||!/OANDA timeout at/.test(accountAuthority)||!/path/.test(accountAuthority))throw new Error("Account authority must preserve identity, route, and transport failure classes");
}else if(/class HtlEngine extends/.test(execution)&&!/from "\.\/engine\.js"/.test(execution))throw new Error("Execution layer must extend the certified analytical engine entry point");

const required=[
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
];
for(const[pattern,label]of required)if(!pattern.test(executionContract))throw new Error(`Missing ${label}`);
if(!/SIX_INDEPENDENT_REGISTERED_HORIZON_STATE_MACHINES/.test(analytics))throw new Error("Certified six-strategy analytical contract is missing");
if(/BLOCKED_PENDING_USER_DEPLOYMENT_APPROVAL/.test(executionContract))throw new Error("Private execution must not be deployment-blocked");
const topology=liveSignalPriceExport?"live executable-side signal-price wrapper over exact cached OANDA account authority, durable signal provenance, execution-clock authority, bounded OANDA close retry, and dual exact-unit IO":signalProvenanceExport?"signal-provenance and execution-clock authority wrapper over bounded OANDA close retry and dual exact-unit IO":closeRetryExport?"bounded OANDA close retry wrapper over dual exact-unit IO":ioDualExport?"dual Indicator Only wrapper over exact-unit IO":ioUnitsExport?"Indicator Only units wrapper over exclusive IO":ioExport?"Indicator Only wrapper":"direct certified Worker";
console.log(`Certified analytical inheritance, AGE v2 Great Expectation reallocation, selected-reversal recovery, completed-candle boundaries, and ${topology} verified.`);
