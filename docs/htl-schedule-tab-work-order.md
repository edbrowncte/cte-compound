# HTL Schedule Tab — 28-Pair Table Work Order

**Target:** `cte-compound` — Analytical Compound → HTL Schedule tab
**Date:** 2026-08-13

Table renders once per pair, 28 rows, sortable by any column.

Required analytical columns:

`Bid — Spread — Ask — Indicator ▾ — MFM — MAM — Current Signal — Signal Time — Signal Price — Pips Since Signal — Pips Since Session`

Implementation contract:
- Bid / Ask must be sourced from the live OANDA pricing stream already used by the application. Spread is live `Ask - Bid`; never hardcode a static spread estimate.
- Indicator selector supports ASSET and NAI. ASSET is fully populated. NAI must remain unavailable until its own standing 28-pair event-outcome instrumentation exists; do not synthesize ASSET statistics for NAI.
- MFM / MAM use the current event's historical survival statistics and are displayed in pips.
- Current Signal is the current indicator event direction.
- Signal Time is the current event's actual `startTime`, not configuration timestamps and not the latest completed candle unless that candle is the signal origin.
- Signal Price is the current event's source-candle price / event open.
- Pips Since Signal is direction-adjusted from Signal Price to current live price.
- Pips Since Session uses the current OANDA broker-day daily-candle open as the session reference; do not create a static session approximation.
- Reuse existing live pricing and candle data paths before introducing any new state.
- Preserve timeframe provenance. The original evidence set was M30; the implemented table must use the actively selected HTL Schedule timeframe rather than silently labeling another timeframe as M30.
