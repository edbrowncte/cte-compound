import "../public/htl-horizon-contract.js";
import "../public/horizon-strategy-contract.js";

const H=globalThis.CTE_HORIZON_HTL,S=globalThis.CTE_HORIZON_STRATEGIES;
const failure=(message,status=409,code="SIGNAL_EXECUTION_WITHHELD")=>Object.assign(new Error(message),{status,code});

export function verifyCandidateSignal(candles,candidate){
  const indicators=S.buildIndicators(candles,candidate.context.length),crossings=indicators.horizon.crossings||[],crossing=crossings.find(event=>event.time===candidate.context.crossingTime&&event.direction===candidate.context.rawDirection);
  if(!crossing)throw failure("The cited Horizon crossing is not present in current completed OANDA history.",409,"SIGNAL_IDENTITY_NOT_FOUND");
  const latestCrossing=crossings.at(-1)||null,lastCandle=candles.at(-1)?.time||null;
  if(latestCrossing&&(latestCrossing.time!==crossing.time||latestCrossing.direction!==crossing.direction))throw failure("A newer Horizon crossing exists. Automatic execution never replays an earlier signal.",409,"SIGNAL_REPLAY_REJECTED");
  if(crossing.index!==candles.length-1||crossing.time!==lastCandle)throw failure("Automatic execution requires the newly completed crossing that is being processed now; historical crossings cannot initiate later orders.",409,"SIGNAL_REPLAY_REJECTED");
  const identity=H.crossingIdentity({pair:candidate.order.instrument,timeframe:candidate.context.timeframe,strategy:candidate.context.strategy,length:candidate.context.length,filter:candidate.context.filter,crossing});
  if(identity!==candidate.context.crossingIdentity)throw failure("The Horizon crossing identity changed during live revalidation.",409,"SIGNAL_IDENTITY_CHANGED");
  const qualification=S.qualificationAt(indicators,crossing.index,candidate.context.strategy,candidate.context.filter,crossing.direction);
  if(!qualification.qualified)throw failure(`The raw crossing is current but ${candidate.context.strategy} does not qualify it: ${qualification.reason}.`,409,"SIGNAL_QUALIFICATION_REVOKED");
  return{crossing,identity,qualification,lastCandle};
}

export const CANDIDATE_SIGNAL_CALCULATION_VERSION=H.VERSION;
export const CANDIDATE_SIGNAL_QUALIFICATION_VERSION=S.VERSION;
export const __candidateSignalVerifierTest=Object.freeze({calculationVersion:H.VERSION,qualificationVersion:S.VERSION});
