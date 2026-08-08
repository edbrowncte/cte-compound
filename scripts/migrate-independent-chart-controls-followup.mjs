import fs from "node:fs";

const path="public/index.html";
let html=fs.readFileSync(path,"utf8");
let changes=0;
const replaceOnce=(from,to,label)=>{if(!html.includes(from))throw new Error(`Missing follow-up anchor: ${label}`);html=html.replace(from,to);changes++;};

replaceOnce(
'    const live = state.evalOffsetBars === 0 ? liveMid(state.selectedInstrument) : NaN;',
'    const evalPair=el("evalChartPair")?.value||state.selectedInstrument;\n    const live = state.evalOffsetBars === 0 ? liveMid(evalPair) : NaN;',
"evaluation live price pair");

replaceOnce(
'      const label = formatPrice(live, state.selectedInstrument);',
'      const label = formatPrice(live, evalPair);',
"evaluation live label pair");

replaceOnce(
`    if (el("evalTableTfFilter")) {
      el("evalTableTfFilter").addEventListener("change", () => {
        const tf = el("evalTableTfFilter").value;
        if (el("evalChartTimeframe")) el("evalChartTimeframe").value = tf;
        void loadEvaluationData();
        void loadEvalChartData(state.selectedInstrument, tf);
        void preloadEvaluationTimeframe(tf);
      });
    }`,
`    if (el("evalTableTfFilter")) {
      el("evalTableTfFilter").addEventListener("change", () => {
        const tf = el("evalTableTfFilter").value;
        void loadEvaluationData();
        void preloadEvaluationTimeframe(tf);
      });
    }`,
"evaluation table filter isolation");

replaceOnce(
`    if (el("evalChartTimeframe")) {
      el("evalChartTimeframe").addEventListener("change", () => {
        const tf = el("evalChartTimeframe").value;
        if (el("evalTableTfFilter")) el("evalTableTfFilter").value = tf;
        void loadEvalChartData(state.selectedInstrument, tf);
        void computeEvaluationResults();
        void preloadEvaluationTimeframe(tf);
      });
    }
    if (el("evalChartStrategy")) {
      el("evalChartStrategy").addEventListener("change", () => {
        void loadEvalChartData(state.selectedInstrument, el("evalChartTimeframe").value);
      });
    }
    if (el("evalRefreshChart")) {
      el("evalRefreshChart").addEventListener("click", () => {
        void loadEvalChartData(state.selectedInstrument, el("evalChartTimeframe").value);
      });
    }`,
`    if (el("evalChartTimeframe")) {
      el("evalChartTimeframe").addEventListener("change", () => {
        void loadEvalChartData(el("evalChartPair").value,el("evalChartTimeframe").value);
      });
    }
    if (el("evalRefreshChart")) {
      el("evalRefreshChart").addEventListener("click", () => {
        void loadEvalChartData(el("evalChartPair").value,el("evalChartTimeframe").value);
      });
    }`,
"evaluation chart controls isolation");

fs.writeFileSync(path,html);
console.log(`Applied ${changes} follow-up chart isolation changes.`);
