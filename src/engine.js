const API="https://api-fxtrade.oanda.com";
const PAIRS=["EUR_USD","GBP_USD","USD_JPY","USD_CAD","USD_CHF","AUD_USD","NZD_USD","EUR_GBP","EUR_JPY","EUR_CHF","EUR_AUD","EUR_CAD","EUR_NZD","GBP_JPY","GBP_CHF","GBP_AUD","GBP_CAD","GBP_NZD","AUD_JPY","AUD_CHF","AUD_CAD","AUD_NZD","NZD_JPY","NZD_CHF","NZD_CAD","CAD_JPY","CAD_CHF","CHF_JPY"];
const TIMEFRAME="M15",HTL_LENGTH=50,CANDLE_COUNT=650;

const response=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{"Content-Type":"application/json","Cache-Control":"no-store"}});
const mean=values=>values.length?values.reduce((sum,value)=>sum+value,0)/values.length:0;
const median=values=>{if(!values.length)return null;const v=[...values].sort((a,b)=>a-b),m=Math.floor(v.length/2);return v.length%2?v[m]:(v[m-1]+v[m])/2;};

async function callOanda(path,token,init={}){
  const result=await fetch(API+path,{method:init.method||"GET",headers:{Authorization:`Bearer ${token}`,Accept:"application/json",...(init.body?{"Content-Type":"application/json"}:{})},body:init.body,redirect:"manual",cache:"no-store"});
  const payload=await result.json().catch(()=>({}));
  if(!result.ok)throw Object.assign(new Error(payload.errorMessage||payload.errorCode||`OANDA HTTP ${result.status}`),{status:result.status,payload});
  return payload;
}

function secrets(env){const token=String(env.OANDA_API_KEY||"").trim(),configured=String(env.OANDA_ACCOUNT_ID||"").trim();if(token.length<20||!configured)throw new Error("OANDA secrets unavailable");return{token,configured};}

async function liveAccount(token,configured){
  const payload=await callOanda("/v3/accounts",token),accounts=payload.accounts||[];
  const account=accounts.find(item=>item.id===configured&&!item.tags?.includes("MT4"))||accounts.find(item=>String(item.id||"").endsWith("-001")&&!item.tags?.includes("MT4"));
  if(!account)throw new Error("Authorized non-MT4 account ending -001 not found");
  return account.id;
}

function seriesAverage(values,length){let total=0;return values.map((value,index)=>{total+=value;if(index>=length)total-=values[index-length];return total/length;});}
function seriesStdev(values,length){const out=Array(values.length).fill(null);if(values.length<length)return out;for(let i=length-1;i<values.length;i++){const slice=values.slice(i-length+1,i+1);if(!slice.every(Number.isFinite))continue;const m=mean(slice);out[i]=Math.sqrt(mean(slice.map(value=>(value-m)**2)));}return out;}
function seriesWma(values,length){const out=Array(values.length).fill(null),den=length*(length+1)/2;for(let i=length-1;i<values.length;i++){const slice=values.slice(i-length+1,i+1);if(slice.every(Number.isFinite))out[i]=slice.reduce((sum,value,index)=>sum+(index+1)*value,0)/den;}return out;}
const pairAverage=(left,right)=>left.map((value,index)=>Number.isFinite(value)&&Number.isFinite(right[index])?(value+right[index])/2:null);
const norm=(left,right,deviation)=>left.map((value,index)=>Number.isFinite(value)&&Number.isFinite(right[index])&&Number.isFinite(deviation[index])&&deviation[index]!==0?(value-right[index])/deviation[index]:null);
const inverse=(z,deviation,center)=>z.map((value,index)=>Number.isFinite(value)&&Number.isFinite(deviation[index])&&Number.isFinite(center[index])?(-value*deviation[index])+center[index]:null);
function cross(left,right,index){if(index<1)return 0;const v=[left[index],right[index],left[index-1],right[index-1]];if(!v.every(Number.isFinite))return 0;if(left[index]>right[index]&&left[index-1]<=right[index-1])return 1;if(left[index]<right[index]&&left[index-1]>=right[index-1])return-1;return 0;}

function htlCore(data,length){
  const close=data.map(c=>c.close),high=data.map(c=>c.high),low=data.map(c=>c.low),average=seriesAverage(close,length),deviation=seriesStdev(close,length),zero=deviation.map(value=>Number.isFinite(value)&&value!==0?0:null),u=zero.map((value,index)=>Number.isFinite(value)&&Number.isFinite(deviation[index])?(value*deviation[index])+average[index]:null),wmaU=seriesWma(u,length),zu=norm(u,wmaU,deviation),i=inverse(zu,deviation,wmaU),hl2=high.map((value,index)=>(value+low[index])/2),mui=pairAverage(i,u),wmaMui=seriesWma(mui,length),zui=norm(mui,wmaMui,deviation),iuz=zui.map(value=>Number.isFinite(value)?-value:null),ui=inverse(zui,deviation,wmaMui),uim=pairAverage(mui,ui),wmaUim=seriesWma(uim,length),zim=norm(uim,wmaUim,deviation),uir=inverse(zim,deviation,wmaUim),miu=pairAverage(uim,uir),wmaMiu=seriesWma(miu,length),zmiu=norm(miu,wmaMiu,deviation),ia=zmiu.map((value,index)=>Number.isFinite(value)&&Number.isFinite(deviation[index])&&Number.isFinite(wmaMiu[index])?((value+1)*deviation[index])+wmaMiu[index]:null),id=zmiu.map((value,index)=>Number.isFinite(value)&&Number.isFinite(deviation[index])&&Number.isFinite(wmaMiu[index])?((value-1)*deviation[index])+wmaMiu[index]:null),up=pairAverage(ia,id),wmaUp=seriesWma(up,length),zup=norm(close,wmaUp,deviation),upr=inverse(zup,deviation,wmaUp);
  return{hl2,mui,zui,iuz,ui,upr};
}

function htlBuild(data,length){
  const series=htlCore(data,length),families=[[series.hl2,series.upr],[series.mui,series.ui],[series.zui,series.iuz]],sourceCrosses=[];
  for(let index=1;index<data.length;index++){const directions=families.map(pair=>cross(pair[0],pair[1],index)).filter(Boolean),vote=directions.reduce((sum,value)=>sum+value,0);if(vote)sourceCrosses.push({index,direction:Math.sign(vote)});}
  const anchors=[];let active=null;
  const finalize=(episode,end,status)=>{let price=episode.direction>0?-Infinity:Infinity,extremeIndex=episode.index;for(let index=episode.index;index<=end;index++){const value=episode.direction>0?data[index].high:data[index].low;if((episode.direction>0&&value>price)||(episode.direction<0&&value<price)){price=value;extremeIndex=index;}}return{index:extremeIndex,price,direction:episode.direction,status};};
  for(const event of sourceCrosses){if(active&&event.direction!==active.direction){anchors.push(finalize(active,Math.max(active.index,event.index-1),"FINAL"));active=event;}else if(!active)active=event;}
  if(active)anchors.push(finalize(active,data.length-1,"PROVISIONAL"));anchors.sort((a,b)=>a.index-b.index);const dedup=[];for(const anchor of anchors){if(dedup.length&&dedup.at(-1).index===anchor.index)dedup[dedup.length-1]=anchor;else dedup.push(anchor);}
  const asset=Array(data.length).fill(null);if(dedup.length){for(let index=0;index<=dedup[0].index;index++)asset[index]=dedup[0].price;for(let p=1;p<dedup.length;p++){const from=dedup[p-1],to=dedup[p],span=Math.max(1,to.index-from.index);for(let index=from.index;index<=to.index;index++)asset[index]=from.price+(to.price-from.price)*((index-from.index)/span);}const last=dedup.at(-1);for(let index=last.index;index<data.length;index++)asset[index]=last.price;}
  const assetMean=seriesWma(asset,length),assetDeviation=seriesStdev(asset,length),assetZ=norm(asset,assetMean,assetDeviation),recovered=inverse(assetZ,assetDeviation,assetMean),sourceTotal=Array(data.length).fill(0);let total=0,crossPosition=0;for(let index=0;index<data.length;index++){while(crossPosition<sourceCrosses.length&&sourceCrosses[crossPosition].index===index){total++;crossPosition++;}sourceTotal[index]=total;}
  return{asset,inverse:recovered,sourceTotal};
}

function currentEvent(data){
  const htl=htlBuild(data,HTL_LENGTH),crosses=[];for(let index=1;index<data.length;index++){const direction=cross(htl.asset,htl.inverse,index);if(direction)crosses.push({index,direction});}
  if(!crosses.length)return null;const current=crosses.at(-1),start=data[current.index];return{direction:current.direction,startTime:start.time,openPrice:start.close,bars:data.length-current.index,id:`${current.direction}:${start.time}`};
}

function normalizeCandles(payload){return(payload.candles||[]).filter(c=>c.complete&&c.mid).map(c=>({time:c.time,open:Number(c.mid.o),high:Number(c.mid.h),low:Number(c.mid.l),close:Number(c.mid.c),volume:Number(c.volume||0)})).filter(c=>[c.open,c.high,c.low,c.close].every(Number.isFinite));}
async function candles(pair,token,count=CANDLE_COUNT){const q=new URLSearchParams({price:"M",granularity:TIMEFRAME,count:String(count),smooth:"false"});return normalizeCandles(await callOanda(`/v3/instruments/${pair}/candles?${q}`,token));}

async function notify(env,entry){
  const text=`CTE ${entry.type}: ${entry.pair||"system"} ${entry.direction||""} ${entry.message||""}`.trim();
  if(env.SENDGRID_API_KEY&&env.ALERT_EMAIL_TO&&env.ALERT_EMAIL_FROM)await fetch("https://api.sendgrid.com/v3/mail/send",{method:"POST",headers:{Authorization:`Bearer ${env.SENDGRID_API_KEY}`,"Content-Type":"application/json"},body:JSON.stringify({personalizations:[{to:[{email:env.ALERT_EMAIL_TO}]}],from:{email:env.ALERT_EMAIL_FROM},subject:"CTE Compound",content:[{type:"text/plain",value:text}]})}).catch(()=>{});
  if(env.TWILIO_ACCOUNT_SID&&env.TWILIO_AUTH_TOKEN&&env.TWILIO_FROM&&env.SMS_TO){const body=new URLSearchParams({To:env.SMS_TO,From:env.TWILIO_FROM,Body:text});await fetch(`https://api.twilio.com/2010-04-01/Accounts/${env.TWILIO_ACCOUNT_SID}/Messages.json`,{method:"POST",headers:{Authorization:`Basic ${btoa(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`)}`,"Content-Type":"application/x-www-form-urlencoded"},body}).catch(()=>{});}
}

export class HtlEngine{
  constructor(ctx,env){this.ctx=ctx;this.env=env;this.running=false;}
  async fetch(request){const path=new URL(request.url).pathname;if(path==="/status")return response(await this.status());if(path==="/ledger")return response({ledger:(await this.ctx.storage.get("ledger"))||[]});if(path==="/tick"&&request.method==="POST"){await this.tick();return response(await this.status());}return response({error:"Not found"},404);}
  async alarm(){try{await this.tick();}finally{await this.ctx.storage.setAlarm(Date.now()+60000);}}
  async status(){const state=(await this.ctx.storage.get("state"))||{};return{armed:true,running:this.running,timeframe:TIMEFRAME,htlLength:HTL_LENGTH,lastCandle:state.lastCandle||null,lastRun:state.lastRun||null,lastError:state.lastError||null,processedPairs:Object.keys(state.events||{}).length};}
  async write(entry){const ledger=(await this.ctx.storage.get("ledger"))||[];ledger.unshift({...entry,time:new Date().toISOString()});await this.ctx.storage.put("ledger",ledger.slice(0,500));await notify(this.env,entry);}
  async tick(){
    if(this.running)return;this.running=true;let state=(await this.ctx.storage.get("state"))||{events:{},initialized:false};
    try{
      const{token,configured}=secrets(this.env),accountId=await liveAccount(token,configured),probe=await candles("EUR_USD",token,2),lastCandle=probe.at(-1)?.time;if(!lastCandle||lastCandle===state.lastCandle)return;
      const rows=[];for(const pair of PAIRS){const data=await candles(pair,token),event=currentEvent(data);if(event)rows.push({pair,event});}
      if(!state.initialized){state.events=Object.fromEntries(rows.map(row=>[row.pair,row.event.id]));state.initialized=true;await this.write({type:"INITIALIZED",message:`${rows.length} HTL events registered`});}
      else{
        const candidates=rows.filter(row=>state.events[row.pair]!==row.event.id&&row.event.startTime===lastCandle).sort((a,b)=>b.event.bars-a.event.bars);
        if(candidates.length)await this.execute(await this.choose(candidates),token,accountId,state);
        for(const row of rows)state.events[row.pair]=row.event.id;
      }
      state.lastCandle=lastCandle;state.lastRun=new Date().toISOString();state.lastError=null;
    }catch(error){state.lastRun=new Date().toISOString();state.lastError=error.message||"Engine failure";await this.write({type:"ERROR",message:state.lastError});}
    finally{await this.ctx.storage.put("state",state);if(await this.ctx.storage.getAlarm()===null)await this.ctx.storage.setAlarm(Date.now()+60000);this.running=false;}
  }
  async choose(candidates){
    if(candidates.length===1||!this.env.AI)return candidates[0];
    try{
      const table=candidates.map(row=>({pair:row.pair,direction:row.event.direction>0?"BUY":"SELL",eventId:row.event.id,bars:row.event.bars,openPrice:row.event.openPrice}));
      const result=await this.env.AI.run("@cf/nvidia/nemotron-3-120b-a12b",{messages:[{role:"system",content:"Select exactly one newly completed HTL reversal event. Return JSON only: {\"pair\":\"PAIR\"}. Never invent a pair."},{role:"user",content:JSON.stringify(table)}],response_format:{type:"json_object"},max_completion_tokens:80}),parsed=JSON.parse(result.response||result.result||"{}");
      return candidates.find(row=>row.pair===parsed.pair)||candidates[0];
    }catch{return candidates[0];}
  }
  async execute(candidate,token,accountId,state){
    const{pair,event}=candidate,direction=event.direction>0?"BUY":"SELL",accountPayload=await callOanda(`/v3/accounts/${accountId}`,token),account=accountPayload.account||{},position=(account.positions||[]).find(item=>item.instrument===pair),longUnits=Number(position?.long?.units||0),shortUnits=Math.abs(Number(position?.short?.units||0)),existing=longUnits>0?1:shortUnits>0?-1:0;
    if(existing===event.direction){await this.write({type:"NO_ORDER",pair,direction,message:"Existing position already matches event"});return;}
    if(existing){const body=existing>0?{longUnits:"ALL"}:{shortUnits:"ALL"};await callOanda(`/v3/accounts/${accountId}/positions/${pair}/close`,token,{method:"PUT",body:JSON.stringify(body)});await this.write({type:"POSITION_CLOSED",pair,direction:existing>0?"BUY":"SELL",message:"Opposite HTL event"});}
    const summary=(await callOanda(`/v3/accounts/${accountId}/summary`,token)).account||{};if(Number(summary.marginAvailable)<=0){await this.write({type:"NO_ORDER",pair,direction,message:"No margin available"});return;}
    const pricing=await callOanda(`/v3/accounts/${accountId}/pricing?instruments=${pair}&includeUnitsAvailable=true`,token),available=pricing.prices?.[0]?.unitsAvailable?.default,units=Math.max(0,Math.trunc(Number(event.direction>0?available?.long:available?.short)||0));if(!units){await this.write({type:"NO_ORDER",pair,direction,message:"No directional units available"});return;}
    const signed=event.direction>0?units:-units,order={order:{instrument:pair,units:String(signed),type:"MARKET",timeInForce:"FOK",positionFill:"DEFAULT"}},result=await callOanda(`/v3/accounts/${accountId}/orders`,token,{method:"POST",body:JSON.stringify(order)}),fill=result.orderFillTransaction;
    await this.write({type:"ORDER_FILLED",pair,direction,units,transaction:fill?.id||result.lastTransactionID||null,price:fill?.price||null,event:event.id});
  }
}
