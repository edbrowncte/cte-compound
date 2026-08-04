from pathlib import Path
import re


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected 1 occurrence, found {count}")
    return text.replace(old, new, 1)


def regex_once(text: str, pattern: str, replacement: str, label: str) -> str:
    result, count = re.subn(pattern, replacement, text, count=1, flags=re.S)
    if count != 1:
        raise SystemExit(f"{label}: expected 1 regex replacement, found {count}")
    return result


html_path = Path("public/index.html")
html = html_path.read_text()

html = replace_once(
    html,
    '    .decision-card strong { display:block; margin-top:3px; font-size:11px; }',
    '''    .decision-card strong { display:block; margin-top:3px; font-size:11px; }
    .candidate-card { position:relative; text-align:left; color:var(--text); cursor:pointer; }
    .candidate-card:hover:not(:disabled) { background:#111925; }
    .candidate-card.selected { border-color:var(--accent); box-shadow:0 0 0 1px rgba(215,168,92,.35) inset; background:rgba(215,168,92,.08); }
    .candidate-card.recommended::after { content:"NEMOTRON"; position:absolute; top:5px; right:6px; color:var(--accent2); font-size:7px; letter-spacing:.08em; }
    .candidate-card small { display:block; margin-top:4px; color:var(--muted); font-size:8px; }
    .candidate-execution { grid-column:1/-1; display:grid; grid-template-columns:minmax(190px,1fr) minmax(120px,.45fr) auto; gap:8px; align-items:end; padding:9px; border:1px solid var(--line); background:#0a1017; }
    .candidate-selection { min-height:36px; padding:7px 9px; border:1px solid var(--line); background:#0b1118; }
    .candidate-selection span { display:block; color:var(--muted); font-size:8px; text-transform:uppercase; letter-spacing:.08em; }
    .candidate-selection strong { display:block; margin-top:3px; font-size:11px; }
    .candidate-execution-status { grid-column:1/-1; min-height:14px; color:var(--muted); font-size:9px; }
    @media(max-width:760px) { .candidate-execution { grid-template-columns:1fr 1fr; }.candidate-execution button { grid-column:1/-1; } }''',
    "candidate selection styles",
)

html = replace_once(
    html,
    '''        <div class="decision-strip">
          <div class="decision-card"><span>A · Event Forecast</span><strong id="decisionA">—</strong></div>
          <div class="decision-card"><span>B · MTF Forecast</span><strong id="decisionB">—</strong></div>
          <div class="decision-card"><span>C · Combined Forecast</span><strong id="decisionC">—</strong></div>
        </div>''',
    '''        <div class="decision-strip" id="decisionCandidateStrip" aria-label="Selectable next-trade alternatives">
          <button class="decision-card candidate-card" id="candidateA" data-candidate="A" type="button" disabled><span>A · Event Forecast</span><strong id="decisionA">—</strong><small>Select this alternative</small></button>
          <button class="decision-card candidate-card" id="candidateB" data-candidate="B" type="button" disabled><span>B · MTF Forecast</span><strong id="decisionB">—</strong><small>Select this alternative</small></button>
          <button class="decision-card candidate-card" id="candidateC" data-candidate="C" type="button" disabled><span>C · Combined Forecast</span><strong id="decisionC">—</strong><small>Select this alternative</small></button>
        </div>
        <div class="candidate-execution" aria-label="Selected candidate order controls">
          <div class="candidate-selection"><span>Selected candidate</span><strong id="selectedDecisionCandidate">—</strong></div>
          <label class="field"><span>Units</span><input id="candidateUnits" type="text" inputmode="numeric" pattern="[0-9]+" value="1"></label>
          <button id="executeDecisionCandidate" type="button" disabled>Execute selected trade</button>
          <div class="candidate-execution-status" id="candidateExecutionStatus" role="status" aria-live="polite"></div>
        </div>''',
    "selectable candidate controls",
)

html = replace_once(
    html,
    '    preferenceSyncStatus:"Not synchronized"\n  };',
    '    preferenceSyncStatus:"Not synchronized",\n    decisionCandidates:{A:null,B:null,C:null},\n    selectedDecisionCandidate:null,\n    candidateBusy:false,\n    nemotronRecommendedPair:null\n  };',
    "candidate state",
)

old_causal = '''  async function causalIndicatorSet(data,length,token){const keys=["asset","inverse","meanAsset","meanInverse","dareNAsset","dareNInverse","naiAsset","naiInverse","zup","puz"],out=Object.fromEntries(keys.map(key=>[key,Array(data.length).fill(null)])),first=Math.max(2,length);for(let index=first;index<data.length;index++){if(index%16===0){await new Promise(resolve=>setTimeout(resolve,0));if(token!==state.chartCausalToken)return null;}const indicators=prepareIndicators(data.slice(0,index+1),{length});for(const key of keys)out[key][index]=indicators[key]?.at(-1)??null;}return out;}
'''
new_causal = '''  function causalIndicatorSetFast(data,length){const htl=htlCausal(data,length),meanAsset=htlPairAverage(htl.asset,htl.inverse),meanCenter=htlSeriesWma(meanAsset,length),meanInverse=meanAsset.map((value,index)=>Number.isFinite(value)&&Number.isFinite(meanCenter[index])?(2*meanCenter[index])-value:null),assetCenter=htlSeriesWma(htl.asset,length),inverseCenter=htlSeriesWma(htl.inverse,length),naiAsset=htlNorm(htl.asset,assetCenter,htlSeriesStdev(htl.asset,length)),naiInverse=htlNorm(htl.inverse,inverseCenter,htlSeriesStdev(htl.inverse,length)),dareNAsset=htlNorm(meanAsset,htlSeriesWma(meanAsset,length),htlSeriesStdev(meanAsset,length)),dareNInverse=htlNorm(meanInverse,htlSeriesWma(meanInverse,length),htlSeriesStdev(meanInverse,length));return{asset:htl.asset,inverse:htl.inverse,meanAsset,meanInverse,dareNAsset,dareNInverse,naiAsset,naiInverse,zup:htl.series.zup,puz:htl.series.puz};}
  async function causalIndicatorSet(data,length,token){await new Promise(resolve=>setTimeout(resolve,0));if(token!==state.chartCausalToken)return null;return causalIndicatorSetFast(data,length);}
'''
html = replace_once(html, old_causal, new_causal, "incremental causal chart indicator set")

causal_direction = '''  function causalDirection(indicators,index,strategy,filter=0){const relation=(left,right)=>Number.isFinite(left?.[index])&&Number.isFinite(right?.[index])?left[index]-right[index]>filter?1:left[index]-right[index]<-filter?-1:0:0;if(strategy==="ASSET")return relation(indicators.asset,indicators.inverse);if(strategy==="DARE")return relation(indicators.meanAsset,indicators.meanInverse);if(strategy==="DARE_N")return relation(indicators.dareNAsset,indicators.dareNInverse);if(strategy==="NAI")return relation(indicators.naiAsset,indicators.naiInverse);if(strategy==="APEX"){const z=indicators.zup?.[index],p=indicators.puz?.[index];return Number.isFinite(z)&&Number.isFinite(p)?z<=-filter&&p>=filter?1:z>=filter&&p<=-filter?-1:0:0;}return 0;}
'''
causal_analysis = '''  function causalAnalysisWithConfiguration(candles,configuration){const sets=new Map(),series=Object.fromEntries(STRATEGIES.map(strategy=>[strategy.id,[]])),getSet=length=>{if(!sets.has(length))sets.set(length,causalIndicatorSetFast(candles,length));return sets.get(length);},config=id=>configuration?.[id]||STRATEGY_CONFIG[id];let prior=Object.fromEntries(STRATEGIES.map(strategy=>[strategy.id,0]));for(let index=1;index<candles.length;index++){const directions={};for(const id of ["ASSET","DARE_N","DARE","NAI","APEX"]){const item=config(id),direction=causalDirection(getSet(item.length),index,id,item.filter);directions[id]=direction;if(direction&&direction!==prior[id])series[id].push({index,direction,confidence:.5,time:candles[index].time,price:candles[index].close});prior[id]=direction;}const comboConfig=config("COMBO"),combo=directions.DARE&&directions.DARE===directions.NAI?directions.DARE:0;if(combo&&combo!==prior.COMBO)series.COMBO.push({index,direction:combo,confidence:.5,time:candles[index].time,price:candles[index].close});prior.COMBO=combo;}return{series};}
'''
html = replace_once(html, causal_direction, causal_direction + causal_analysis, "causal performance analysis")

old_macro = '''  function renderMacroPerformance(){const fmt=(value,digits=2)=>Number.isFinite(value)?Number(value).toFixed(digits):"—",filtered=filterByDateRange(state.chartCandles,"macro"),minimum=Math.max(...Object.values(resolvedConfiguration(state.selectedInstrument,state.selectedTimeframe)).filter(value=>value&&typeof value==="object").map(value=>Number(value.length)||3),3)*2;el("macroPerformanceScope").textContent=`${rangeLabel(filtered.range,"All loaded completed candles")} · ${filtered.rows.length} candles`;if(filtered.rows.length<minimum){el("macroPerformanceBody").innerHTML=`<tr><td colspan="9">Insufficient completed candles for this date range: ${filtered.rows.length} / ${minimum}</td></tr>`;el("computeConfiguration").disabled=false;return;}try{const analysis=analyzeWithConfiguration(filtered.rows,resolvedConfiguration(state.selectedInstrument,state.selectedTimeframe),true);el("macroPerformanceBody").innerHTML=STRATEGIES.map(strategy=>{const stats=tradeStats(strategyTrades(filtered.rows,analysis,strategy.id,state.selectedInstrument));return `<tr><td>${strategy.label}</td><td>${stats.trades||"—"}</td><td>${stats.trades?`${stats.wins}/${stats.losses}/${stats.flats}`:"—"}</td><td class="${stats.net>=0?"positive":"negative"}">${fmt(stats.net,1)}</td><td>${fmt(stats.average)}</td><td>${fmt(stats.mfeMae)}</td><td>${fmt(stats.maxDrawdown,1)}</td><td>${fmt(stats.profitFactor)}</td><td>${fmt(stats.recoveryFactor)}</td></tr>`;}).join("");}catch(error){el("macroPerformanceBody").innerHTML=`<tr><td colspan="9">${error.message||"Performance calculation failed"}</td></tr>`;}el("computeConfiguration").disabled=false;}
'''
new_macro = '''  function renderMacroPerformance(){const fmt=(value,digits=2)=>Number.isFinite(value)?Number(value).toFixed(digits):"—",filtered=filterByDateRange(state.chartCandles,"macro"),configuration=resolvedConfiguration(state.selectedInstrument,state.selectedTimeframe),minimum=Math.max(...Object.values(configuration).filter(value=>value&&typeof value==="object").map(value=>Number(value.length)||3),3)*2;el("macroPerformanceScope").textContent=`${rangeLabel(filtered.range,"All loaded completed candles")} · ${filtered.rows.length} candles · causal completed-candle reconstruction`;if(filtered.rows.length<minimum){el("macroPerformanceBody").innerHTML=`<tr><td colspan="9">Insufficient completed candles for this date range: ${filtered.rows.length} / ${minimum}</td></tr>`;el("computeConfiguration").disabled=false;return;}try{const analysis=causalAnalysisWithConfiguration(filtered.rows,configuration);el("macroPerformanceBody").innerHTML=STRATEGIES.map(strategy=>{const stats=tradeStats(strategyTrades(filtered.rows,analysis,strategy.id,state.selectedInstrument));return `<tr><td>${strategy.label}</td><td>${stats.trades||"—"}</td><td>${stats.trades?`${stats.wins}/${stats.losses}/${stats.flats}`:"—"}</td><td class="${stats.net>=0?"positive":"negative"}">${fmt(stats.net,1)}</td><td>${fmt(stats.average)}</td><td>${fmt(stats.mfeMae)}</td><td>${fmt(stats.maxDrawdown,1)}</td><td>${fmt(stats.profitFactor)}</td><td>${fmt(stats.recoveryFactor)}</td></tr>`;}).join("");}catch(error){el("macroPerformanceBody").innerHTML=`<tr><td colspan="9">${error.message||"Performance calculation failed"}</td></tr>`;}el("computeConfiguration").disabled=false;}
'''
html = replace_once(html, old_macro, new_macro, "causal macro performance")

old_nemotron = '''  function renderNemotronStatus(ai={}){const last=ai.last||{},daily=ai.daily||{};el("nemotronModel").textContent=(ai.model||"Nemotron 3 Super").replace("@cf/nvidia/","");el("nemotronStatus").textContent=last.status||`${ai.binding?"Ready":"AI binding unavailable"}`;el("nemotronSelection").textContent=last.selectedPair?formatPair(last.selectedPair):"—";el("nemotronLatency").textContent=Number.isFinite(last.latencyMs)?`${last.latencyMs} ms`:"—";el("nemotronDaily").textContent=`${daily.invocations||0} invocations · ${daily.selections||0} selected · ${daily.fallbacks||0} fallback`;el("nemotronTotal").textContent=`${ai.totalInvocations||0} invocations · ${ai.totalSelections||0} selected · ${ai.totalFallbacks||0} fallback`;el("nemotronReason").textContent=last.time?`${formatTime(last.time)} · ${(last.candidates||[]).map(formatPair).join(", ")} · ${last.reason||"No reason returned"}`:"Nemotron runs only when multiple eligible trade candidates require adjudication.";}
'''
new_nemotron = '''  function renderNemotronStatus(ai={}){const last=ai.last||{},daily=ai.daily||{};state.nemotronRecommendedPair=last.selectedPair||null;el("nemotronModel").textContent=(ai.model||"Nemotron 3 Super").replace("@cf/nvidia/","");el("nemotronStatus").textContent=last.status||`${ai.binding?"Ready":"AI binding unavailable"}`;el("nemotronSelection").textContent=last.selectedPair?formatPair(last.selectedPair):"—";el("nemotronLatency").textContent=Number.isFinite(last.latencyMs)?`${last.latencyMs} ms`:"—";el("nemotronDaily").textContent=`${daily.invocations||0} invocations · ${daily.selections||0} selected · ${daily.fallbacks||0} fallback`;el("nemotronTotal").textContent=`${ai.totalInvocations||0} invocations · ${ai.totalSelections||0} selected · ${ai.totalFallbacks||0} fallback`;el("nemotronReason").textContent=last.time?`${formatTime(last.time)} · ${(last.candidates||[]).map(formatPair).join(", ")} · ${last.reason||"No reason returned"}`:"Nemotron recommends among eligible alternatives; it does not execute or override your selection.";renderDecisionCandidates();}
'''
html = replace_once(html, old_nemotron, new_nemotron, "advisory Nemotron rendering")

candidate_functions = '''  function candidateUnitAmount(){return Math.trunc(Number((el("candidateUnits").value||"").replace(/\\D/g,"")));}
  function openPositionPairs(){return new Set(state.openPositions.filter(position=>Number(position.long?.units||0)!==0||Number(position.short?.units||0)!==0).map(position=>position.instrument));}
  function renderDecisionCandidates(){for(const key of ["A","B","C"]){const candidate=state.decisionCandidates[key],button=el(`candidate${key}`),selected=state.selectedDecisionCandidate===key,recommended=Boolean(candidate&&state.nemotronRecommendedPair===candidate.pair);button.disabled=!candidate||state.candidateBusy;button.classList.toggle("selected",selected);button.classList.toggle("recommended",recommended);button.setAttribute("aria-pressed",String(selected));button.querySelector("small").textContent=candidate?(recommended?"Nemotron recommendation · selectable":"Selectable alternative"):"No eligible alternative";}const selected=state.decisionCandidates[state.selectedDecisionCandidate],amount=candidateUnitAmount();el("selectedDecisionCandidate").textContent=selected?`${state.selectedDecisionCandidate} · ${formatPair(selected.pair)} · ${signalWord(selected.direction)} · ${formatPct(selected.confidence)}`:"—";el("executeDecisionCandidate").textContent=selected?`Execute ${signalWord(selected.direction)}`:"Execute selected trade";el("executeDecisionCandidate").disabled=!state.connected||state.candidateBusy||!selected||!Number.isFinite(amount)||amount<1;}
  function selectDecisionCandidate(key){if(!state.decisionCandidates[key]||state.candidateBusy)return;state.selectedDecisionCandidate=key;el("candidateExecutionStatus").textContent="";renderDecisionCandidates();}
  async function executeSelectedDecisionCandidate(){const key=state.selectedDecisionCandidate,candidate=state.decisionCandidates[key],amount=candidateUnitAmount();if(!state.connected||state.candidateBusy||!candidate||!Number.isFinite(amount)||amount<1)return;state.candidateBusy=true;renderDecisionCandidates();el("candidateExecutionStatus").textContent="Validating selected candidate against live OANDA state…";try{await refreshOpenPositions();if(openPositionPairs().has(candidate.pair)){updateDecisionDisplays();throw new Error(`${formatPair(candidate.pair)} is no longer available; candidates were refreshed.`);}const accountId=el("oandaAccountId").value.trim(),pricing=await oanda(`/v3/accounts/${encodeURIComponent(accountId)}/pricing?instruments=${encodeURIComponent(candidate.pair)}&includeUnitsAvailable=true`),available=pricing.prices?.[0]?.unitsAvailable?.default,limit=Math.max(0,Math.trunc(Number(candidate.direction>0?available?.long:available?.short)||0));if(amount>limit)throw new Error(`Requested ${amount.toLocaleString()} units exceeds ${signalWord(candidate.direction)} availability ${limit.toLocaleString()}.`);const units=candidate.direction>0?amount:-amount,payload=await oandaPost(`/v3/accounts/${encodeURIComponent(accountId)}/orders`,{order:{instrument:candidate.pair,units:String(units),type:"MARKET",timeInForce:"FOK",positionFill:"DEFAULT"}}),fill=payload.orderFillTransaction;el("candidateExecutionStatus").textContent=`${key} · ${signalWord(candidate.direction)} ${amount.toLocaleString()} ${formatPair(candidate.pair)} · ${fill?.price||"filled"} · transaction ${fill?.id||payload.lastTransactionID||"—"}`;state.selectedDecisionCandidate=null;await refreshOpenPositions();await loadTradingLedger();}catch(error){el("candidateExecutionStatus").textContent=error.message||"Selected candidate order failed.";}finally{state.candidateBusy=false;updateDecisionDisplays();renderDecisionCandidates();}}
'''
html = replace_once(html, '  function dateRange(prefix){', candidate_functions + '\n  function dateRange(prefix){', "candidate selection and execution functions")

old_decision = re.compile(r'  function updateDecisionDisplays\(\)\{.*?\}\n  function renderEventDetail', re.S)
match = old_decision.search(html)
if not match:
    raise SystemExit("updateDecisionDisplays function was not found")
new_decision = '''  function updateDecisionDisplays(){const strategy=state.engineConfig.strategy,timeframe=state.engineConfig.timeframe,unavailable=openPositionPairs(),eventCandidates=INSTRUMENTS.map(pair=>{if(unavailable.has(pair))return null;const output=state.scheduleEvaluations.get(scheduleKey(pair,timeframe))?.latest?.[strategy];return output?.direction?{pair,direction:output.direction,confidence:output.confidence,source:"EVENT"}:null;}).filter(Boolean).sort((a,b)=>b.confidence-a.confidence),a=eventCandidates[0],mtfCandidates=INSTRUMENTS.map(pair=>unavailable.has(pair)?null:mtfPairDecision(pair,strategy)).filter(item=>item?.direction&&item.available>=2).sort((left,right)=>right.confidence-left.confidence||right.matches-left.matches),b=mtfCandidates[0],combined=eventCandidates.map(event=>{const mtf=mtfCandidates.find(item=>item.pair===event.pair&&item.direction===event.direction);return mtf?{pair:event.pair,direction:event.direction,confidence:(event.confidence+mtf.confidence)/2,source:"COMBINED"}:null;}).filter(Boolean).sort((left,right)=>right.confidence-left.confidence)[0],c=combined;state.decisionCandidates={A:a||null,B:b?{...b,source:"MTF"}:null,C:c||null};if(state.selectedDecisionCandidate&&!state.decisionCandidates[state.selectedDecisionCandidate])state.selectedDecisionCandidate=null;el("decisionA").textContent=a?`${formatPair(a.pair)} · ${signalWord(a.direction)} · ${formatPct(a.confidence)}`:"—";el("decisionB").textContent=b?`${formatPair(b.pair)} · ${signalWord(b.direction)} · ${formatPct(b.confidence)}`:"—";el("decisionC").textContent=c?`${formatPair(c.pair)} · ${signalWord(c.direction)} · ${formatPct(c.confidence)}`:"—";renderDecisionCandidates();}
  function renderEventDetail'''
html = html[:match.start()] + new_decision + html[match.end():]

html = replace_once(
    html,
    '      renderOpenPositions();void startPositionStream(instruments);',
    '      renderOpenPositions();updateDecisionDisplays();void startPositionStream(instruments);',
    "candidate refresh after live positions",
)

html = replace_once(
    html,
    '    el("tradeSell").addEventListener("click",()=>placeTrade("SELL"));',
    '''    el("tradeSell").addEventListener("click",()=>placeTrade("SELL"));
    el("decisionCandidateStrip").addEventListener("click",event=>{const button=event.target.closest("[data-candidate]");if(button)selectDecisionCandidate(button.dataset.candidate);});
    el("candidateUnits").addEventListener("input",event=>{event.target.value=event.target.value.replace(/\\D/g,"");renderDecisionCandidates();});
    el("executeDecisionCandidate").addEventListener("click",executeSelectedDecisionCandidate);''',
    "candidate event bindings",
)

html_path.write_text(html)

check_html_path = Path("scripts/check-html.mjs")
check_html = check_html_path.read_text()
check_html = replace_once(
    check_html,
    '"const zDefinitions=indicatorSet.z"',
    '"const zDefinitions=indicatorSet.z","decisionCandidateStrip","executeSelectedDecisionCandidate","causalIndicatorSetFast","causalAnalysisWithConfiguration"',
    "candidate and causal HTML checks",
)
check_html_path.write_text(check_html)

test_path = Path("scripts/test-runtime.mjs")
test = test_path.read_text()
test = replace_once(
    test,
    'assert.match(html,/MAX_CANDLE_REQUESTS=3/);',
    'assert.match(html,/MAX_CANDLE_REQUESTS=3/);assert.match(html,/decisionCandidateStrip/);assert.match(html,/executeSelectedDecisionCandidate/);assert.match(html,/state\\.decisionCandidates=\\{A:a\\|\\|null,B:b/);assert.match(html,/openPositionPairs\\(\\)/);assert.match(html,/causalIndicatorSetFast/);assert.match(html,/causalAnalysisWithConfiguration/);assert.doesNotMatch(html,/prepareIndicators\\(data\\.slice\\(0,index\\+1\\)/);',
    "candidate and causal runtime assertions",
)
test_path.write_text(test)

Path(__file__).unlink(missing_ok=True)
