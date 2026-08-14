import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {JSDOM} from "jsdom";

const cards=()=>`<div id="platformDiagnosticGrid">
  <div class="diagnostic-card good"><span>Forensic verdict</span><strong>PASS</strong></div>
  <div class="diagnostic-card good"><span>Configured account</span><strong>Verified · ••••001 · token accounts •••001, •••002</strong></div>
  <div class="diagnostic-card good"><span>Failure stage</span><strong>None</strong></div>
</div><span id="platformDiagnosticStatus">PASS · 10:57:27 AM</span>`;
const dom=new JSDOM(`<!doctype html><body>${cards()}</body>`,{url:"https://cte.test/",runScripts:"outside-only"}),w=dom.window;
w.CTE_HORIZON_STRATEGIES={VERSION:"CTE_HORIZON_STRATEGY_QUALIFICATION@2.0.0",directionAt:()=>0};
w.CTE_HORIZON_PLATFORM={FORENSIC_FIELDS:[["Calculation Version","calculationVersion"]]};
w.state={diagnosticLast:{server:{engine:{accountAuthorityVersion:"EXACT_OANDA_ACCOUNT_AUTHORITY@1.0.0",accountAuthority:{verified:false,configuredMatchesResolved:false,configuredSuffix:"001",resolvedSuffix:"001",lastResolveError:{code:"ACCOUNT_IDENTITY_MISMATCH",stage:"ACCOUNT_IDENTITY",message:"Configured OANDA account is not present in the token-authorized account list"}}},browserAssessment:{verdict:"PASS",failure:null},effectiveVerdict:"PASS"},entries:[{label:"Forensic verdict",value:"PASS",good:true},{label:"Configured account",value:"Verified · ••••001",good:true},{label:"Failure stage",value:"None",good:true}]}};
w.eval(await readFile(new URL("../public/platform-horizon-qualified-direction.js",import.meta.url),"utf8"));
const byLabel=label=>[...w.document.querySelectorAll(".diagnostic-card")].find(card=>card.querySelector("span")?.textContent===label);
assert.equal(byLabel("Forensic verdict").querySelector("strong").textContent,"FAIL");assert.ok(byLabel("Forensic verdict").classList.contains("bad"));
assert.equal(byLabel("Configured account").querySelector("strong").textContent,"Exact identity mismatch · configured account is not token-authorized");assert.ok(byLabel("Configured account").classList.contains("bad"));
assert.equal(byLabel("Failure stage").querySelector("strong").textContent,"ACCOUNT_IDENTITY_MISMATCH · ACCOUNT_IDENTITY");
assert.equal(w.state.diagnosticLast.server.effectiveVerdict,"FAIL");assert.equal(w.state.diagnosticLast.server.browserAssessment.verdict,"FAIL");assert.equal(w.state.diagnosticLast.server.browserAssessment.failure.code,"ACCOUNT_IDENTITY_MISMATCH");assert.match(w.document.getElementById("platformDiagnosticStatus").textContent,/^FAIL/);
assert.ok(w.document.querySelector("[data-qualification-version]"));

w.document.body.innerHTML=cards();w.state.diagnosticLast={server:{engine:{accountAuthorityVersion:"EXACT_OANDA_ACCOUNT_AUTHORITY@1.0.0",accountAuthority:{verified:true,configuredMatchesResolved:true,configuredSuffix:"001",resolvedSuffix:"001",lastResolveError:null}},browserAssessment:{verdict:"PASS",failure:null},effectiveVerdict:"PASS"},entries:[{label:"Forensic verdict",value:"PASS",good:true},{label:"Configured account",value:"Verified · ••••001",good:true},{label:"Failure stage",value:"None",good:true}]};
w.CTEExactAccountDiagnostic.reconcile();assert.equal(byLabel("Configured account").querySelector("strong").textContent,"Exact identity verified · ••••001");assert.ok(byLabel("Configured account").classList.contains("good"));assert.equal(w.state.diagnosticLast.server.effectiveVerdict,"PASS");

dom.window.close();
console.log("Platform diagnostic cannot report PASS/Verified when exact configured OANDA account authority is false.");
