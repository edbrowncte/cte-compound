(function installCandidateContext(root){
  "use strict";
  const horizon=root.CTE_HORIZON_HTL,strategies=root.CTE_HORIZON_STRATEGIES;
  if(!horizon||!strategies||typeof root.oandaPost!=="function")return;
  const prior=root.oandaPost;
  root.oandaPost=async function(path,body){
    const context=body?.cteContext;
    if(context?.crossingTime&&typeof state!=="undefined"){
      const pair=context.pair,timeframe=context.timeframe,strategy=context.strategy||"ASSET",length=Math.max(3,Math.trunc(Number(context.length)||10)),filter=Math.max(0,Number(context.filter)||0),candles=state.scheduleCandles?.get?.(`${pair}|${timeframe}`);
      if(candles?.length){
        const indicators=strategies.buildIndicators(candles,length),crossing=indicators.horizon.crossings.find(event=>event.time===context.crossingTime&&event.direction===context.rawDirection);
        if(crossing){
          const qualification=strategies.qualificationAt(indicators,crossing.index,strategy,filter,crossing.direction);
          body={...body,cteContext:{...context,configuredStrategy:strategy,crossingStrategy:"ASSET",crossingIdentity:horizon.crossingIdentity({pair,timeframe,strategy,length,filter,crossing}),qualificationVersion:strategies.VERSION,qualificationResult:qualification.qualified?"QUALIFIED":"REJECTED",qualificationReason:qualification.reason}};
        }
      }
    }
    return prior(path,body);
  };
  try{oandaPost=root.oandaPost;}catch{}
})(globalThis);
