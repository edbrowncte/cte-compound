export const AGE_EXPECTATION_VERSION="AGE_GREAT_EXPECTATION@2.0.0";
export const AGE_REALLOCATION_MIN_INDEX=62;
export const AGE_REALLOCATION_DELTA_INDEX=12;
export const AGE_REALLOCATION_MAX_PER_CANDLE=1;

const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
const finite=(value,fallback=null)=>Number.isFinite(Number(value))?Number(value):fallback;
const directionNumber=value=>value===1||value==="BUY"?1:value===-1||value==="SELL"?-1:0;
const reportFor=(context,pair)=>context?.pairReports?.find(item=>item?.pair===pair)||context?.slots?.find(item=>item?.pair===pair)||null;
const mtfFor=(context,pair,direction)=>context?.mtfForecasts?.find(item=>item?.pair===pair&&directionNumber(item.direction)===direction)||null;

function optimizerQuality(candidate){
  const primary=candidate?.configuration?.primary||{},trades=Math.max(0,finite(primary.trades,0)),net=finite(primary.net,0),score=finite(primary.score,0),drawdown=Math.max(0,finite(primary.maxDrawdown,0)),winRate=clamp(finite(primary.winRate,.5),0,1),sample=clamp(trades/30,0,1),netPerTrade=trades>0?net/trades:0;
  const edge=clamp(.5+.28*Math.tanh(netPerTrade/8)+.22*Math.tanh(score/12),0,1),risk=clamp(Math.tanh(drawdown/25),0,1);
  return{trades,net,score,drawdown,winRate,sample,netPerTrade,edge,risk};
}

function regimeAdjustment(regime){
  switch(String(regime||"")){
    case"TREND_ALIGNED":return .06;
    case"TRANSITION":return .035;
    case"CHALLENGE":return -.015;
    case"ANTAGONIST_DETERIORATING":return .02;
    case"ANTAGONIST_ACCELERATING":return -.055;
    case"REVERSION_PRESSURE":return -.03;
    default:return 0;
  }
}

export function greatExpectation(candidate,context=null,directionOverride=null){
  const pair=String(candidate?.pair||""),direction=directionNumber(directionOverride??candidate?.event?.direction??candidate?.direction),report=reportFor(context,pair),mtf=mtfFor(context,pair,direction),optimizer=optimizerQuality(candidate);
  const confidence=clamp(finite(candidate?.confidence,finite(mtf?.confidence,.5)),0,1),strength=clamp(finite(report?.strength,.5),0,1),fit=clamp(finite(report?.r2,.5),0,1),transition=clamp(finite(report?.transitionProbability,.5),0,1),reportDirection=directionNumber(report?.direction),alignment=reportDirection?reportDirection===direction?1:-1:0;
  const pipsPerHour=finite(report?.pipsPerHour,null),signedPace=pipsPerHour===null?null:reportDirection?Math.abs(pipsPerHour)*alignment:pipsPerHour,paceQuality=signedPace===null?.5:clamp(.5+.5*Math.tanh(signedPace/25),0,1),riskQuality=1-optimizer.risk;
  let evidence=.24*confidence+.18*strength+.12*fit+.13*optimizer.winRate+.08*optimizer.sample+.08*transition+.10*optimizer.edge+.07*paceQuality;
  evidence=clamp(evidence+regimeAdjustment(report?.regime)+alignment*.045,0,1);
  const index=clamp(100*evidence*(.88+.12*riskQuality),0,100),expectedPipsPerHour=signedPace===null?null:signedPace*(.45+.55*evidence)*(.72+.28*riskQuality);
  return{version:AGE_EXPECTATION_VERSION,pair,direction,index,expectedPipsPerHour,evidence,riskPenalty:optimizer.risk,components:{confidence,strength,fit,transition,alignment,paceQuality,optimizerEdge:optimizer.edge,winRate:optimizer.winRate,sample:optimizer.sample,netPerTrade:optimizer.netPerTrade,drawdown:optimizer.drawdown,regime:String(report?.regime||"NEUTRAL")}};
}

export function continuationExpectation(position,requirement,context=null){
  const direction=directionNumber(position?.direction??position?.event?.direction),pair=String(position?.pair||position?.instrument||""),synthetic={pair,event:{direction},confidence:null,configuration:requirement?.configuration||null},expectation=greatExpectation(synthetic,context,direction),required=directionNumber(requirement?.event?.direction??requirement);
  let index=expectation.index,expectedPipsPerHour=expectation.expectedPipsPerHour,disposition="SUPPORTED";
  if(required&&required!==direction){index=Math.min(index,20);expectedPipsPerHour=Number.isFinite(expectedPipsPerHour)?-Math.abs(expectedPipsPerHour):null;disposition="OPPOSED_BY_CURRENT_III";}
  else if(!required){index=Math.max(0,index-10);disposition="NO_CURRENT_REQUIREMENT";}
  return{...expectation,index,expectedPipsPerHour,disposition};
}

export function annotateAgeCandidate(candidate,context=null,candidateType="NEW_ENTRY"){
  const expectation=greatExpectation(candidate,context);
  return{...candidate,AGE:{version:AGE_EXPECTATION_VERSION,candidateType,greatExpectation:expectation}};
}

export function reallocationDecision({positions=[],requirements={},selectedCandidate=null,context=null,manualPositions={}}={}){
  if(!selectedCandidate)return{action:"NO_CANDIDATE",qualified:false,selected:null,displacement:null,delta:null,threshold:AGE_REALLOCATION_DELTA_INDEX,minimum:AGE_REALLOCATION_MIN_INDEX};
  const selectedExpectation=selectedCandidate?.AGE?.greatExpectation||greatExpectation(selectedCandidate,context),selectedDirection=directionNumber(selectedCandidate?.event?.direction),protectedPairs=new Set(Object.keys(manualPositions||{}));
  const occupied=[];
  for(const position of positions||[]){
    const pair=String(position?.instrument||position?.pair||""),long=Number(position?.long?.units||0),short=Math.abs(Number(position?.short?.units||0)),direction=long>0?1:short>0?-1:directionNumber(position?.direction);
    if(!pair||!direction||protectedPairs.has(pair))continue;
    occupied.push({position,pair,direction,continuation:continuationExpectation({pair,direction},requirements?.[pair],context)});
  }
  const samePair=occupied.find(item=>item.pair===selectedCandidate.pair);
  if(samePair&&samePair.direction!==selectedDirection){
    const delta=selectedExpectation.index-samePair.continuation.index;
    return{action:"REVERSE",qualified:true,selected:selectedExpectation,displacement:samePair,delta,threshold:AGE_REALLOCATION_DELTA_INDEX,minimum:AGE_REALLOCATION_MIN_INDEX};
  }
  const candidates=occupied.filter(item=>item.pair!==selectedCandidate.pair&&item.continuation.disposition!=="OPPOSED_BY_CURRENT_III").map(item=>({...item,delta:selectedExpectation.index-item.continuation.index})).filter(item=>selectedExpectation.index>=AGE_REALLOCATION_MIN_INDEX&&item.delta>=AGE_REALLOCATION_DELTA_INDEX).sort((a,b)=>b.delta-a.delta||a.continuation.index-b.continuation.index);
  const displacement=candidates[0]||null;
  return displacement?{action:"REALLOCATE",qualified:true,selected:selectedExpectation,displacement,delta:displacement.delta,threshold:AGE_REALLOCATION_DELTA_INDEX,minimum:AGE_REALLOCATION_MIN_INDEX}:{action:"DEPLOY_WITHOUT_DISPLACEMENT",qualified:false,selected:selectedExpectation,displacement:null,delta:null,threshold:AGE_REALLOCATION_DELTA_INDEX,minimum:AGE_REALLOCATION_MIN_INDEX};
}

export const __ageTest=Object.freeze({directionNumber,optimizerQuality,regimeAdjustment,reportFor,mtfFor});
