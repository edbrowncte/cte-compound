import test from "node:test";
import assert from "node:assert/strict";
import "../public/market-mentor.js";

const mentor=globalThis.CTEMarketMentor;

function row(overrides={}){
  return{
    pair:"AUD_CHF",timeframe:"H1",signal:1,mas:0,im:.032,ratio:Infinity,masRoc:-.002,imRoc:.004,ratioRoc:.03,eventAngleZ:.8,convexity:.2,r2:.41,requiredIm:0,transitionProbability:1,regime:"TREND_ALIGNED",type:"TREND_FOLLOWING",strength:.7,
    ...overrides
  };
}

function slot(title,candidate){return{title,candidate};}

test("mentor identifies infinity as denominator collapse rather than infinite strength",()=>{
  const narrative=mentor.__test.buildNarrative({rows:[row()],slots:[],selectedPair:"AUD_CHF",timeframe:"H1"});
  assert.match(narrative.headline,/IM\/MAS ∞ \(MAS≈0\)/);
  assert.match(narrative.explanation,/denominator collapse, not infinite market strength/i);
  assert.match(narrative.lesson,/Infinity is a diagnostic state, not a ranking score/i);
});

test("aligned state teaches that transition is no longer the question",()=>{
  const candidate=row({pair:"CAD_CHF",mas:.055,im:.464,ratio:8.5,requiredIm:NaN,transitionProbability:NaN});
  const narrative=mentor.__test.buildNarrative({rows:[candidate],slots:[],selectedPair:"CAD_CHF",timeframe:"H1"});
  assert.match(narrative.explanation,/No transition is required because the macro field is already aligned/i);
  assert.match(narrative.lesson,/transition is no longer the question/i);
  assert.match(narrative.posture,/Trend-aligned posture/i);
});

test("transition posture remains confirmation-oriented rather than guaranteed",()=>{
  const candidate=row({pair:"NZD_CAD",mas:.31,im:.42,ratio:1.35,requiredIm:.38,transitionProbability:.72,regime:"TRANSITION",type:"REVERSION"});
  const narrative=mentor.__test.buildNarrative({rows:[candidate],slots:[],selectedPair:"NZD_CAD",timeframe:"H1"});
  assert.match(narrative.posture,/Require confirmation from completed candles/i);
  assert.match(narrative.posture,/not a guaranteed reversal/i);
  assert.equal(narrative.alertLevel,"MATERIAL");
});

test("rotator change explains replacement as composite strength rather than ratio alone",()=>{
  const previous=[slot("Best BUY Trend Following",row({pair:"AUD_CHF",strength:.61,eventAngleZ:.5}))];
  const current=[slot("Best BUY Trend Following",row({pair:"CAD_CHF",mas:.055,im:.464,ratio:8.5,strength:.83,eventAngleZ:4.01,regime:"TREND_ALIGNED"}))];
  const text=mentor.__test.rotationText(mentor.__test.leadersOf(current),mentor.__test.leadersOf(previous));
  assert.match(text,/AUD\/CHF → CAD\/CHF/);
  assert.match(text,/composite strength—not IM\/MAS alone/i);
  assert.match(text,/Event Z 4\.01/);
});

test("leader rotation and transition regime changes are material notification events",()=>{
  const base={row:row(),slots:[slot("Best BUY Trend Following",row({pair:"AUD_CHF"}))]};
  const rotated={row:row(),slots:[slot("Best BUY Trend Following",row({pair:"CAD_CHF"}))]};
  assert.equal(mentor.__test.materialChange(rotated,base),true);
  const transitioned={row:row({regime:"TRANSITION",ratio:1.2}),slots:base.slots};
  assert.equal(mentor.__test.materialChange(transitioned,base),true);
});

test("candle-first chart guard paints valid OHLC independently of analytical overlays",()=>{
  const operations=[];
  const ctx={
    setTransform(){},
    fillRect(...args){operations.push(["fillRect",...args]);},
    beginPath(){},moveTo(){},lineTo(){},stroke(){operations.push(["stroke"]);},fillText(){},setLineDash(){},measureText(){return{width:80};},
    fillStyle:"",strokeStyle:"",lineWidth:1,font:"",textBaseline:"",textAlign:""
  };
  const canvas={width:0,height:0,clientWidth:900,clientHeight:420,parentNode:{clientWidth:900,clientHeight:420},getBoundingClientRect(){return{width:900,height:420};},getContext(){return ctx;}};
  const candles=Array.from({length:120},(_,index)=>{const open=1.19+index*.00001,close=open+(index%2===0?.00005:-.00004);return{time:new Date(Date.UTC(2026,7,10,0,index)).toISOString(),open,high:Math.max(open,close)+.00008,low:Math.min(open,close)-.00008,close};});
  const result=globalThis.CTEChartRuntimeGuard.__test.renderCandles({canvas,candles,visibleBars:120,offsetBars:0,leftIndent:24,rightIndent:72,devicePixelRatio:1,formatPrice:value=>Number(value).toFixed(5)});
  assert.equal(result.rendered,true);
  assert.equal(result.visibleCandles.length,120);
  assert.ok(canvas.width>0&&canvas.height>0);
  assert.ok(operations.filter(([name])=>name==="fillRect").length>120,"background plus candle bodies should be painted");
});
