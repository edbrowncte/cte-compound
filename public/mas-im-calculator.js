(function installMasIm(global){
  "use strict";

  const VERSION="MAS_ANTAGONIST_PRESSURE@2.0.0";
  const PIP_SIZE={USD_JPY:.01,EUR_JPY:.01,GBP_JPY:.01,AUD_JPY:.01,NZD_JPY:.01,CAD_JPY:.01,CHF_JPY:.01,default:.0001};
  const MAS_IM_TIMEFRAMES=Object.freeze(["S5","S30","M1","M5","M15","M30","H1","H4","D","W"]);
  const TF_MS=Object.freeze({S5:5000,S30:30000,M1:60000,M5:300000,M15:900000,M30:1800000,H1:3600000,H4:14400000,D:86400000,W:604800000});
  const TF_HOURS=Object.freeze(Object.fromEntries(Object.entries(TF_MS).map(([tf,ms])=>[tf,ms/3600000])));
  const DEFAULT_WINDOW=50,DEFAULT_HISTORY=100,MIN_HISTORY=20,DEFAULT_ROC_WINDOW=5,MIN_EVENT_HISTORY=5,MODEL_RATIO_CAP=20,MACRO_DEADZONE=.05;

  const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
  const getPipSize=pair=>PIP_SIZE[pair]||PIP_SIZE.default;
  const mean=values=>values.length?values.reduce((sum,value)=>sum+value,0)/values.length:NaN;
  const std=(values,m=null)=>{if(values.length<2)return NaN;const center=m??mean(values),variance=values.reduce((sum,value)=>sum+(value-center)**2,0)/(values.length-1);return Math.sqrt(variance);};
  const finite=values=>values.every(Number.isFinite);
  const closeOf=value=>typeof value==="number"?value:Number(value?.close);
  const timeOf=value=>{const parsed=Date.parse(value?.time||"");return Number.isFinite(parsed)?parsed:NaN;};
  const signWithDeadzone=(value,deadzone=MACRO_DEADZONE)=>Number.isFinite(value)&&Math.abs(value)>=deadzone?Math.sign(value):0;

  function normalCDF(x){
    const a1=.254829592,a2=-.284496736,a3=1.421413741,a4=-1.453152027,a5=1.061405429,p=.3275911,sign=x<0?-1:1,scaled=Math.abs(x)/Math.sqrt(2),t=1/(1+p*scaled),y=1-(((((a5*t+a4)*t+a3)*t+a2)*t+a1)*t*Math.exp(-scaled*scaled));
    return .5*(1+sign*y);
  }

  function calculateSlopeStats(prices,times=null){
    const n=prices.length;
    if(n<10)return{slope:0,intercept:0,r2:0,pValue:1,roc:0,tStat:0,fStat:0,se:NaN,n};
    const x=times||prices.map((_,index)=>index),xMean=mean(x),yMean=mean(prices);
    let numerator=0,denominator=0,ssTotal=0,ssResidual=0;
    for(let index=0;index<n;index++){
      numerator+=(x[index]-xMean)*(prices[index]-yMean);
      denominator+=(x[index]-xMean)**2;
      ssTotal+=(prices[index]-yMean)**2;
    }
    const slope=denominator===0?0:numerator/denominator,intercept=yMean-slope*xMean;
    for(let index=0;index<n;index++){
      const predicted=slope*x[index]+intercept;
      ssResidual+=(prices[index]-predicted)**2;
    }
    const r2=ssTotal===0?0:1-ssResidual/ssTotal,se=denominator===0||n<=2?NaN:Math.sqrt(ssResidual/(n-2))/Math.sqrt(denominator),tStat=Number.isFinite(se)&&se>0?slope/se:0,pValue=tStat===0?1:clamp(2*(1-normalCDF(Math.abs(tStat))),0,1),fStat=tStat*tStat,span=x[n-1]-x[0],roc=n>1&&Number.isFinite(span)&&span!==0?(prices[n-1]-prices[0])/span:0;
    return{slope,intercept,r2:clamp(r2,0,1),pValue,roc,tStat,fStat,se,n};
  }

  function calculateLogSlopeStats(prices,times=null){
    if(prices.length<10||prices.some(price=>!Number.isFinite(price)||price<=0))return{slope:NaN,intercept:NaN,r2:NaN,pValue:NaN,roc:NaN,tStat:NaN,fStat:NaN,se:NaN,n:prices.length};
    return calculateSlopeStats(prices.map(Math.log),times);
  }

  function relativeHours(frame,tf,start,end){
    const firstTime=timeOf(frame[start]),hours=[];
    if(Number.isFinite(firstTime)){
      for(let index=start;index<=end;index++){
        const timestamp=timeOf(frame[index]);
        if(!Number.isFinite(timestamp))return Array.from({length:end-start+1},(_,offset)=>offset*TF_HOURS[tf]);
        hours.push((timestamp-firstTime)/3600000);
      }
      return hours;
    }
    return Array.from({length:end-start+1},(_,offset)=>offset*TF_HOURS[tf]);
  }

  function completedAt(frame,tf,end){
    const next=timeOf(frame[end+1]);
    if(Number.isFinite(next))return next;
    const current=timeOf(frame[end]);
    return Number.isFinite(current)?current+TF_MS[tf]:NaN;
  }

  function trendPower(logStats){
    if(!Number.isFinite(logStats?.slope)||!Number.isFinite(logStats?.tStat)||!Number.isFinite(logStats?.r2))return NaN;
    const direction=Math.sign(logStats.slope);
    if(!direction)return 0;
    const evidence=Math.tanh(Math.abs(logStats.tStat)/3),fit=Math.sqrt(clamp(logStats.r2,0,1));
    return direction*evidence*fit;
  }

  function windowStats(frame,tf,end,window,pair){
    const start=end-window+1,closes=frame.slice(start,end+1).map(closeOf);
    if(closes.length!==window||!finite(closes)||closes.some(value=>value<=0))return null;
    const hours=relativeHours(frame,tf,start,end),logStats=calculateLogSlopeStats(closes,hours),priceHourStats=calculateSlopeStats(closes,hours),rawStats=calculateSlopeStats(closes);
    if(!Number.isFinite(logStats.slope))return null;
    return{
      slope:rawStats.slope,
      rawRoc:rawStats.roc,
      logSlopePerHour:logStats.slope,
      priceSlopePerHour:priceHourStats.slope,
      pipsPerHour:priceHourStats.slope/getPipSize(pair),
      r2:logStats.r2,
      pValue:logStats.pValue,
      tStat:logStats.tStat,
      fStat:logStats.fStat,
      trendPower:trendPower(logStats),
      completedAt:completedAt(frame,tf,end),
      endIndex:end,
    };
  }

  function frameSlopeSeries(pair,tf,frame,window){
    if(!Array.isArray(frame)||frame.length<window)return[];
    const series=[];
    for(let end=window-1;end<frame.length;end++){
      const stats=windowStats(frame,tf,end,window,pair);
      if(stats&&Number.isFinite(stats.completedAt))series.push(stats);
    }
    return series;
  }

  function timeframeHierarchy(timeframe){
    const index=MAS_IM_TIMEFRAMES.indexOf(timeframe);
    return index<0?[]:MAS_IM_TIMEFRAMES.slice(index);
  }

  function rowAtOrBefore(series,anchorMs){
    if(!Array.isArray(series)||!series.length||!Number.isFinite(anchorMs))return null;
    let low=0,high=series.length-1,best=-1;
    while(low<=high){
      const mid=(low+high)>>1,value=series[mid].completedAt;
      if(value<=anchorMs){best=mid;low=mid+1;}else high=mid-1;
    }
    return best>=0?series[best]:null;
  }

  function pressureFromForces(hierarchy,direction,forces){
    if(!hierarchy.length||!direction)return null;
    const n=hierarchy.length,totalWeight=n*(n+1)/2;
    let mas=0,im=0,macro=0;
    const perFrame={};
    for(let index=0;index<n;index++){
      const tf=hierarchy[index],force=Number(forces?.[tf]);
      if(!Number.isFinite(force))return null;
      const masWeight=index+1,imWeight=n-index,oriented=direction*force,antagonist=Math.max(0,-oriented),support=Math.max(0,oriented);
      mas+=masWeight*antagonist;
      im+=imWeight*support;
      macro+=masWeight*force;
      perFrame[tf]={force,oriented,antagonist,support,masWeight,imWeight};
    }
    mas/=totalWeight;im/=totalWeight;macro/=totalWeight;
    const rawRatio=mas>1e-12?im/mas:im>1e-12?Infinity:0,modelRatio=mas>1e-12?Math.min(MODEL_RATIO_CAP,rawRatio):im>1e-12?MODEL_RATIO_CAP:0;
    return{MAS:mas,IM:im,IM_OVER_MAS:rawRatio,MODEL_RATIO:modelRatio,macroForce:macro,macroDirection:signWithDeadzone(macro),perFrame};
  }

  function pressureStateAt(seriesByTf,hierarchy,anchorMs,direction){
    const rows={},forces={};
    for(const tf of hierarchy){
      const row=rowAtOrBefore(seriesByTf[tf],anchorMs);
      if(!row||!Number.isFinite(row.trendPower))return null;
      rows[tf]=row;forces[tf]=row.trendPower;
    }
    const pressure=pressureFromForces(hierarchy,direction,forces);
    return pressure?{...pressure,anchorMs,rows}:null;
  }

  function causalZSeries(values,historyLimit,minHistory=MIN_HISTORY){
    return values.map((value,index)=>{
      if(!Number.isFinite(value))return NaN;
      const prior=values.slice(Math.max(0,index-historyLimit),index).filter(Number.isFinite);
      if(prior.length<minHistory)return NaN;
      const m=mean(prior),s=std(prior,m);
      return Number.isFinite(s)&&s>Number.EPSILON?(value-m)/s:NaN;
    });
  }

  function roc(values,window=DEFAULT_ROC_WINDOW){
    const sample=values.filter(Number.isFinite).slice(-Math.max(2,window));
    if(sample.length<2)return NaN;
    return calculateSlopeStats(sample, sample.map((_,index)=>index)).slope;
  }

  function normalizeEvents(events,timeframe,anchorMs){
    const duration=TF_MS[timeframe]||0,out=[];
    for(const event of Array.isArray(events)?events:[]){
      const start=Date.parse(event?.time||event?.startTime||""),direction=Math.sign(Number(event?.direction)||0),price=Number(event?.price??event?.openPrice);
      if(!Number.isFinite(start)||!direction)continue;
      const observedAt=Number(event?.completedAt)||start+duration;
      if(Number.isFinite(anchorMs)&&observedAt>anchorMs)continue;
      out.push({...event,direction,price:Number.isFinite(price)&&price>0?price:NaN,observedAt});
    }
    out.sort((a,b)=>a.observedAt-b.observedAt);
    return out.filter((event,index)=>index===0||event.observedAt!==out[index-1].observedAt||event.direction!==out[index-1].direction);
  }

  function eventPowerDiagnostics(events,historyLimit){
    const velocity=[];
    for(let index=1;index<events.length;index++){
      const previous=events[index-1],current=events[index],hours=(current.observedAt-previous.observedAt)/3600000;
      if(!(hours>0)||!Number.isFinite(hours)){velocity.push(NaN);continue;}
      if(!Number.isFinite(previous.price)||!Number.isFinite(current.price)||previous.price<=0||current.price<=0){velocity.push(NaN);continue;}
      velocity.push(current.direction*Math.log(current.price/previous.price)/hours);
    }
    const zSeries=causalZSeries(velocity,historyLimit,MIN_EVENT_HISTORY),eventAngleZ=zSeries.at(-1),priorAngleZ=zSeries.slice(0,-1).reverse().find(Number.isFinite),convexity=Number.isFinite(eventAngleZ)&&Number.isFinite(priorAngleZ)?eventAngleZ-priorAngleZ:NaN,eventAngle=Number.isFinite(eventAngleZ)?Math.atan(eventAngleZ)*180/Math.PI:NaN;
    return{velocity,zSeries,eventVelocity:velocity.at(-1),eventAngleZ,eventAngle,convexity};
  }

  function transitionSucceeded(seriesByTf,hierarchy,activeSeries,event,nextEvent,confirmBars=2){
    let consecutive=0;
    for(const anchor of activeSeries){
      if(anchor.completedAt<=event.observedAt)continue;
      if(anchor.completedAt>nextEvent.observedAt)break;
      const state=pressureStateAt(seriesByTf,hierarchy,anchor.completedAt,event.direction);
      if(!state)continue;
      if(state.macroDirection===event.direction){
        consecutive++;
        if(consecutive>=confirmBars)return true;
      }else consecutive=0;
    }
    return false;
  }

  function transitionSamples(seriesByTf,hierarchy,activeSeries,events){
    const samples=[];
    for(let index=0;index<events.length-1;index++){
      const event=events[index],nextEvent=events[index+1],state=pressureStateAt(seriesByTf,hierarchy,event.observedAt,event.direction);
      if(!state||state.macroDirection===0||state.macroDirection===event.direction)continue;
      samples.push({ratio:state.MODEL_RATIO,success:transitionSucceeded(seriesByTf,hierarchy,activeSeries,event,nextEvent),time:event.observedAt,direction:event.direction});
    }
    return samples;
  }

  function learnTransitionThreshold(samples){
    const usable=samples.filter(sample=>Number.isFinite(sample.ratio)&&typeof sample.success==="boolean");
    const positives=usable.filter(sample=>sample.success).length,negatives=usable.length-positives;
    if(usable.length<6||!positives||!negatives)return{threshold:1,source:"PARITY_FALLBACK",samples:usable.length,positives,negatives,balancedAccuracy:NaN};
    const candidates=[...new Set(usable.map(sample=>sample.ratio))].sort((a,b)=>a-b);
    let best=null;
    for(const threshold of candidates){
      let tp=0,tn=0,fp=0,fn=0;
      for(const sample of usable){
        const predicted=sample.ratio>=threshold;
        if(predicted&&sample.success)tp++;
        else if(predicted&&!sample.success)fp++;
        else if(!predicted&&sample.success)fn++;
        else tn++;
      }
      const tpr=tp/(tp+fn),tnr=tn/(tn+fp),balanced=(tpr+tnr)/2;
      const candidate={threshold,balancedAccuracy:balanced};
      if(!best||candidate.balancedAccuracy>best.balancedAccuracy+1e-12||(Math.abs(candidate.balancedAccuracy-best.balancedAccuracy)<=1e-12&&Math.abs(candidate.threshold-1)<Math.abs(best.threshold-1)))best=candidate;
    }
    return{...best,source:"ROLLING_EVENT_CLASSIFICATION",samples:usable.length,positives,negatives};
  }

  function transitionProbability(samples,currentRatio){
    const usable=samples.filter(sample=>Number.isFinite(sample.ratio)&&typeof sample.success==="boolean");
    if(usable.length<4||!Number.isFinite(currentRatio))return NaN;
    const x=Math.log1p(Math.min(MODEL_RATIO_CAP,currentRatio)),xs=usable.map(sample=>Math.log1p(sample.ratio)),spread=std(xs),bandwidth=Math.max(.2,Number.isFinite(spread)?spread*.75:.35),base=usable.filter(sample=>sample.success).length/usable.length;
    let weightSum=0,successWeight=0;
    for(let index=0;index<usable.length;index++){
      const distance=(xs[index]-x)/bandwidth,weight=Math.exp(-.5*distance*distance);
      weightSum+=weight;successWeight+=weight*(usable[index].success?1:0);
    }
    return clamp((successWeight+2*base)/(weightSum+2),0,1);
  }

  function classifyRegime(current,direction,threshold,masRoc,imRoc,ratioRoc){
    if(!current||!direction)return"NEUTRAL";
    if(current.macroDirection===direction)return"TREND_ALIGNED";
    if(current.MODEL_RATIO>=threshold&&Number.isFinite(ratioRoc)&&ratioRoc>=0)return"TRANSITION";
    if(current.MODEL_RATIO>=1)return"CHALLENGE";
    if(Number.isFinite(masRoc)&&Number.isFinite(imRoc)&&masRoc<0&&imRoc>0)return"ANTAGONIST_DETERIORATING";
    if(Number.isFinite(masRoc)&&masRoc>0&&(!Number.isFinite(imRoc)||imRoc<=0))return"ANTAGONIST_ACCELERATING";
    return"REVERSION_PRESSURE";
  }

  function unavailable(pair,timeframe,direction=0){
    return{version:VERSION,pair,timeframe,signalDirection:direction,hierarchy:timeframeHierarchy(timeframe),perTF:{},MAS:NaN,IM:NaN,IM_OVER_MAS:NaN,MODEL_RATIO:NaN,MAS_Z:NaN,IM_Z:NaN,MAS_ROC:NaN,IM_ROC:NaN,RATIO_ROC:NaN,EVENT_ANGLE_Z:NaN,EVENT_ANGLE:NaN,CONVEXITY:NaN,R2:NaN,F_STAT:NaN,P_VALUE:NaN,PIPS_PER_HOUR:NaN,REQUIRED_IM:NaN,TRANSITION_THRESHOLD:NaN,TRANSITION_PROBABILITY:NaN,TRANSITION_SAMPLE_COUNT:0,REGIME:"NEUTRAL",TYPE:"NEUTRAL",MAS_SERIES:[],IM_SERIES:[],RATIO_SERIES:[],MAS_Z_SERIES:[],IM_Z_SERIES:[],historyMode:"TIMESTAMP_SYNCHRONIZED_HIERARCHICAL_PRESSURE"};
  }

  function calculateMASIMPressure(pair,timeframe,priceCache,options={}){
    const hierarchy=timeframeHierarchy(timeframe),direction=Math.sign(Number(options.direction)||0),window=Math.max(10,Math.trunc(Number(options.window)||DEFAULT_WINDOW)),historyLimit=Math.max(MIN_HISTORY,Math.trunc(Number(options.history)||DEFAULT_HISTORY)),rocWindow=Math.max(2,Math.trunc(Number(options.rocWindow)||DEFAULT_ROC_WINDOW));
    if(!hierarchy.length||!direction)return unavailable(pair,timeframe,direction);

    const seriesByTf={},perTF={};
    for(const tf of hierarchy){
      const series=frameSlopeSeries(pair,tf,priceCache?.[tf],window);
      seriesByTf[tf]=series;
      if(series.length)perTF[tf]=series.at(-1);
    }
    const activeSeries=seriesByTf[timeframe]||[];
    if(!activeSeries.length||hierarchy.some(tf=>!(seriesByTf[tf]||[]).length))return unavailable(pair,timeframe,direction);

    const anchorMs=activeSeries.at(-1).completedAt,current=pressureStateAt(seriesByTf,hierarchy,anchorMs,direction);
    if(!current)return unavailable(pair,timeframe,direction);

    const timeline=[];
    for(const anchor of activeSeries){
      const state=pressureStateAt(seriesByTf,hierarchy,anchor.completedAt,direction);
      if(state)timeline.push(state);
    }
    const masSeries=timeline.map(state=>state.MAS),imSeries=timeline.map(state=>state.IM),ratioSeries=timeline.map(state=>state.MODEL_RATIO),masZSeries=causalZSeries(masSeries,historyLimit),imZSeries=causalZSeries(imSeries,historyLimit),masRoc=roc(masSeries,rocWindow),imRoc=roc(imSeries,rocWindow),ratioRoc=roc(ratioSeries,rocWindow);

    const events=normalizeEvents(options.events,timeframe,anchorMs),eventPower=eventPowerDiagnostics(events,historyLimit),samples=transitionSamples(seriesByTf,hierarchy,activeSeries,events),threshold=learnTransitionThreshold(samples),probability=current.macroDirection===direction?1:transitionProbability(samples,current.MODEL_RATIO),requiredIm=current.macroDirection===direction?0:threshold.threshold*current.MAS,selected=perTF[timeframe]||{},regime=classifyRegime(current,direction,threshold.threshold,masRoc,imRoc,ratioRoc),type=current.macroDirection===direction?"TREND_FOLLOWING":"REVERSION";

    return{
      version:VERSION,pair,timeframe,signalDirection:direction,hierarchy,perTF,
      MAS:current.MAS,IM:current.IM,IM_OVER_MAS:current.IM_OVER_MAS,MODEL_RATIO:current.MODEL_RATIO,
      MAS_Z:masZSeries.at(-1),IM_Z:imZSeries.at(-1),MAS_ROC:masRoc,IM_ROC:imRoc,RATIO_ROC:ratioRoc,
      EVENT_VELOCITY:eventPower.eventVelocity,EVENT_ANGLE_Z:eventPower.eventAngleZ,EVENT_ANGLE:eventPower.eventAngle,CONVEXITY:eventPower.convexity,
      R2:selected.r2??NaN,F_STAT:selected.fStat??NaN,P_VALUE:selected.pValue??NaN,PIPS_PER_HOUR:selected.pipsPerHour??NaN,
      REQUIRED_IM:requiredIm,TRANSITION_THRESHOLD:threshold.threshold,TRANSITION_THRESHOLD_SOURCE:threshold.source,TRANSITION_PROBABILITY:probability,TRANSITION_SAMPLE_COUNT:threshold.samples,TRANSITION_SUCCESS_COUNT:threshold.positives,
      REGIME:regime,TYPE:type,macroForce:current.macroForce,macroDirection:current.macroDirection,currentFrames:current.perFrame,
      MAS_SERIES:masSeries,IM_SERIES:imSeries,RATIO_SERIES:ratioSeries,MAS_Z_SERIES:masZSeries,IM_Z_SERIES:imZSeries,
      historyMode:"TIMESTAMP_SYNCHRONIZED_HIERARCHICAL_PRESSURE",
      summary:{pair,timeframe,signal:direction,mas:current.MAS,im:current.IM,ratio:current.IM_OVER_MAS,masRoc,imRoc,ratioRoc,eventAngleZ:eventPower.eventAngleZ,convexity:eventPower.convexity,r2:selected.r2??NaN,fStat:selected.fStat??NaN,pValue:selected.pValue??NaN,pipsPerHour:selected.pipsPerHour??NaN,requiredIm,transitionProbability:probability,regime}
    };
  }

  function calculateMAS_IM_ZScores(pair,timeframe,priceCache,_legacySlopeHistoryCache=null,options={}){
    return calculateMASIMPressure(pair,timeframe,priceCache,options);
  }

  function calculateEventAngle(prevP,currP,bars){
    if(!Number.isFinite(prevP)||!Number.isFinite(currP)||!Number.isFinite(bars)||bars===0||prevP<=0||currP<=0)return NaN;
    return Math.atan(Math.log(currP/prevP)/bars)*180/Math.PI;
  }

  function classifyType(direction,macroForce){
    if(!direction||!Number.isFinite(macroForce)||Math.abs(macroForce)<MACRO_DEADZONE)return"NEUTRAL";
    return Math.sign(direction)===Math.sign(macroForce)?"TREND_FOLLOWING":"REVERSION";
  }

  global.CTEMASIM=Object.freeze({
    VERSION,MAS_IM_TIMEFRAMES,TF_MS,timeframeHierarchy,calculateSlopeStats,calculateLogSlopeStats,calculateMASIMPressure,calculateMAS_IM_ZScores,calculateEventAngle,classifyType,
    __test:Object.freeze({trendPower,pressureFromForces,learnTransitionThreshold,transitionProbability,signWithDeadzone})
  });
})(globalThis);
