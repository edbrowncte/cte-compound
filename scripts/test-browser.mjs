import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {JSDOM,VirtualConsole} from "jsdom";

const origin="https://cte.example";
const FIXTURE_TOKEN="test-access-token-browser-fixture-0123456789abcdef";
const source=(await readFile(new URL("../public/index.html",import.meta.url),"utf8"))
  .replace("CANDLE_TIMEOUT_MS=25000","CANDLE_TIMEOUT_MS=40")
  .replace(/;\s*void connect\(\);\s*<\/script>/,";</script>");

const candleRequests=[];
const apiRequests=[];
let armedState=true;
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
    const authorization=init.headers?.get?init.headers.get("Authorization"):init.headers?.Authorization||"";
    const request={path,method:init.method||"GET",authorization,body:init.body||null};
    apiRequests.push(request);
    if(authorization!==`Bearer ${FIXTURE_TOKEN}`){request.status=401;return json({error:"Invalid access token."},401);}
    if(path==="/api/platform/preferences")return json({selectedInstrument:"EUR_USD",selectedTimeframe:"M15",selectedStrategy:"ASSET",selectedScheduleStrategy:"ASSET",activeFacility:"analysis",visibleBars:120,rightIndent:72,crosshairEnabled:true,eventPair:"EUR_USD",eventTimeframe:"M15",eventLength:10,eventStrategy:"ASSET",eventVisibleBars:120,eventRightIndent:72,eventCrosshairEnabled:true,microStartDate:"",microEndDate:"",minimumUnits:1000,updatedAt:"2026-08-04T18:00:00Z"});
    if(path==="/api/oanda/connect")return json({account:{id:"001-001-1234567-001",alias:"LIVE",currency:"USD",balance:"1000",NAV:"1000",marginAvailable:"900"},live:true});
    if(path==="/api/engine/config")return json({timeframe:"M15",htlLength:10,decisionMode:"EVENT",strategy:"ASSET",confirmationStrategy:"NONE",filter:0,configurationSource:"OPTIMIZED"});
    if(path==="/api/engine/optimizer")return json({records:{}});
    if(path==="/api/engine/ledger")return json({ledger:[],retained:0});
    if(path==="/api/engine/arm"&&init.method==="POST"){const body=JSON.parse(init.body||"{}");armedState=Boolean(body.armed);return json({armed:armedState});}
    if(path==="/api/engine/status")return json({optimizerCoverage:0,optimizerTotal:280,armed:armedState,ai:{model:"@cf/nvidia/nemotron-3-120b-a12b",binding:true}});
    if(path==="/api/platform/diagnostic")return json({deployment:{versionId:"version-1",versionTag:"test-sha",versionTimestamp:"2026-08-04T18:00:00Z"},worker:{telemetry:{}},oanda:{completedCandles:60},engine:{reachable:true,armed:armedState,optimizerCoverage:0,optimizerTotal:280},cloneAssessment:{verdict:"No structuredClone hot path exists in this repository."}});
    if(path==="/api/oanda/stream")return{ok:true,status:200,body:{getReader:()=>({read:()=>new Promise(()=>{})})}};
    if(path==="/api/oanda/proxy"){
      const upstream=decodeURIComponent(url.searchParams.get("path")||"");
      if(upstream.endsWith("/positions"))return json({positions:[]});
      if(upstream.includes("/pricing?"))return json({prices:[{type:"PRICE",instrument:"EUR_USD",bids:[{price:"1.1"}],asks:[{price:"1.1002"}],unitsAvailable:{default:{long:"5000",short:"5000"}}}]});
      if(upstream.endsWith("/summary"))return json({account:{id:"001-001-1234567-001",alias:"LIVE",currency:"USD",balance:"1000",NAV:"1000",marginAvailable:"900"}});
      return json({});
    }
    if(path==="/api/oanda/candles"){
      const instrument=url.searchParams.get("instrument")||"",granularity=url.searchParams.get("granularity")||"",count=Number(url.searchParams.get("count")||0),key=`${instrument}|${granularity}`;
      candleRequests.push({instrument,granularity,count,time:Date.now()});
      if(key===hangKey)return new Promise((_,reject)=>{const abort=()=>reject(new DOMException("Aborted","AbortError"));if(init.signal?.aborted)abort();else init.signal?.addEventListener("abort",abort,{once:true});});
      if(instrument==="EUR_USD"&&(granularity==="M15"||granularity==="M30"))return json({instrument,granularity,candles:makeCandles(Math.max(180,Math.min(count||180,240))),completedOnly:true});
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
  // Security gate: the console starts locked with no stored token.
  assert.equal(document.getElementById("authGate").classList.contains("locked"),true,"console must start locked");
  assert.equal(document.getElementById("authGateStatus").textContent,"Locked");
  assert.equal(document.getElementById("connectButton").disabled,true,"connect must stay disabled while locked");
  assert.equal(window.sessionStorage.getItem("cteAccessToken"),null);

  // A wrong token is rejected with 401 and the console stays locked.
  document.getElementById("authTokenInput").value="wrong-token";
  document.getElementById("authUnlockButton").click();
  await waitFor(()=>document.getElementById("authGateMessage").textContent.includes("rejected"),"rejected token message");
  assert.equal(document.getElementById("authGate").classList.contains("locked"),true,"wrong token must keep the console locked");
  assert.equal(window.sessionStorage.getItem("cteAccessToken"),null,"rejected token must not be persisted");

  // The correct token unlocks the console and every later /api call carries it.
  document.getElementById("authTokenInput").value=FIXTURE_TOKEN;
  document.getElementById("authUnlockButton").click();
  await waitFor(()=>document.getElementById("authGate").classList.contains("unlocked"),"unlocked gate");
  assert.equal(document.getElementById("authGateStatus").textContent,"Unlocked");
  assert.equal(document.getElementById("connectButton").disabled,false);
  assert.equal(window.sessionStorage.getItem("cteAccessToken"),FIXTURE_TOKEN,"accepted token must be stored in sessionStorage");
  assert.ok(apiRequests.some(request=>request.path==="/api/engine/status"&&request.authorization===`Bearer ${FIXTURE_TOKEN}`),"unlock validation must carry the bearer token");

  document.getElementById("connectButton").click();
  await waitFor(()=>!document.getElementById("refreshChart").disabled&&document.getElementById("metricTime").textContent!=="—","initial live chart");
  assert.equal(document.getElementById("minimumUnits").value,"1000");
  document.getElementById("tradeUnits").value="999";document.getElementById("tradeUnits").dispatchEvent(new window.Event("input",{bubbles:true}));assert.equal(document.getElementById("tradeBuy").disabled,true);

  candleShape="normalized";candleRequests.length=0;document.getElementById("refreshChart").click();
  await waitFor(()=>candleRequests.length>0,"Refresh chart request");
  assert.equal(candleRequests[0].instrument,"EUR_USD","Refresh chart must not pass MouseEvent as the instrument");
  await waitFor(()=>!document.getElementById("refreshChart").disabled,"Refresh chart completion");
  assert.notEqual(document.getElementById("metricTime").textContent,"—");
  assert.notEqual(document.querySelector("#compartment-ASSET .badge").textContent,"—");

  candleShape="both";document.getElementById("refreshEventChart").click();
  await waitFor(()=>!document.getElementById("refreshEventChart").disabled&&document.getElementById("eventChartInstrument").textContent==="EUR/USD","event chart refresh");
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
  const rejectedRequests=apiRequests.filter(request=>request.authorization!==`Bearer ${FIXTURE_TOKEN}`);
  assert.ok(rejectedRequests.length>=1,"wrong-token auth probe must be sent");
  assert.ok(rejectedRequests.every(request=>request.status===401),"every wrong-token request must return 401");
  assert.ok(apiRequests.filter(request=>request.status!==401).every(request=>request.path.startsWith("/api/")&&request.authorization===`Bearer ${FIXTURE_TOKEN}`),"every authenticated /api request must carry the bearer token");

  // Arm/disarm: the automation panel shows the persisted arm state and the authenticated toggle persists it.
  await waitFor(()=>document.getElementById("engineArmState").textContent==="ARMED","armed status render");
  assert.equal(document.getElementById("engineArmToggle").disabled,false);
  document.getElementById("engineArmToggle").click();
  await waitFor(()=>document.getElementById("engineArmState").textContent==="DISARMED","disarm toggle");
  const disarmRequest=apiRequests.find(request=>request.path==="/api/engine/arm"&&request.method==="POST");
  assert.ok(disarmRequest,"arm toggle must POST /api/engine/arm");
  assert.equal(disarmRequest.authorization,`Bearer ${FIXTURE_TOKEN}`,"arm toggle must be authenticated");
  assert.equal(JSON.parse(disarmRequest.body).armed,false,"disarm body must request armed:false");
  assert.equal(document.getElementById("engineArmToggle").textContent,"Arm engine");
  document.getElementById("engineArmToggle").click();
  await waitFor(()=>document.getElementById("engineArmState").textContent==="ARMED","re-arm toggle");
  assert.equal(document.getElementById("engineArmToggle").textContent,"Disarm engine");

  // 401 handling: locking clears the token; a rejected token attempt keeps the console locked; the correct token re-unlocks.
  document.getElementById("authLockButton").click();
  assert.equal(document.getElementById("authGate").classList.contains("locked"),true,"lock button must return the console to the locked state");
  assert.equal(window.sessionStorage.getItem("cteAccessToken"),null,"locking must clear the stored token");
  assert.equal(document.getElementById("connectButton").disabled,true);
  document.getElementById("authTokenInput").value="still-wrong";
  document.getElementById("authUnlockButton").click();
  await waitFor(()=>document.getElementById("authGateMessage").textContent.includes("rejected"),"post-lock rejected message");
  assert.equal(document.getElementById("authGate").classList.contains("locked"),true);
  document.getElementById("authTokenInput").value=FIXTURE_TOKEN;
  document.getElementById("authUnlockButton").click();
  await waitFor(()=>document.getElementById("authGate").classList.contains("unlocked"),"re-unlock after 401");
  assert.equal(document.getElementById("connectButton").disabled,false);

  assert.equal(browserErrors.length,0,browserErrors.map(error=>error.message).join("\n"));
  console.log("DOM connection, bearer token gate, 401 re-lock, arm/disarm control, Refresh chart, normalized candle compatibility, schedule, event refresh, timeout, abort, and minimum-unit behavior verified.");
}finally{
  document.getElementById("disconnectButton")?.click();dom.window.close();
}
