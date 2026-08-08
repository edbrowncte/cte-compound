import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {JSDOM,VirtualConsole} from "jsdom";

const html=await readFile(new URL("../public/index.html",import.meta.url),"utf8");
const worker=await readFile(new URL("../src/worker-base.js",import.meta.url),"utf8");

assert.match(worker,/Math\.min\(5000,Math\.trunc\(Number\(url\.searchParams\.get\("count"\)\)\)\|\|650\)/);
assert.match(html,/MAX_ANALYTICAL_HISTORY=5000,MAX_ANALYTICAL_LENGTH=500/);
assert.match(html,/id="chartLength"[^>]*max="500"/);
assert.match(html,/id="eventLength"[^>]*max="500"/);
assert.match(html,/id="eventChartLength"[^>]*max="500"/);
assert.match(html,/function chartRequestCount\(instrument,timeframe\)\{return MAX_ANALYTICAL_HISTORY;\}/);
assert.match(html,/indicatorWarmupBars\(strategy,length\).*DARE_N:5.*NAI:4.*APEX:6/);
assert.match(html,/scheduleRequestCount\(instrument,timeframe\)/);
assert.match(html,/loadEventRow\(pair,timeframe,length,controller,100,MAX_ANALYTICAL_HISTORY\)/);
assert.match(html,/eventCausalIndicators\(chartPair,chartTimeframe,config\.length,data\)/);
assert.match(html,/const zDefinitions=definition\.z\|\|\[\]/);
assert.match(html,/\.\.\.\(definition\.z\|\|\[\]\)/);
assert.match(html,/state\.chartAnalysis=\{latest\}/);
assert.doesNotMatch(html,/const relation=\(left,right,threshold=0\)=>\{const spread=finite\(left\[index\]\)-finite\(right\[index\]\)/);
assert.match(html,/if\(!Number\.isFinite\(leftValue\)\|\|!Number\.isFinite\(rightValue\)\)return\{direction:0,spread:NaN\}/);
assert.match(html,/while\(state\.chartCache\.size>12\)/);
assert.match(html,/while\(state\.eventIndicatorCache\.size>8\)/);
assert.match(html,/state\.eventIndicatorCache\.clear\(\)/);
assert.match(html,/refreshAdaptiveTimeframe\(\).*scheduleRequestCount\(pair,timeframe\)/s);
assert.match(html,/selectedScheduleStrategy=event\.target\.value.*loadSchedule\("focused"\)/s);
assert.match(html,/refreshAnalyticalChartConfig=.*chartCandles\.length<chartRequestCount/s);

// The trading-engine control remains independently certified at its registered 3..200 boundary.
assert.match(html,/id="engineHtlLength"[^>]*max="200"/);

const source=html
  .replace('<script src="/mas-im-calculator.js"></script>',"")
  .replace(/;\s*void connect\(\);\s*<\/script>/,";</script>");
const virtualConsole=new VirtualConsole();
const browserErrors=[];
virtualConsole.on("jsdomError",error=>browserErrors.push(error));
virtualConsole.on("error",error=>browserErrors.push(error));
const canvasContext=new Proxy({measureText:value=>({width:String(value??"").length*6})},{get(target,key){if(key in target)return target[key];return()=>{};},set(target,key,value){target[key]=value;return true;}});
const dom=new JSDOM(source,{url:"https://cte.example",runScripts:"dangerously",pretendToBeVisual:true,virtualConsole,beforeParse(window){
  window.fetch=async()=>{throw new Error("Maximum-history indicator unit test made an unexpected network request.");};
  window.Response=globalThis.Response;window.Request=globalThis.Request;window.Headers=globalThis.Headers;window.AbortController=globalThis.AbortController;window.DOMException=globalThis.DOMException;window.TextDecoder=globalThis.TextDecoder;window.ReadableStream=globalThis.ReadableStream;window.devicePixelRatio=1;
  window.requestAnimationFrame=callback=>window.setTimeout(()=>callback(Date.now()),0);window.cancelAnimationFrame=id=>window.clearTimeout(id);
  Object.defineProperty(window.HTMLCanvasElement.prototype,"getContext",{value:()=>canvasContext});
  Object.defineProperty(window.HTMLCanvasElement.prototype,"getBoundingClientRect",{value:()=>({left:0,top:0,right:1000,bottom:460,width:1000,height:460,x:0,y:0})});
  Object.defineProperty(window.HTMLElement.prototype,"clientWidth",{get(){return 1000;}});Object.defineProperty(window.HTMLElement.prototype,"clientHeight",{get(){return 460;}});Object.defineProperty(window.HTMLElement.prototype,"scrollIntoView",{value:()=>{}});
}});

try{
  const {window}=dom;
  assert.equal(typeof window.causalIndicatorSetFast,"function","causalIndicatorSetFast must be callable in the analytical runtime");
  const length=240,total=2200;
  const candles=Array.from({length:total},(_,index)=>{
    const trend=1.08+index*0.000012,cycle=Math.sin(index/19)*0.0035+Math.sin(index/61)*0.0017,close=trend+cycle;
    return {time:new Date(Date.UTC(2026,0,1,0,index)).toISOString(),open:close-0.0002,high:close+0.0012,low:close-0.0011,close,volume:100+(index%23),complete:true};
  });
  const indicators=window.causalIndicatorSetFast(candles,length);
  const tail=values=>values.slice(-120);
  for(const key of ["naiAsset","naiInverse","dareNAsset","dareNInverse","zup","puz"]){
    assert.equal(tail(indicators[key]).filter(Number.isFinite).length,120,`${key} must cover the complete final 120-bar visible window at length 240`);
  }
  const firstFinite=values=>values.findIndex(Number.isFinite);
  assert.ok(firstFinite(indicators.naiAsset)>=length*3,"NAI must retain its causal warmup instead of fabricating early zero values");
  assert.ok(firstFinite(indicators.dareNInverse)>=length*4,"DARE(N) inverse must retain its deeper causal warmup");
  assert.equal(browserErrors.length,0,browserErrors.map(error=>error.message).join("\n"));
}finally{dom.window.close();}

console.log("5000-candle analytical history, length-240 causal DARE(N)/NAI/APEX coverage, missing-data safety, and independent 200-bar engine boundary verified.");
