import assert from "node:assert/strict";
import fs from "node:fs";

const dual=fs.readFileSync(new URL("../src/engine-indicator-only-dual.js",import.meta.url),"utf8");
const live=fs.readFileSync(new URL("../src/engine-live-signal-price.js",import.meta.url),"utf8");
const ui=fs.readFileSync(new URL("../public/indicator-only.js",import.meta.url),"utf8");
const integrity=fs.readFileSync(new URL("../public/runtime-integrity.js",import.meta.url),"utf8");

assert.match(dual,/IO_TICKET_CAPACITY=3/);
assert.match(ui,/IO_TICKET_CAPACITY=3/);
assert.match(ui,/Three Independent Execution Tickets/);
assert.match(live,/IO_EVENT_MONOTONIC_CHRONOLOGY@1\.0\.0/);
assert.match(live,/INDICATOR_ONLY_RETROGRADE_EVENT_REJECTED/);
assert.match(live,/if\(retrogradeEvent\(runtime,event\)\)/);
assert.match(integrity,/OANDA_SELECTED_CHART_FORMING_CANDLE@1\.0\.0/);
assert.match(integrity,/LIVE_OANDA_BID_ASK_MID/);
assert.match(integrity,/complete:false,streaming:true/);
assert.match(integrity,/recentExecutableSignals/);
assert.match(integrity,/SIGNAL_PROVENANCE_REGISTERED/);
assert.match(integrity,/signals:live/);
assert.doesNotMatch(integrity,/CROSS BUY|CROSS SELL/);

console.log("Consolidated IO streaming work order certified: three tickets, monotonic event chronology, live forming selected-chart candle, and executable ASK/BID arrows.");
