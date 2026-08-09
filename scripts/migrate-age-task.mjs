import fs from "node:fs";

function replaceOnce(source, from, to, label){
  const index=source.indexOf(from);
  if(index<0)throw new Error(`AGE migration target missing: ${label}`);
  if(source.indexOf(from,index+from.length)>=0)throw new Error(`AGE migration target is ambiguous: ${label}`);
  return source.slice(0,index)+to+source.slice(index+from.length);
}

{
  const path="src/engine-nemotron-base.js";
  let source=fs.readFileSync(path,"utf8");
  source=replaceOnce(source,
    'const AI_POLICY="CAPITALIZATION_NEW_ENTRY_DISCRETION";\nconst MODEL_CONTEXT_MAX_AGE_MS=10*60*1000;',
    'const AI_POLICY="CAPITALIZATION_NEW_ENTRY_DISCRETION";\nconst AI_TASK_NAME="AGE";\nconst AI_TASK="ADMINISTRATING_GREAT_EXPECTATIONS";\nconst MODEL_CONTEXT_MAX_AGE_MS=10*60*1000;',
    "AGE task constants");
  source=replaceOnce(source,
    '      policy:AI_POLICY,\n      invoked:Boolean(invoked),',
    '      policy:AI_POLICY,\n      taskName:AI_TASK_NAME,\n      task:AI_TASK,\n      invoked:Boolean(invoked),',
    "candidate AGE telemetry");
  source=replaceOnce(source,
    'export const __nemotronTest=Object.freeze({AI_MODEL,AI_TIMEOUT_MS,AI_POLICY,MODEL_CONTEXT_MAX_AGE_MS,modelContextMatchesConfig,capitalizationScore,deterministicCandidate,compactCandidate,parseAiResponse});',
    'export const __nemotronTest=Object.freeze({AI_MODEL,AI_TIMEOUT_MS,AI_POLICY,AI_TASK_NAME,AI_TASK,MODEL_CONTEXT_MAX_AGE_MS,modelContextMatchesConfig,capitalizationScore,deterministicCandidate,compactCandidate,parseAiResponse});',
    "AGE test exports");
  source=replaceOnce(source,
    'You are the internal CTE Capitalization Model. Your mandate is Capitalization and Account Value Proliferation.',
    'You are the internal CTE Capitalization Model operating AGE (Administrating Great Expectations). Your mandate is Capitalization and Account Value Proliferation.',
    "AGE system identity");
  source=replaceOnce(source,
    'Existing positions are the capital currently occupied in the account and must be monitored as opportunity-cost context together with NAV and available margin. Select exactly one supplied candidate.',
    'AGE continuously compares the expected continuation or subsequent reversal value of capital already occupied in positions against the best currently qualified alternatives, together with NAV and available margin. Existing positions remain opportunity-cost context under the current bounded authority. Select exactly one supplied candidate.',
    "AGE expectation mandate");
  source=replaceOnce(source,
    'task:"select_one_new_entry_candidate_for_capitalization",mandate:"CAPITALIZATION_AND_ACCOUNT_VALUE_PROLIFERATION"',
    'task:"AGE_ADMINISTRATING_GREAT_EXPECTATIONS_NEW_ENTRY_SELECTION",taskName:AI_TASK_NAME,taskDefinition:AI_TASK,mandate:"CAPITALIZATION_AND_ACCOUNT_VALUE_PROLIFERATION"',
    "AGE structured task");
  source=replaceOnce(source,
    'ai:{model:AI_MODEL,binding:Boolean(this.env.AI),policy:AI_POLICY,mandate:"CAPITALIZATION_AND_ACCOUNT_VALUE_PROLIFERATION",modelContextAt:engineState.modelContext?.receivedAt||null,...telemetry}',
    'ai:{model:AI_MODEL,binding:Boolean(this.env.AI),policy:AI_POLICY,taskName:AI_TASK_NAME,task:AI_TASK,mandate:"CAPITALIZATION_AND_ACCOUNT_VALUE_PROLIFERATION",modelContextAt:engineState.modelContext?.receivedAt||null,...telemetry}',
    "AGE status metadata");
  fs.writeFileSync(path,source);
}

{
  const path="public/index.html";
  let source=fs.readFileSync(path,"utf8");
  source=replaceOnce(source,
    'aria-label="Nemotron decision orchestration status">\n          <div style="font-size:12px; font-weight:850; text-transform:uppercase; letter-spacing:.06em;">Nemotron Decision Orchestration</div>',
    'aria-label="AGE Administrating Great Expectations status">\n          <div style="font-size:12px; font-weight:850; text-transform:uppercase; letter-spacing:.06em;">AGE · Administrating Great Expectations</div>',
    "AGE panel title");
  source=replaceOnce(source,
    'A/B/C forecasts · trend-following/transition leaders · Nemotron orchestration · CTE Market Mentor.',
    'A/B/C forecasts · trend-following/transition leaders · AGE (Administrating Great Expectations) · CTE Market Mentor.',
    "AGE composition description");
  source=replaceOnce(source,
    '"Nemotron recommends among eligible alternatives; it does not execute or override your selection."',
    '"AGE compares occupied capital and qualified alternatives through Nemotron; current authority remains bounded to eligible candidate selection."',
    "AGE status fallback");
  fs.writeFileSync(path,source);
}

{
  const path="package.json";
  let source=fs.readFileSync(path,"utf8");
  source=replaceOnce(source,
    'node scripts/test-capitalization-control-unison.mjs && node --test',
    'node scripts/test-capitalization-control-unison.mjs && node scripts/test-age-task.mjs && node --test',
    "AGE regression command");
  fs.writeFileSync(path,source);
}

console.log("AGE · Administrating Great Expectations task naming materialized.");
