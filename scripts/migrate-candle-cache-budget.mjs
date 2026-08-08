import fs from "node:fs";
const path="src/worker-base.js";
let source=fs.readFileSync(path,"utf8"),changes=0;
const replaceOnce=(from,to,label)=>{if(!source.includes(from))throw new Error(`Missing candle cache anchor: ${label}`);source=source.replace(from,to);changes++;};

replaceOnce(
'const candleCache=new Map();\nconst OANDA_MAX_CONCURRENCY=3,OANDA_REQUEST_TIMEOUT_MS=15000;',
'const candleCache=new Map();\nconst CANDLE_CACHE_MAX_ENTRIES=32,CANDLE_CACHE_MAX_BARS=60000;\nfunction candleCacheBarCount(){let total=0;for(const entry of candleCache.values())total+=Array.isArray(entry?.value?.candles)?entry.value.candles.length:0;return total;}\nfunction trimCandleCache(protectedKey=null){let bars=candleCacheBarCount();while(candleCache.size>CANDLE_CACHE_MAX_ENTRIES||bars>CANDLE_CACHE_MAX_BARS){const candidate=[...candleCache.keys()].find(key=>key!==protectedKey);if(!candidate)break;const entry=candleCache.get(candidate);bars-=Array.isArray(entry?.value?.candles)?entry.value.candles.length:0;candleCache.delete(candidate);}}\nfunction setCandleCache(key,entry){candleCache.delete(key);candleCache.set(key,entry);trimCandleCache(key);}\nfunction touchCandleCache(key,entry){candleCache.delete(key);candleCache.set(key,entry);}\nconst OANDA_MAX_CONCURRENCY=3,OANDA_REQUEST_TIMEOUT_MS=15000;',
'cache budget helpers');
replaceOnce(
'  if(cached?.value&&cached.expires>now&&cached.count>=count)return json(select(cached.value));\n  if(cached?.promise&&cached.count>=count)return json(select(await cached.promise));',
'  if(cached?.value&&cached.expires>now&&cached.count>=count){touchCandleCache(key,cached);return json(select(cached.value));}\n  if(cached?.promise&&cached.count>=count){touchCandleCache(key,cached);return json(select(await cached.promise));}',
'LRU cache hits');
replaceOnce(
'  candleCache.set(key,{promise,count:requestCount,expires:0,value:cached?.value});\n  try{const value=await promise;candleCache.set(key,{value,count:requestCount,expires:Date.now()+ttl});if(candleCache.size>400)candleCache.delete(candleCache.keys().next().value);return json(select(value));}catch(error){if(candleCache.get(key)?.promise===promise)candleCache.delete(key);throw error;}',
'  setCandleCache(key,{promise,count:requestCount,expires:0,value:cached?.value});\n  try{const value=await promise;setCandleCache(key,{value,count:requestCount,expires:Date.now()+ttl});return json(select(value));}catch(error){if(candleCache.get(key)?.promise===promise)candleCache.delete(key);throw error;}',
'budgeted cache writes');
replaceOnce(
'worker:{oandaActive,oandaQueued:oandaWaiters.length,maxConcurrency:OANDA_MAX_CONCURRENCY,requestTimeoutMs:OANDA_REQUEST_TIMEOUT_MS,candleCacheEntries:candleCache.size,telemetry:oandaTelemetry}',
'worker:{oandaActive,oandaQueued:oandaWaiters.length,maxConcurrency:OANDA_MAX_CONCURRENCY,requestTimeoutMs:OANDA_REQUEST_TIMEOUT_MS,candleCacheEntries:candleCache.size,candleCacheBars:candleCacheBarCount(),candleCacheMaxEntries:CANDLE_CACHE_MAX_ENTRIES,candleCacheMaxBars:CANDLE_CACHE_MAX_BARS,telemetry:oandaTelemetry}',
'cache diagnostic telemetry');
fs.writeFileSync(path,source);console.log(`Applied memory-bounded candle cache migration (${changes} transformations).`);
