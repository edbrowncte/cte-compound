import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {candles} from "../src/horizon-platform-engine.js";

const originalFetch=globalThis.fetch;
const requests=[];
const payload={candles:[
  {time:"2026-08-14T03:00:00.000000000Z",complete:true,mid:{o:"1.1000",h:"1.1010",l:"1.0990",c:"1.1005"},volume:10},
  {time:"2026-08-14T03:05:00.000000000Z",complete:true,mid:{o:"1.1005",h:"1.1020",l:"1.1000",c:"1.1015"},volume:11},
]};

globalThis.fetch=async url=>{
  requests.push(String(url));
  return new Response(JSON.stringify(payload),{status:200,headers:{"Content-Type":"application/json"}});
};

try{
  const before=Date.now(),probeRows=await candles("EUR_USD","x".repeat(40),"M5",2),probeUrl=new URL(requests.at(-1)),probeTo=Date.parse(probeUrl.searchParams.get("to")||"");
  assert.equal(probeUrl.searchParams.get("count"),"2");
  assert.equal(probeUrl.searchParams.get("granularity"),"M5");
  assert.equal(probeUrl.searchParams.get("smooth"),"false");
  assert.ok(Number.isFinite(probeTo),"Two-candle execution clock probe must carry an explicit OANDA to= timestamp");
  assert.ok(probeTo>=before-1000&&probeTo<=Date.now()+1000,"Execution clock to= timestamp must represent the current request time");
  assert.equal(probeRows.at(-1)?.time,"2026-08-14T03:05:00.000000000Z");

  requests.length=0;
  await candles("EUR_USD","x".repeat(40),"M5",3);
  const historyUrl=new URL(requests.at(-1));
  assert.equal(historyUrl.searchParams.get("count"),"3");
  assert.equal(historyUrl.searchParams.has("to"),false,"Normal analytical/history candle requests must retain their existing open-ended contract");

  const execution=await readFile(new URL("../src/engine-certified-execution.js",import.meta.url),"utf8");
  assert.match(execution,/candles\("EUR_USD",token,config\.timeframe,2\)/,"Certified execution must continue to use the dedicated two-candle clock probe covered by this contract");
  console.log("Execution candle clock verified: the two-candle OANDA probe is explicitly bounded to now while analytical/history requests remain unchanged.");
}finally{
  globalThis.fetch=originalFetch;
}
