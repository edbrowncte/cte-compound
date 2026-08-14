import "../public/htl-horizon-contract.js";
import "../public/horizon-strategy-contract.js";
import { executionOpportunity, SIGNAL_EXECUTION_WINDOW_VERSION } from "./signal-execution-window.js";

const H=globalThis.CTE_HORIZON_HTL,S=globalThis.CTE_HORIZON_STRATEGIES;
const failure=(message,status=409,code="SIGNAL_EXECUTION_WITHHELD")=>Object.assign(new Error(message),{status,code});

export function verifyCandidateSignal(candles,candidate,now=Date.now()){
  const indicators=S.buildIndicators(candles,candidate.context.length),crossings=indicators.horizon.crossings||[],crossing=crossings.find(event=>event.time===candidate.context.crossingTime&&event.direction===candidate.context.rawDirection);
  if(!crossing)throw failure("The cited Horizon crossing is not present in current completed OANDA history.",409,"SIGNAL_IDENTITY_NOT_FOUND");
  const latestCrossing=crossings.at(-1)||null;
  if(latestCrossing&&(latestCrossing.time!==crossing.time||latestCrossing.direction!==crossing.direction))throw failure("The cited Horizon signal remains historical, but a newer Horizon crossing has superseded its order-initiation authority.",409,"SIGNAL_SUPERSEDED");
  const opportunity=executionOpportunity(crossing.time,candidate.context.timeframe,now);
  if(!opportunity.open)throw Object.assign(failure(`The cited Horizon signal remains recorded, but its contemporaneous order-initiation window closed at ${opportunity.closesAt||"an unknown time"}.`,409,"EXECUTION_WINDOW_ELAPSED"),{executionOpportunity:opportunity,signalExecutionWindowVersion:SIGNAL_EXECUTION_WINDOW_VERSION});
  const identity=H.crossingIdentity({pair:candidate.order.instrument,timeframe:candidate.context.timeframe,strategy:candidate.context.strategy,length:candidate.context.length,filter:candidate.context.filter,crossing});
  if(identity!==candidate.context.crossingIdentity)throw failure("The Horizon crossing identity changed during live revalidation.",409,"SIGNAL_IDENTITY_CHANGED");
  const qualification=S.qualificationAt(indicators,crossing.index,candidate.context.strategy,candidate.context.filter,crossing.direction);
  if(!qualification.qualified)throw failure(`The raw crossing remains valid but ${candidate.context.strategy} no longer qualifies it: ${qualification.reason}.`,409,"SIGNAL_QUALIFICATION_REVOKED");
  return{crossing,identity,qualification,lastCandle:candles.at(-1)?.time||null,executionOpportunity:opportunity,signalExecutionWindowVersion:SIGNAL_EXECUTION_WINDOW_VERSION};
}

export const CANDIDATE_SIGNAL_CALCULATION_VERSION=H.VERSION;
export const CANDIDATE_SIGNAL_QUALIFICATION_VERSION=S.VERSION;
export const __candidateSignalVerifierTest=Object.freeze({calculationVersion:H.VERSION,qualificationVersion:S.VERSION,signalExecutionWindowVersion:SIGNAL_EXECUTION_WINDOW_VERSION});
