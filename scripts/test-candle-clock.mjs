import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {EXECUTION_CLOCK_SOURCE,executionClockCandle,latestCompletedCandleTime} from "../src/execution-candle-clock.js";

const completeTime="2026-08-14T03:05:00.000000000Z",payload={latestCandles:[{instrument:"EUR_USD",granularity:"M5",candles:[
  {time:"2026-08-14T03:00:00.000000000Z",complete:true,mid:{o:"1.1000",h:"1.1010",l:"1.0990",c:"1.1005"}},
  {time:completeTime,complete:true,mid:{o:"1.1005",h:"1.1020",l:"1.1000",c:"1.1015"}},
  {time:"2026-08-14T03:10:00.000000000Z",complete:false,mid:{o:"1.1015",h:"1.1025",l:"1.1010",c:"1.1020"}},
]}]};

assert.equal(latestCompletedCandleTime(payload,"EUR_USD","M5"),completeTime,"Execution clock must ignore a newer incomplete candle");
assert.equal(EXECUTION_CLOCK_SOURCE,"OANDA_ACCOUNT_CANDLES_LATEST@1.0.0");

const requests=[];
const result=await executionClockCandle(async path=>{requests.push(path);return payload;},"001-001-1111111-001","M5");
assert.equal(result,completeTime);
assert.equal(requests.length,1);
const url=new URL(`https://api-fxtrade.oanda.com${requests[0]}`);
assert.equal(url.pathname,"/v3/accounts/001-001-1111111-001/candles/latest");
assert.equal(url.searchParams.get("candleSpecifications"),"EUR_USD:M5:M");
assert.equal(url.searchParams.get("smooth"),"false");

const execution=await readFile(new URL("../src/engine-certified-execution.js",import.meta.url),"utf8");
assert.match(execution,/executionClockCandle\(path=>callOanda\(path,token\),accountId,config\.timeframe\)/,"Certified execution must consume the isolated account-scoped current-candle clock");
assert.doesNotMatch(execution,/candles\("EUR_USD",token,config\.timeframe,2\)/,"Legacy two-candle history request must not remain the execution clock");
assert.match(execution,/executionClockSource:state\.executionClockSource\|\|null/);
assert.match(execution,/executionClockCandle:state\.executionClockCandle\|\|null/);
assert.match(execution,/executionClockProbeAt:state\.executionClockProbeAt\|\|null/);

const registered=await readFile(new URL("../src/horizon-platform-engine.js",import.meta.url),"utf8");
assert.doesNotMatch(registered,/candles\/latest|EXECUTION_CLOCK_SOURCE/,"Checksum-registered Horizon analytical source must remain execution-clock agnostic");

console.log("Authoritative execution clock verified: account-scoped OANDA latest completed EUR/USD candle, incomplete-candle rejection, runtime observability, and registered Horizon source isolation are wired.");
