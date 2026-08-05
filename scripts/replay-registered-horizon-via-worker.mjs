import { readFile, writeFile, mkdir } from "node:fs/promises";
import { evaluateRegisteredPerformance, registeredExportRows } from "../src/horizon-registered-performance.js";

const origin=String(process.env.CERTIFICATION_WORKER_ORIGIN||"https://cte-compound.thetestamony.workers.dev").replace(/\/$/,"");
const AUDIT_TO="2026-07-28T03:52:00.000Z";
const settings={assetLength:50,dareNLength:40,dareNFilter:1.5,naiLength:50,naiFilter:1.5,apexLength:50,apexFilter:7,csf:{selected:["DARE_N","NAI"],method:"REGIME_TRIGGER",regime:"NAI",trigger:"DARE_N"}};
const saved=JSON.parse(await readFile(new URL("../test/fixtures/registered-horizon-performance.json",import.meta.url),"utf8"));
const pairs=[...new Set(saved.map(row=>row.Pair.replace(" / ","_")))];
const numericFields=["Bars","Trades","Win rate","Net pips","Avg","MFE/MAE","Max DD","Gross winning pips","Gross losing pips","Profit factor","Recovery factor"];
const tolerance=1e-8;
const delta=(actual,expected)=>Number.isFinite(actual)&&Number.isFinite(expected)?actual-expected:actual===expected?0:Number.NaN;
const exact=(actual,expected)=>{
  if(Number.isNaN(actual)&&Number.isNaN(expected))return true;
  if(!Number.isFinite(actual)||!Number.isFinite(expected))return actual===expected;
  return Math.abs(actual-expected)<=tolerance;
};

async function fetchCandles(pair){
  const oandaPath=`/v3/instruments/${pair}/candles?price=M&granularity=M1&count=3000&to=${encodeURIComponent(AUDIT_TO)}&smooth=false`;
  const requestUrl=`${origin}/api/oanda/proxy?path=${encodeURIComponent(oandaPath)}`;
  const response=await fetch(requestUrl,{headers:{Origin:origin,"Sec-Fetch-Site":"same-origin",Accept:"application/json"},redirect:"manual",cache:"no-store"});
  const contentType=response.headers.get("content-type")||"";
  const payload=contentType.includes("application/json")?await response.json():{error:await response.text()};
  if(!response.ok)throw new Error(`${pair}: Worker HTTP ${response.status}: ${payload.error||payload.errorMessage||"historical candle proxy failed"}`);
  const candles=(payload.candles||[]).filter(row=>row.complete&&row.mid).map(row=>({time:row.time,open:Number(row.mid.o),high:Number(row.mid.h),low:Number(row.mid.l),close:Number(row.mid.c),complete:true}));
  if(candles.length!==3000)throw new Error(`${pair}: expected 3000 candles, received ${candles.length}`);
  return candles;
}

const comparisons=[];
for(const pair of pairs){
  const candles=await fetchCandles(pair);
  const actualRows=registeredExportRows(evaluateRegisteredPerformance(candles,pair,settings),pair,"M1");
  const expectedRows=saved.filter(row=>row.Pair===pair.replace("_"," / "));
  for(const row of actualRows){
    const target=expectedRows.find(item=>item.Strategy===row.Strategy);
    if(!target)throw new Error(`${pair}/${row.Strategy}: missing saved row`);
    const fields={};
    for(const field of numericFields){
      const actual=Number(row[field]),expected=Number(target[field]);
      fields[field]={actual,expected,delta:delta(actual,expected),exact:exact(actual,expected)};
    }
    fields["W/L/Flat"]={actual:row["W/L/Flat"],expected:target["W/L/Flat"],exact:row["W/L/Flat"]===target["W/L/Flat"]};
    comparisons.push({pair:row.Pair,strategy:row.Strategy,lastCandle:candles.at(-1)?.time,fields,exact:Object.values(fields).every(item=>item.exact)});
  }
  console.log(`AUDITED ${pair}`);
}

const fieldSummary={};
for(const field of [...numericFields,"W/L/Flat"]){
  const values=comparisons.map(row=>row.fields[field]);
  const numeric=field!=="W/L/Flat";
  fieldSummary[field]={exact:values.filter(item=>item.exact).length,mismatched:values.filter(item=>!item.exact).length,...(numeric?{maximumAbsoluteDelta:Math.max(0,...values.map(item=>Number.isFinite(item.delta)?Math.abs(item.delta):0))}:{})};
}
const mismatches=comparisons.filter(row=>!row.exact);
const report={format:"registered-horizon-live-replay-audit-v1",workerOrigin:origin,auditTo:AUDIT_TO,tolerance,rows:comparisons.length,exactRows:comparisons.length-mismatches.length,mismatchedRows:mismatches.length,fieldSummary,mismatches,comparisons};
await mkdir(new URL("../artifacts/",import.meta.url),{recursive:true});
await writeFile(new URL("../artifacts/registered-horizon-live-replay.json",import.meta.url),`${JSON.stringify(report,null,2)}\n`,`utf8`);
console.log(`RESULT exact=${report.exactRows}/${report.rows} mismatched=${report.mismatchedRows}`);
for(const[field,summary]of Object.entries(fieldSummary))console.log(`${field}: exact=${summary.exact} mismatched=${summary.mismatched}${"maximumAbsoluteDelta" in summary?` maxAbsDelta=${summary.maximumAbsoluteDelta}`:""}`);
if(mismatches.length)throw new Error(`Saved-record parity failed for ${mismatches.length}/${comparisons.length} rows. See artifacts/registered-horizon-live-replay.json.`);
console.log(`PASS all ${saved.length} registered Horizon performance rows through ${origin} at ${AUDIT_TO}`);
