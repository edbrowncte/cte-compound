import fs from "node:fs";

function replaceOnce(source,from,to,label){
  if(!source.includes(from))throw new Error(`Missing migration anchor: ${label}`);
  return source.replace(from,to);
}
function replaceRegex(source,pattern,to,label){
  if(!pattern.test(source))throw new Error(`Missing migration regex anchor: ${label}`);
  pattern.lastIndex=0;
  return source.replace(pattern,to);
}

// Browser: make the Capitalization Model inherit the active automated-trading perspective.
{
  const path="public/index.html";
  let source=fs.readFileSync(path,"utf8");
  source=replaceOnce(source,
'    .model-composition-body #fourSlotRotator { margin-bottom:0 !important; }',
'    .model-composition-body #fourSlotRotator { margin-bottom:0 !important; }\n    .model-perspective { display:grid; grid-template-columns:repeat(4,minmax(150px,1fr)); gap:7px; }\n    .model-perspective .metric { min-height:58px; }\n    .candidate-card.active-lane { border-color:var(--accent2); box-shadow:0 0 0 1px rgba(125,196,255,.28) inset; }\n    @media(max-width:900px){.model-perspective{grid-template-columns:repeat(2,minmax(140px,1fr));}}\n    @media(max-width:560px){.model-perspective{grid-template-columns:1fr;}}',
'model perspective styles');

  source=replaceOnce(source,
'model.innerHTML=\'<div class="model-composition-head"><div><h2>CTE Capitalization Model</h2><p>One decision composition: A/B/C forecasts · trend-following/transition leaders · Nemotron orchestration · CTE Market Mentor. III determines qualified structure; the Model exercises pair discretion only inside the engine-qualified candidate set.</p><div id="modelContextStatus" style="margin-top:5px;color:var(--muted);font-size:8px">Model context awaiting synchronized reports.</div></div><div class="model-mandate">Capitalization and Account Value Proliferation</div></div><div class="model-composition-body" id="modelCompositionBody"></div>\';',
'model.innerHTML=\'<div class="model-composition-head"><div><h2>CTE Capitalization Model</h2><p>One automated-trading perspective: active controls → Event / MTF / Combined qualification → position-aware Capitalization Model → Nemotron pair discretion. The Model monitors the positions actually occupying account capital under the same saved trading controls.</p><div id="modelContextStatus" style="margin-top:5px;color:var(--muted);font-size:8px">Model perspective awaiting active trading controls.</div></div><div class="model-mandate">Capitalization and Account Value Proliferation</div></div><div class="model-composition-body" id="modelCompositionBody"><div class="model-perspective" id="modelPerspective"><div class="metric"><span>Active trading controls</span><strong id="modelControlPerspective">—</strong></div><div class="metric"><span>Decision / execution lane</span><strong id="modelDecisionPerspective">—</strong></div><div class="metric"><span>Positions monitored</span><strong id="modelPositionPerspective">—</strong></div><div class="metric"><span>Pair universe</span><strong id="modelUniversePerspective">—</strong></div></div></div>\';',
'model composition perspective');

  source=replaceOnce(source,
'    modelContextTimer:null,',
'    modelContextTimer:null,\n    modelPositionSignature:"",',
'model position signature state');

  source=replaceRegex(source,
/  function applyEngineConfig\(config\)\{.*?\n\n  function preferenceDateValue/s,
`  function applyEngineConfig(config){
    const ids=new Set(STRATEGIES.map(item=>item.id));
    state.engineConfig={timeframe:TIMEFRAMES.includes(config?.timeframe)?config.timeframe:"M15",htlLength:clamp(Math.trunc(Number(config?.htlLength))||10,3,200),decisionMode:["EVENT","MTF","COMBINED"].includes(config?.decisionMode)?config.decisionMode:"EVENT",strategy:ids.has(config?.strategy)?config.strategy:"ASSET",confirmationStrategy:config?.confirmationStrategy==="NONE"||ids.has(config?.confirmationStrategy)?config.confirmationStrategy:"NONE",filter:clamp(Number(config?.filter)||0,0,10),configurationSource:"OPTIMIZED"};
    el("engineTimeframe").value=state.engineConfig.timeframe;el("engineStrategy").value=state.engineConfig.strategy;el("engineConfirmationStrategy").value=state.engineConfig.confirmationStrategy;el("engineHtlLength").value=state.engineConfig.htlLength;el("engineFilter").value=state.engineConfig.filter;el("engineDecisionMode").value=state.engineConfig.decisionMode;el("engineConfigurationSource").value=state.engineConfig.configurationSource;
    const name=STRATEGIES.find(item=>item.id===state.engineConfig.strategy)?.label||state.engineConfig.strategy,confirmation=state.engineConfig.confirmationStrategy==="NONE"?"NONE":(STRATEGIES.find(item=>item.id===state.engineConfig.confirmationStrategy)?.label||state.engineConfig.confirmationStrategy);
    el("automationStatus").textContent=\`Active · \${state.engineConfig.timeframe} · \${name} · confirmation \${confirmation} · length \${state.engineConfig.htlLength} · filter \${state.engineConfig.filter} · \${state.engineConfig.decisionMode} · \${state.engineConfig.configurationSource}\`;
    const tableTf=el("evalTableTfFilter");if(tableTf)tableTf.value=state.engineConfig.timeframe;
    state.mtfEventCache.clear();renderMtfForecast();updateDecisionDisplays();renderModelOperatingPerspective();
    if(state.connected){void preloadEvaluationTimeframe(state.engineConfig.timeframe);void loadEvaluationData();queueModelContextPublish();}
  }

  function preferenceDateValue`,
'active engine config synchronization');

  source=replaceRegex(source,
/  function mtfEventRow\(pair,timeframe\)\{.*?\n\n  function updateDecisionDisplays\(\)\{/s,
`  function engineDecisionLabel(mode=state.engineConfig.decisionMode){return mode==="MTF"?"MTF Forecast":mode==="COMBINED"?"Combined Forecast":"Event Forecast";}
  function engineControlPerspective(){const config=state.engineConfig||{},strategy=STRATEGIES.find(item=>item.id===config.strategy)?.label||config.strategy,confirmation=config.confirmationStrategy==="NONE"?"NONE":(STRATEGIES.find(item=>item.id===config.confirmationStrategy)?.label||config.confirmationStrategy),selectedPairs=(state.selectedPairs?.length?state.selectedPairs:INSTRUMENTS).filter(pair=>INSTRUMENTS.includes(pair));return{timeframe:config.timeframe,strategy:config.strategy,strategyLabel:strategy,confirmationStrategy:config.confirmationStrategy,confirmationLabel:confirmation,htlLength:config.htlLength,filter:config.filter,decisionMode:config.decisionMode,decisionLabel:engineDecisionLabel(config.decisionMode),configurationSource:config.configurationSource,minimumUnits:minimumUnitAmount(),selectedPairs};}
  function engineScheduleAnalysis(pair,timeframe){const latest=state.scheduleEvaluations.get(scheduleKey(pair,timeframe))?.latest||{},primary=latest[state.engineConfig.strategy];if(!primary?.direction)return null;const confirmationId=state.engineConfig.confirmationStrategy,confirmation=confirmationId!=="NONE"?latest[confirmationId]:null;if(confirmationId!=="NONE"&&(!confirmation?.direction||confirmation.direction!==primary.direction))return null;const primaryConfidence=clamp(Number(primary.confidence)||0,0,1),confirmationConfidence=confirmation?clamp(Number(confirmation.confidence)||0,0,1):primaryConfidence;return{...primary,direction:primary.direction,confidence:Math.min(primaryConfidence,confirmationConfidence),primaryConfidence,confirmationConfidence:confirmation?confirmationConfidence:null};}
  function mtfEventRow(pair,timeframe){const candles=state.scheduleCandles.get(scheduleKey(pair,timeframe));if(!candles?.length)return null;const cacheKey=\`\${pair}|\${timeframe}|\${state.engineConfig.htlLength}|\${candles.at(-1).time}\`;if(!state.mtfEventCache.has(cacheKey))state.mtfEventCache.set(cacheKey,buildEventRow(pair,candles,state.engineConfig.htlLength));return state.mtfEventCache.get(cacheKey);}
  function mtfPairDecision(pair){let score=0,weight=0,matches=0,available=0;for(const timeframe of TIMEFRAMES){const eventRow=mtfEventRow(pair,timeframe),analysis=engineScheduleAnalysis(pair,timeframe);if(!eventRow||!analysis?.direction||eventRow.currentEvent==="—")continue;const eventDirection=eventRow.currentEvent==="BUY"?1:-1,confidence=clamp(Number(analysis.confidence)||0,0,1),agreement=eventDirection===analysis.direction;score+=(agreement?eventDirection:analysis.direction*.25)*(0.5+confidence);weight+=0.5+confidence;matches+=agreement?1:0;available++;}return{pair,direction:score>0?1:score<0?-1:0,confidence:weight?Math.abs(score)/weight:0,matches,available};}
  function engineMtfForecasts(){return INSTRUMENTS.map(pair=>mtfPairDecision(pair)).filter(item=>item.direction&&item.available>=2).map(item=>({pair:item.pair,direction:item.direction>0?"BUY":"SELL",confidence:item.confidence,matches:item.matches,available:item.available}));}
  function modelPairReports(){return (state.evaluationTableData||[]).filter(row=>INSTRUMENTS.includes(row.pair)&&row.signal).map(c=>({pair:c.pair,direction:c.signal>0?"BUY":"SELL",type:c.type,regime:c.regime,strength:modelContextNumber(c.strength),mas:modelContextNumber(c.mas),im:modelContextNumber(c.im),ratio:c.ratio===Infinity?20:modelContextNumber(c.ratio),masRoc:modelContextNumber(c.masRoc),imRoc:modelContextNumber(c.imRoc),ratioRoc:modelContextNumber(c.ratioRoc),eventAngleZ:modelContextNumber(c.eventAngleZ),convexity:modelContextNumber(c.convexity),r2:modelContextNumber(c.r2),pipsPerHour:modelContextNumber(c.pipsPerHour),transitionProbability:modelContextNumber(c.transitionProbability)}));}
  function renderModelOperatingPerspective(){const controls=engineControlPerspective(),lane={EVENT:"A",MTF:"B",COMBINED:"C"}[controls.decisionMode]||"A",positions=(state.openPositions||[]).map(position=>{const long=Number(position.long?.units||0),short=Math.abs(Number(position.short?.units||0)),side=long>0?"BUY":short>0?"SELL":"",units=Math.max(long,short);return side?\`\${formatPair(position.instrument)} \${side} \${units.toLocaleString()}\`:null;}).filter(Boolean);if(el("modelControlPerspective"))el("modelControlPerspective").textContent=\`\${controls.timeframe} · \${controls.strategyLabel} · L\${controls.htlLength} · F\${controls.filter}\${controls.confirmationStrategy!=="NONE"?\` · +\${controls.confirmationLabel}\`:""}\`;if(el("modelDecisionPerspective"))el("modelDecisionPerspective").textContent=\`\${lane} · \${controls.decisionLabel}\`;if(el("modelPositionPerspective"))el("modelPositionPerspective").textContent=positions.length?positions.join(" · "):"No open positions";if(el("modelUniversePerspective"))el("modelUniversePerspective").textContent=\`\${controls.selectedPairs.length} qualified pair\${controls.selectedPairs.length===1?"":"s"} · min \${controls.minimumUnits.toLocaleString()} units\`;}
  function renderMtfForecast(){const pair=state.selectedInstrument,controls=engineControlPerspective();el("mtfScope").textContent=\`\${formatPair(pair)} · \${controls.timeframe} execution perspective · \${controls.strategyLabel}\${controls.confirmationStrategy!=="NONE"?\` + \${controls.confirmationLabel}\`:""} · HTL \${controls.htlLength} · filter \${controls.filter} · \${controls.decisionLabel}\`;const rows=TIMEFRAMES.map(timeframe=>{const eventRow=mtfEventRow(pair,timeframe),analysis=engineScheduleAnalysis(pair,timeframe),eventDirection=eventRow?.currentEvent==="BUY"?1:eventRow?.currentEvent==="SELL"?-1:0,analyticalDirection=analysis?.direction||0,agreement=eventDirection&&analyticalDirection&&eventDirection===analyticalDirection,confidence=agreement?clamp(Number(analysis.confidence)||0,0,1):0;return \`<tr><td>\${timeframe}</td><td class="\${directionClass(eventDirection)}">\${signalWord(eventDirection)}</td><td class="\${directionClass(analyticalDirection)}">\${signalWord(analyticalDirection)}</td><td>\${agreement?"MATCH":"—"}</td><td>\${agreement?formatPct(confidence):"—"}</td><td><div class="mtf-step"><i class="\${directionClass(agreement?eventDirection:0)}" style="width:\${agreement?Math.max(8,confidence*100):4}%"></i></div></td></tr>\`;});el("mtfBody").innerHTML=rows.join("");updateDecisionDisplays();renderModelOperatingPerspective();}

  function updateDecisionDisplays(){`,
'mtf and model shared perspective');

  source=replaceOnce(source,
'      const output=state.scheduleEvaluations.get(scheduleKey(pair,timeframe))?.latest?.[strategy];',
'      const output=engineScheduleAnalysis(pair,timeframe);',
'event candidate active strategy qualification');
  source=replaceOnce(source,
'    mtfCandidates=INSTRUMENTS.map(pair=>unavailable.has(pair)?null:mtfPairDecision(pair,strategy)).filter(item=>item?.direction&&item.available>=2).sort((left,right)=>right.confidence-left.confidence||right.matches-left.matches),',
'    mtfCandidates=INSTRUMENTS.map(pair=>unavailable.has(pair)?null:mtfPairDecision(pair)).filter(item=>item?.direction&&item.available>=2).sort((left,right)=>right.confidence-left.confidence||right.matches-left.matches),',
'mtf candidate active config');
  source=replaceOnce(source,
'    renderDecisionCandidates();',
'    renderDecisionCandidates();renderModelOperatingPerspective();queueModelContextPublish();',
'candidate/model publish synchronization');

  source=replaceRegex(source,
/  function renderDecisionCandidates\(\)\{.*?\n  function selectDecisionCandidate/s,
`  function renderDecisionCandidates(){const activeLane={EVENT:"A",MTF:"B",COMBINED:"C"}[state.engineConfig.decisionMode]||"A";for(const key of ["A","B","C"]){const candidate=state.decisionCandidates[key],button=el(\`candidate\${key}\`),selected=state.selectedDecisionCandidate===key;button.disabled=!candidate||state.candidateBusy;button.classList.toggle("selected",selected);button.classList.toggle("active-lane",activeLane===key);button.setAttribute("aria-pressed",String(selected));button.querySelector("small").textContent=candidate?(activeLane===key?"Active execution lane":"Selectable alternative"):"No eligible alternative";}const selected=state.decisionCandidates[state.selectedDecisionCandidate],amount=candidateUnitAmount();el("selectedDecisionCandidate").textContent=selected?\`\${state.selectedDecisionCandidate} · \${formatPair(selected.pair)} · \${signalWord(selected.direction)} · \${formatPct(selected.confidence)}\`:"—";el("executeDecisionCandidate").textContent=selected?\`Execute \${signalWord(selected.direction)}\`:"Execute selected trade";el("executeDecisionCandidate").disabled=!state.connected||state.candidateBusy||!selected||!Number.isFinite(amount)||amount<minimumUnitAmount();}
  function selectDecisionCandidate`,
'active decision lane rendering');

  source=replaceRegex(source,
/  function modelContextNumber\(value\)\{.*?\n\n  function evaluationRotatorSlots/s,
`  function modelContextNumber(value){const number=Number(value);return Number.isFinite(number)?number:null;}
  function queueModelContextPublish(){
    if(!state.connected)return;clearTimeout(state.modelContextTimer);state.modelContextTimer=setTimeout(async()=>{
      const controls=engineControlPerspective();
      const slots=evaluationRotatorSlots().map(slot=>{const c=slot.candidate;if(!c)return null;return{title:slot.title,pair:c.pair,direction:c.signal>0?"BUY":"SELL",type:c.type,regime:c.regime,strength:modelContextNumber(c.strength),mas:modelContextNumber(c.mas),im:modelContextNumber(c.im),ratio:c.ratio===Infinity?20:modelContextNumber(c.ratio),masRoc:modelContextNumber(c.masRoc),imRoc:modelContextNumber(c.imRoc),ratioRoc:modelContextNumber(c.ratioRoc),eventAngleZ:modelContextNumber(c.eventAngleZ),convexity:modelContextNumber(c.convexity),r2:modelContextNumber(c.r2),pipsPerHour:modelContextNumber(c.pipsPerHour),transitionProbability:modelContextNumber(c.transitionProbability)};}).filter(Boolean);
      const forecasts=Object.entries(state.decisionCandidates||{}).map(([key,c])=>c?{key,pair:c.pair,direction:c.direction>0?"BUY":"SELL",confidence:modelContextNumber(c.confidence),source:c.source||null}:null).filter(Boolean),pairReports=modelPairReports(),mtfForecasts=engineMtfForecasts();
      const readMoney=id=>{const value=Number(String(el(id)?.textContent||"").replaceAll(",",""));return Number.isFinite(value)?value:null;};
      const openPositions=(state.openPositions||[]).map(position=>{const long=Number(position.long?.units||0),short=Math.abs(Number(position.short?.units||0)),direction=long>0?"BUY":short>0?"SELL":null;return direction?{pair:position.instrument,direction,units:Math.max(long,short),unrealizedPL:modelContextNumber(position.unrealizedPL??(long>0?position.long?.unrealizedPL:position.short?.unrealizedPL))}:null;}).filter(Boolean);
      const body={type:"MODEL_CONTEXT",mandate:"CAPITALIZATION_AND_ACCOUNT_VALUE_PROLIFERATION",timeframe:controls.timeframe,controls:{timeframe:controls.timeframe,strategy:controls.strategy,confirmationStrategy:controls.confirmationStrategy,htlLength:controls.htlLength,filter:controls.filter,decisionMode:controls.decisionMode,configurationSource:controls.configurationSource,minimumUnits:controls.minimumUnits},selectedPairs:controls.selectedPairs,account:{balance:readMoney("factBalance"),nav:readMoney("factNav"),marginAvailable:readMoney("factMargin")},slots,pairReports,forecasts,mtfForecasts,openPositions};
      try{const response=await fetch("/api/evaluation/log",{method:"POST",headers:{"Content-Type":"application/json"},credentials:"same-origin",body:JSON.stringify(body)});if(!response.ok)throw new Error("HTTP "+response.status);const node=el("modelContextStatus");if(node)node.textContent=\`Model synchronized · \${controls.timeframe} · \${controls.decisionLabel} · \${new Date().toLocaleTimeString()}\`;}catch(error){const node=el("modelContextStatus");if(node)node.textContent="Model context pending · "+(error.message||error);}
    },300);
  }

  function evaluationRotatorSlots`,
'model context active controls');

  fs.writeFileSync(path,source);
}

// Certified execution boundary: preserve the exact saved trading controls in model context.
{
  const path="src/engine-certified-execution.js";
  let source=fs.readFileSync(path,"utf8");
  source=replaceRegex(source,
/function sanitizeModelContext\(value\)\{.*?\n\}\n\nfunction compactCandidate/s,
`function sanitizeModelContext(value){
  const body=value&&typeof value==="object"?value:{},direction=value=>value==="BUY"||value==="SELL"?value:null,pair=value=>PAIRS.includes(String(value||""))?String(value):null;
  const compactReport=item=>{const validPair=pair(item?.pair);if(!validPair)return null;return{pair:validPair,direction:direction(item.direction),type:String(item?.type||"").slice(0,32),regime:String(item?.regime||"").slice(0,48),strength:modelNumber(item?.strength,0,1),mas:modelNumber(item?.mas,0,1),im:modelNumber(item?.im,0,1),ratio:modelNumber(item?.ratio,0,20),masRoc:modelNumber(item?.masRoc,-10,10),imRoc:modelNumber(item?.imRoc,-10,10),ratioRoc:modelNumber(item?.ratioRoc,-20,20),eventAngleZ:modelNumber(item?.eventAngleZ,-20,20),convexity:modelNumber(item?.convexity,-40,40),r2:modelNumber(item?.r2,0,1),pipsPerHour:modelNumber(item?.pipsPerHour,-10000,10000),transitionProbability:modelNumber(item?.transitionProbability,0,1)};};
  const compactForecast=item=>{const validPair=pair(item?.pair);if(!validPair)return null;return{key:["A","B","C"].includes(item?.key)?item.key:null,pair:validPair,direction:direction(item.direction),confidence:modelNumber(item?.confidence,0,1),source:String(item?.source||"").slice(0,24)};};
  const compactMtf=item=>{const validPair=pair(item?.pair);if(!validPair)return null;return{pair:validPair,direction:direction(item.direction),confidence:modelNumber(item?.confidence,0,1),matches:modelNumber(item?.matches,0,10),available:modelNumber(item?.available,0,10)};};
  const compactPosition=item=>{const validPair=pair(item?.pair);if(!validPair)return null;return{pair:validPair,direction:direction(item.direction),units:modelNumber(item?.units,0,1e9),unrealizedPL:modelNumber(item?.unrealizedPL,-1e9,1e9)};};
  const strategyIds=new Set(["ASSET","DARE","DAREN","NAI","COMBO","APEX"]),controlsBody=body.controls&&typeof body.controls==="object"?body.controls:{},controls={timeframe:TIMEFRAMES.includes(controlsBody.timeframe)?controlsBody.timeframe:null,strategy:strategyIds.has(controlsBody.strategy)?controlsBody.strategy:null,confirmationStrategy:controlsBody.confirmationStrategy==="NONE"||strategyIds.has(controlsBody.confirmationStrategy)?controlsBody.confirmationStrategy:null,htlLength:modelNumber(controlsBody.htlLength,3,200),filter:modelNumber(controlsBody.filter,0,10),decisionMode:["EVENT","MTF","COMBINED"].includes(controlsBody.decisionMode)?controlsBody.decisionMode:null,configurationSource:controlsBody.configurationSource==="OPTIMIZED"?"OPTIMIZED":null,minimumUnits:modelNumber(controlsBody.minimumUnits,1,1e9)};
  return{mandate:"CAPITALIZATION_AND_ACCOUNT_VALUE_PROLIFERATION",timeframe:controls.timeframe||(TIMEFRAMES.includes(body.timeframe)?body.timeframe:null),controls,selectedPairs:(Array.isArray(body.selectedPairs)?body.selectedPairs:[]).map(pair).filter(Boolean).slice(0,PAIRS.length),account:{balance:modelNumber(body.account?.balance,0,1e12),nav:modelNumber(body.account?.nav,0,1e12),marginAvailable:modelNumber(body.account?.marginAvailable,0,1e12)},slots:(Array.isArray(body.slots)?body.slots:[]).slice(0,4).map(compactReport).filter(Boolean),pairReports:(Array.isArray(body.pairReports)?body.pairReports:[]).slice(0,PAIRS.length).map(compactReport).filter(Boolean),forecasts:(Array.isArray(body.forecasts)?body.forecasts:[]).slice(0,3).map(compactForecast).filter(Boolean),mtfForecasts:(Array.isArray(body.mtfForecasts)?body.mtfForecasts:[]).slice(0,PAIRS.length).map(compactMtf).filter(Boolean),openPositions:(Array.isArray(body.openPositions)?body.openPositions:[]).slice(0,PAIRS.length).map(compactPosition).filter(Boolean),receivedAt:new Date().toISOString()};
}

function compactCandidate`,
'certified model context controls');
  fs.writeFileSync(path,source);
}

// Nemotron: use model context only when it matches the engine's saved controls.
{
  const path="src/engine-nemotron-base.js";
  let source=fs.readFileSync(path,"utf8");
  source=replaceRegex(source,
/function modelContextFresh\(context\)\{.*?\nfunction modelReportForPair\(context,pair\)\{.*?\n/s,
`function modelContextMatchesConfig(context,config){if(!context?.controls||!config)return false;const controls=context.controls,sameNumber=(left,right)=>Math.abs(Number(left)-Number(right))<1e-9;return controls.timeframe===config.timeframe&&controls.strategy===config.strategy&&controls.confirmationStrategy===config.confirmationStrategy&&sameNumber(controls.htlLength,config.htlLength)&&sameNumber(controls.filter,config.filter)&&controls.decisionMode===config.decisionMode&&controls.configurationSource===config.configurationSource;}
function modelContextFresh(context,config=null){const time=Date.parse(context?.receivedAt||0);if(!Number.isFinite(time)||Date.now()-time>MODEL_CONTEXT_MAX_AGE_MS)return null;return config&&!modelContextMatchesConfig(context,config)?null:context;}
function modelReportForPair(context,pair){return context?.pairReports?.find(item=>item?.pair===pair)||context?.slots?.find(item=>item?.pair===pair)||null;}
`,
'model context config alignment');
  source=replaceOnce(source,
'export const __nemotronTest=Object.freeze({AI_MODEL,AI_TIMEOUT_MS,AI_POLICY,MODEL_CONTEXT_MAX_AGE_MS,capitalizationScore,deterministicCandidate,compactCandidate,parseAiResponse});',
'export const __nemotronTest=Object.freeze({AI_MODEL,AI_TIMEOUT_MS,AI_POLICY,MODEL_CONTEXT_MAX_AGE_MS,modelContextMatchesConfig,capitalizationScore,deterministicCandidate,compactCandidate,parseAiResponse});',
'nemotron test exports');
  source=replaceOnce(source,
'const engineState=(await this.ctx.storage.get("state"))||{},modelContext=modelContextFresh(engineState.modelContext),fallback=deterministicCandidate(candidates,modelContext),table=candidates.map(candidate=>compactCandidate(candidate,modelContext)),candidatePairs=table.map(item=>item.pair),started=Date.now();',
'const engineState=(await this.ctx.storage.get("state"))||{},modelContext=modelContextFresh(engineState.modelContext,engineState.config||null),fallback=deterministicCandidate(candidates,modelContext),table=candidates.map(candidate=>compactCandidate(candidate,modelContext)),candidatePairs=table.map(item=>item.pair),started=Date.now();',
'fresh aligned model context');
  source=replaceOnce(source,
'Existing positions and available margin are context for capital efficiency. Select exactly one supplied candidate.',
'Operate strictly from the active saved trading controls supplied in context; the candidate set already reflects that Event, MTF, or Combined execution lane. Existing positions are the capital currently occupied in the account and must be monitored as opportunity-cost context together with NAV and available margin. Select exactly one supplied candidate.',
'nemotron control/position mandate');
  source=replaceOnce(source,
'account:modelContext?.account||null,openPositions:modelContext?.openPositions||[],forecasts:modelContext?.forecasts||[],candidates:table',
'controls:modelContext?.controls||null,selectedPairs:modelContext?.selectedPairs||[],account:modelContext?.account||null,openPositions:modelContext?.openPositions||[],forecasts:modelContext?.forecasts||[],mtfForecasts:modelContext?.mtfForecasts||[],candidates:table',
'nemotron active perspective payload');
  fs.writeFileSync(path,source);
}

console.log("Capitalization Model / MTF Forecast automated-control unison migration applied.");
