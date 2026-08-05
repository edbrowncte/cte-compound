import { readFile } from "node:fs/promises";
import { evaluateRegisteredPerformance, registeredExportRows } from "../src/horizon-registered-performance.js";

const token=String(process.env.OANDA_API_KEY||"").trim();
if(token.length<20)throw new Error("OANDA_API_KEY is required for exact historical certification.");
const API="https://api-fxtrade.oanda.com",AUDIT_TO="2026-07-28T03:52:00.000Z",settings={assetLength:50,dareNLength:40,dareNFilter:1.5,naiLength:50,naiFilter:1.5,apexLength:50,apexFilter:7,csf:{selected:["DARE_N","NAI"],method:"REGIME_TRIGGER",regime:"NAI",trigger:"DARE_N"}},saved=JSON.parse(await readFile(new URL("../test/fixtures/registered-horizon-performance.json",import.meta.url),"utf8")),pairs=[...new Set(saved.map(row=>row.Pair.replace(" / ","_")))];
const close=(actual,expected,label)=>{if(Number.isNaN(actual)&&Number.isNaN(expected))return;if(!Number.isFinite(actual)||!Number.isFinite(expected)){if(actual!==expected)throw new Error(`${label}: ${actual} != ${expected}`);return;}if(Math.abs(actual-expected)>1e-8)throw new Error(`${label}: ${actual} != ${expected}`);};
for(const pair of pairs){
  const query=new URLSearchParams({price:"M",granularity:"M1",count:"3000",to:AUDIT_TO,smooth:"false"}),response=await fetch(`${API}/v3/instruments/${pair}/candles?${query}`,{headers:{Authorization:`Bearer ${token}`,Accept:"application/json"},redirect:"manual",cache:"no-store"}),payload=await response.json();
  if(!response.ok)throw new Error(`${pair}: ${payload.errorMessage||response.status}`);
  const candles=(payload.candles||[]).filter(row=>row.complete&&row.mid).map(row=>({time:row.time,open:Number(row.mid.o),high:Number(row.mid.h),low:Number(row.mid.l),close:Number(row.mid.c),complete:true}));
  if(candles.length!==3000)throw new Error(`${pair}: expected 3000 candles, received ${candles.length}`);
  const actual=registeredExportRows(evaluateRegisteredPerformance(candles,pair,settings),pair,"M1"),expected=saved.filter(row=>row.Pair===pair.replace("_"," / "));
  for(const row of actual){const target=expected.find(item=>item.Strategy===row.Strategy);if(!target)throw new Error(`${pair}/${row.Strategy}: missing saved row`);for(const field of ["Bars","Trades","Net pips","Avg","MFE/MAE","Max DD","Gross winning pips","Gross losing pips","Profit factor","Recovery factor"])close(Number(row[field]),Number(target[field]),`${pair}/${row.Strategy}/${field}`);if(row["W/L/Flat"]!==target["W/L/Flat"])throw new Error(`${pair}/${row.Strategy}/W/L/Flat: ${row["W/L/Flat"]} != ${target["W/L/Flat"]}`);}
  console.log(`PASS ${pair}`);
}
console.log(`PASS all ${saved.length} registered Horizon performance rows at ${AUDIT_TO}`);
