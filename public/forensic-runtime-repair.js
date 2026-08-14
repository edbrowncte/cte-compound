(function installForensicRuntimeRepair(root){
  "use strict";

  const VERSION="CTE_FORENSIC_RUNTIME_REPAIR@1.2.0";
  const ACCOUNT_POSITION_STREAM_VERSION="OANDA_ACCOUNT_POSITION_STREAM_TRUTH@1.0.0";
  const POSITION_RECONCILIATION_WATCHDOG_MS=60000;
  const POSITION_STREAM_RECONNECT_MS=1500;
  const H=root.CTE_HORIZON_HTL;
  const finite=Number.isFinite;
  const loadHealth=new Map();
  const mean=values=>values.length?values.reduce((sum,value)=>sum+value,0)/values.length:0;

  function pipScale(pair){return String(pair||"").endsWith("JPY")?100:10000;}

  function enrichedEventFeatures(data,htl,pair){
    const candles=Array.isArray(data)?data:[],crossings=Array.isArray(htl?.crossings)?htl.crossings:[],events=[],scale=pipScale(pair);
    crossings.forEach((crossing,position)=>{
      const end=position+1<crossings.length?crossings[position+1].index-1:candles.length-1;
      const status=position+1<crossings.length?"FINAL":"PROVISIONAL";
      const segment=candles.slice(crossing.index,end+1);
      if(!segment.length)return;
      const spreads=htl.asset.slice(crossing.index,end+1).map((value,index)=>value-htl.inverse[crossing.index+index]).filter(finite);
      const start=Number(segment[0]?.close),close=Number(segment.at(-1)?.close);
      const profitPips=finite(start)&&finite(close)?(close-start)*Number(crossing.direction||0)*scale:null;
      const result=status!=="FINAL"?"OPEN":finite(profitPips)?profitPips>.05?"WIN":profitPips<-.05?"LOSS":"FLAT":null;
      const highs=segment.map(candle=>Number(candle.high)).filter(finite),lows=segment.map(candle=>Number(candle.low)).filter(finite);
      const high=highs.length?Math.max(...highs):null,low=lows.length?Math.min(...lows):null,center=mean(spreads);
      const variance=spreads.length?mean(spreads.map(value=>(value-center)**2)):0;
      let slope=0;
      if(spreads.length>1){const xMean=(spreads.length-1)/2;let numerator=0,denominator=0;spreads.forEach((value,index)=>{numerator+=(index-xMean)*(value-center);denominator+=(index-xMean)**2;});slope=denominator?numerator/denominator:0;}
      events.push({
        number:position+1,
        calculationVersion:H?.VERSION||htl?.version||null,
        pair:pair||null,
        direction:crossing.direction,
        startIndex:crossing.index,
        endIndex:end,
        status,
        result,
        startTime:candles[crossing.index]?.time||crossing.time||null,
        endTime:candles[end]?.time||null,
        openPrice:finite(start)?start:null,
        closePrice:finite(close)?close:null,
        profitPips,
        bars:end-crossing.index+1,
        high,
        low,
        upBps:finite(start)&&start&&finite(high)?((high/start)-1)*10000:null,
        downBps:finite(start)&&start&&finite(low)?((low/start)-1)*10000:null,
        mean:center,
        variance,
        slope,
        area:spreads.reduce((sum,value)=>sum+Math.abs(value),0),
        sourceCrosses:Math.max(0,(htl.sourceTotal?.[end]||0)-(htl.sourceTotal?.[Math.max(0,crossing.index-1)]||0)),
        priorAsset:crossing.priorAsset??null,
        priorInverse:crossing.priorInverse??null,
        asset:crossing.asset??null,
        inverse:crossing.inverse??null,
      });
    });
    return events;
  }

  const healthKey=(pair,timeframe,length)=>`${pair}|${timeframe}|${Number(length)}`;
  function recordLoadHealth(pair,timeframe,length,row,requestedCount){
    const bars=Number(row?.data?.length??row?.historyBars),target=Number(requestedCount);
    const health={pair,timeframe,length:Number(row?.length??length),degradedHistory:Boolean(row?.degradedHistory),historyBars:finite(bars)?bars:null,historyTarget:finite(target)?target:null};
    loadHealth.set(healthKey(pair,timeframe,health.length),health);return health;
  }
  function healthForSupportKey(key){const [pair,timeframe,length]=String(key||"").split("|");return loadHealth.get(healthKey(pair,timeframe,length))||null;}

  function normalizeSupportRecord(record,health={degradedHistory:false}){
    if(!record||typeof record!=="object")return record;
    const status=String(record.supportingStatus||""),bars=Number(record.supportingHistoryBars),target=Number(record.supportingHistoryTarget),finals=Number(record.supportingFinalEvents),magnitudes=Number(record.supportingMagnitudeEvents),gap=target-bars;
    const authoritativeHealthy=health?.degradedHistory===false;
    if(status==="DEGRADED_HISTORY"&&authoritativeHealthy&&!record.supportingError&&finite(bars)&&finite(target)&&gap>=0&&gap<=1&&finals>0&&magnitudes>0){
      return{...record,supportingStatus:"READY",corroborated:true,historyCompletion:"MAX_REQUEST_COMPLETED_CANDLES",historyCompletionGap:gap};
    }
    return record;
  }

  class RateFluctuationSupportMap extends Map{
    set(key,value){return super.set(key,normalizeSupportRecord(value,healthForSupportKey(key)));}
  }

  function conversionFactorsFromPrice(price={}){
    const source=price?.quoteHomeConversionFactors||price?.homeConversions||null;
    const positive=Number(source?.positiveUnits),negative=Number(source?.negativeUnits);
    return{positive:finite(positive)&&positive>0?positive:null,negative:finite(negative)&&negative>0?negative:null};
  }

  function positionPriceFromRaw(raw={}){
    const bucketBid=Number(raw?.bids?.[0]?.price),bucketAsk=Number(raw?.asks?.[0]?.price),closeoutBid=Number(raw?.closeoutBid),closeoutAsk=Number(raw?.closeoutAsk);
    return{
      bid:finite(bucketBid)?bucketBid:finite(closeoutBid)?closeoutBid:NaN,
      ask:finite(bucketAsk)?bucketAsk:finite(closeoutAsk)?closeoutAsk:NaN,
      time:raw?.time||null,
      tradeable:raw?.tradeable!==false,
      priceBasis:finite(bucketBid)&&finite(bucketAsk)?"LIVE_OANDA_BID_ASK_BUCKETS":"OANDA_CLOSEOUT_FALLBACK",
    };
  }

  function livePositionMark(position,price,accountCurrency=""){
    const pair=String(position?.instrument||""),longUnits=Number(position?.long?.units||0),shortUnits=Math.abs(Number(position?.short?.units||0)),isLong=longUnits>0,units=isLong?longUnits:shortUnits,details=isLong?position?.long:position?.short,entry=Number(details?.averagePrice),current=Number(isLong?price?.bid:price?.ask);
    if(!pair||!(units>0)||!finite(entry)||!finite(current))return null;
    const direction=isLong?1:-1,delta=(current-entry)*direction,pips=delta*(String(pair).endsWith("JPY")?100:10000),change=entry?delta/entry*100:null,quotePnl=delta*units,quoteCurrency=pair.split("_")[1]||"",account=String(accountCurrency||"").toUpperCase(),factors=price?.homeConversion||conversionFactorsFromPrice(price),factor=quoteCurrency===account?1:(quotePnl>=0?factors?.positive:factors?.negative),unrealized=finite(factor)&&factor>0?quotePnl*factor:null;
    return{pair,isLong,units,entry,current,pips,change,quotePnl,quoteCurrency,accountCurrency:account,homeConversionFactor:finite(factor)?factor:null,unrealizedPL:finite(unrealized)?unrealized:null,markTime:price?.time||null,priceBasis:price?.priceBasis||null};
  }

  function applyLivePositionMarks(){
    if(typeof state==="undefined"||!(state.positionPrices instanceof Map))return[];
    const marks=[];
    for(const position of state.openPositions||[]){
      const price=state.positionPrices.get(position.instrument);if(!price)continue;
      const mark=livePositionMark(position,price,state.accountCurrency||"");if(!mark)continue;
      const long=Number(position.long?.units||0)>0,details=long?position.long:position.short,broker=Number(details?.unrealizedPL??position.unrealizedPL);
      position.cteBrokerUnrealizedPL=finite(broker)?broker:null;position.cteLiveMark=mark;
      if(finite(mark.unrealizedPL)){position.unrealizedPL=mark.unrealizedPL;if(details)details.unrealizedPL=mark.unrealizedPL;}
      else if(finite(broker)&&Math.sign(broker)!==0&&Math.sign(mark.quotePnl)!==0&&Math.sign(broker)!==Math.sign(mark.quotePnl)){position.unrealizedPL=Number.NaN;if(details)details.unrealizedPL=Number.NaN;}
      marks.push(mark);
    }
    return marks;
  }

  function installLivePositionAccounting(){
    if(typeof state==="undefined")return false;
    if(typeof applyAccountFacts==="function"&&!applyAccountFacts?.cteLiveMarkWrapper){const prior=applyAccountFacts,wrapped=function(account,...rest){state.accountCurrency=String(account?.currency||state.accountCurrency||"").toUpperCase();return prior(account,...rest);};Object.defineProperty(wrapped,"cteLiveMarkWrapper",{value:true});try{applyAccountFacts=wrapped;root.applyAccountFacts=wrapped;}catch{}}
    if(typeof setPositionPrice==="function"&&!setPositionPrice?.cteLiveMarkWrapper){const prior=setPositionPrice,wrapped=function(raw){const result=prior(raw);const stored=state.positionPrices?.get?.(raw?.instrument);if(stored){const market=positionPriceFromRaw(raw);if(finite(market.bid))stored.bid=market.bid;if(finite(market.ask))stored.ask=market.ask;stored.time=market.time||stored.time;stored.tradeable=market.tradeable;stored.priceBasis=market.priceBasis;stored.homeConversion=conversionFactorsFromPrice(raw);stored.quoteHomeConversionFactors=raw?.quoteHomeConversionFactors||null;}return result;};Object.defineProperty(wrapped,"cteLiveMarkWrapper",{value:true});try{setPositionPrice=wrapped;root.setPositionPrice=wrapped;}catch{}}
    if(typeof renderOpenPositions==="function"&&!renderOpenPositions?.cteLiveMarkWrapper){const prior=renderOpenPositions,wrapped=function(...args){applyLivePositionMarks();return prior(...args);};Object.defineProperty(wrapped,"cteLiveMarkWrapper",{value:true});try{renderOpenPositions=wrapped;root.renderOpenPositions=wrapped;}catch{}}
    if(typeof renderModelOperatingPerspective==="function"&&!renderModelOperatingPerspective?.cteLiveMarkWrapper){const prior=renderModelOperatingPerspective,wrapped=function(...args){applyLivePositionMarks();return prior(...args);};Object.defineProperty(wrapped,"cteLiveMarkWrapper",{value:true});try{renderModelOperatingPerspective=wrapped;root.renderModelOperatingPerspective=wrapped;}catch{}}
    return true;
  }

  function transactionChangesAccount(transaction){return Boolean(transaction&&typeof transaction==="object"&&String(transaction.type||"").toUpperCase()!=="HEARTBEAT");}
  function transactionIdentity(transaction){const value=transaction?.id??transaction?.lastTransactionID;return value===undefined||value===null?null:String(value);}
  function setPositionStreamStatus(text,live=false){
    if(typeof document==="undefined")return;
    const node=document.getElementById("positionsStreamStatus");if(!node)return;node.textContent=text;node.classList.toggle("live",Boolean(live));
  }
  function positionStreamStatus(){
    if(typeof state==="undefined")return"Account stream unavailable";
    if(typeof accountReady==="function"&&!accountReady())return"Not connected";
    if(state.positionTransactionStreamConnected&&state.positionStreamController)return"Account + pricing streams live";
    if(state.positionTransactionStreamConnected)return"Account transaction stream live";
    return"Account stream reconnecting";
  }
  function publishPositionStreamStatus(){const text=positionStreamStatus(),live=text.includes("live");setPositionStreamStatus(text,live);return text;}

  function queuePositionTruthRefresh(transaction=null){
    if(typeof state==="undefined")return false;
    if(transaction){state.positionLastTransactionType=String(transaction.type||"TRANSACTION");state.positionLastTransactionID=transactionIdentity(transaction);state.positionLastTransactionAt=transaction.time||new Date().toISOString();}
    state.positionRefreshQueued=true;
    if(state.positionTransactionRefreshTimer)return true;
    state.positionTransactionRefreshTimer=setTimeout(()=>{
      state.positionTransactionRefreshTimer=null;
      const reason=transaction?`TRANSACTION_STREAM:${String(transaction.type||"TRANSACTION")}`:"TRANSACTION_STREAM";
      if(typeof refreshOpenPositions==="function")void refreshOpenPositions(reason);
    },25);
    return true;
  }

  async function startAccountTransactionStream(){
    if(typeof state==="undefined"||typeof fetch!=="function"||typeof accountReady!=="function"||!accountReady())return false;
    if(state.positionTransactionStreamController&&!state.positionTransactionStreamController.signal?.aborted)return true;
    clearTimeout(state.positionTransactionReconnectTimer);state.positionTransactionReconnectTimer=null;
    const controller=new AbortController();state.positionTransactionStreamController=controller;state.positionTransactionStreamConnected=false;state.positionTransactionStreamVersion=ACCOUNT_POSITION_STREAM_VERSION;publishPositionStreamStatus();
    try{
      const response=await fetch("/api/oanda/transactions/stream",{method:"GET",headers:{Accept:"application/octet-stream"},credentials:"same-origin",cache:"no-store",signal:controller.signal});
      if(!response.ok){const payload=await response.json().catch(()=>({}));throw new Error(payload.error||payload.code||`HTTP ${response.status}`);}
      state.positionTransactionStreamConnected=true;state.positionTransactionStreamError=null;state.positionTransactionConnectedAt=new Date().toISOString();publishPositionStreamStatus();
      queuePositionTruthRefresh({type:"STREAM_CONNECTED",time:state.positionTransactionConnectedAt});
      const reader=response.body?.getReader?.();if(!reader)throw new Error("Transaction stream response body is unavailable.");
      const decoder=new TextDecoder();let buffer="";
      while(accountReady()&&!controller.signal.aborted){
        const{value,done}=await reader.read();if(done)break;buffer+=decoder.decode(value,{stream:true});const lines=buffer.split("\n");buffer=lines.pop()||"";
        for(const line of lines){if(!line.trim())continue;let transaction;try{transaction=JSON.parse(line);}catch{continue;}
          const id=transactionIdentity(transaction);if(id)state.positionLastTransactionID=id;
          if(String(transaction?.type||"").toUpperCase()==="HEARTBEAT"){state.positionTransactionHeartbeatAt=transaction.time||new Date().toISOString();publishPositionStreamStatus();continue;}
          if(transactionChangesAccount(transaction))queuePositionTruthRefresh(transaction);
        }
      }
    }catch(error){if(controller.signal.aborted)return false;state.positionTransactionStreamError=String(error?.message||error);}
    finally{
      if(state.positionTransactionStreamController===controller)state.positionTransactionStreamController=null;
      state.positionTransactionStreamConnected=false;publishPositionStreamStatus();
      if(typeof accountReady==="function"&&accountReady()&&!controller.signal.aborted){clearTimeout(state.positionTransactionReconnectTimer);state.positionTransactionReconnectTimer=setTimeout(()=>{state.positionTransactionReconnectTimer=null;if(accountReady())void startAccountTransactionStream();},POSITION_STREAM_RECONNECT_MS);}
    }
    return false;
  }

  function stopAccountTransactionStream(){
    if(typeof state==="undefined")return;
    clearTimeout(state.positionTransactionReconnectTimer);state.positionTransactionReconnectTimer=null;clearTimeout(state.positionTransactionRefreshTimer);state.positionTransactionRefreshTimer=null;
    state.positionTransactionStreamController?.abort?.();state.positionTransactionStreamController=null;state.positionTransactionStreamConnected=false;state.positionRefreshQueued=false;publishPositionStreamStatus();
  }

  function installStreamingPositionTruth(){
    if(typeof state==="undefined")return false;
    state.positionTransactionStreamVersion=ACCOUNT_POSITION_STREAM_VERSION;
    if(typeof refreshOpenPositions==="function"&&!refreshOpenPositions?.cteStreamingTruthWrapper){
      const prior=refreshOpenPositions,wrapped=async function(reason="ACCOUNT_POSITION_RECONCILIATION"){
        if(typeof accountReady==="function"&&!accountReady())return;
        if(state.positionsBusy){state.positionRefreshQueued=true;state.positionRefreshQueuedReason=reason;return;}
        let passes=0,currentReason=reason;
        do{
          state.positionRefreshQueued=false;state.positionRefreshQueuedReason=null;state.positionRefreshSource=currentReason;await prior();state.positionSnapshotAt=new Date().toISOString();state.positionSnapshotSource=currentReason;passes++;currentReason="QUEUED_TRANSACTION_RECONCILIATION";
        }while(state.positionRefreshQueued&&passes<4&&(typeof accountReady!=="function"||accountReady()));
        if(state.positionRefreshQueued){clearTimeout(state.positionTransactionRefreshTimer);state.positionTransactionRefreshTimer=setTimeout(()=>{state.positionTransactionRefreshTimer=null;if(typeof refreshOpenPositions==="function"&&(typeof accountReady!=="function"||accountReady()))void refreshOpenPositions("QUEUED_TRANSACTION_RECONCILIATION");},25);}
        publishPositionStreamStatus();
      };
      Object.defineProperty(wrapped,"cteStreamingTruthWrapper",{value:true});try{refreshOpenPositions=wrapped;root.refreshOpenPositions=wrapped;}catch{}
    }
    if(typeof startPositionMonitor==="function"&&!startPositionMonitor?.cteStreamingTruthWrapper){
      const wrapped=function(){clearInterval(state.positionTimer);state.positionTimer=null;void refreshOpenPositions("ACCOUNT_STREAM_BOOTSTRAP");void startAccountTransactionStream();state.positionTimer=setInterval(()=>{if(typeof accountReady==="function"&&accountReady())void refreshOpenPositions("ACCOUNT_STREAM_WATCHDOG");},POSITION_RECONCILIATION_WATCHDOG_MS);};
      Object.defineProperty(wrapped,"cteStreamingTruthWrapper",{value:true});try{startPositionMonitor=wrapped;root.startPositionMonitor=wrapped;}catch{}
    }
    if(typeof stopPositionMonitor==="function"&&!stopPositionMonitor?.cteStreamingTruthWrapper){
      const prior=stopPositionMonitor,wrapped=function(...args){stopAccountTransactionStream();const result=prior(...args);publishPositionStreamStatus();return result;};Object.defineProperty(wrapped,"cteStreamingTruthWrapper",{value:true});try{stopPositionMonitor=wrapped;root.stopPositionMonitor=wrapped;}catch{}
    }
    if(typeof startPositionStream==="function"&&!startPositionStream?.cteStreamingTruthWrapper){
      const prior=startPositionStream,wrapped=function(...args){const result=prior(...args);setTimeout(publishPositionStreamStatus,50);return result;};Object.defineProperty(wrapped,"cteStreamingTruthWrapper",{value:true});try{startPositionStream=wrapped;root.startPositionStream=wrapped;}catch{}
    }
    return true;
  }

  function installEventFeatures(){root.eventFeatures=enrichedEventFeatures;try{eventFeatures=enrichedEventFeatures;}catch{}}
  function installLoadHealth(){
    if(typeof loadEventRow!=="function"||loadEventRow?.cteForensicHealthWrapper)return false;
    const prior=loadEventRow;
    const wrapped=async function(pair,timeframe,length,controller,priority=60,requestedCount=null){const row=await prior(pair,timeframe,length,controller,priority,requestedCount);if(requestedCount!==null&&requestedCount!==undefined)recordLoadHealth(pair,timeframe,length,row,requestedCount);return row;};
    Object.defineProperty(wrapped,"cteForensicHealthWrapper",{value:true});root.loadEventRow=wrapped;try{loadEventRow=wrapped;}catch{}return true;
  }
  function installSupportCache(){
    if(typeof state==="undefined")return false;
    state.rateFluctuationEventCache=new RateFluctuationSupportMap();
    state.rateFluctuationSupportPromises=new Map();
    return true;
  }

  installEventFeatures();
  const install=()=>{installEventFeatures();installLoadHealth();installSupportCache();installLivePositionAccounting();installStreamingPositionTruth();};
  root.CTEForensicRuntimeRepair=Object.freeze({VERSION,ACCOUNT_POSITION_STREAM_VERSION,POSITION_RECONCILIATION_WATCHDOG_MS,POSITION_STREAM_RECONNECT_MS,pipScale,enrichedEventFeatures,recordLoadHealth,healthForSupportKey,normalizeSupportRecord,RateFluctuationSupportMap,conversionFactorsFromPrice,positionPriceFromRaw,livePositionMark,applyLivePositionMarks,transactionChangesAccount,transactionIdentity,queuePositionTruthRefresh,startAccountTransactionStream,stopAccountTransactionStream,positionStreamStatus,publishPositionStreamStatus,installEventFeatures,installLoadHealth,installSupportCache,installLivePositionAccounting,installStreamingPositionTruth});
  if(typeof document!=="undefined"){if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",install,{once:true});else queueMicrotask(install);}
})(typeof globalThis!=="undefined"?globalThis:self);
