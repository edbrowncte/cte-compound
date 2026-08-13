import "../public/htl-horizon-contract.js";
import "../public/horizon-strategy-contract.js";

const H=globalThis.CTE_HORIZON_HTL,S=globalThis.CTE_HORIZON_STRATEGIES;
const failure=(message,status=409)=>Object.assign(new Error(message),{status});

export function verifyCandidateSignal(candles,candidate){
  const indicators=S.buildIndicators(candles,candidate.context.length),crossing=indicators.horizon.crossings.find(event=>event.time===candidate.context.crossingTime&&event.direction===candidate.context.rawDirection);
  if(!crossing)throw failure("The cited Horizon crossing is not present in current completed OANDA history.");
  if(crossing.index!==candles.length-1||crossing.time!==candles.at(-1)?.time)throw failure("The cited Horizon crossing is not the latest completed OANDA candle.");
  const identity=H.crossingIdentity({pair:candidate.order.instrument,timeframe:candidate.context.timeframe,strategy:candidate.context.strategy,length:candidate.context.length,filter:candidate.context.filter,crossing});
  if(identity!==candidate.context.crossingIdentity)throw failure("The Horizon crossing identity changed during live revalidation.");
  const qualification=S.qualificationAt(indicators,crossing.index,candidate.context.strategy,candidate.context.filter,crossing.direction);
  if(!qualification.qualified)throw failure(`The raw crossing remains valid but ${candidate.context.strategy} no longer qualifies it: ${qualification.reason}.`);
  return{crossing,identity,qualification,lastCandle:candles.at(-1)?.time||null};
}

export const CANDIDATE_SIGNAL_CALCULATION_VERSION=H.VERSION;
export const CANDIDATE_SIGNAL_QUALIFICATION_VERSION=S.VERSION;
export const __candidateSignalVerifierTest=Object.freeze({calculationVersion:H.VERSION,qualificationVersion:S.VERSION});
