import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {JSDOM,VirtualConsole} from "jsdom";

const origin="https://cte.example";
const originalFetch=globalThis.fetch;
const masImSource=await readFile(new URL("../public/mas-im-calculator.js",import.meta.url),"utf8");
const source=(await readFile(new URL("../public/index.html",import.meta.url),"utf8"))
  .replace('<script src="/mas-im-calculator.js"></script>',`<script>${masImSource}</script>`)
  .replace("CANDLE_TIMEOUT_MS=55000","CANDLE_TIMEOUT_MS=40")
  .replace(/;\s*void connect\(\);\s*<\/script>/,";</script>");

const candleRequests=[];
let candleShape="both";
let hangKey="";
const makeCandles=(count=180,shape=candleShape)=>Array.from({length:count},(_,index)=>{
  const base=1.1+Math.sin(index/8)*.004+index*.00001;
  const row={time:new Date(Date.UTC(2026,6,1,0,index*15)).toISOString(),complete:true,volume:10};
  const values={o:String(base),h:String(base+.0015),l:String(base-.0015),c:String(base+Math.sin(index/3)*.0004)};
  if(shape!=="normalized")row.mid=values;
  if(shape!=="mid")Object.assign(row,{open:Number(values.o),high:Number(values.h),low:Number(values.l),close:Number(values.c)});
  return row;
});
const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{"Content-Type":"application/json"}});
const waitFor=async(predicate,label,timeout=12000)=>{const started=Date.now();while(Date.now()-started<timeout){if(predicate())return;await new Promise(resolve=>setTimeout(resolve,20));}throw new Error(`Timed out waiting for ${label}`);};
const canvasContext=new Proxy({measureText:value=>({width:String(value??"").length*6})},{get(target,key){if(key in target)return target[key];return()=>{};},set(target,key,value){target[key]=value;return true;}});
const virtualConsole=new VirtualConsole();const browserErrors=[];virtualConsole.on("jsdomError",error=>browserErrors.push(error));virtualConsole.on("error",error=>browserErrors.push(error));

const dom=new JSDOM(source,{url:origin,runScripts:"dangerously",pretendToBeVisual:true,virtualConsole,beforeParse(window){
  window.fetch=async(input,init={})=>{
    const url=new URL(String(input),origin),path=url.pathname;
    if(path==="/api/platform/preferences")return json({selectedInstrument:"EUR_USD",selectedTimeframe:"M15",selectedStrategy:"ASSET",selectedScheduleStrategy:"ASSET",activeFacility:"analysis",visibleBars:120,rightIndent:72,crosshairEnabled:true,eventPair:"EUR_USD",eventTimeframe:"M15",eventLength:10,eventStrategy:"ASSET",eventVisibleBars:120,eventRightIndent:72,eventCrosshairEnabled:true,microStartDate:"",microEndDate:"",minimumUnits:1000,updatedAt:"2026-08-04T18:00:00Z"});
    if(path==="/api/control/status")return json({lastScanAt:null,lastTradeAttemptAt:null,lastNoOrderReason:null,openPositions:0,selectedPairs:[],mode:"all",manualPositions:{}});
    if(path==="/api/control/selectedPairs")return json({ok:true,selectedPairs:[],manualSelectMode:true,autoRotateMode:false,manualPositions:{}});
    if(path==="/api/oanda/connect")return json({account:{id:"001-001-1234567-001",alias:"LIVE",currency:"USD",balance:"1000",NAV:"1000",marginAvailable:"900"},live:true});
    if(path==="/api/engine/config")return json({timeframe:"M15",htlLength:10,decisionMode:"EVENT",strategy:"ASSET",confirmationStrategy:"NONE",filter:0,configurationSource:"OPTIMIZED"});
    if(path==="/api/engine/optimizer")return json({records:{}});
    if(path==="/api/engine/ledger")return json({ledger:[],retained:0});
    if(path==="/api/engine/status")return json({optimizerCoverage:0,optimizerTotal:280,ai:{model:"@cf/nvidia/nemotron-3-120b-a12b",binding:true}});
    if(path==="/api/platform/diagnostic")return json({deployment:{versionId:"version-1",versionTag:"test-sha",versionTimestamp:"2026-08-04T18:00:00Z"},worker:{telemetry:{}},oanda:{completedCandles:60},engine:{reachable:true,armed:true,optimizerCoverage:0,optimizerTotal:280},cloneAssessment:{verdict:"No structuredClone hot path exists in this repository."}});
    if(path==="/api/oanda/stream")return{ok:true,status:200,body:{getReader:()=>({read:()=>new Promise(()=>{})})}};
    if(path==="/api/oanda/proxy"){
      const upstream=decodeURIComponent(url.searchParams.get("path")||"");
      if(upstream.endsWith("/openPositions"))return json({positions:[]});
      if(upstream.includes("/pricing?"))return json({prices:[{type:"PRICE",instrument:"EUR_USD",bids:[{price:"1.1"}],asks:[{price:"1.1002"}],unitsAvailable:{default:{long:"5000",short:"5000"}}}]});
      if(upstream.endsWith("/summary"))return json({account:{id:"001-001-1234567-001",alias:"LIVE",currency:"USD",balance:"1000",NAV:"1000",marginAvailable:"900"}});
      return json({});
    }
    if(path==="/api/oanda/candles"){
      const instrument=url.searchParams.get("instrument")||"",granularity=url.searchParams.get("granularity")||"",count=Number(url.searchParams.get("count")||0),key=`${instrument}|${granularity}`;
      candleRequests.push({instrument,granularity,count,time:Date.now()});
      if(key===hangKey)return new Promise((_,reject)=>{const abort=()=>reject(new DOMException("Aborted","AbortError"));if(init.signal?.aborted)abort();else init.signal?.addEventListener("abort",abort,{once:true});});
      if((count>=650||instrument==="EUR_USD")&&(granularity==="M15"||granularity==="M30"))return json({instrument,granularity,candles:makeCandles(Math.max(180,Math.min(count||180,240))),completedOnly:true});
      return json({instrument,granularity,candles:[],completedOnly:true});
    }
    throw new Error(`Unexpected browser request ${url}`);
  };
  window.Response=globalThis.Response;window.Request=globalThis.Request;window.Headers=globalThis.Headers;window.AbortController=globalThis.AbortController;window.DOMException=globalThis.DOMException;window.TextDecoder=globalThis.TextDecoder;window.ReadableStream=globalThis.ReadableStream;window.devicePixelRatio=1;
  window.requestAnimationFrame=callback=>window.setTimeout(()=>callback(Date.now()),0);window.cancelAnimationFrame=id=>window.clearTimeout(id);
  Object.defineProperty(window.HTMLCanvasElement.prototype,"getContext",{value:()=>canvasContext});
  Object.defineProperty(window.HTMLCanvasElement.prototype,"getBoundingClientRect",{value:()=>({left:0,top:0,right:900,bottom:420,width:900,height:420,x:0,y:0})});
  Object.defineProperty(window.HTMLElement.prototype,"clientWidth",{get(){return 900;}});Object.defineProperty(window.HTMLElement.prototype,"clientHeight",{get(){return 420;}});Object.defineProperty(window.HTMLElement.prototype,"scrollIntoView",{value:()=>{}});
}});
const {window}=dom,document=window.document;

try{
  document.getElementById("connectButton").click();
  await waitFor(()=>!document.getElementById("refreshChart").disabled&&document.getElementById("metricTime").textContent!=="—"&&document.querySelector("#compartment-ASSET .badge").textContent!=="—","initial causal live chart");
  assert.equal(document.getElementById("minimumUnits").value,"1000");await waitFor(()=>document.getElementById("NemotronStatus").textContent==="Ready","Nemotron status rendering");
  document.getElementById("tradeUnits").value="999";document.getElementById("tradeUnits").dispatchEvent(new window.Event("input",{bubbles:true}));assert.equal(document.getElementById("tradeBuy").disabled,true);

  candleShape="normalized";candleRequests.length=0;document.getElementById("refreshChart").click();
  await waitFor(()=>candleRequests.length>0,"Refresh chart request");
  assert.equal(candleRequests[0].instrument,"EUR_USD","Refresh chart must not pass MouseEvent as the instrument");
  await waitFor(()=>!document.getElementById("refreshChart").disabled&&document.querySelector("#compartment-ASSET .badge").textContent!=="—","causal Refresh chart completion");
  assert.notEqual(document.getElementById("metricTime").textContent,"—");
  assert.notEqual(document.querySelector("#compartment-ASSET .badge").textContent,"—");

  candleShape="both";document.getElementById("refreshEventChart").click();
  await waitFor(()=>!document.getElementById("refreshEventChart").disabled&&document.getElementById("eventChartInstrument").textContent==="EUR/USD","event chart refresh");
  assert.equal(document.querySelectorAll("#eventScheduleBody tr[data-pair]").length,0,"Refreshing the independent HTL chart must not mutate the HTL schedule");
  document.getElementById("loadEvents").click();
  await waitFor(()=>!document.getElementById("loadEvents").disabled&&document.getElementById("eventScheduleStatus").textContent.includes("HTL schedule"),"HTL schedule independent load",20000);
  assert.ok(document.querySelectorAll("#eventScheduleBody tr[data-pair]").length>=1);

  await waitFor(()=>!document.getElementById("refreshSchedule").disabled,"focused schedule completion");
  document.getElementById("refreshSchedule").click();
  await waitFor(()=>!document.getElementById("refreshSchedule").disabled,"full schedule completion",20000);
  const scheduleCell=document.querySelector('.signal-cell[data-instrument="EUR_USD"][data-timeframe="M15"][data-side="buy"]');
  assert.notEqual(scheduleCell.title,"No data");

  hangKey="EUR_USD|M15";document.getElementById("chartTimeframe").value="M15";document.getElementById("refreshChart").click();
  await waitFor(()=>document.getElementById("chartMessage").textContent.includes("timed out")&&!document.getElementById("refreshChart").disabled,"timeout re-enables Refresh chart",6000);

  hangKey="EUR_USD|M15";document.getElementById("refreshChart").click();await waitFor(()=>document.getElementById("refreshChart").disabled,"abortable chart start");
  document.getElementById("chartTimeframe").value="M30";document.getElementById("chartTimeframe").dispatchEvent(new window.Event("change",{bubbles:true}));
  await waitFor(()=>!document.getElementById("refreshChart").disabled&&document.getElementById("metricTime").textContent!=="—","replacement chart completion",6000);
  assert.ok(!document.getElementById("chartMessage").textContent.includes("timed out"),"Aborted superseded chart must not display a false timeout");
  hangKey="";

  document.getElementById("connectButton").click();await waitFor(()=>document.getElementById("connectButton").textContent==="TEST","connection retest");
  assert.equal(document.getElementById("accountFacts").hidden,false);assert.equal(document.getElementById("refreshChart").disabled,false);
  assert.equal(browserErrors.length,0,browserErrors.map(error=>error.message).join("\n"));
  console.log("DOM connection, causal analytical chart, independent HTL chart/schedule loading, normalized candle compatibility, schedule, timeout, abort, and minimum-unit behavior verified.");
}finally{
  document.getElementById("disconnectButton")?.click();dom.window.close();
  globalThis.fetch=originalFetch;
}
