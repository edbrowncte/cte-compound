import { HtlEngine as CertifiedAnalyticsEngine } from "./engine.js";
import { PAIRS, TIMEFRAMES, candles, currentEvent } from "./horizon-platform-engine.js";
import { STRATEGY_ENGINE_VERSION } from "./horizon-strategy-v1.js";
import { REGISTERED_PERFORMANCE_VERSION } from "./horizon-registered-performance.js";
import { credentials } from "./engine-base.js";
import {
  optimizedOptimizeNext,
  optimizedComputeConfiguration,
  optimizedScan,
  fullSettings,
  RUNTIME_OPTIMIZER_VERSION,
  RUNTIME_OPTIMIZER_HISTORY_BARS,
  currentRuntimeOptimizer
} from "./optimized-optimizer.js";

const API="https://api-fxtrade.oanda.com";
const EXECUTION_POLICY_VERSION="CERTIFIED_MULTI_REVERSAL@1.0.0";

async function callOanda(path,token,init={}){
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),15000);
  try{
    const response=await fetch(API+path,{
      method:init.method||"GET",
      headers:{Authorization:`Bearer ${token}`,Accept:"application/json",...(init.body?{"Content-Type":"application/json"}:{})},
      body:init.body,
      redirect:"manual",
      cache:"no-store",
      signal:controller.signal,
    });
    const payload=await response.json().catch(()=>({}));
    if(!response.ok)throw Object.assign(new Error(payload.errorMessage||payload.errorCode||`OANDA HTTP ${response.status}`),{status:response.status,payload});
    return payload;
  }catch(error){
    if(controller.signal.aborted)throw Object.assign(new Error("OANDA request timed out"),{status:504});
    throw error;
  }finally{
    clearTimeout(timeout);
  }
}

async function exactLiveAccount(token,configured,state,writeLedger=null){
  const payload=await callOanda("/v3/accounts",token);
  const accounts=payload.accounts||[];
  const candidates = accounts.filter(item => {
    const isMT4 = (item.tags && item.tags.some(t => String(t).toUpperCase().includes("MT4"))) ||
                  (item.properties && String(JSON.stringify(item.properties)).toUpperCase().includes("MT4")) ||
                  String(item.id).toUpperCase().includes("MT4");
    return !isMT4 && String(item.id || "").endsWith("-001");
  });

  const getScore = (id, configured) => {
    if (!configured) return 0;
    if (id === configured) return 3;
    if (configured.length >= 11 && id.endsWith(configured.slice(-11))) return 2;
    const digits = configured.replace(/\D/g, "");
    if (digits && id.includes(digits)) return 1;
    return 0;
  };

  candidates.sort((a, b) => {
    const scoreA = getScore(a.id, configured);
    const scoreB = getScore(b.id, configured);
    return scoreB - scoreA;
  });

  let resolvedId = null;
  for (const candidate of candidates) {
    try {
      const summary = await callOanda(`/v3/accounts/${candidate.id}/summary`, token);
      if (summary.account && (summary.account.state === undefined || summary.account.state === "OPEN")) {
        resolvedId = candidate.id;
        break;
      }
    } catch (e) {
      // ignore
    }
  }

  if (!resolvedId) {
    throw new Error(`Configured OANDA account ${configured} is not authorized or is an MT4-linked account`);
  }

  if (state && state.resolvedAccountId !== resolvedId) {
    state.resolvedAccountId = resolvedId;
    if (writeLedger) {
      await writeLedger({
        type: "CONFIGURATION",
        message: `Resolved live account ID to authorized non-MT4 account: ${resolvedId}`
      });
    }
  }

  return resolvedId;
}

function configFingerprint(config){
  return JSON.stringify({
    timeframe:config.timeframe,
    decisionMode:config.decisionMode,
    strategy:config.strategy,
    confirmationStrategy:config.confirmationStrategy,
    htlLength:config.htlLength,
    filter:config.filter,
    configurationSource:config.configurationSource,
    optimizerVersion:RUNTIME_OPTIMIZER_VERSION,
  });
}

function positionDirection(position){
  const longUnits=Number(position?.long?.units||0);
  const shortUnits=Math.abs(Number(position?.short?.units||0));
  return longUnits>0?1:shortUnits>0?-1:0;
}

function requirementDirection(requirement){
  return Number(requirement?.event?.direction??requirement??0);
}

function modelNumber(value,min=-Infinity,max=Infinity){const number=Number(value);return Number.isFinite(number)?Math.max(min,Math.min(max,number)):null;}
function sanitizeModelContext(value){
  const body=value&&typeof value==="object"?value:{},direction=value=>value==="BUY"||value==="SELL"?value:null,pair=value=>PAIRS.includes(String(value||""))?String(value):null;
  const compactReport=item=>{const validPair=pair(item?.pair);if(!validPair)return null;return{pair:validPair,direction:direction(item.direction),type:String(item?.type||"").slice(0,32),regime:String(item?.regime||"").slice(0,48),strength:modelNumber(item?.strength,0,1),mas:modelNumber(item?.mas,0,1),im:modelNumber(item?.im,0,1),ratio:modelNumber(item?.ratio,0,20),masRoc:modelNumber(item?.masRoc,-10,10),imRoc:modelNumber(item?.imRoc,-10,10),ratioRoc:modelNumber(item?.ratioRoc,-20,20),eventAngleZ:modelNumber(item?.eventAngleZ,-20,20),convexity:modelNumber(item?.convexity,-40,40),r2:modelNumber(item?.r2,0,1),pipsPerHour:modelNumber(item?.pipsPerHour,-10000,10000),transitionProbability:modelNumber(item?.transitionProbability,0,1)};};
  const compactForecast=item=>{const validPair=pair(item?.pair);if(!validPair)return null;return{key:["A","B","C"].includes(item?.key)?item.key:null,pair:validPair,direction:direction(item.direction),confidence:modelNumber(item?.confidence,0,1),source:String(item?.source||"").slice(0,24)};};
  const compactMtf=item=>{const validPair=pair(item?.pair);if(!validPair)return null;return{pair:validPair,direction:direction(item.direction),confidence:modelNumber(item?.confidence,0,1),matches:modelNumber(item?.matches,0,10),available:modelNumber(item?.available,0,10)};};
  const compactPosition=item=>{const validPair=pair(item?.pair);if(!validPair)return null;return{pair:validPair,direction:direction(item.direction),units:modelNumber(item?.units,0,1e9),unrealizedPL:modelNumber(item?.unrealizedPL,-1e9,1e9)};};
  const strategyIds=new Set(["ASSET","DARE","DARE_N","NAI","COMBO","APEX"]),controlsBody=body.controls&&typeof body.controls==="object"?body.controls:{},controls={timeframe:TIMEFRAMES.includes(controlsBody.timeframe)?controlsBody.timeframe:null,strategy:strategyIds.has(controlsBody.strategy)?controlsBody.strategy:null,confirmationStrategy:controlsBody.confirmationStrategy==="NONE"||strategyIds.has(controlsBody.confirmationStrategy)?controlsBody.confirmationStrategy:null,htlLength:modelNumber(controlsBody.htlLength,3,200),filter:modelNumber(controlsBody.filter,0,10),decisionMode:["EVENT","MTF","COMBINED"].includes(controlsBody.decisionMode)?controlsBody.decisionMode:null,configurationSource:controlsBody.configurationSource==="OPTIMIZED"?"OPTIMIZED":null,minimumUnits:modelNumber(controlsBody.minimumUnits,1,1e9)};
  return{mandate:"CAPITALIZATION_AND_ACCOUNT_VALUE_PROLIFERATION",timeframe:controls.timeframe||(TIMEFRAMES.includes(body.timeframe)?body.timeframe:null),controls,selectedPairs:(Array.isArray(body.selectedPairs)?body.selectedPairs:[]).map(pair).filter(Boolean).slice(0,PAIRS.length),account:{balance:modelNumber(body.account?.balance,0,1e12),nav:modelNumber(body.account?.nav,0,1e12),marginAvailable:modelNumber(body.account?.marginAvailable,0,1e12)},slots:(Array.isArray(body.slots)?body.slots:[]).slice(0,4).map(compactReport).filter(Boolean),pairReports:(Array.isArray(body.pairReports)?body.pairReports:[]).slice(0,PAIRS.length).map(compactReport).filter(Boolean),forecasts:(Array.isArray(body.forecasts)?body.forecasts:[]).slice(0,3).map(compactForecast).filter(Boolean),mtfForecasts:(Array.isArray(body.mtfForecasts)?body.mtfForecasts:[]).slice(0,PAIRS.length).map(compactMtf).filter(Boolean),openPositions:(Array.isArray(body.openPositions)?body.openPositions:[]).slice(0,PAIRS.length).map(compactPosition).filter(Boolean),receivedAt:new Date().toISOString()};
}

function compactCandidate(candidate){
  return{
    pair:candidate.pair,
    event:candidate.event,
    confidence:Number.isFinite(candidate.confidence)?candidate.confidence:null,
    count:Number.isFinite(candidate.count)?candidate.count:null,
    configuration:candidate.configuration||null,
    Nemotron:candidate.Nemotron||null,
  };
}

export const __executionTest=Object.freeze({
  EXECUTION_POLICY_VERSION,
  sanitizeModelContext,
  positionDirection,
  requirementDirection,
  configFingerprint,
});

export class HtlEngine extends CertifiedAnalyticsEngine{
  async fetch(request){
    const url=new URL(request.url),path=url.pathname;
    if(path==="/optimizer"&&request.method==="GET"){
      const records=currentRuntimeOptimizer((await this.ctx.storage.get("optimizer"))||{});
      return new Response(JSON.stringify({version:RUNTIME_OPTIMIZER_VERSION,optimizerHistoryBars:RUNTIME_OPTIMIZER_HISTORY_BARS,strategyEngineVersion:STRATEGY_ENGINE_VERSION,performanceVersion:REGISTERED_PERFORMANCE_VERSION,records}),{status:200,headers:{"Content-Type":"application/json","Cache-Control":"no-store"}});
    }
    if(path==="/control/selectedPairs"&&request.method==="POST"){
      const body=await request.json().catch(()=>({}));
      let state=(await this.ctx.storage.get("state"))||{};
      state.selectedPairs=body.selectedPairs||[];
      state.manualSelectMode=body.manualSelectMode!==false;
      state.autoRotateMode=Boolean(body.autoRotateMode);
      if(state.autoRotateMode){state.selectedPairs=PAIRS.slice();state.manualPositions={};}
      if (!state.selectedPairs || state.selectedPairs.length === 0) {
        state.selectedPairs = PAIRS.slice();
        state.tradingMode = "ALL_PAIRS";
        state.manualPositions = {};
      } else {
        state.manualPositions = {};
        const nowMs = Date.now();
        if (body.manualPositions) {
          for (const [pair, details] of Object.entries(body.manualPositions)) {
            state.manualPositions[pair] = {
              timeframe: details.timeframe || "M30",
              direction: Number(details.direction || 1),
              protectedUntil: nowMs + 24 * 60 * 60 * 1000
            };
          }
        }
        state.tradingMode=state.autoRotateMode ? "AUTO_ROTATE" : (state.selectedPairs.length === 1 ? "MANUAL_1_PAIR" : "MANUAL_MULTI");
      }
      await this.ctx.storage.put("state",state);
      return new Response(JSON.stringify({ok:true,selectedPairs:state.selectedPairs,manualSelectMode:state.manualSelectMode,autoRotateMode:state.autoRotateMode,manualPositions:state.manualPositions,tradingMode:state.tradingMode}),{status:200,headers:{"Content-Type":"application/json","Cache-Control":"no-store"}});
    }
    if(path==="/evaluation/log"&&request.method==="POST"){
      const body=await request.json().catch(()=>({}));
      if(body?.type==="MODEL_CONTEXT"){const state=(await this.ctx.storage.get("state"))||{};state.modelContext=sanitizeModelContext(body);await this.ctx.storage.put("state",state);return new Response(JSON.stringify({ok:true,receivedAt:state.modelContext.receivedAt}),{status:200,headers:{"Content-Type":"application/json","Cache-Control":"no-store"}});}
      await this.write(body);
      return new Response(JSON.stringify({ok:true}),{status:200,headers:{"Content-Type":"application/json","Cache-Control":"no-store"}});
    }
    if(path==="/control/status"&&request.method==="GET"){
      const state=(await this.ctx.storage.get("state"))||{};
      const credentialInfo = credentials(this.env);
      let summary = {};
      let resolvedAccountId = state.resolvedAccountId;
      try {
        if (!resolvedAccountId) {
          resolvedAccountId = await exactLiveAccount(credentialInfo.token, credentialInfo.accountId, state);
        }
        const payload = await callOanda(`/v3/accounts/${resolvedAccountId}/summary`, credentialInfo.token);
        summary = payload.account || {};
      } catch (e) {
        // ignore
      }
      return new Response(JSON.stringify({
        lastScanAt:state.lastScanAt||null,
        lastTradeAttemptAt:state.lastTradeAttemptAt||null,
        lastNoOrderReason:state.lastNoOrderReason||null,
        openPositions:Number.isFinite(Number(summary.openPositionCount))?Number(summary.openPositionCount):(state.openPositionsCount||0),
        selectedPairs:state.selectedPairs||[],
        mode:state.autoRotateMode?"auto-rotate":state.manualSelectMode?"manual-select":"all",
        tradingMode:state.tradingMode||"MANUAL_1_PAIR",
        lastError:state.lastError||null,
        resolvedAccountId:resolvedAccountId||null,
        marginAvailable:Number(summary.marginAvailable || 0),
        manualPositions:state.manualPositions||{},
        modelContextAt:state.modelContext?.receivedAt||null
      }),{status:200,headers:{"Content-Type":"application/json","Cache-Control":"no-store"}});
    }
    return super.fetch(request);
  }

  async execute(candidate,token,accountId,state){
    const tradablePairs = state.selectedPairs?.length ? state.selectedPairs : PAIRS.slice();
    if (!tradablePairs.includes(candidate.pair)) {
      state.lastNoOrderReason = `Pair ${candidate.pair} not in selection`;
      return;
    }
    return super.execute(candidate,token,accountId,state);
  }

  async computeConfiguration(value) {
    return optimizedComputeConfiguration(this, value);
  }

  async optimizeNext(state, token) {
    return optimizedOptimizeNext(this, state, token);
  }

  async scan(token, config, timeframe = config.timeframe, optimizer = {}) {
    return optimizedScan(this, token, config, timeframe, optimizer);
  }

  async status(){
    const status=await super.status();
    const state=(await this.ctx.storage.get("state"))||{};
    const runtimeOptimizer=currentRuntimeOptimizer((await this.ctx.storage.get("optimizer"))||{});
    return{
      ...status,
      optimizerVersion:RUNTIME_OPTIMIZER_VERSION,
      optimizerHistoryBars:RUNTIME_OPTIMIZER_HISTORY_BARS,
      optimizerCoverage:Object.keys(runtimeOptimizer).length,
      optimizerTotal:PAIRS.length*TIMEFRAMES.length,
      armed:true,
      executionCertification:"ARMED_PRIVATE_USER",
      executionPolicy:EXECUTION_POLICY_VERSION,
      pendingReversals:Object.keys(state.pendingReversals||{}).length,
      reversalPolicy:"ALL_OPPOSING_EVENTS_INDEPENDENT_NEW_ENTRIES_NEMOTRON_RANKED",
      reconciliationCadence:"new-completed-candle-only",
    };
  }

  async loadPositions(token,accountId){
    const payload=await callOanda(`/v3/accounts/${accountId}/openPositions`,token);
    return payload.positions||[];
  }

  async reconcile(requirements,token,accountId,state,config,positionsSnapshot=null,excludedPairs=new Set()){
    const positions=positionsSnapshot||await this.loadPositions(token,accountId);
    const tradablePairs = state.selectedPairs?.length ? state.selectedPairs : PAIRS.slice();
    const nowMs = Date.now();

    for(const position of positions){
      if(!PAIRS.includes(position.instrument)||excludedPairs.has(position.instrument))continue;

      // Handle Manual Position protection
      const manual = state.manualPositions?.[position.instrument];
      if (manual) {
        if (nowMs >= Number(manual.protectedUntil || 0)) {
          // expired: auto-delete entry
          delete state.manualPositions[position.instrument];
        } else {
          const tf = manual.timeframe || "M30";
          const existing = positionDirection(position);
          const sameTimeframe = config.timeframe === tf;
          const sameDirection = existing === manual.direction;

          if (sameTimeframe && sameDirection) {
            let opt = {};
            try { opt = (await this.ctx.storage.get("optimizer")) || {}; } catch (e) {}
            let ev = null;
            let settings = null;
            try {
              settings = fullSettings(this, config, opt, position.instrument, tf);
              const candleData = await candles(position.instrument, token, tf);
              ev = currentEvent(candleData, position.instrument, tf, config.strategy, settings);
            } catch (e) {
              console.error("Failed to load candles for manual protection:", e);
            }

            const longUnits=Number(position.long?.units||0);
            const shortUnits=Math.abs(Number(position.short?.units||0));
            const opposingDirection = -existing;

            if (!ev || !ev.direction || ev.direction !== opposingDirection) {
              const side = existing > 0 ? "LONG" : "SHORT";
              const oppositeSide = existing > 0 ? "SELL" : "BUY";
              await this.write({
                type: "MANUAL_PROTECTED",
                pair: position.instrument,
                message: `Protecting manual ${position.instrument} ${tf} ${side} - no opposing ${tf} ${oppositeSide} signal`
              }, false);
              continue;
            }

            const context = this.decisionContext(ev ? { configuration: { settings } } : null, config);
            await this.closePosition(position.instrument, existing, longUnits, shortUnits, token, accountId, ev.id, "Opposing signal for protected manual position", context);
            continue;
          }
        }
      }

      if(!tradablePairs.includes(position.instrument))continue;

      const longUnits=Number(position.long?.units||0);
      const shortUnits=Math.abs(Number(position.short?.units||0));
      const existing=positionDirection(position);
      const requirement=requirements?.[position.instrument];
      const required=requirementDirection(requirement);
      if(!existing||!required||existing===required)continue;
      const context=this.decisionContext(requirement&&typeof requirement==="object"?requirement:null,config);
      const event=requirement?.event?.id||state.events?.[position.instrument]||null;
      await this.closePosition(position.instrument,existing,longUnits,shortUnits,token,accountId,event,"Position opposed current strategy direction",context);
    }
  }

  classifyCandidates(candidates,positions){
    const map=new Map((positions||[]).map(position=>[position.instrument,positionDirection(position)]));
    const reversals=[];
    const newEntries=[];
    const matching=[];
    for(const candidate of candidates||[]){
      const existing=map.get(candidate.pair)||0;
      if(existing&&existing!==candidate.event.direction)reversals.push(candidate);
      else if(!existing)newEntries.push(candidate);
      else matching.push(candidate);
    }
    return{reversals,newEntries,matching};
  }

  async claimReversals(candidates,state){
    state.pendingReversals=state.pendingReversals||{};
    const now=new Date().toISOString();
    for(const candidate of candidates){
      const current=state.pendingReversals[candidate.pair];
      if(current?.eventId===candidate.event.id)continue;
      state.pendingReversals[candidate.pair]={
        candidate:compactCandidate(candidate),
        eventId:candidate.event.id,
        direction:candidate.event.direction,
        claimedAt:now,
        attempts:0,
        lastError:null,
      };
    }
    await this.ctx.storage.put("state",state);
  }

  async processPendingReversals(state,token,accountId){
    state.pendingReversals=state.pendingReversals||{};
    for(const[pair,claim]of Object.entries({...state.pendingReversals})){
      const candidate=claim?.candidate;
      if(!candidate?.event?.id||candidate.pair!==pair){
        delete state.pendingReversals[pair];
        continue;
      }
      claim.attempts=Number(claim.attempts||0)+1;
      claim.lastAttemptAt=new Date().toISOString();
      await this.ctx.storage.put("state",state);
      try{
        await this.execute(candidate,token,accountId,state);
        delete state.pendingReversals[pair];
        await this.ctx.storage.put("state",state);
        await this.write({
          type:"REVERSAL_CLAIM_RESOLVED",
          pair,
          direction:candidate.event.direction>0?"BUY":"SELL",
          event:candidate.event.id,
          executionPolicy:EXECUTION_POLICY_VERSION,
          attempts:claim.attempts,
          message:"Durable reversal claim completed or reconciled against the live OANDA position",
        },false);
      }catch(error){
        claim.lastError=String(error?.message||error);
        claim.updatedAt=new Date().toISOString();
        state.pendingReversals[pair]=claim;
        await this.ctx.storage.put("state",state);
        await this.write({
          type:"REVERSAL_RETRY_PENDING",
          pair,
          direction:candidate.event.direction>0?"BUY":"SELL",
          event:candidate.event.id,
          executionPolicy:EXECUTION_POLICY_VERSION,
          attempts:claim.attempts,
          message:claim.lastError,
        },false);
      }
    }
  }

  async tick(){
    if(this.running)return;
    this.running=true;
    let state=(await this.ctx.storage.get("state"))||{events:{},initialized:false};

    if (!state.selectedPairs || state.selectedPairs.length === 0) {
      state.selectedPairs = PAIRS.slice();
      state.tradingMode = "ALL_PAIRS";
      state.manualPositions = {};
      await this.ctx.storage.put("state", state);
    }

    // Task 1 - Backoff Guard check
    const nowMs = Date.now();
    if (state.backoffUntil && nowMs < state.backoffUntil) {
      this.running = false;
      const backoffTimeStr = new Date(state.backoffUntil).toISOString();
      if (!state.lastBackoffLogged || state.lastBackoffLogged !== state.backoffUntil) {
        state.lastBackoffLogged = state.backoffUntil;
        await this.ctx.storage.put("state", state);
        await this.write({
          type: "INFO",
          executionPolicy: EXECUTION_POLICY_VERSION,
          message: `Skipping tick - in backoff until ${backoffTimeStr}`
        }, false);
      }
      return;
    }

    if(state.strategyEngineVersion!==STRATEGY_ENGINE_VERSION){
      Object.assign(state,{
        events:{},directions:null,requirements:null,lastCandle:null,
        mtf:{},mtfDecisionDirections:{},mtfRotation:0,initialized:false,
        reconciledCandle:null,
        strategyEngineVersion:STRATEGY_ENGINE_VERSION,
        performanceVersion:REGISTERED_PERFORMANCE_VERSION,
      });
      await this.ctx.storage.put("state",state);
      await this.write({
        type:"ANALYTICAL_ENGINE_MIGRATION",
        strategyEngineVersion:STRATEGY_ENGINE_VERSION,
        performanceVersion:REGISTERED_PERFORMANCE_VERSION,
        message:"Engine state reset for strategy version change (reconciled from engine-certified-execution.js — engine.js's original migration path is unreachable due to tick() override without super call)",
      },false);
    }

    try{
      const config=await this.config();
      const fingerprint=configFingerprint(config);
      state.config=config;
      if(state.mtfFingerprint!==fingerprint){
        state.mtf={};
        state.mtfRotation=0;
        state.mtfFingerprint=fingerprint;
        // Clean stale strategy requirements, directions, events, candle markers, and initialized flag to prevent premature position closures on configuration change
        state.requirements=null;
        state.directions=null;
        state.events={};
        state.lastCandle=null;
        state.initialized=false;
        state.reconciledCandle=null;
      }

      const{token,accountId:configured}=credentials(this.env);
      let accountId;
      try {
        accountId = await exactLiveAccount(token, configured, state, entry => this.write(entry));
        // Reset backoff count on successful resolve
        if (state.accountResolveError) {
          delete state.accountResolveError;
          delete state.backoffUntil;
          await this.ctx.storage.put("state", state);
        }
      } catch (err) {
        const errMessage = err.message || "Failed to resolve live OANDA account";
        const resolveError = state.accountResolveError || { lastErrorAt: null, count: 0, message: "" };
        resolveError.lastErrorAt = new Date().toISOString();
        resolveError.count = Number(resolveError.count || 0) + 1;
        resolveError.message = errMessage;

        // Backoff delay: 2m -> 4m -> 8m -> 15m -> 30m max
        const backoffMinutes = [2, 4, 8, 15, 30];
        const delayMin = backoffMinutes[Math.min(resolveError.count - 1, backoffMinutes.length - 1)];
        const backoffUntil = Date.now() + delayMin * 60 * 1000;

        state.accountResolveError = resolveError;
        state.backoffUntil = backoffUntil;
        await this.ctx.storage.put("state", state);

        throw new Error(`${errMessage}. Scheduled backoff for ${delayMin} minutes.`);
      }

      try{await this.syncTransactions(state,token,accountId);}catch(error){state.transactionSyncError=String(error?.message||error);}

      await this.processPendingReversals(state,token,accountId);

      let optimizer=currentRuntimeOptimizer((await this.ctx.storage.get("optimizer"))||{});
      try{optimizer=(await this.optimizeNext(state,token)).records;}catch(error){state.optimizerLastError=String(error?.message||error);}

      const rotationIndex=Number(state.mtfRotation||0)%TIMEFRAMES.length;
      const rotationTimeframe=TIMEFRAMES[rotationIndex];
      const rotationRows=await this.scan(token,config,rotationTimeframe,optimizer);
      state.mtf=state.mtf||{};
      state.mtf[rotationTimeframe]={
        fingerprint,
        directions:Object.fromEntries(rotationRows.map(row=>[row.pair,row.event.direction])),
        updated:new Date().toISOString(),
      };
      state.mtfRotation=(rotationIndex+1)%TIMEFRAMES.length;

      const probe=await candles("EUR_USD",token,config.timeframe,2);
      const lastCandle=probe.at(-1)?.time;
      if(!lastCandle)return;

      if(lastCandle===state.lastCandle&&state.initialized){
        if(!state.requirements){
          const rows=rotationTimeframe===config.timeframe?rotationRows:await this.scan(token,config,config.timeframe,optimizer);
          state.directions=Object.fromEntries(rows.map(row=>[row.pair,row.event.direction]));
          state.requirements=Object.fromEntries(rows.map(row=>[row.pair,row]));
          state.events=Object.fromEntries(rows.map(row=>[row.pair,row.event.id]));
        }
        if(state.reconciledCandle!==lastCandle){
          const positions=await this.loadPositions(token,accountId);
          await this.reconcile(state.requirements,token,accountId,state,config,positions);
          state.reconciledCandle=lastCandle;
        }
        state.lastRun=new Date().toISOString();
        state.lastError=null;
        return;
      }

      const rows=rotationTimeframe===config.timeframe?rotationRows:await this.scan(token,config,config.timeframe,optimizer);
      state.directions=Object.fromEntries(rows.map(row=>[row.pair,row.event.direction]));
      const requirements=Object.fromEntries(rows.map(row=>[row.pair,row]));
      state.requirements=requirements;
      const mtfNow=this.mtfCandidates(state,rows,lastCandle,fingerprint);
      const positions=await this.loadPositions(token,accountId);

      state.lastScanAt = new Date().toISOString();
      state.openPositionsCount = positions.length;

      // Model Discretion mode keeps the full qualified universe available. Pair selection is performed downstream by Nemotron among engine-qualified new-entry candidates; III itself does not choose the pair.
      if(state.autoRotateMode){state.selectedPairs=PAIRS.slice();state.tradingMode="MODEL_DISCRETION";}

      const tradablePairs = state.selectedPairs?.length ? state.selectedPairs : PAIRS.slice();
      const tradableSet = new Set(tradablePairs);

      if(!state.initialized){
        await this.reconcile(requirements,token,accountId,state,config,positions);
        state.reconciledCandle=lastCandle;
        state.events=Object.fromEntries(rows.map(row=>[row.pair,row.event.id]));
        state.mtfDecisionDirections=Object.fromEntries(mtfNow.map(row=>[row.pair,row.event.direction]));
        state.initialized=true;
        await this.write({type:"INITIALIZED",message:`${rows.length} registered Horizon events baselined; no pre-existing event entry submitted`});
      }else{
        const eventCandidates=rows
          .filter(row=>state.events[row.pair]!==row.event.id&&row.event.startTime===lastCandle)
          .sort((left,right)=>right.event.bars-left.event.bars);
        const priorMtf=state.mtfDecisionDirections||{};
        const mtfCandidates=mtfNow.filter(row=>Number(priorMtf[row.pair]||0)!==row.event.direction);
        const combined=eventCandidates.map(event=>{
          const mtf=mtfNow.find(item=>item.pair===event.pair&&item.event.direction===event.event.direction);
          return mtf?{...event,confidence:mtf.confidence,count:mtf.count}:null;
        }).filter(Boolean).sort((left,right)=>right.confidence-left.confidence);
        const decisionCandidates=config.decisionMode==="EVENT"?eventCandidates:config.decisionMode==="MTF"?mtfCandidates:combined;

        // Filter decisionCandidates to respect selection
        const filteredDecisionCandidates = decisionCandidates.filter(candidate => tradableSet.has(candidate.pair));
        const{reversals,newEntries}=this.classifyCandidates(filteredDecisionCandidates,positions);
        const reversalPairs=new Set(reversals.map(candidate=>candidate.pair));

        await this.reconcile(requirements,token,accountId,state,config,positions,reversalPairs);
        state.reconciledCandle=lastCandle;

        if(reversals.length){
          await this.claimReversals(reversals,state);
          await this.processPendingReversals(state,token,accountId);
        }

        if(newEntries.length){
          const selected=await this.choose(newEntries);
          if(selected)await this.execute(selected,token,accountId,state);
        }

        for(const row of rows)state.events[row.pair]=row.event.id;
        state.mtfDecisionDirections=Object.fromEntries(mtfNow.map(row=>[row.pair,row.event.direction]));
      }

      state.lastCandle=lastCandle;
      state.lastRun=new Date().toISOString();
      state.lastError=null;
    }catch(error){
      state.lastRun=new Date().toISOString();
      state.lastError=String(error?.message||error);
      await this.write({type:"ERROR",executionPolicy:EXECUTION_POLICY_VERSION,message:state.lastError});
    }finally{
      await this.ctx.storage.put("state",state);
      if(await this.ctx.storage.getAlarm()!==null)await this.ctx.storage.deleteAlarm();
      this.running=false;
    }
  }
}
