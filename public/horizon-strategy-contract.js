(function installHorizonStrategyContract(root){
  "use strict";

  const H=root.CTE_HORIZON_HTL;
  if(!H)throw new Error("CTE Horizon HTL contract must load before the strategy contract.");

  const VERSION="CTE_HORIZON_STRATEGY_QUALIFICATION@2.0.0";
  const finite=Number.isFinite;
  const signRelation=(left,right,threshold=0)=>finite(left)&&finite(right)?left-right>threshold?1:left-right<-threshold?-1:0:0;

  function buildIndicators(candles,length){
    const horizon=H.build(candles,length);
    const assetMean=horizon.assetMean;
    const assetMeanInverse=horizon.assetMeanInverse;
    const naiAssetWma=H.wma(horizon.asset,length);
    const naiInverseWma=H.wma(horizon.inverse,length);
    const naiAsset=H.normalizedDifference(horizon.asset,naiAssetWma,H.stdev(horizon.asset,length));
    const naiInverse=H.normalizedDifference(horizon.inverse,naiInverseWma,H.stdev(horizon.inverse,length));
    const dareNAsset=H.normalizedDifference(assetMean,H.wma(assetMean,length),H.stdev(assetMean,length));
    const dareNInverse=H.normalizedDifference(assetMeanInverse,H.wma(assetMeanInverse,length),H.stdev(assetMeanInverse,length));
    return{
      horizon,
      asset:horizon.asset,
      inverse:horizon.inverse,
      assetMean,
      assetMeanInverse,
      meanAsset:assetMean,
      meanInverse:assetMeanInverse,
      assetDeviation:horizon.assetDeviation,
      naiAsset,
      naiInverse,
      dareNAsset,
      dareNInverse,
      zup:horizon.series.zup,
      puz:horizon.series.puz,
    };
  }

  function qualificationAt(indicators,index,strategy="ASSET",filter=0,direction=null){
    const crossingDirection=direction||H.crossDirection(indicators.asset,indicators.inverse,index);
    const threshold=Math.max(0,Number(filter)||0);
    if(!crossingDirection)return{qualified:false,direction:0,reason:"NO_RAW_ASSET_INVERSE_CROSSING",metrics:{}};

    if(strategy==="ASSET"){
      const sigma=indicators.assetDeviation[index];
      const separation=Math.abs(indicators.asset[index]-indicators.inverse[index]);
      const separationSigma=finite(sigma)&&sigma>0?separation/sigma:threshold<=0?Infinity:0;
      const qualified=threshold<=0||separationSigma>=threshold;
      return{qualified,direction:crossingDirection,reason:qualified?threshold<=0?"RAW_CROSSING_NO_FILTER":`ASSET_SEPARATION_SIGMA_${separationSigma.toFixed(4)}_GTE_${threshold}`:`ASSET_SEPARATION_SIGMA_${separationSigma.toFixed(4)}_LT_${threshold}`,metrics:{separation,separationSigma}};
    }

    if(strategy==="DARE"){
      const state=signRelation(indicators.assetMean[index],indicators.assetMeanInverse[index]);
      const qualified=state===crossingDirection;
      return{qualified,direction:crossingDirection,reason:qualified?"DARE_ASSET_MEAN_STATE_ALIGNS_RAW_CROSSING":"DARE_ASSET_MEAN_STATE_OPPOSES_RAW_CROSSING",metrics:{state}};
    }

    if(strategy==="DARE_N"){
      const spread=finite(indicators.dareNAsset[index])&&finite(indicators.dareNInverse[index])?indicators.dareNAsset[index]-indicators.dareNInverse[index]:null;
      const state=finite(spread)?Math.sign(spread):0;
      const qualified=state===crossingDirection&&Math.abs(spread)>=threshold;
      return{qualified,direction:crossingDirection,reason:qualified?`DARE_N_ALIGNED_ABS_SPREAD_${Math.abs(spread).toFixed(4)}_GTE_${threshold}`:"DARE_N_NOT_QUALIFIED",metrics:{spread,state}};
    }

    if(strategy==="NAI"){
      const spread=finite(indicators.naiAsset[index])&&finite(indicators.naiInverse[index])?indicators.naiAsset[index]-indicators.naiInverse[index]:null;
      const state=finite(spread)?Math.sign(spread):0;
      const qualified=state===crossingDirection&&Math.abs(spread)>=threshold;
      return{qualified,direction:crossingDirection,reason:qualified?`NAI_ALIGNED_ABS_SPREAD_${Math.abs(spread).toFixed(4)}_GTE_${threshold}`:"NAI_NOT_QUALIFIED",metrics:{spread,state}};
    }

    if(strategy==="APEX"){
      const z=indicators.zup[index],p=indicators.puz[index];
      const state=finite(z)&&finite(p)?z<=-threshold&&p>=threshold?1:z>=threshold&&p<=-threshold?-1:0:0;
      const qualified=state===crossingDirection;
      return{qualified,direction:crossingDirection,reason:qualified?"APEX_STATE_ALIGNS_RAW_CROSSING":"APEX_STATE_NOT_QUALIFIED",metrics:{zup:z,puz:p,state}};
    }

    if(strategy==="COMBO"){
      const dare=qualificationAt(indicators,index,"DARE",0,crossingDirection);
      const nai=qualificationAt(indicators,index,"NAI",threshold,crossingDirection);
      const qualified=dare.qualified&&nai.qualified;
      return{qualified,direction:crossingDirection,reason:qualified?"COMBO_CSF_DARE_AND_NAI_ALIGN_RAW_CROSSING":`COMBO_NOT_QUALIFIED__${dare.reason}__${nai.reason}`,metrics:{dare:dare.metrics,nai:nai.metrics}};
    }

    return{qualified:false,direction:crossingDirection,reason:"UNKNOWN_STRATEGY",metrics:{}};
  }

  function events(candles,length,strategy="ASSET",filter=0){
    const indicators=buildIndicators(candles,length);
    return indicators.horizon.crossings.map(crossing=>{
      const qualification=qualificationAt(indicators,crossing.index,strategy,filter,crossing.direction);
      return{index:crossing.index,time:crossing.time,direction:crossing.direction,rawCrossing:crossing,qualified:qualification.qualified,qualificationReason:qualification.reason,qualificationMetrics:qualification.metrics,calculationVersion:H.VERSION,qualificationVersion:VERSION};
    });
  }

  function active(candles,length,strategy="ASSET",filter=0){return events(candles,length,strategy,filter).at(-1)||null;}

  function directionAt(indicators,index,strategy="ASSET",filter=0){
    let crossingIndex=null,direction=0;
    const crossings=indicators.horizon?.crossings;
    if(Array.isArray(crossings)){
      let low=0,high=crossings.length-1;
      while(low<=high){
        const middle=(low+high)>>1;
        if(crossings[middle].index<=index){crossingIndex=crossings[middle].index;direction=crossings[middle].direction;low=middle+1;}else high=middle-1;
      }
    }else{
      for(let cursor=index;cursor>=1;cursor-=1){
        const candidate=H.crossDirection(indicators.asset,indicators.inverse,cursor);
        if(candidate){crossingIndex=cursor;direction=candidate;break;}
      }
    }
    if(crossingIndex===null)return 0;
    return qualificationAt(indicators,crossingIndex,strategy,filter,direction).qualified?direction:0;
  }

  root.CTE_HORIZON_STRATEGIES=Object.freeze({VERSION,buildIndicators,qualificationAt,events,active,directionAt});
})(typeof globalThis!=="undefined"?globalThis:self);
