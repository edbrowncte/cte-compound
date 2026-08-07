import test from "node:test";
import assert from "node:assert/strict";
import {calculateMAS_IM_ZScores,calculateLogSlopeStats} from "../src/mas-im-calculator.js";

const TF_ORDER=["M1","M5","M15","M30","H1","H4","D","W"];
const TF_MS={M1:60000,M5:300000,M15:900000,M30:1800000,H1:3600000,H4:14400000,D:86400000,W:604800000};

function frame(tf,scale=1,phase=0,count=180){
  const step=TF_MS[tf],start=Date.UTC(2023,0,1),out=[];
  for(let index=0;index<count;index++){
    const drift=.000025*index*TF_MS.M1/step;
    const wave=.0025*Math.sin(index/7+phase)+.0012*Math.cos(index/17+phase*.3);
    const close=scale*Math.exp(drift+wave);
    out.push({time:new Date(start+index*step).toISOString(),close});
  }
  return out;
}

function cache(scale=1){return Object.fromEntries(TF_ORDER.map((tf,index)=>[tf,frame(tf,scale,index*.23)]));}

function scaledCache(source,multiplier){return Object.fromEntries(Object.entries(source).map(([tf,rows])=>[tf,rows.map(row=>({...row,close:row.close*multiplier}))]));}

test("log OLS slope is invariant to nominal price scale",()=>{
  const prices=Array.from({length:80},(_,index)=>1.2*Math.exp(.0004*index+.01*Math.sin(index/9)));
  const scaled=prices.map(value=>value*125);
  const left=calculateLogSlopeStats(prices).slope,right=calculateLogSlopeStats(scaled).slope;
  assert.ok(Math.abs(left-right)<1e-12,`${left} != ${right}`);
});

test("MAS Z and IM Z are invariant to pair price scale",()=>{
  const source=cache(1.2),jpyLike=scaledCache(source,125);
  for(const tf of TF_ORDER){
    const a=calculateMAS_IM_ZScores("EUR_USD",tf,source);
    const b=calculateMAS_IM_ZScores("USD_JPY",tf,jpyLike);
    assert.ok(Number.isFinite(a.MAS_Z),`${tf} MAS Z unavailable`);
    assert.ok(Number.isFinite(a.IM_Z),`${tf} IM Z unavailable`);
    assert.ok(Math.abs(a.MAS_Z-b.MAS_Z)<1e-9,`${tf} MAS Z changed with price scale`);
    assert.ok(Math.abs(a.IM_Z-b.IM_Z)<1e-9,`${tf} IM Z changed with price scale`);
  }
});

test("MAS Z standardizes the MAS composite, not the mean of per-frame z scores",()=>{
  const result=calculateMAS_IM_ZScores("EUR_USD","H1",cache(1.1));
  assert.deepEqual(result.masFrames,["H4","D","W"]);
  assert.ok(Number.isFinite(result.MAS));
  assert.ok(Number.isFinite(result.MAS_HISTORY_MEAN));
  assert.ok(Number.isFinite(result.MAS_HISTORY_STD));
  const expected=(result.MAS-result.MAS_HISTORY_MEAN)/result.MAS_HISTORY_STD;
  assert.ok(Math.abs(result.MAS_Z-expected)<1e-12);
  assert.equal(result.historyMode,"CAUSAL_SAME_LAG_MULTISCALE");
});

test("IM/MAS is the raw composite ratio rather than IM Z divided by MAS Z",()=>{
  const result=calculateMAS_IM_ZScores("EUR_USD","D",cache(1.3));
  assert.ok(Number.isFinite(result.IM_OVER_MAS));
  assert.ok(Math.abs(result.IM_OVER_MAS-result.IM/result.MAS)<1e-12);
  if(Math.abs(result.MAS_Z)>1e-9)assert.notEqual(result.IM_OVER_MAS,result.IM_Z/result.MAS_Z);
});

test("missing required timeframe data is unavailable instead of silently partial or synthetic",()=>{
  const source=cache(1.2);
  delete source.W;
  const result=calculateMAS_IM_ZScores("EUR_USD","D",source);
  assert.ok(Number.isNaN(result.MAS_Z));
  assert.ok(Number.isNaN(result.IM_Z));
});

test("insufficient history produces NaN rather than a fabricated or zero z-score",()=>{
  const short=Object.fromEntries(TF_ORDER.map((tf,index)=>[tf,frame(tf,1,index*.1,60)]));
  const result=calculateMAS_IM_ZScores("EUR_USD","H1",short);
  assert.ok(Number.isNaN(result.MAS_Z));
  assert.ok(Number.isNaN(result.IM_Z));
});

test("future bars do not alter an already-computed terminal MAS/IM observation when truncated back to that observation",()=>{
  const original=cache(1.4),baseline=calculateMAS_IM_ZScores("EUR_USD","M30",original);
  const extended=Object.fromEntries(TF_ORDER.map((tf,index)=>{
    const rows=original[tf],last=rows.at(-1),step=TF_MS[tf];
    return[tf,[...rows,...Array.from({length:20},(_,offset)=>({time:new Date(Date.parse(last.time)+(offset+1)*step).toISOString(),close:last.close*Math.exp(.005*Math.sin(offset+index))}))]];
  }));
  const truncated=Object.fromEntries(TF_ORDER.map(tf=>[tf,extended[tf].slice(0,original[tf].length)]));
  const recomputed=calculateMAS_IM_ZScores("EUR_USD","M30",truncated);
  assert.equal(recomputed.MAS_Z,baseline.MAS_Z);
  assert.equal(recomputed.IM_Z,baseline.IM_Z);
});
