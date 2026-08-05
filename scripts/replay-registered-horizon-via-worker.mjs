import { readFile } from "node:fs/promises";
import { evaluateRegisteredPerformance, registeredExportRows } from "../src/horizon-registered-performance.js";

const origin=String(process.env.CERTIFICATION_WORKER_ORIGIN||"https://cte-compound.thetestamony.workers.dev").replace(/\/$/,"");
const NOMINAL_AUDIT_TO="2026-07-28T03:52:00.000Z";
const settings={assetLength:50,dareNLength:40,dareNFilter:1.5,naiLength:50,naiFilter:1.5,apexLength:50,apexFilter:7,csf:{selected:["DARE_N","NAI"],method:"REGIME_TRIGGER",regime:"NAI",trigger:"DARE_N"}};
const saved=JSON.parse(await readFile(new URL("../test/fixtures/registered-horizon-performance.json",import.meta.url),"utf8"));
const pairs=[...new Set(saved.map(row=>row.Pair.replace(" / ","_")))];
const numericFields=["Bars","Trades","Net pips","Avg","MFE/MAE","Max DD","Gross winning pips","Gross losing pips","Profit factor","Recovery factor"];
const closeEnough=(actual,expected)=>{
  if(Number.isNaN(actual)&&Number.isNaN(expected))return true;
  if(!Number.isFinite(actual)||!Number.isFinite(expected))return actual===expected;
  return Math.abs(actual-expected)<=1e-8;
};
const close=(actual,expected,label)=>{
  if(!closeEnough(actual,expected))throw new Error(`${label}: ${actual} != ${expected}`);
};

async function fetchCandles(pair,auditTo){
  const oandaPath=`/v3/instruments/${pair}/candles?price=M&granularity=M1&count=3000&to=${encodeURIComponent(auditTo)}&smooth=false`;
  const requestUrl=`${origin}/api/oanda/proxy?path=${encodeURIComponent(oandaPath)}`;
  const response=await fetch(requestUrl,{headers:{Origin:origin,"Sec-Fetch-Site":"same-origin",Accept:"application/json"},redirect:"manual",cache:"no-store"});
  const contentType=response.headers.get("content-type")||"";
  const payload=contentType.includes("application/json")?await response.json():{error:await response.text()};
  if(!response.ok)throw new Error(`${pair}: Worker HTTP ${response.status}: ${payload.error||payload.errorMessage||"historical candle proxy failed"}`);
  const candles=(payload.candles||[]).filter(row=>row.complete&&row.mid).map(row=>({time:row.time,open:Number(row.mid.o),high:Number(row.mid.h),low:Number(row.mid.l),close:Number(row.mid.c),complete:true}));
  if(candles.length!==3000)throw new Error(`${pair}: expected 3000 candles, received ${candles.length}`);
  return candles;
}

function exactRows(actual,expected){
  if(actual.length!==expected.length)return false;
  for(const row of actual){
    const target=expected.find(item=>item.Strategy===row.Strategy);
    if(!target||row["W/L/Flat"]!==target["W/L/Flat"])return false;
    if(numericFields.some(field=>!closeEnough(Number(row[field]),Number(target[field]))))return false;
  }
  return true;
}

async function resolveAuditTo(){
  const calibrationPair="EUR_AUD",expected=saved.filter(row=>row.Pair==="EUR / AUD"),nominal=Date.parse(NOMINAL_AUDIT_TO),diagnostics=[];
  for(let offset=-5;offset<=5;offset+=1){
    const auditTo=new Date(nominal+(offset*60000)).toISOString(),candles=await fetchCandles(calibrationPair,auditTo),actual=registeredExportRows(evaluateRegisteredPerformance(candles,calibrationPair,settings),calibrationPair,"M1"),asset=actual.find(row=>row.Strategy==="HTL Asset");
    diagnostics.push(`${auditTo} last=${candles.at(-1)?.time} trades=${asset?.Trades} net=${asset?.["Net pips"]}`);
    if(exactRows(actual,expected))return auditTo;
  }
  throw new Error(`No exact EUR_AUD saved-record boundary found. Candidates: ${diagnostics.join(" | ")}`);
}

const AUDIT_TO=await resolveAuditTo();
console.log(`Resolved exact registered candle boundary: ${AUDIT_TO}`);
for(const pair of pairs){
  const candles=await fetchCandles(pair,AUDIT_TO),actual=registeredExportRows(evaluateRegisteredPerformance(candles,pair,settings),pair,"M1"),expected=saved.filter(row=>row.Pair===pair.replace("_"," / "));
  for(const row of actual){
    const target=expected.find(item=>item.Strategy===row.Strategy);
    if(!target)throw new Error(`${pair}/${row.Strategy}: missing saved row`);
    for(const field of numericFields)close(Number(row[field]),Number(target[field]),`${pair}/${row.Strategy}/${field}`);
    if(row["W/L/Flat"]!==target["W/L/Flat"])throw new Error(`${pair}/${row.Strategy}/W/L/Flat: ${row["W/L/Flat"]} != ${target["W/L/Flat"]}`);
  }
  console.log(`PASS ${pair}`);
}
console.log(`PASS all ${saved.length} registered Horizon performance rows through ${origin} at ${AUDIT_TO}`);
