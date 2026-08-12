import fs from "node:fs";

function replaceOnce(source,needle,replacement,label){
  const first=source.indexOf(needle);
  if(first<0)throw new Error(`Missing ${label}`);
  if(source.indexOf(needle,first+needle.length)>=0)throw new Error(`Ambiguous ${label}`);
  return source.slice(0,first)+replacement+source.slice(first+needle.length);
}

const analyticalPath="public/analytical-facilities.js";
let analytical=fs.readFileSync(analyticalPath,"utf8");
analytical=replaceOnce(
  analytical,
  '  const currentEventPair=()=>document.getElementById("eventPair")?.value||state.selectedInstrument;\n',
  '  const currentEventPair=()=>document.getElementById("eventPair")?.value||state.selectedInstrument;\n  const eventOutcomeLedgerDetails=()=>typeof document==="undefined"?null:document.getElementById("eventLedger")?.closest("details.event-ledger")||null;\n',
  "event outcome ledger helper anchor"
);
const ledgerSelector='document.querySelector(".event-ledger")';
const occurrences=(analytical.match(/document\.querySelector\("\.event-ledger"\)/g)||[]).length;
if(occurrences!==3)throw new Error(`Expected exactly 3 generic event-ledger selectors, found ${occurrences}`);
analytical=analytical.split(ledgerSelector).join('eventOutcomeLedgerDetails()');
fs.writeFileSync(analyticalPath,analytical);

const indicatorPath="public/indicator-only.js";
let indicator=fs.readFileSync(indicatorPath,"utf8");
indicator=replaceOnce(indicator,
  '    if(typeof document==="undefined")return false;if(root&&document.contains(root))return true;const panel=el("chartPanel"),anchor=panel?.querySelector(".panel-head");if(!panel||!anchor)return false;anchor.style.flexWrap="wrap";\n    root=document.createElement("section");root.id="indicatorOnlyControls";root.setAttribute("aria-label","Dual Indicator Only automated trading tickets");root.dataset.controlScope="indicator-only-dual";root.style.cssText="flex:1 0 100%;border:1px solid var(--line2,#3a4657);background:#0a1017;padding:8px;margin-top:4px;";root.innerHTML=`<div style="font-size:9px;font-weight:900;letter-spacing:.08em;text-transform:uppercase;margin-bottom:7px;">Indicator Only · Two Independent Execution Tickets</div>${ticketMarkup(1)}${ticketMarkup(2)}`;anchor.appendChild(root);\n',
  '    if(typeof document==="undefined")return false;if(root&&document.contains(root))return true;const panel=el("chartPanel"),anchor=panel?.querySelector(".panel-head"),toolbar=panel?.querySelector(".chart-toolbar");if(!panel||!anchor||!toolbar)return false;\n    root=document.createElement("section");root.id="indicatorOnlyControls";root.setAttribute("aria-label","Dual Indicator Only automated trading tickets");root.dataset.controlScope="indicator-only-dual";root.style.cssText="border:1px solid var(--line2,#3a4657);background:#0a1017;padding:8px;margin:8px 14px 0;";root.innerHTML=`<div style="font-size:9px;font-weight:900;letter-spacing:.08em;text-transform:uppercase;margin-bottom:7px;">Indicator Only · Two Independent Execution Tickets</div>${ticketMarkup(1)}${ticketMarkup(2)}`;anchor.insertAdjacentElement("afterend",root);toolbar.dataset.chartControlAttachment="canonical-chart";toolbar.setAttribute("aria-label","Canonical chart controls");toolbar.style.padding="8px 14px";toolbar.style.borderBottom="1px solid var(--line,#2b3543)";root.insertAdjacentElement("afterend",toolbar);\n',
  "indicator only chart composition"
);
fs.writeFileSync(indicatorPath,indicator);

const analyticalTestPath="scripts/test-analytical-facilities.mjs";
let analyticalTest=fs.readFileSync(analyticalTestPath,"utf8");
analyticalTest=replaceOnce(analyticalTest,
  'assert.match(source,/eventLedgerPairSelection/,"Event Ledger JSON must preserve pair-selection provenance");\n',
  'assert.match(source,/eventLedgerPairSelection/,"Event Ledger JSON must preserve pair-selection provenance");\nassert.match(source,/getElementById\\(\\"eventLedger\\"\\)\\?\\.closest\\(\\"details\\.event-ledger\\"\\)/,"Event Ledger controls and composition must resolve from the actual Result / Profit table");\nassert.doesNotMatch(source,/document\\.querySelector\\(\\"\\.event-ledger\\"\\)/,"Generic .event-ledger selection must not confuse Historical Event Survival with Result / Profit");\nassert.match(source,/const eventLedger=eventOutcomeLedgerDetails\\(\\)/,"Configuration Optimizer must move the actual Result / Profit Event Ledger into Event Outcome Ledger");\n',
  "analytical ledger composition assertions"
);
fs.writeFileSync(analyticalTestPath,analyticalTest);

const indicatorTestPath="scripts/test-indicator-only.mjs";
let indicatorTest=fs.readFileSync(indicatorTestPath,"utf8");
indicatorTest=replaceOnce(indicatorTest,
  'assert.match(ui,/executionDelayMs/);assert.doesNotMatch(ui,/chartPair|chartTimeframe|chartStrategy|chartLength|chartFilter/);\n',
  'assert.match(ui,/executionDelayMs/);assert.doesNotMatch(ui,/chartPair|chartTimeframe|chartStrategy|chartLength|chartFilter/);assert.match(ui,/anchor\\.insertAdjacentElement\\(\\"afterend\\",root\\)/,"Indicator Only tickets must sit directly below the canonical chart title");assert.match(ui,/root\\.insertAdjacentElement\\(\\"afterend\\",toolbar\\)/,"Chart controls must sit directly below Indicator Only tickets");assert.match(ui,/toolbar\\.dataset\\.chartControlAttachment=\\"canonical-chart\\"/,"Chart toolbar must retain explicit canonical-chart attachment");assert.doesNotMatch(ui,/anchor\\.appendChild\\(root\\)/,"Indicator Only tickets must not remain embedded in the chart header beside the toolbar");\n',
  "indicator chart composition assertions"
);
fs.writeFileSync(indicatorTestPath,indicatorTest);

console.log("Applied Event Outcome Ledger targeting and Indicator Only/chart control composition repair.");
