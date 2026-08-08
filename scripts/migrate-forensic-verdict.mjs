import fs from "node:fs";
const path="src/worker-base.js";
let source=fs.readFileSync(path,"utf8");
const from='  const required=[credentialCheck,accountList,summary,candles,engine],failures=required.filter(step=>!step.ok),verdict=failures.length===0?"PASS":credentialCheck.ok&&candles.ok&&engine.ok?"DEGRADED":"FAIL",firstFailure=failures.find(step=>!step.skipped)||failures[0]||null;';
const to='  const required=[credentialCheck,accountList,summary,candles,engine],failures=required.filter(step=>!step.ok),tradingCritical=[credentialCheck,accountList,summary,candles],verdict=tradingCritical.some(step=>!step.ok)?"FAIL":engine.ok?"PASS":"DEGRADED",firstFailure=failures.find(step=>!step.skipped)||failures[0]||null;';
if(!source.includes(from))throw new Error("Missing forensic verdict anchor.");
source=source.replace(from,to);fs.writeFileSync(path,source);console.log("Applied trading-readiness forensic verdict correction.");
