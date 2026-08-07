import {readFile,writeFile} from "node:fs/promises";

const path="public/index.html";
let html=await readFile(path,"utf8");

if(!html.includes('id="NemotronStatus"')){
  const marker=`        </div>\n\n        <!-- Tradable Pair Selector Panel -->`;
  const panel=`        </div>\n\n        <div class="heartbeat-panel" id="NemotronPanel" aria-label="Nemotron decision orchestration status">\n          <div style="font-size:12px; font-weight:850; text-transform:uppercase; letter-spacing:.06em;">Nemotron Decision Orchestration</div>\n          <div class="heartbeat-grid">\n            <div class="heartbeat-item"><span>Model</span><strong id="NemotronModel">—</strong></div>\n            <div class="heartbeat-item"><span>Status</span><strong id="NemotronStatus">—</strong></div>\n            <div class="heartbeat-item"><span>Selected Pair</span><strong id="NemotronSelection">—</strong></div>\n            <div class="heartbeat-item"><span>Latency</span><strong id="NemotronLatency">—</strong></div>\n            <div class="heartbeat-item"><span>Daily</span><strong id="NemotronDaily">—</strong></div>\n            <div class="heartbeat-item"><span>Total</span><strong id="NemotronTotal">—</strong></div>\n          </div>\n          <div id="NemotronReason" style="margin-top:8px; color:var(--muted); font-size:9px; line-height:1.35;">Awaiting engine status.</div>\n        </div>\n\n        <!-- Tradable Pair Selector Panel -->`;
  const matches=html.split(marker).length-1;
  if(matches!==1)throw new Error(`Nemotron panel insertion marker expected once, found ${matches}`);
  html=html.replace(marker,panel);
  await writeFile(path,html);
  console.log("Inserted visible Nemotron telemetry panel");
}else{
  console.log("Nemotron telemetry panel already present");
}
