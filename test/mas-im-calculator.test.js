import test from "node:test";
import assert from "node:assert/strict";
import {
  MAS_IM_VERSION,
  MAS_IM_TIMEFRAMES,
  MAS_IM_TF_MS,
  timeframeHierarchy,
  calculateMASIMPressure,
  calculateLogSlopeStats,
  __masImTest,
} from "../src/mas-im-calculator.js";

const END=Date.UTC(2026,7,7,20,0,0);

function frame(tf,{scale=1.2,phase=0,count=260,trend=.00008,end=END}={}){
  const step=MAS_IM_TF_MS[tf],start=end-count*step;
  return Array.from({length:count},(_,index)=>{
    const hours=index*step/3600000;
    const wave=.002*Math.sin(index/11+phase)+.0008*Math.cos(index/23+phase*.7);
    const close=scale*Math.exp(trend*hours+wave);
    return{time:new Date(start+index*step).toISOString(),close};
  });
}

function cache(scale=1.2,trend=.00008){
  return Object.fromEntries(MAS_IM_TIMEFRAMES.map((tf,index)=>[tf,frame(tf,{scale,trend,phase:index*.17})]));
}

function scaledCache(source,multiplier){
  return Object.fromEntries(Object.entries(source).map(([tf,rows])=>[tf,rows.map(row=>({...row,close:row.close*multiplier}))]));
}

function monotonicCache(scale=1.2,trend=.0002){
  return Object.fromEntries(MAS_IM_TIMEFRAMES.map(tf=>[tf,frame(tf,{scale,trend,phase:0}).map((row,index)=>({...row,close:scale*Math.exp(trend*index*MAS_IM_TF_MS[tf]/3600000)}))]));
}

function eventSeries(tf,rows,count=14){
  const spacing=Math.floor((rows.length-80)/count),events=[];
  for(let index=0;index<count;index++){
    const candleIndex=70+index*spacing;
    const candle=rows[candleIndex];
    events.push({time:candle.time,price:candle.close,direction:index%2===0?1:-1});
  }
  return events;
}

test("v2 uses the complete S5-to-W hierarchy including H2",()=>{
  assert.equal(MAS_IM_VERSION,"MAS_ANTAGONIST_PRESSURE@2.1.0");
  assert.deepEqual(MAS_IM_TIMEFRAMES,["S5","S30","M1","M5","M15","M30","H1","H2","H4","D","W"]);
  assert.deepEqual(timeframeHierarchy("D"),["D","W"]);
  assert.deepEqual(timeframeHierarchy("H2"),["H2","H4","D","W"]);
  assert.deepEqual(timeframeHierarchy("H1"),["H1","H2","H4","D","W"]);
  assert.deepEqual(timeframeHierarchy("S5"),MAS_IM_TIMEFRAMES);
});

test("log OLS slope is invariant to nominal price scale",()=>{
  const prices=Array.from({length:80},(_,index)=>1.2*Math.exp(.0004*index+.01*Math.sin(index/9)));
  const scaled=prices.map(value=>value*125);
  const left=calculateLogSlopeStats(prices).slope,right=calculateLogSlopeStats(scaled).slope;
  assert.ok(Math.abs(left-right)<1e-12,`${left} != ${right}`);
});

test("MAS applies macro-heavy antagonist weights and IM applies the exact reverse cadence",()=>{
  const hierarchy=["H1","H4","D","W"],direction=1;
  const pressure=__masImTest.pressureFromForces(hierarchy,direction,{H1:.8,H4:.4,D:-.6,W:-1});
  assert.ok(Math.abs(pressure.MAS-.58)<1e-12,`MAS ${pressure.MAS}`);
  assert.ok(Math.abs(pressure.IM-.44)<1e-12,`IM ${pressure.IM}`);
  assert.ok(Math.abs(pressure.IM_OVER_MAS-(.44/.58))<1e-12);
  assert.deepEqual(Object.fromEntries(Object.entries(pressure.perFrame).map(([tf,row])=>[tf,[row.masWeight,row.imWeight]])),{H1:[1,4],H4:[2,3],D:[3,2],W:[4,1]});
});

test("signal orientation converts the same trend field from support to antagonist pressure",()=>{
  const hierarchy=["D","W"],forces={D:.8,W:.9};
  const buy=__masImTest.pressureFromForces(hierarchy,1,forces),sell=__masImTest.pressureFromForces(hierarchy,-1,forces);
  assert.equal(buy.MAS,0);
  assert.ok(buy.IM>0);
  assert.ok(sell.MAS>0);
  assert.equal(sell.IM,0);
});

test("Daily MAS/IM requires Daily and Weekly only, not lower timeframes",()=>{
  const source=cache();
  const result=calculateMASIMPressure("EUR_USD","D",{D:source.D,W:source.W},{direction:1});
  assert.deepEqual(result.hierarchy,["D","W"]);
  assert.ok(Number.isFinite(result.MAS));
  assert.ok(Number.isFinite(result.IM));
  assert.ok(Number.isFinite(result.R2));
  assert.ok(Number.isFinite(result.F_STAT));
  assert.ok(Number.isFinite(result.P_VALUE));
});

test("S5 pressure is unavailable when any required enclosing timeframe is missing",()=>{
  const source=cache();
  delete source.W;
  const result=calculateMASIMPressure("EUR_USD","S5",source,{direction:1});
  assert.ok(Number.isNaN(result.MAS));
  assert.equal(result.REGIME,"NEUTRAL");
});

test("MAS, IM, ratio, and event power are invariant to pair nominal price scale",()=>{
  const source=cache(1.2),jpyLike=scaledCache(source,125),events=eventSeries("M15",source.M15),scaledEvents=events.map(event=>({...event,price:event.price*125}));
  const a=calculateMASIMPressure("EUR_USD","M15",source,{direction:events.at(-1).direction,events});
  const b=calculateMASIMPressure("USD_JPY","M15",jpyLike,{direction:events.at(-1).direction,events:scaledEvents});
  for(const key of ["MAS","IM","MODEL_RATIO","MAS_ROC","IM_ROC","RATIO_ROC","EVENT_ANGLE_Z","CONVEXITY"]){
    if(Number.isNaN(a[key])&&Number.isNaN(b[key]))continue;
    assert.ok(Math.abs(a[key]-b[key])<1e-9,`${key}: ${a[key]} != ${b[key]}`);
  }
});

test("timestamp synchronization ignores a higher-timeframe observation that completes after the active anchor",()=>{
  const source=cache(),events=eventSeries("H1",source.H1),baseline=calculateMASIMPressure("EUR_USD","H1",source,{direction:events.at(-1).direction,events});
  const future=structuredClone(source),last=future.W.at(-1),nextStart=Date.parse(last.time)+MAS_IM_TF_MS.W;
  future.W.push({time:new Date(nextStart).toISOString(),close:last.close*.4});
  const recomputed=calculateMASIMPressure("EUR_USD","H1",future,{direction:events.at(-1).direction,events});
  assert.equal(recomputed.MAS,baseline.MAS);
  assert.equal(recomputed.IM,baseline.IM);
  assert.equal(recomputed.macroForce,baseline.macroForce);
});

test("all-up trend is supporting force for BUY and antagonist force for SELL",()=>{
  const source=monotonicCache(),buy=calculateMASIMPressure("EUR_USD","H1",source,{direction:1}),sell=calculateMASIMPressure("EUR_USD","H1",source,{direction:-1});
  assert.ok(buy.IM>.7);
  assert.equal(buy.MAS,0);
  assert.ok(sell.MAS>.7);
  assert.equal(sell.IM,0);
  assert.equal(buy.TYPE,"TREND_FOLLOWING");
  assert.equal(sell.TYPE,"REVERSION");
});

test("trend-aligned pressure reports no future transition probability or required IM",()=>{
  const source=monotonicCache(),result=calculateMASIMPressure("EUR_USD","H1",source,{direction:1});
  assert.equal(result.REGIME,"TREND_ALIGNED");
  assert.equal(result.TRANSITION_STATE,"ALREADY_ALIGNED");
  assert.ok(Number.isNaN(result.TRANSITION_PROBABILITY));
  assert.ok(Number.isNaN(result.REQUIRED_IM));
  assert.equal(result.IM_OVER_MAS,Infinity);
  assert.equal(result.MODEL_RATIO,20);
});

test("empirical transition threshold separates successful pressure ratios when history permits",()=>{
  const samples=[
    {ratio:.35,success:false},{ratio:.55,success:false},{ratio:.8,success:false},
    {ratio:1.2,success:true},{ratio:1.45,success:true},{ratio:2.1,success:true},
  ];
  const learned=__masImTest.learnTransitionThreshold(samples);
  assert.equal(learned.source,"ROLLING_EVENT_CLASSIFICATION");
  assert.equal(learned.threshold,1.2);
  assert.equal(learned.balancedAccuracy,1);
  assert.equal(learned.samples,6);
});

test("kernel transition probability rises as IM/MAS moves into the successful historical region",()=>{
  const samples=[
    {ratio:.3,success:false},{ratio:.5,success:false},{ratio:.7,success:false},{ratio:.9,success:false},
    {ratio:1.2,success:true},{ratio:1.4,success:true},{ratio:1.7,success:true},{ratio:2.2,success:true},
  ];
  const low=__masImTest.transitionProbability(samples,.5),high=__masImTest.transitionProbability(samples,1.8);
  assert.ok(Number.isFinite(low)&&Number.isFinite(high));
  assert.ok(high>low,`${high} <= ${low}`);
});

test("IM/MAS remains the literal pressure ratio while the finite model ratio is capped only for calibration",()=>{
  const pressure=__masImTest.pressureFromForces(["D","W"],1,{D:-.2,W:.8});
  assert.ok(pressure.MAS>0&&pressure.IM>0);
  assert.equal(pressure.IM_OVER_MAS,pressure.IM/pressure.MAS);
  assert.equal(pressure.MODEL_RATIO,Math.min(20,pressure.IM/pressure.MAS));
});

test("event-angle Z is based on event-to-event log velocity and produces convexity only from causal prior events",()=>{
  const source=cache(),events=eventSeries("M30",source.M30,16),result=calculateMASIMPressure("EUR_USD","M30",source,{direction:events.at(-1).direction,events});
  assert.ok(Number.isFinite(result.EVENT_VELOCITY));
  assert.ok(Number.isFinite(result.EVENT_ANGLE_Z));
  assert.ok(Number.isFinite(result.EVENT_ANGLE));
  assert.ok(result.EVENT_ANGLE>-90&&result.EVENT_ANGLE<90);
  assert.ok(Number.isFinite(result.CONVEXITY));
});

test("pressure history is causal and adding future active bars does not alter a result computed at the old anchor",()=>{
  const original=cache(),events=eventSeries("M30",original.M30),baseline=calculateMASIMPressure("EUR_USD","M30",original,{direction:events.at(-1).direction,events});
  const extended=Object.fromEntries(MAS_IM_TIMEFRAMES.map(tf=>{
    const rows=original[tf],last=rows.at(-1),step=MAS_IM_TF_MS[tf];
    return[tf,[...rows,...Array.from({length:20},(_,offset)=>({time:new Date(Date.parse(last.time)+(offset+1)*step).toISOString(),close:last.close*Math.exp(.002*Math.sin(offset+1))}))]];
  }));
  const truncated=Object.fromEntries(MAS_IM_TIMEFRAMES.map(tf=>[tf,extended[tf].slice(0,original[tf].length)]));
  const recomputed=calculateMASIMPressure("EUR_USD","M30",truncated,{direction:events.at(-1).direction,events});
  assert.equal(recomputed.MAS,baseline.MAS);
  assert.equal(recomputed.IM,baseline.IM);
  assert.equal(recomputed.MAS_ROC,baseline.MAS_ROC);
  assert.equal(recomputed.RATIO_ROC,baseline.RATIO_ROC);
});