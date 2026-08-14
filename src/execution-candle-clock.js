export const EXECUTION_CLOCK_SOURCE="OANDA_ACCOUNT_CANDLES_LATEST@1.0.0";
export const EXECUTION_CLOCK_PAIR="EUR_USD";

export function latestCompletedCandleTime(payload={},pair=EXECUTION_CLOCK_PAIR,timeframe=null){
  const groups=Array.isArray(payload?.latestCandles)?payload.latestCandles:[];
  const selected=groups.find(item=>item?.instrument===pair&&(!timeframe||item?.granularity===timeframe))||groups.find(item=>item?.instrument===pair)||groups[0]||null;
  const completed=(Array.isArray(selected?.candles)?selected.candles:[]).filter(candle=>candle?.complete===true&&candle?.time);
  return completed.at(-1)?.time||null;
}

export async function executionClockCandle(callOanda,accountId,timeframe,pair=EXECUTION_CLOCK_PAIR){
  if(typeof callOanda!=="function")throw new TypeError("Execution clock requires an OANDA request function");
  const query=new URLSearchParams({candleSpecifications:`${pair}:${timeframe}:M`,smooth:"false"});
  const payload=await callOanda(`/v3/accounts/${encodeURIComponent(accountId)}/candles/latest?${query}`);
  const time=latestCompletedCandleTime(payload,pair,timeframe);
  if(!time)throw new Error(`OANDA latest completed candle unavailable for ${pair} ${timeframe}`);
  return time;
}
