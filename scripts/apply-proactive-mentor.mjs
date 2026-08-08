import {readFile,writeFile} from "node:fs/promises";

async function patch(path,changes){
  let text=await readFile(path,"utf8");
  for(const {label,before,after,count=1} of changes){
    const found=text.split(before).length-1;
    if(found!==count)throw new Error(`${path} ${label}: expected ${count} matches, found ${found}`);
    text=text.split(before).join(after);
  }
  await writeFile(path,text);
}

await patch("public/mas-im-calculator.js",[
  {
    label:"version bump",
    before:'const VERSION="MAS_ANTAGONIST_PRESSURE@2.0.0";',
    after:'const VERSION="MAS_ANTAGONIST_PRESSURE@2.1.0";'
  },
  {
    label:"aligned transition semantics",
    before:'const events=normalizeEvents(options.events,timeframe,anchorMs),eventPower=eventPowerDiagnostics(events,historyLimit),samples=transitionSamples(seriesByTf,hierarchy,activeSeries,events),threshold=learnTransitionThreshold(samples),probability=current.macroDirection===direction?1:transitionProbability(samples,current.MODEL_RATIO),requiredIm=current.macroDirection===direction?0:threshold.threshold*current.MAS,selected=perTF[timeframe]||{},regime=classifyRegime(current,direction,threshold.threshold,masRoc,imRoc,ratioRoc),type=current.macroDirection===direction?"TREND_FOLLOWING":"REVERSION";',
    after:'const events=normalizeEvents(options.events,timeframe,anchorMs),eventPower=eventPowerDiagnostics(events,historyLimit),samples=transitionSamples(seriesByTf,hierarchy,activeSeries,events),threshold=learnTransitionThreshold(samples),transitionState=current.macroDirection===direction?"ALREADY_ALIGNED":current.macroDirection===0?"NO_DOMINANT_MACRO":"OPPOSITION_ACTIVE",probability=transitionState==="OPPOSITION_ACTIVE"?transitionProbability(samples,current.MODEL_RATIO):NaN,requiredIm=transitionState==="OPPOSITION_ACTIVE"?threshold.threshold*current.MAS:NaN,selected=perTF[timeframe]||{},regime=classifyRegime(current,direction,threshold.threshold,masRoc,imRoc,ratioRoc),type=current.macroDirection===direction?"TREND_FOLLOWING":"REVERSION";'
  },
  {
    label:"transition state output",
    before:'REQUIRED_IM:requiredIm,TRANSITION_THRESHOLD:threshold.threshold,TRANSITION_THRESHOLD_SOURCE:threshold.source,TRANSITION_PROBABILITY:probability,TRANSITION_SAMPLE_COUNT:threshold.samples,TRANSITION_SUCCESS_COUNT:threshold.positives,',
    after:'REQUIRED_IM:requiredIm,TRANSITION_THRESHOLD:threshold.threshold,TRANSITION_THRESHOLD_SOURCE:threshold.source,TRANSITION_STATE:transitionState,TRANSITION_PROBABILITY:probability,TRANSITION_SAMPLE_COUNT:threshold.samples,TRANSITION_SUCCESS_COUNT:threshold.positives,'
  },
  {
    label:"transition state summary",
    before:'requiredIm,transitionProbability:probability,regime}',
    after:'requiredIm,transitionState,transitionProbability:probability,regime}'
  }
]);

await patch("test/mas-im-calculator.test.js",[
  {
    label:"version expectation",
    before:'assert.equal(MAS_IM_VERSION,"MAS_ANTAGONIST_PRESSURE@2.0.0");',
    after:'assert.equal(MAS_IM_VERSION,"MAS_ANTAGONIST_PRESSURE@2.1.0");'
  },
  {
    label:"aligned transition test insertion",
    before:'test("empirical transition threshold separates successful pressure ratios when history permits",()=>{',
    after:'test("trend-aligned pressure reports no future transition probability or required IM",()=>{\n  const source=monotonicCache(),result=calculateMASIMPressure("EUR_USD","H1",source,{direction:1});\n  assert.equal(result.REGIME,"TREND_ALIGNED");\n  assert.equal(result.TRANSITION_STATE,"ALREADY_ALIGNED");\n  assert.ok(Number.isNaN(result.TRANSITION_PROBABILITY));\n  assert.ok(Number.isNaN(result.REQUIRED_IM));\n  assert.equal(result.IM_OVER_MAS,Infinity);\n  assert.equal(result.MODEL_RATIO,20);\n});\n\ntest("empirical transition threshold separates successful pressure ratios when history permits",()=>{'
  }
]);

await patch("public/index.html",[
  {
    label:"mentor script",
    before:'  <script src="/mas-im-calculator.js"></script>',
    after:'  <script src="/mas-im-calculator.js"></script>\n  <script src="/market-mentor.js"></script>'
  },
  {
    label:"automatic mentor update",
    before:'    state.evaluationTableData=results;\n    renderEvaluationTable();\n    renderFourSlotRotator();\n  }\n\n  function evaluationRotatorSlots(){',
    after:'    state.evaluationTableData=results;\n    renderEvaluationTable();\n    renderFourSlotRotator();\n    if(globalThis.CTEMarketMentor)void CTEMarketMentor.update({rows:state.evaluationTableData,slots:evaluationRotatorSlots(),selectedPair:state.selectedInstrument,timeframe:activeTf,connected:state.connected});\n  }\n\n  function evaluationRotatorSlots(){'
  },
  {
    label:"rotator infinity label",
    before:'function renderFourSlotRotator(){\n    const fmt=(value,digits=2)=>Number.isFinite(value)?value.toFixed(digits):value===Infinity?"∞":"—",pct=value=>Number.isFinite(value)?`${(value*100).toFixed(1)}%`:"—",slots=evaluationRotatorSlots();',
    after:'function renderFourSlotRotator(){\n    const fmt=(value,digits=2)=>Number.isFinite(value)?value.toFixed(digits):value===Infinity?"∞ (MAS≈0)":"—",pct=value=>Number.isFinite(value)?`${(value*100).toFixed(1)}%`:"—",slots=evaluationRotatorSlots();'
  },
  {
    label:"rotator aligned transition label",
    before:'<div>Event Z <b>${fmt(c.eventAngleZ,2)}</b></div><div>Transition <b>${pct(c.transitionProbability)}</b></div>',
    after:'<div>Event Z <b>${fmt(c.eventAngleZ,2)}</b></div><div>Transition <b>${c.regime==="TREND_ALIGNED"?"ALIGNED":pct(c.transitionProbability)}</b></div>'
  },
  {
    label:"preview infinity label",
    before:'const ratio=Number.isFinite(c.ratio)?c.ratio.toFixed(2):c.ratio===Infinity?"∞":"—";',
    after:'const ratio=Number.isFinite(c.ratio)?c.ratio.toFixed(2):c.ratio===Infinity?"∞ (MAS≈0)":"—";'
  },
  {
    label:"chart transition label",
    before:'el("evalMetricRequiredIm").textContent=fmt(metrics?.REQUIRED_IM);el("evalMetricTransition").textContent=Number.isFinite(metrics?.TRANSITION_PROBABILITY)?`${(metrics.TRANSITION_PROBABILITY*100).toFixed(1)}%`:"—";',
    after:'el("evalMetricRequiredIm").textContent=metrics?.REGIME==="TREND_ALIGNED"?"—":fmt(metrics?.REQUIRED_IM);el("evalMetricTransition").textContent=metrics?.REGIME==="TREND_ALIGNED"?"ALIGNED":Number.isFinite(metrics?.TRANSITION_PROBABILITY)?`${(metrics.TRANSITION_PROBABILITY*100).toFixed(1)}%`:"—";'
  },
  {
    label:"table infinity label",
    before:'const fmt=(value,digits=2)=>Number.isFinite(value)?value.toFixed(digits):value===Infinity?"∞":"—",pct=value=>Number.isFinite(value)?`${(value*100).toFixed(1)}%`:"—";\n    el("evalTableBody")',
    after:'const fmt=(value,digits=2)=>Number.isFinite(value)?value.toFixed(digits):value===Infinity?"∞ (MAS≈0)":"—",pct=value=>Number.isFinite(value)?`${(value*100).toFixed(1)}%`:"—";\n    el("evalTableBody")'
  },
  {
    label:"table aligned transition label",
    before:'<td>${fmt(row.requiredIm,3)}</td><td>${pct(row.transitionProbability)}</td><td>${String(row.regime||"NEUTRAL").replaceAll("_"," ")}</td></tr>`',
    after:'<td>${row.regime==="TREND_ALIGNED"?"—":fmt(row.requiredIm,3)}</td><td>${row.regime==="TREND_ALIGNED"?"ALIGNED":pct(row.transitionProbability)}</td><td>${String(row.regime||"NEUTRAL").replaceAll("_"," ")}</td></tr>`'
  }
]);

console.log("Applied proactive mentor and aligned-transition semantic migration");
