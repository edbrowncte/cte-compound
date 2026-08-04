from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected 1 occurrence, found {count}")
    return text.replace(old, new, 1)


engine_path = Path("src/engine.js")
engine = engine_path.read_text()

engine = replace_once(
    engine,
    'CANDLE_COUNT=650,MAX_COMPUTE_BARS=5000,OPTIMIZER_VERSION=4',
    'CANDLE_COUNT=650,MAX_COMPUTE_BARS=2500,OPTIMIZER_VERSION=4',
    "bounded Compute Configuration workload",
)

old_snapshots = 'function causalSnapshots(data,length){const snapshots=Array(data.length).fill(null),start=Math.max(2,length);for(let end=start;end<data.length;end++){const htl=htlBuild(data.slice(0,end+1),length),at=series=>series.at(-1);snapshots[end]={asset:at(htl.asset),inverse:at(htl.inverse),meanAsset:at(htl.meanAsset),meanInverse:at(htl.meanInverse),dareNAsset:at(htl.dareNAsset),dareNInverse:at(htl.dareNInverse),naiAsset:at(htl.naiAsset),naiInverse:at(htl.naiInverse),zup:at(htl.zup),puz:at(htl.puz)};}return snapshots;}'
new_snapshots = '''function htlCausal(data,length){const series=htlCore(data,length),families=[[series.hl2,series.upr],[series.mui,series.ui],[series.zui,series.iuz]],crosses=new Map();for(let index=1;index<data.length;index++){const directions=families.map(pair=>cross(pair[0],pair[1],index)).filter(Boolean),vote=directions.reduce((sum,value)=>sum+value,0);if(vote)crosses.set(index,{index,direction:Math.sign(vote)});}const asset=Array(data.length).fill(null),recovered=Array(data.length).fill(null),assetMean=Array(data.length).fill(null),finalized=[];let active=null;const begin=event=>({index:event.index,direction:event.direction,price:event.direction>0?data[event.index].high:data[event.index].low,extremeIndex:event.index}),update=(episode,index)=>{const price=episode.direction>0?data[index].high:data[index].low;if((episode.direction>0&&price>episode.price)||(episode.direction<0&&price<episode.price)){episode.price=price;episode.extremeIndex=index;}},dedup=anchors=>{const out=[];for(const anchor of anchors.sort((a,b)=>a.index-b.index)){if(out.length&&out.at(-1).index===anchor.index)out[out.length-1]=anchor;else out.push(anchor);}return out;},assetAt=(anchors,index)=>{if(!anchors.length)return null;if(index<=anchors[0].index)return anchors[0].price;for(let position=1;position<anchors.length;position++){const from=anchors[position-1],to=anchors[position];if(index<=to.index){const span=Math.max(1,to.index-from.index);return from.price+(to.price-from.price)*((index-from.index)/span);}}return anchors.at(-1).price;},first=Math.max(1,length*3-1),denominator=length*(length+1)/2;for(let index=0;index<data.length;index++){const event=crosses.get(index);if(event){if(!active)active=begin(event);else if(event.direction!==active.direction){finalized.push({index:active.extremeIndex,price:active.price,direction:active.direction,status:"FINAL"});active=begin(event);}}if(active)update(active,index);if(index<first||!active)continue;const anchors=dedup([...finalized,{index:active.extremeIndex,price:active.price,direction:active.direction,status:"PROVISIONAL"}]),start=Math.max(0,index-length+1),window=[];for(let cursor=start;cursor<=index;cursor++)window.push(assetAt(anchors,cursor));if(window.length!==length||!window.every(Number.isFinite))continue;const current=window.at(-1),weighted=window.reduce((sum,value,position)=>sum+(position+1)*value,0)/denominator,average=mean(window),deviation=Math.sqrt(mean(window.map(value=>(value-average)**2)));asset[index]=current;assetMean[index]=weighted;recovered[index]=deviation>0?(2*weighted)-current:null;}return{asset,inverse:recovered,assetMean,series};}
function causalIndicatorSet(data,length){const htl=htlCausal(data,length),meanAsset=pairAverage(htl.asset,htl.inverse),meanCenter=seriesWma(meanAsset,length),meanInverse=meanAsset.map((value,index)=>Number.isFinite(value)&&Number.isFinite(meanCenter[index])?(2*meanCenter[index])-value:null),assetCenter=seriesWma(htl.asset,length),inverseCenter=seriesWma(htl.inverse,length),naiAsset=norm(htl.asset,assetCenter,seriesStdev(htl.asset,length)),naiInverse=norm(htl.inverse,inverseCenter,seriesStdev(htl.inverse,length)),dareNAsset=norm(meanAsset,seriesWma(meanAsset,length),seriesStdev(meanAsset,length)),dareNInverse=norm(meanInverse,seriesWma(meanInverse,length),seriesStdev(meanInverse,length));return{asset:htl.asset,inverse:htl.inverse,meanAsset,meanInverse,dareNAsset,dareNInverse,naiAsset,naiInverse,zup:htl.series.zup,puz:htl.series.puz};}
function causalSnapshots(data,length){const indicators=causalIndicatorSet(data,length);return data.map((_,index)=>({asset:indicators.asset[index],inverse:indicators.inverse[index],meanAsset:indicators.meanAsset[index],meanInverse:indicators.meanInverse[index],dareNAsset:indicators.dareNAsset[index],dareNInverse:indicators.dareNInverse[index],naiAsset:indicators.naiAsset[index],naiInverse:indicators.naiInverse[index],zup:indicators.zup[index],puz:indicators.puz[index]}));}'''
engine = replace_once(engine, old_snapshots, new_snapshots, "incremental causal optimizer snapshots")

engine = replace_once(
    engine,
    'if(path==="/compute"&&request.method==="POST"){try{return response(await this.computeConfiguration(await request.json()));}catch(error){return response({error:String(error?.message||error)},Number(error?.status)||500);}}',
    'if(path==="/compute"&&request.method==="POST"){try{return response(await this.computeConfiguration(await request.json()));}catch(error){return response({error:String(error?.message||error),stage:error?.stage||"compute"},Number(error?.status)||500);}}',
    "Compute Configuration staged error response",
)

old_compute = '  async computeConfiguration(value={}){const pair=String(value.pair||"").toUpperCase(),timeframe=String(value.timeframe||"").toUpperCase(),startDate=String(value.startDate||""),endDate=String(value.endDate||"");if(!PAIRS.includes(pair))throw Object.assign(new Error("Invalid Compute Configuration currency pair."),{status:400});if(!TIMEFRAMES.has(timeframe))throw Object.assign(new Error("Invalid Compute Configuration timeframe."),{status:400});if(!/^\\d{4}-\\d{2}-\\d{2}$/.test(startDate)||!/^\\d{4}-\\d{2}-\\d{2}$/.test(endDate))throw Object.assign(new Error("Start date and end date are required."),{status:400});const {token}=secrets(this.env),data=await candlesForRange(pair,token,timeframe,startDate,endDate);if(data.length<80)throw Object.assign(new Error(`Insufficient completed candles for Compute Configuration: ${data.length}. Select a wider date range.`),{status:400});const config=optimizeDataset(data,pair),stamp=data.at(-1)?.time||new Date().toISOString(),records=(await this.ctx.storage.get("optimizer"))||{},key=`${pair}|${timeframe}`,record={version:OPTIMIZER_VERSION,stamp,computedAt:new Date().toISOString(),source:"COMPUTE_CONFIGURATION",range:{startDate,endDate,firstCandle:data[0]?.time||null,lastCandle:data.at(-1)?.time||null,bars:data.length},config};records[key]=record;await this.ctx.storage.put("optimizer",records);return{key,record};}'
new_compute = '  async computeConfiguration(value={}){let stage="validation";try{const pair=String(value.pair||"").toUpperCase(),timeframe=String(value.timeframe||"").toUpperCase(),startDate=String(value.startDate||""),endDate=String(value.endDate||"");if(!PAIRS.includes(pair))throw Object.assign(new Error("Invalid Compute Configuration currency pair."),{status:400});if(!TIMEFRAMES.has(timeframe))throw Object.assign(new Error("Invalid Compute Configuration timeframe."),{status:400});if(!/^\\d{4}-\\d{2}-\\d{2}$/.test(startDate)||!/^\\d{4}-\\d{2}-\\d{2}$/.test(endDate))throw Object.assign(new Error("Start date and end date are required."),{status:400});stage="credentials";const {token}=secrets(this.env);stage="oanda-range";const data=await candlesForRange(pair,token,timeframe,startDate,endDate);if(data.length<80)throw Object.assign(new Error(`Insufficient completed candles for Compute Configuration: ${data.length}. Select a wider date range.`),{status:400});stage="causal-optimization";const config=optimizeDataset(data,pair),stamp=data.at(-1)?.time||new Date().toISOString();stage="durable-storage";const records=(await this.ctx.storage.get("optimizer"))||{},key=`${pair}|${timeframe}`,record={version:OPTIMIZER_VERSION,stamp,computedAt:new Date().toISOString(),source:"COMPUTE_CONFIGURATION",range:{startDate,endDate,firstCandle:data[0]?.time||null,lastCandle:data.at(-1)?.time||null,bars:data.length},config};records[key]=record;await this.ctx.storage.put("optimizer",records);return{key,record};}catch(error){if(!error.stage)error.stage=stage;throw error;}}'
engine = replace_once(engine, old_compute, new_compute, "staged Compute Configuration method")
engine_path.write_text(engine)

html_path = Path("public/index.html")
html = html_path.read_text()
html = replace_once(
    html,
    'if(!response.ok)throw new Error(payload.error||`HTTP ${response.status}`);state.autoConfigurations.set(payload.key,payload.record);',
    'if(!response.ok)throw new Error(payload.error?`${payload.stage||"compute"} · ${payload.error}`:`HTTP ${response.status}`);state.autoConfigurations.set(payload.key,payload.record);',
    "stage-specific browser error",
)
html_path.write_text(html)

check_worker_path = Path("scripts/check-worker.mjs")
check_worker = check_worker_path.read_text()
check_worker = replace_once(
    check_worker,
    '  [/MAX_COMPUTE_BARS/,"bounded causal optimization range"]',
    '  [/MAX_COMPUTE_BARS/,"bounded causal optimization range"],\n  [/function htlCausal/,"incremental causal optimizer"],\n  [/stage="causal-optimization"/,"Compute Configuration error stage"]',
    "Compute Configuration CPU checks",
)
check_worker_path.write_text(check_worker)

test_path = Path("scripts/test-runtime.mjs")
test = test_path.read_text()
test = replace_once(
    test,
    '  if(value.includes("/candles?"))return new Response(JSON.stringify({candles:[{time:"2026-08-04T00:00:00Z",complete:true,mid:{o:"1",h:"1.2",l:".9",c:"1.1"},volume:10}]}),{status:200});',
    '  if(value.includes("/candles?")){const parsed=new URL(value);if(parsed.searchParams.has("from")){const candles=Array.from({length:180},(_,index)=>{const base=1.1+Math.sin(index/8)*.004+index*.00001;return{time:new Date(Date.UTC(2026,6,1,0,index*15)).toISOString(),complete:true,mid:{o:String(base),h:String(base+.0015),l:String(base-.0015),c:String(base+Math.sin(index/3)*.0004)},volume:10};});return new Response(JSON.stringify({candles}),{status:200});}return new Response(JSON.stringify({candles:[{time:"2026-08-04T00:00:00Z",complete:true,mid:{o:"1",h:"1.2",l:".9",c:"1.1"},volume:10}]}),{status:200});}',
    "date-range optimizer test candles",
)
test = replace_once(
    test,
    'response=await engine.fetch(new Request("https://engine/compute",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({pair:"EUR_USD",timeframe:"M15",startDate:"bad",endDate:"2026-08-04"})}));assert.equal(response.status,400);response=await engine.fetch',
    'response=await engine.fetch(new Request("https://engine/compute",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({pair:"EUR_USD",timeframe:"M15",startDate:"bad",endDate:"2026-08-04"})}));assert.equal(response.status,400);response=await engine.fetch(new Request("https://engine/compute",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({pair:"EUR_USD",timeframe:"M15",startDate:"2026-07-01",endDate:"2026-07-03"})}));assert.equal(response.status,200);const computed=await response.json();assert.equal(computed.record.source,"COMPUTE_CONFIGURATION");assert.equal(computed.record.range.bars,180);response=await engine.fetch',
    "successful authoritative compute test",
)
test = replace_once(
    test,
    'assert.match(html,/MAX_CANDLE_REQUESTS=3/);',
    'assert.match(html,/MAX_CANDLE_REQUESTS=3/);assert.doesNotMatch(await readFile(new URL("../src/engine.js",import.meta.url),"utf8"),/htlBuild\\(data\\.slice\\(0,end\\+1\\),length\\)/);assert.match(html,/payload\\.stage\\|\\|"compute"/);',
    "CPU regression and staged error assertions",
)
test_path.write_text(test)

Path("scripts/authoritative-compute-trigger").unlink(missing_ok=True)
Path(__file__).unlink(missing_ok=True)
