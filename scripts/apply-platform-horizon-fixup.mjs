import { readFile, writeFile } from 'node:fs/promises';

let html=await readFile('public/index.html','utf8');

const tradeBlock=`<div class="trade-management" aria-label="Open trade modification and closure controls">
          <label class="field"><span>Open OANDA trade</span><select id="managedTrade"></select></label>
          <label class="field"><span>Stop loss</span><input id="managedStopLoss" type="number" step="0.00001" inputmode="decimal" placeholder="Leave blank to retain"></label>
          <label class="field"><span>Take profit</span><input id="managedTakeProfit" type="number" step="0.00001" inputmode="decimal" placeholder="Leave blank to retain"></label>
          <button class="modify-trade" id="modifyOpenTrade" type="button" disabled>Modify trade</button>
          <button class="close-trade" id="closeOpenTrade" type="button" disabled>Close trade</button>
          <div class="trade-management-status" id="tradeManagementStatus" role="status" aria-live="polite"></div>
        </div>`;
const mainIdentity='<div class="configuration-identity" id="chartConfigurationIdentity" aria-label="Analytical chart configuration identity"></div>';
const eventIdentity='<div class="configuration-identity" id="eventConfigurationIdentity" aria-label="Event chart configuration identity"></div>';

for(const block of [tradeBlock,mainIdentity,eventIdentity])html=html.split(block).join('');

const insertBefore=(marker,block,label)=>{
  const index=html.indexOf(marker);if(index<0)throw new Error(`Missing fixup marker: ${label}`);
  html=html.slice(0,index)+block+'\n        '+html.slice(index);
};
insertBefore('        <div class="decision-strip" id="decisionCandidateStrip"',tradeBlock,'decision strip');
insertBefore('        <div class="indicator-legend" id="indicatorLegend"',mainIdentity,'main indicator legend');
insertBefore('        <div class="indicator-legend" id="eventIndicatorLegend"',eventIdentity,'event indicator legend');

await writeFile('public/index.html',html,'utf8');
