const PIP_SIZE={USD_JPY:.01,EUR_JPY:.01,GBP_JPY:.01,AUD_JPY:.01,NZD_JPY:.01,CAD_JPY:.01,CHF_JPY:.01,default:.0001};
export const MAS_IM_TIMEFRAMES=Object.freeze(["M1","M5","M15","M30","H1","H4","D","W"]);
const TF_HOURS=Object.freeze({M1:1/60,M5:5/60,M15:15/60,M30:.5,H1:1,H4:4,D:24,W:168});
const DEFAULT_WINDOW=50,DEFAULT_HISTORY=100,MIN_HISTORY=20;

function getPipSize(pair){return PIP_SIZE[pair]||PIP_SIZE.default;}
function mean(values){return values.length?values.reduce((sum,value)=>sum+value,0)/values.length:NaN;}
function std(values,m=null){if(values.length<2)return NaN;const center=m??mean(values);const variance=values.reduce((sum,value)=>sum+(value-center)**2,0)/(values.length-1);return Math.sqrt(variance);}
function finite(values){return values.every(Number.isFinite);}
function closeOf(value){return typeof value==="number"?value:Number(value?.close);}
function timeOf(value){const parsed=Date.parse(value?.time||"");return Number.isFinite(parsed)?parsed:NaN;}

function normalCDF(x){const a1=.254829592,a2=-.284496736,a3=1.421413741,a4=-1.453152027,a5=1.061405429,p=.3275911,sign=x<0?-1:1;let scaled=Math.abs(x)/Math.sqrt(2);const t=1/(1+p*scaled),y=1-(((((a5*t+a4)*t+a3)*t+a2)*t+a1)*t*Math.exp(-scaled*scaled));return .5*(1+sign*y);}

export function calculateSlopeStats(prices,times=null){
  const n=prices.length;
  if(n<10)return{slope:0,intercept:0,r2:0,pValue:1,roc:0};
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
  const r2=ssTotal===0?0:1-ssResidual/ssTotal,se=denominator===0||n<=2?0:Math.sqrt(ssResidual/(n-2))/Math.sqrt(denominator),tStat=se===0?0:slope/se,pValue=tStat===0?1:Math.max(0,Math.min(1,2*(1-normalCDF(Math.abs(tStat))))),roc=n>1?(prices[n-1]-prices[0])/n:0;
  return{slope,intercept,r2:Math.max(0,r2),pValue,roc};
}

export function calculateLogSlopeStats(prices,times=null){
  if(prices.length<10||prices.some(price=>!Number.isFinite(price)||price<=0))return{slope:NaN,intercept:NaN,r2:NaN,pValue:NaN,roc:NaN};
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

function windowStats(frame,tf,end,window){
  const start=end-window+1,closes=frame.slice(start,end+1).map(closeOf);
  if(closes.length!==window||!finite(closes)||closes.some(value=>value<=0))return null;
  const hours=relativeHours(frame,tf,start,end),logStats=calculateLogSlopeStats(closes,hours),rawStats=calculateSlopeStats(closes),priceHourStats=calculateSlopeStats(closes,hours);
  if(!Number.isFinite(logStats.slope))return null;
  return{...rawStats,logSlopePerHour:logStats.slope,priceSlopePerHour:priceHourStats.slope,pipsPerHour:priceHourStats.slope/getPipSize("default")};
}

function frameSlopeSeries(pair,tf,frame,window){
  if(!Array.isArray(frame)||frame.length<window)return[];
  const series=[];
  for(let end=window-1;end<frame.length;end++){
    const stats=windowStats(frame,tf,end,window);
    if(stats)series.push({...stats,pipsPerHour:stats.priceSlopePerHour/getPipSize(pair),endIndex:end});
  }
  return series;
}

function compositeAtLag(seriesByTf,frames,lag){
  const values=[];
  for(const tf of frames){
    const series=seriesByTf[tf],row=series?.[series.length-1-lag],value=row?.logSlopePerHour;
    if(!Number.isFinite(value))return NaN;
    values.push(value);
  }
  return mean(values);
}

function compositeDistribution(seriesByTf,frames,historyLimit){
  if(!frames.length)return{value:NaN,history:[],mean:NaN,std:NaN,z:NaN};
  const lengths=frames.map(tf=>seriesByTf[tf]?.length||0),available=Math.min(...lengths);
  if(available<2)return{value:NaN,history:[],mean:NaN,std:NaN,z:NaN};
  const value=compositeAtLag(seriesByTf,frames,0),history=[];
  for(let lag=1;lag<available&&history.length<historyLimit;lag++){
    const historical=compositeAtLag(seriesByTf,frames,lag);
    if(Number.isFinite(historical))history.push(historical);
  }
  if(!Number.isFinite(value)||history.length<MIN_HISTORY)return{value,history,mean:history.length?mean(history):NaN,std:history.length>1?std(history):NaN,z:NaN};
  const historyMean=mean(history),historyStd=std(history,historyMean),z=Number.isFinite(historyStd)&&historyStd>Number.EPSILON?(value-historyMean)/historyStd:NaN;
  return{value,history,mean:historyMean,std:historyStd,z};
}

export function calculateMAS_IM_ZScores(pair,timeframe,priceCache,_legacySlopeHistoryCache=null,options={}){
  const currentIndex=MAS_IM_TIMEFRAMES.indexOf(timeframe),window=Math.max(10,Math.trunc(Number(options.window)||DEFAULT_WINDOW)),historyLimit=Math.max(MIN_HISTORY,Math.trunc(Number(options.history)||DEFAULT_HISTORY));
  if(currentIndex<0)return{perTF:{},MAS:NaN,IM:NaN,MAS_Z:NaN,IM_Z:NaN,IM_OVER_MAS:NaN,MAS_OVER_IM:NaN,summary:{pair,timeframe,mas_z:NaN,im_z:NaN,ratio:NaN,r2_avg:NaN,sig_avg:NaN}};

  const seriesByTf={},perTF={};
  for(const tf of MAS_IM_TIMEFRAMES){
    const series=frameSlopeSeries(pair,tf,priceCache?.[tf],window);
    seriesByTf[tf]=series;
    if(series.length)perTF[tf]=series.at(-1);
  }

  const masFrames=currentIndex===MAS_IM_TIMEFRAMES.length-1?["W"]:MAS_IM_TIMEFRAMES.slice(currentIndex+1),imFrames=MAS_IM_TIMEFRAMES.slice(0,currentIndex+1),mas=compositeDistribution(seriesByTf,masFrames,historyLimit),im=compositeDistribution(seriesByTf,imFrames,historyLimit),ratio=Number.isFinite(mas.value)&&Math.abs(mas.value)>Number.EPSILON?im.value/mas.value:NaN,reverseRatio=Number.isFinite(im.value)&&Math.abs(im.value)>Number.EPSILON?mas.value/im.value:NaN,rows=Object.values(perTF),r2Values=rows.map(row=>row.r2).filter(Number.isFinite),pValues=rows.map(row=>row.pValue).filter(Number.isFinite);

  return{
    perTF,
    MAS:mas.value,
    IM:im.value,
    MAS_Z:mas.z,
    IM_Z:im.z,
    IM_OVER_MAS:ratio,
    MAS_OVER_IM:reverseRatio,
    MAS_HISTORY_MEAN:mas.mean,
    MAS_HISTORY_STD:mas.std,
    IM_HISTORY_MEAN:im.mean,
    IM_HISTORY_STD:im.std,
    masFrames,
    imFrames,
    historyMode:"CAUSAL_SAME_LAG_MULTISCALE",
    summary:{pair,timeframe,mas_z:mas.z,im_z:im.z,ratio,r2_avg:r2Values.length?mean(r2Values):NaN,sig_avg:pValues.length?mean(pValues):NaN}
  };
}

export function calculateEventAngle(prevP,currP,bars){return bars===0?0:Math.atan2(currP-prevP,bars)*(180/Math.PI);}
export function classifyType(direction,MAS_Z){if(!Number.isFinite(MAS_Z)||MAS_Z===0)return"NEUTRAL";return Math.sign(direction)===Math.sign(MAS_Z)?"TREND_FOLLOWING":"REVERSION";}
