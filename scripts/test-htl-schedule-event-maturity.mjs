import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {JSDOM,VirtualConsole} from "jsdom";

const html=await readFile(new URL("../public/index.html",import.meta.url),"utf8");
const masImSource=await readFile(new URL("../public/mas-im-calculator.js",import.meta.url),"utf8");
const unifiedChartSource=await readFile(new URL("../public/unified-chart.js",import.meta.url),"utf8");
const source=html
  .replace('<script src="/mas-im-calculator.js"></script>',`<script>${masImSource}</script>`)
  .replace('<script src="/unified-chart.js"></script>',`<script>${unifiedChartSource}</script>`)
  .replace(/;\s*void connect\(\);\s*<\/script>/,";</script>");
const virtualConsole=new VirtualConsole(),errors=[];
virtualConsole.on("jsdomError",error=>errors.push(error));
virtualConsole.on("error",error=>errors.push(error));
const context=new Proxy({measureText:value=>({width:String(value??"").length*6})},{get(target,key){if(key in target)return target[key];return()=>{};},set(target,key,value){target[key]=value;return true;}});
const dom=new JSDOM(source,{url:"https://cte.example",runScripts:"dangerously",pretendToBeVisual:true,virtualConsole,beforeParse(window){
  window.fetch=async()=>{throw new Error("HTL schedule maturity test made an unexpected network request.");};
  window.Response=globalThis.Response;window.Request=globalThis.Request;window.Headers=globalThis.Headers;window.AbortController=globalThis.AbortController;window.DOMException=globalThis.DOMException;window.TextDecoder=globalThis.TextDecoder;window.ReadableStream=globalThis.ReadableStream;window.devicePixelRatio=1;
  window.requestAnimationFrame=callback=>window.setTimeout(()=>callback(Date.now()),0);window.cancelAnimationFrame=id=>window.clearTimeout(id);
  Object.defineProperty(window.HTMLCanvasElement.prototype,"getContext",{value:()=>context});
  Object.defineProperty(window.HTMLCanvasElement.prototype,"getBoundingClientRect",{value:()=>({left:0,top:0,right:1000,bottom:460,width:1000,height:460,x:0,y:0})});
  Object.defineProperty(window.HTMLElement.prototype,"clientWidth",{get(){return 1000;}});Object.defineProperty(window.HTMLElement.prototype,"clientHeight",{get(){return 460;}});Object.defineProperty(window.HTMLElement.prototype,"scrollIntoView",{value:()=>{}});
}});

try{
  const {window}=dom,length=200,total=5000;
  assert.equal(window.eventHistoryCount(length),5000,"HTL schedule must request the maximum completed-candle history");
  const candles=Array.from({length:total},(_,index)=>{
    const close=190+Math.sin(index/17)*2.4+Math.sin(index/53)*1.3+Math.sin(index/211)*0.7;
    return {time:new Date(Date.UTC(2025,0,1,0,index*15)).toISOString(),open:close-0.08,high:close+0.18,low:close-0.19,close,volume:100+(index%31),complete:true};
  });
  const row=window.buildEventRow("CHF_JPY",candles,length);
  assert.equal(row.data.length,5000);
  assert.ok(row.eventList.length>5,`Expected mature HTL event history, got ${row.eventList.length}`);
  assert.ok(row.events>0,`Expected completed HTL events, got ${row.events}`);
  assert.ok(row.currentEvent==="BUY"||row.currentEvent==="SELL",`Expected a current HTL event, got ${row.currentEvent}`);
  assert.ok(Number.isFinite(row.eventOpen),"Current HTL event must expose its opening price");
  assert.equal(errors.length,0,errors.map(error=>error.message).join("\n"));
}finally{dom.window.close();}

console.log("HTL Schedule length-200 event universe matures on the same 5,000-candle history used by the canonical chart.");
