export * from "./engine-certified-execution-base.js";
import { HtlEngine as CertifiedExecutionBase } from "./engine-certified-execution-base.js";
import { PAIRS, TIMEFRAMES } from "./horizon-platform-engine.js";
import { STRATEGY_ENGINE_VERSION } from "./horizon-strategy-v1.js";
import { REGISTERED_PERFORMANCE_VERSION } from "./horizon-registered-performance.js";
import { credentials } from "./engine-base.js";
import { AGE_EXPECTATION_VERSION, AGE_REALLOCATION_MIN_INDEX, AGE_REALLOCATION_DELTA_INDEX, annotateAgeCandidate, continuationExpectation, reallocationDecision } from "./age-expectation.js";
import { EXECUTION_CLOCK_SOURCE, executionClockCandle } from "./execution-candle-clock.js";
import { RUNTIME_OPTIMIZER_VERSION, loadRuntimeOptimizer } from "./optimized-optimizer.js";
import { ACCOUNT_AUTHORITY_VERSION, accountAuthorityBackoff, clearAccountAuthorityBackoff, oandaAuthorityRequest, resolveExactAccountAuthority } from "./account-authority.js";

const EXECUTION_POLICY_VERSION="CERTIFIED_AGE_REALLOCATION@2.0.0";
const AGE_POLICY_VERSION="AGE_ADMINISTRATING_GREAT_EXPECTATIONS@2.0.0";
const AGE_TIME_ZONE="America/Chicago";
const AGE_FRIDAY_FLATTEN_HOUR=15,AGE_FRIDAY_FLATTEN_MINUTE=57,AGE_SUNDAY_REOPEN_HOUR=16,AGE_SUNDAY_REOPEN_MINUTE=5;

function ageLocalParts(now=new Date()){const parts=new Intl.DateTimeFormat("en-US",{timeZone:AGE_TIME_ZONE,weekday:"short",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).formatToParts(now),get=type=>parts.find(part=>part.type===type)?.value;return{weekday:get("weekday"),year:Number(get("year")),month:Number(get("month")),day:Number(get("day")),hour:Number(get("hour")),minute:Number(get("minute"))};}
function ageMarketWindow(now=new Date()){const local=ageLocalParts(now),minutes=local.hour*60+local.minute,fridayFlatten=local.weekday==="Fri"&&minutes>=AGE_FRIDAY_FLATTEN_HOUR*60+AGE_FRIDAY_FLATTEN_MINUTE,saturday=local.weekday==="Sat",sundayClosed=local.weekday==="Sun"&&minutes<AGE_SUNDAY_REOPEN_HOUR*60+AGE_SUNDAY_REOPEN_MINUTE,weekendLock=fridayFlatten||saturday||sundayClosed,flattenWindow=local.weekday==="Fri"&&minutes>=AGE_FRIDAY_FLATTEN_HOUR*60+AGE_FRIDAY_FLATTEN_MINUTE&&minutes<16*60;return{...local,weekendLock,flattenWindow,marketOpen:!weekendLock,policy:AGE_POLICY_VERSION,timeZone:AGE_TIME_ZONE};}
function configFingerprint(config){return JSON.stringify({timeframe:config.timeframe,strategy:config.strategy,confirmationStrategy:config.confirmationStrategy,htlLength:config.htlLength,filter:config.filter,configurationSource:config.configurationSource,optimizerVersion:RUNTIME_OPTIMIZER_VERSION});}
function positionDirection(position){const longUnits=Number(position?.long?.units||0),shortUnits=Math.abs(Number(position?.short?.units||0));return longUnits>0?1:shortUnits>0?-1:0;}
function ageContextForConfig(context,config){if(!context?.controls||!config)return null;const received=Date.parse(context.receivedAt||0);if(!Number.isFinite(received)||Date.now()-received>10*60*1000)return null;const controls=context.controls,same=(left,right)=>Math.abs(Number(left)-Number(right))<1e-9;if(controls.timeframe!==config.timeframe||controls.strategy!==config.strategy||controls.confirmationStrategy!==config.confirmationStrategy||!same(controls.htlLength,config.htlLength)||!same(controls.filter,config.filter)||controls.decisionMode!==config.decisionMode||controls.configurationSource!==config.configurationSource)return null;return context;}
function compactAgePlan(plan){if(!plan)return null;return{action:plan.action,qualified:Boolean(plan.qualified),selected:plan.selected?{pair:plan.selected.pair,direction:plan.selected.direction,index:plan.selected.index,expectedPipsPerHour:plan.selected.expectedPipsPerHour}:null,displacement:plan.displacement?{pair:plan.displacement.pair,direction:plan.displacement.direction,index:plan.displacement.continuation?.index,expectedPipsPerHour:plan.displacement.continuation?.expectedPipsPerHour}:null,delta:plan.delta,threshold:plan.threshold,minimum:plan.minimum,time:new Date().toISOString()};}

async function callOanda(path,token){return oandaAuthorityRequest(path,token);}

export class HtlEngine extends CertifiedExecutionBase{
  async resolveCertifiedAccount(state){
    const{token,accountId:configured}=credentials(this.env);
    const resolved=await resolveExactAccountAuthority({token,configuredAccountId:configured,state,writeLedger:entry=>this.write(entry,false)});
    clearAccountAuthorityBackoff(state);
    return resolved;
  }

  async enforceAgeWeekendPolicy(state,config,window){
    state.agePolicy=AGE_POLICY_VERSION;state.ageTimeZone=AGE_TIME_ZONE;state.ageWeekendLock=true;state.lastNoOrderReason=`AGE weekend flat · Friday 3:57 PM Nashville policy · ${AGE_TIME_ZONE}`;
    let closed=0,attempted=0;
    if(window.flattenWindow){
      const{token,accountId}=await this.resolveCertifiedAccount(state),positions=await this.loadPositions(token,accountId),context=this.decisionContext(null,config);
      for(const position of positions){const existing=positionDirection(position);if(!existing)continue;attempted++;const longUnits=Number(position.long?.units||0),shortUnits=Math.abs(Number(position.short?.units||0)),fill=await this.closePosition(position.instrument,existing,longUnits,shortUnits,token,accountId,null,"AGE Friday weekend flatten · 3:57 PM Nashville",{...context,agePolicy:AGE_POLICY_VERSION,capitalDisposition:"WEEKEND_FLAT"});if(fill)closed++;}
      state.ageWeekendFlattenAt=new Date().toISOString();state.ageWeekendFlattenAttempted=attempted;state.ageWeekendFlattenClosed=closed;
      await this.write({type:"AGE_WEEKEND_FLATTEN",agePolicy:AGE_POLICY_VERSION,timeZone:AGE_TIME_ZONE,scheduledLocalTime:"Friday 15:57",attempted,closed,message:`AGE weekend flatten processed ${closed}/${attempted} open positions`},false);
    }
    state.lastRun=new Date().toISOString();state.lastError=null;await this.ctx.storage.put("state",state);return{closed,attempted,window};
  }

  async status(){
    const status=await super.status(),state=(await this.ctx.storage.get("state"))||{};let configuredSuffix=null,configuredMatchesResolved=null;
    try{const configured=credentials(this.env).accountId;configuredSuffix=String(configured).split("-").at(-1)||null;configuredMatchesResolved=Boolean(configured&&state.resolvedAccountId===configured);}catch{}
    const authority=state.accountAuthority||null;
    return{...status,accountAuthorityVersion:ACCOUNT_AUTHORITY_VERSION,accountAuthority:{verified:Boolean(authority&&configuredMatchesResolved),source:authority?.source||null,configuredSuffix,resolvedSuffix:String(state.resolvedAccountId||"").split("-").at(-1)||null,configuredMatchesResolved,verifiedAt:authority?.verifiedAt||null,expiresAt:authority?.expiresAt||null,lastResolveError:state.accountResolveError||null,lastTransportError:state.accountTransportError||null}};
  }

  async tick(){
    if(this.running)return;
    this.running=true;
    let state=(await this.ctx.storage.get("state"))||{events:{},initialized:false};

    if(!state.selectedPairs||state.selectedPairs.length===0){state.selectedPairs=PAIRS.slice();state.tradingMode="ALL_PAIRS";state.manualPositions={};await this.ctx.storage.put("state",state);}

    const nowMs=Date.now();
    if(state.backoffUntil&&nowMs<state.backoffUntil){
      this.running=false;const backoffTimeStr=new Date(state.backoffUntil).toISOString();
      if(!state.lastBackoffLogged||state.lastBackoffLogged!==state.backoffUntil){state.lastBackoffLogged=state.backoffUntil;await this.ctx.storage.put("state",state);await this.write({type:"INFO",executionPolicy:EXECUTION_POLICY_VERSION,message:`Skipping tick - in backoff until ${backoffTimeStr}`},false);}return;
    }

    if(state.strategyEngineVersion!==STRATEGY_ENGINE_VERSION){Object.assign(state,{events:{},directions:null,requirements:null,lastCandle:null,mtf:{},mtfDecisionDirections:{},mtfRotation:0,initialized:false,reconciledCandle:null,strategyEngineVersion:STRATEGY_ENGINE_VERSION,performanceVersion:REGISTERED_PERFORMANCE_VERSION});await this.ctx.storage.put("state",state);await this.write({type:"ANALYTICAL_ENGINE_MIGRATION",strategyEngineVersion:STRATEGY_ENGINE_VERSION,performanceVersion:REGISTERED_PERFORMANCE_VERSION,message:"Engine state reset for strategy version change (certified execution exact-account wrapper)"},false);}

    try{
      const config=await this.config(),marketWindow=ageMarketWindow(new Date());
      if(marketWindow.weekendLock){await this.enforceAgeWeekendPolicy(state,config,marketWindow);return;}
      if(state.ageWeekendLock){state.ageWeekendLock=false;state.ageReengagedAt=new Date().toISOString();state.lastNoOrderReason=null;await this.ctx.storage.put("state",state);await this.write({type:"AGE_MARKET_REENGAGEMENT",agePolicy:AGE_POLICY_VERSION,timeZone:AGE_TIME_ZONE,message:"AGE weekend lock released; resume qualified market participation"},false);}
      if(state.ageExpectationVersion!==AGE_EXPECTATION_VERSION){state.ageExpectationVersion=AGE_EXPECTATION_VERSION;state.pendingReversals={};state.ageLastPlan=null;await this.ctx.storage.put("state",state);await this.write({type:"AGE_EXPECTATION_MIGRATION",agePolicy:AGE_POLICY_VERSION,expectationVersion:AGE_EXPECTATION_VERSION,message:"AGE Great Expectation v2 activated; legacy blanket reversal claims cleared so reversals compete with alternatives"},false);}
      const fingerprint=configFingerprint(config);state.config=config;
      if(state.mtfFingerprint!==fingerprint){state.mtf={};state.mtfRotation=0;state.mtfFingerprint=fingerprint;state.requirements=null;state.directions=null;state.events={};state.lastCandle=null;state.initialized=false;state.reconciledCandle=null;}

      const{token,accountId:configured}=credentials(this.env);
      let accountId;
      try{({accountId}=await resolveExactAccountAuthority({token,configuredAccountId:configured,state,writeLedger:entry=>this.write(entry,false)}));clearAccountAuthorityBackoff(state);await this.ctx.storage.put("state",state);}
      catch(err){const backoff=accountAuthorityBackoff(err,state);await this.ctx.storage.put("state",state);throw Object.assign(new Error(`${String(err?.message||err)}. Scheduled backoff for ${backoff.label}.`),{code:err?.code,stage:err?.stage,path:err?.path,status:err?.status});}

      try{await this.syncTransactions(state,token,accountId);}catch(error){state.transactionSyncError=String(error?.message||error);}
      await this.processPendingReversals(state,token,accountId);

      const lastCandle=await executionClockCandle(path=>callOanda(path,token),accountId,config.timeframe);state.executionClockSource=EXECUTION_CLOCK_SOURCE;state.executionClockCandle=lastCandle;state.executionClockProbeAt=new Date().toISOString();
      const optimizer=await loadRuntimeOptimizer(this.ctx.storage),rotationIndex=Number(state.mtfRotation||0)%TIMEFRAMES.length,rotationTimeframe=TIMEFRAMES[rotationIndex],rotationRows=await this.scan(token,config,rotationTimeframe,optimizer);state.mtf=state.mtf||{};state.mtf[rotationTimeframe]={fingerprint,directions:Object.fromEntries(rotationRows.map(row=>[row.pair,row.event.direction])),updated:new Date().toISOString()};state.mtfRotation=(rotationIndex+1)%TIMEFRAMES.length;

      if(lastCandle===state.lastCandle&&state.initialized){
        if(!state.requirements){const rows=rotationTimeframe===config.timeframe?rotationRows:await this.scan(token,config,config.timeframe,optimizer);state.directions=Object.fromEntries(rows.map(row=>[row.pair,row.event.direction]));state.requirements=Object.fromEntries(rows.map(row=>[row.pair,row]));state.events=Object.fromEntries(rows.map(row=>[row.pair,row.event.id]));}
        if(state.reconciledCandle!==lastCandle){const positions=await this.loadPositions(token,accountId);await this.reconcile(state.requirements,token,accountId,state,config,positions);state.reconciledCandle=lastCandle;}
        state.lastRun=new Date().toISOString();state.lastError=null;return;
      }

      const rows=rotationTimeframe===config.timeframe?rotationRows:await this.scan(token,config,config.timeframe,optimizer);state.directions=Object.fromEntries(rows.map(row=>[row.pair,row.event.direction]));const requirements=Object.fromEntries(rows.map(row=>[row.pair,row]));state.requirements=requirements;const mtfNow=this.mtfCandidates(state,rows,lastCandle,fingerprint),positions=await this.loadPositions(token,accountId);state.lastScanAt=new Date().toISOString();state.openPositionsCount=positions.length;
      if(state.autoRotateMode){state.selectedPairs=PAIRS.slice();state.tradingMode="MODEL_DISCRETION";}
      const tradablePairs=state.selectedPairs?.length?state.selectedPairs:PAIRS.slice(),tradableSet=new Set(tradablePairs);

      if(!state.initialized){await this.reconcile(requirements,token,accountId,state,config,positions);state.reconciledCandle=lastCandle;state.events=Object.fromEntries(rows.map(row=>[row.pair,row.event.id]));state.mtfDecisionDirections=Object.fromEntries(mtfNow.map(row=>[row.pair,row.event.direction]));state.initialized=true;await this.write({type:"INITIALIZED",message:`${rows.length} registered Horizon events baselined; no pre-existing event entry submitted`});}
      else{
        const eventCandidates=rows.filter(row=>state.events[row.pair]!==row.event.id&&row.event.startTime===lastCandle).sort((left,right)=>right.event.bars-left.event.bars),mtfCandidates=mtfNow,combined=eventCandidates.map(event=>{const mtf=mtfNow.find(item=>item.pair===event.pair&&item.event.direction===event.event.direction);return mtf?{...event,confidence:mtf.confidence,count:mtf.count}:null;}).filter(Boolean).sort((left,right)=>right.confidence-left.confidence),decisionCandidates=config.decisionMode==="EVENT"?eventCandidates:config.decisionMode==="MTF"?mtfCandidates:combined,filteredDecisionCandidates=decisionCandidates.filter(candidate=>tradableSet.has(candidate.pair)),{reversals,newEntries}=this.classifyCandidates(filteredDecisionCandidates,positions),ageContext=ageContextForConfig(state.modelContext,config),deploymentCandidates=[...reversals.map(candidate=>annotateAgeCandidate(candidate,ageContext,"REVERSAL")),...newEntries.map(candidate=>annotateAgeCandidate(candidate,ageContext,"NEW_ENTRY"))];
        state.candidateAssessment={time:new Date().toISOString(),completedCandle:lastCandle,decisionMode:config.decisionMode,eventCandidates:eventCandidates.length,mtfCandidates:mtfCandidates.length,combinedCandidates:combined.length,decisionCandidates:decisionCandidates.length,selectedCandidates:filteredDecisionCandidates.length,reversals:reversals.length,newEntries:newEntries.length,deploymentCandidates:deploymentCandidates.length,selectedPairs:tradablePairs.length};
        await this.reconcile(requirements,token,accountId,state,config,positions);state.reconciledCandle=lastCandle;
        if(deploymentCandidates.length){const selected=await this.choose(deploymentCandidates);if(selected){const plan=reallocationDecision({positions,requirements,selectedCandidate:selected,context:ageContext,manualPositions:state.manualPositions||{}});state.ageLastPlan=compactAgePlan(plan);await this.write({type:"AGE_EXPECTATION_DECISION",agePolicy:AGE_POLICY_VERSION,expectationVersion:AGE_EXPECTATION_VERSION,pair:selected.pair,direction:selected.event.direction>0?"BUY":"SELL",action:plan.action,greatExpectationIndex:plan.selected?.index??null,expectedPipsPerHour:plan.selected?.expectedPipsPerHour??null,displacedPair:plan.displacement?.pair||null,continuationIndex:plan.displacement?.continuation?.index??null,delta:plan.delta??null,threshold:plan.threshold,minimum:plan.minimum,message:`AGE ${plan.action} · selected ${selected.pair} · GE ${Number(plan.selected?.index||0).toFixed(1)}`},false);if(selected.AGE?.candidateType==="REVERSAL"){await this.claimReversals([selected],state);await this.processPendingReversals(state,token,accountId);}else if(plan.action==="REALLOCATE"&&plan.displacement?.position){const position=plan.displacement.position,existing=positionDirection(position),longUnits=Number(position.long?.units||0),shortUnits=Math.abs(Number(position.short?.units||0)),fill=await this.closePosition(position.instrument,existing,longUnits,shortUnits,token,accountId,selected.event.id,`AGE reallocation · GE delta ${Number(plan.delta||0).toFixed(1)}`,{...this.decisionContext(selected,config),agePolicy:AGE_POLICY_VERSION,expectationVersion:AGE_EXPECTATION_VERSION,capitalDisposition:"REALLOCATE",replacementPair:selected.pair,greatExpectationIndex:plan.selected?.index??null,continuationIndex:plan.displacement?.continuation?.index??null});if(fill)await this.execute(selected,token,accountId,state);else state.lastNoOrderReason=`AGE displacement close failed for ${position.instrument}; replacement ${selected.pair} withheld`;}else await this.execute(selected,token,accountId,state);}}
        else{const monitored=(positions||[]).map(position=>{const direction=positionDirection(position);if(!direction)return null;const continuation=continuationExpectation({pair:position.instrument,direction},requirements[position.instrument],ageContext);return{pair:position.instrument,direction,index:continuation.index,expectedPipsPerHour:continuation.expectedPipsPerHour,disposition:continuation.disposition};}).filter(Boolean);state.ageLastPlan={action:"MONITOR_CONTINUATIONS",qualified:false,selected:null,displacement:null,delta:null,threshold:AGE_REALLOCATION_DELTA_INDEX,minimum:AGE_REALLOCATION_MIN_INDEX,positions:monitored,time:new Date().toISOString()};state.lastNoOrderReason=`No new qualified ${config.decisionMode} deployment candidate on completed ${config.timeframe} candle ${lastCandle} · events ${eventCandidates.length} · MTF ${mtfCandidates.length} · combined ${combined.length} · selected ${filteredDecisionCandidates.length}`;}
        for(const row of rows)state.events[row.pair]=row.event.id;state.mtfDecisionDirections=Object.fromEntries(mtfNow.map(row=>[row.pair,row.event.direction]));
      }

      state.lastCandle=lastCandle;state.lastRun=new Date().toISOString();state.lastError=null;
    }catch(error){state.lastRun=new Date().toISOString();state.lastError=String(error?.message||error);await this.write({type:"ERROR",executionPolicy:EXECUTION_POLICY_VERSION,errorCode:error?.code||null,errorStage:error?.stage||null,errorPath:error?.path||null,errorStatus:error?.status||null,message:state.lastError});}
    finally{await this.ctx.storage.put("state",state);if(await this.ctx.storage.getAlarm()!==null)await this.ctx.storage.deleteAlarm();this.running=false;}
  }
}
