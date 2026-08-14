# CTE Compound — IO Streaming Execution Work Order

Date: 2026-08-14

This work order consolidates four coupled runtime concerns into one acceptance boundary:

1. **Monotonic IO event chronology** — once an IO ticket accepts a newer Asset/Inverse event, a later recomputation may not register or execute an older crossing time. Retrograde/repainted event identities are rejected and logged; they never receive executable ASK/BID provenance and never create chart arrows.
2. **Executable BUY/SELL chart arrows** — automatic signals are sourced from the engine executable-signal registry immediately and from the durable ledger for persistence, deduplicated by execution event ID. Arrow price is the captured live ASK for BUY / BID for SELL.
3. **Streaming selected chart** — completed candle storage remains immutable, but the selected OANDA pricing stream builds a browser-only forming candle from live bid/ask midpoint updates. The live candle is marked `complete:false` and is never written into the completed-candle analytical cache or execution engine.
4. **Third IO ticket** — IO capacity is three independent tickets. Each has independent pair/timeframe/indicator/length/filter/units/event identity and runtime state. Enabled tickets must use distinct currency pairs. Manual OANDA position activity remains account truth only and does not reset any IO ticket event state.

## Ledger incident used for acceptance

AUD/CAD M1 Ticket 2 accepted and executed a BUY event at 2026-08-14T19:37:00Z with captured ASK/fill 0.98287, reversing the manually opened 1,800-unit SHORT and opening the configured 100-unit BUY. A later scan at 19:42 registered another BUY using a recomputed older 18:40 event at current ASK 0.98296. That retrograde identity is invalid under this work order and must be rejected before signal provenance registration.

## Non-goals

No HTL/Asset/Inverse mathematical formula, optimizer objective, OANDA fill semantics, account-authority rule, no-hedging rule, or position sizing rule is changed. The streaming forming candle is a visual market-truth layer only; certified strategy/execution remains completed-candle based.
