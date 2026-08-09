import fs from "node:fs";

const agePath="src/age-expectation.js",certifiedPath="src/engine-certified-execution.js",htmlPath="public/index.html";
let age=fs.readFileSync(agePath,"utf8"),certified=fs.readFileSync(certifiedPath,"utf8"),html=fs.readFileSync(htmlPath,"utf8"),changes=0;
const swap=(name,source,from,to)=>{if(!source.includes(from))throw new Error(`Missing fixup anchor: ${name}`);changes++;return source.replace(from,to);};

age=swap("exclude already-opposed positions from strategic displacement",age,
'  const candidates=occupied.filter(item=>item.pair!==selectedCandidate.pair).map(item=>({...item,delta:selectedExpectation.index-item.continuation.index})).filter(item=>selectedExpectation.index>=AGE_REALLOCATION_MIN_INDEX&&item.delta>=AGE_REALLOCATION_DELTA_INDEX).sort((a,b)=>b.delta-a.delta||a.continuation.index-b.continuation.index);',
'  const candidates=occupied.filter(item=>item.pair!==selectedCandidate.pair&&item.continuation.disposition!=="OPPOSED_BY_CURRENT_III").map(item=>({...item,delta:selectedExpectation.index-item.continuation.index})).filter(item=>selectedExpectation.index>=AGE_REALLOCATION_MIN_INDEX&&item.delta>=AGE_REALLOCATION_DELTA_INDEX).sort((a,b)=>b.delta-a.delta||a.continuation.index-b.continuation.index);');

certified=swap("remove pre-migration blanket reversal retry",certified,
'      await this.processPendingReversals(state,token,accountId);\n\n      let optimizer=currentRuntimeOptimizer((await this.ctx.storage.get("optimizer"))||{});',
'      let optimizer=currentRuntimeOptimizer((await this.ctx.storage.get("optimizer"))||{});');
certified=swap("retry only v2 AGE-selected reversals after migration",certified,
'      if(state.ageExpectationVersion!==AGE_EXPECTATION_VERSION){state.ageExpectationVersion=AGE_EXPECTATION_VERSION;state.pendingReversals={};state.ageLastPlan=null;await this.ctx.storage.put("state",state);await this.write({type:"AGE_EXPECTATION_MIGRATION",agePolicy:AGE_POLICY_VERSION,expectationVersion:AGE_EXPECTATION_VERSION,message:"AGE Great Expectation v2 activated; legacy blanket reversal claims cleared so reversals compete with alternatives"},false);}\n      const fingerprint=configFingerprint(config);',
'      if(state.ageExpectationVersion!==AGE_EXPECTATION_VERSION){state.ageExpectationVersion=AGE_EXPECTATION_VERSION;state.pendingReversals={};state.ageLastPlan=null;await this.ctx.storage.put("state",state);await this.write({type:"AGE_EXPECTATION_MIGRATION",agePolicy:AGE_POLICY_VERSION,expectationVersion:AGE_EXPECTATION_VERSION,message:"AGE Great Expectation v2 activated; legacy blanket reversal claims cleared so reversals compete with alternatives"},false);}\n      await this.processPendingReversals(state,token,accountId);\n      const fingerprint=configFingerprint(config);');
certified=swap("preserve AGE annotation in durable reversal claims",certified,
'    Nemotron:candidate.Nemotron||null,\n  };',
'    Nemotron:candidate.Nemotron||null,\n    AGE:candidate.AGE||null,\n  };');
certified=swap("control status AGE telemetry",certified,
'        modelContextAt:state.modelContext?.receivedAt||null\n      }),',
'        modelContextAt:state.modelContext?.receivedAt||null,\n        ageExpectationVersion:AGE_EXPECTATION_VERSION,\n        ageReallocationMinimumIndex:AGE_REALLOCATION_MIN_INDEX,\n        ageReallocationDeltaIndex:AGE_REALLOCATION_DELTA_INDEX,\n        ageLastPlan:state.ageLastPlan||null\n      }),');

html=swap("render AGE heartbeat from control status",html,
'      el("hbCardStats").textContent = `Margin: ${formattedMargin} | Open: ${openCount} | Selected: ${selectedStr} | Resolved Account: ${resolvedAcc}`;',
'      el("hbCardStats").textContent = `Margin: ${formattedMargin} | Open: ${openCount} | Selected: ${selectedStr} | Resolved Account: ${resolvedAcc}`;\n      const agePlan=data.ageLastPlan||null,ageSelected=agePlan?.selected,ageDisplacement=agePlan?.displacement;\n      if(el("AgeAction"))el("AgeAction").textContent=agePlan?.action||"MONITOR";\n      if(el("AgeExpectation"))el("AgeExpectation").textContent=ageSelected?.index!==undefined&&ageSelected?.index!==null?`${formatPair(ageSelected.pair||"")} · GE ${Number(ageSelected.index).toFixed(1)}${Number.isFinite(Number(ageSelected.expectedPipsPerHour))?` · ${Number(ageSelected.expectedPipsPerHour).toFixed(1)} pips/hr`:""}`:agePlan?.positions?.length?agePlan.positions.map(item=>`${formatPair(item.pair)} ${Number(item.index).toFixed(1)}`).join(" · "):"Awaiting qualified expectation";\n      if(el("AgeGate"))el("AgeGate").textContent=`GE ≥ ${Number(data.ageReallocationMinimumIndex??62).toFixed(0)} · Δ ≥ ${Number(data.ageReallocationDeltaIndex??12).toFixed(0)}${ageDisplacement?.pair?` · vs ${formatPair(ageDisplacement.pair)}`:""}`;');

fs.writeFileSync(agePath,age);fs.writeFileSync(certifiedPath,certified);fs.writeFileSync(htmlPath,html);
console.log(`Applied AGE retry/telemetry fixups (${changes} transformations).`);
