from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected 1 occurrence, found {count}")
    return text.replace(old, new, 1)


html_path = Path("public/index.html")
html = html_path.read_text()

html = replace_once(
    html,
    '    .trade-units { min-width:110px; }',
    '    .trade-units { min-width:110px; }\n    .minimum-units { min-width:125px; }',
    "minimum units styling",
)

html = replace_once(
    html,
    '''          <div class="fact trade-capacity"><span>Units Available</span><strong id="factUnitsAvailable">—</strong></div>
          <label class="fact trade-units"><span>Units</span><input id="tradeUnits" type="text" inputmode="numeric" pattern="[0-9]+" value="1"></label>''',
    '''          <div class="fact trade-capacity"><span>Units Available</span><strong id="factUnitsAvailable">—</strong></div>
          <label class="fact minimum-units"><span>Minimum Units</span><input id="minimumUnits" type="text" inputmode="numeric" pattern="[0-9]+" value="1000"></label>
          <label class="fact trade-units"><span>Units</span><input id="tradeUnits" type="text" inputmode="numeric" pattern="[0-9]+" min="1000" value="1000"></label>''',
    "account minimum units control",
)

html = replace_once(
    html,
    '<label class="field"><span>Units</span><input id="candidateUnits" type="text" inputmode="numeric" pattern="[0-9]+" value="1"></label>',
    '<label class="field"><span>Units</span><input id="candidateUnits" type="text" inputmode="numeric" pattern="[0-9]+" min="1000" value="1000"></label>',
    "candidate units default",
)

html = replace_once(
    html,
    'microStartDate:preferenceDateValue("microStartDate"),microEndDate:preferenceDateValue("microEndDate")};}',
    'microStartDate:preferenceDateValue("microStartDate"),microEndDate:preferenceDateValue("microEndDate"),minimumUnits:minimumUnitAmount()};}',
    "minimum units preference payload",
)

html = replace_once(
    html,
    'for(const [id,key] of [["macroStartDate","macroStartDate"],["macroEndDate","macroEndDate"],["microStartDate","microStartDate"],["microEndDate","microEndDate"]])setPreferenceControl(id,preferences[key]||"");selectFacility(state.activeFacility,false);markSelectedRow();updateChartSummary();drawChart();}',
    'for(const [id,key] of [["macroStartDate","macroStartDate"],["macroEndDate","macroEndDate"],["microStartDate","microStartDate"],["microEndDate","microEndDate"]])setPreferenceControl(id,preferences[key]||"");setPreferenceControl("minimumUnits",preferences.minimumUnits||1000);synchronizeMinimumUnits(false);selectFacility(state.activeFacility,false);markSelectedRow();updateChartSummary();drawChart();}',
    "apply minimum units preference",
)

html = replace_once(
    html,
    '  function candidateUnitAmount(){return Math.trunc(Number((el("candidateUnits").value||"").replace(/\\D/g,"")));}',
    '''  function minimumUnitAmount(){return Math.max(1,Math.trunc(Number((el("minimumUnits")?.value||"1000").replace(/\\D/g,"")))||1000);}
  function synchronizeMinimumUnits(persist=true){const minimum=minimumUnitAmount(),control=el("minimumUnits");control.value=String(minimum);for(const id of ["tradeUnits","candidateUnits"]){const input=el(id),amount=Math.trunc(Number((input.value||"").replace(/\\D/g,"")));input.min=String(minimum);if(!Number.isFinite(amount)||amount<minimum)input.value=String(minimum);}updateTradeButtons();renderDecisionCandidates();if(persist)queuePlatformPreferenceSave();}
  function candidateUnitAmount(){return Math.trunc(Number((el("candidateUnits").value||"").replace(/\\D/g,"")));}''',
    "minimum units helpers",
)

html = replace_once(
    html,
    'el("executeDecisionCandidate").disabled=!state.connected||state.candidateBusy||!selected||!Number.isFinite(amount)||amount<1;',
    'el("executeDecisionCandidate").disabled=!state.connected||state.candidateBusy||!selected||!Number.isFinite(amount)||amount<minimumUnitAmount();',
    "candidate minimum button rule",
)

html = replace_once(
    html,
    'if(!state.connected||state.candidateBusy||!candidate||!Number.isFinite(amount)||amount<1)return;',
    'if(!state.connected||state.candidateBusy||!candidate||!Number.isFinite(amount)||amount<minimumUnitAmount())return;',
    "candidate minimum execution guard",
)

html = replace_once(
    html,
    'if(amount>limit)throw new Error(`Requested ${amount.toLocaleString()} units exceeds ${signalWord(candidate.direction)} availability ${limit.toLocaleString()}.`);',
    'if(amount<minimumUnitAmount())throw new Error(`Requested units must be at least ${minimumUnitAmount().toLocaleString()}.`);if(amount>limit)throw new Error(`Requested ${amount.toLocaleString()} units exceeds ${signalWord(candidate.direction)} availability ${limit.toLocaleString()}.`);',
    "candidate live minimum validation",
)

html = replace_once(
    html,
    '''  function updateTradeButtons(){
    const units=tradeUnitAmount();
    el("tradeBuy").disabled=!state.connected||state.tradeBusy||!Number.isFinite(units)||units<1||units>state.tradeLongAvailable;
    el("tradeSell").disabled=!state.connected||state.tradeBusy||!Number.isFinite(units)||units<1||units>state.tradeShortAvailable;
  }''',
    '''  function updateTradeButtons(){
    const units=tradeUnitAmount(),minimum=minimumUnitAmount();
    el("tradeBuy").disabled=!state.connected||state.tradeBusy||!Number.isFinite(units)||units<minimum||units>state.tradeLongAvailable;
    el("tradeSell").disabled=!state.connected||state.tradeBusy||!Number.isFinite(units)||units<minimum||units>state.tradeShortAvailable;
  }''',
    "manual trade minimum button rule",
)

html = replace_once(
    html,
    'if(!Number.isFinite(amount)||amount<1||amount>limit)return;',
    'if(!Number.isFinite(amount)||amount<minimumUnitAmount()||amount>limit)return;',
    "manual order minimum guard",
)

html = replace_once(
    html,
    '    el("tradeUnits").addEventListener("input",event=>{event.target.value=event.target.value.replace(/\\D/g,"");updateTradeButtons();});',
    '''    el("minimumUnits").addEventListener("input",event=>{event.target.value=event.target.value.replace(/\\D/g,"");updateTradeButtons();renderDecisionCandidates();});
    el("minimumUnits").addEventListener("change",()=>synchronizeMinimumUnits(true));
    el("tradeUnits").addEventListener("input",event=>{event.target.value=event.target.value.replace(/\\D/g,"");updateTradeButtons();});''',
    "minimum units bindings",
)

html_path.write_text(html)

engine_path = Path("src/engine.js")
engine = engine_path.read_text()
engine = replace_once(
    engine,
    'microStartDate:date(value.microStartDate),microEndDate:date(value.microEndDate),updatedAt:new Date().toISOString()};}',
    'microStartDate:date(value.microStartDate),microEndDate:date(value.microEndDate),minimumUnits:integer(value.minimumUnits,1,100000000,1000),updatedAt:new Date().toISOString()};}',
    "minimum units preference normalization",
)
engine = replace_once(
    engine,
    '''const pricing=await callOanda(`/v3/accounts/${accountId}/pricing?instruments=${pair}&includeUnitsAvailable=true`,token),available=pricing.prices?.[0]?.unitsAvailable?.default,units=Math.max(0,Math.trunc(Number(event.direction>0?available?.long:available?.short)||0));if(!units){await this.write({type:"NO_ORDER",pair,direction,message:"No directional units available",...context});return;}
    const signed=event.direction>0?units:-units,''',
    '''const pricing=await callOanda(`/v3/accounts/${accountId}/pricing?instruments=${pair}&includeUnitsAvailable=true`,token),available=pricing.prices?.[0]?.unitsAvailable?.default,units=Math.max(0,Math.trunc(Number(event.direction>0?available?.long:available?.short)||0));if(!units){await this.write({type:"NO_ORDER",pair,direction,message:"No directional units available",...context});return;}const minimumUnits=normalizeUiPreferences((await this.ctx.storage.get("uiPreferences"))||{}).minimumUnits;if(units<minimumUnits){await this.write({type:"NO_ORDER",pair,direction,units,message:`Directional availability ${units} is below minimum units ${minimumUnits}`,...context});return;}
    const signed=event.direction>0?units:-units,''',
    "automated execution minimum floor",
)
engine_path.write_text(engine)

check_path = Path("scripts/check-html.mjs")
check = check_path.read_text()
check = replace_once(
    check,
    '"Candle identity mismatch"]',
    '"Candle identity mismatch","id=\\"minimumUnits\\"","minimumUnitAmount","synchronizeMinimumUnits"]',
    "minimum units HTML checks",
)
check_path.write_text(check)

test_path = Path("scripts/test-runtime.mjs")
test = test_path.read_text()
test = replace_once(
    test,
    'body:JSON.stringify({selectedInstrument:"EUR_AUD",selectedTimeframe:"M30",selectedStrategy:"NAI",activeFacility:"performance",visibleBars:51})',
    'body:JSON.stringify({selectedInstrument:"EUR_AUD",selectedTimeframe:"M30",selectedStrategy:"NAI",activeFacility:"performance",visibleBars:51,minimumUnits:1500})',
    "minimum units preference test input",
)
test = replace_once(
    test,
    'assert.equal(storedPreferences.selectedStrategy,"NAI");response=await engine.fetch',
    'assert.equal(storedPreferences.selectedStrategy,"NAI");assert.equal(storedPreferences.minimumUnits,1500);response=await engine.fetch',
    "minimum units preference assertion",
)
test = replace_once(
    test,
    'assert.match(html,/id="refreshEventChart"/);',
    'assert.match(html,/id="minimumUnits"[^>]*value="1000"/);assert.match(html,/minimumUnitAmount/);assert.match(html,/synchronizeMinimumUnits/);assert.match(html,/amount<minimumUnitAmount\\(\\)/);assert.match(await readFile(new URL("../src/engine.js",import.meta.url),"utf8"),/units<minimumUnits/);assert.match(html,/id="refreshEventChart"/);',
    "minimum units runtime assertions",
)
test_path.write_text(test)

Path(__file__).unlink(missing_ok=True)
