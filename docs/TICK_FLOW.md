# Tick Dispatch and Decision Lifecycle Documentation

This document describes the runtime execution lifecycle, state transitions, trade selection, and order routing mechanisms of the `cte-compound` certified execution engine in `src/engine-certified-execution.js`.

---

## 1. Top-Level Heartbeat Dispatch Lifecycle (`tick()`)

The Cloudflare Workers cron trigger fires a heartbeat every minute. This triggers the Durable Object's `tick()` method.

Below is the execution flow of the `tick()` method, including the intermediate-heartbeat `reconcile` gate (`state.reconciledCandle`) and version migration safety check:

```mermaid
graph TD
    A[Cron Heartbeat: every minute] --> B{Is engine.running?}
    B -- Yes --> C[Ignore Tick / Concurrency Guard]
    B -- No --> D[Set running = true]
    D --> E{strategyEngineVersion changed?}

    E -- Yes --> F[Reset events, requirements, initialized = false, etc.]
    E -- No --> G[Keep existing state]

    F --> H[Load config & configure fingerprints]
    G --> H

    H --> I[Validate OANDA credentials and select active live Account]
    I --> J[Sync latest trade history transactions]
    J --> K[Process and retry any pending Durable Reversals]
    K --> L[Rotate MTF scans for multi-timeframe consensus]

    L --> M[Probe latest completed candle time on OANDA]
    M --> N{Is probe candle == state.lastCandle?}

    N -- Yes [Intermediate Tick] --> O{Is state.initialized?}
    O -- Yes --> P{Is requirements.requirements populated?}
    P -- No --> Q[Perform Config Timeframe Scan to rebuild cache]
    P -- Yes --> R{Has reconciledCandle already run for this candle?}
    Q --> R
    R -- Yes --> S[Skip Reconciliation / Early Return]
    R -- No --> T[Load positions & run reconcile()]
    T --> U[Set state.reconciledCandle = lastCandle]
    U --> S

    N -- No [New Candle Boundary] --> V[Scan Config Timeframe & Populate Cache]
    V --> W{Is state.initialized?}
    W -- No [Baseline first run] --> X[Run reconcile() on fresh cache]
    X --> Y[Set state.reconciledCandle = lastCandle]
    Y --> Z[Baseline events cache & mark initialized = true]

    W -- Yes [Main decision pipeline] --> AA[Identify candidates starting at lastCandle]
    AA --> AB[Classify Signals: reversals, new entries, matching]
    AB --> AC[Filter out active reversals from baseline reconcile()]
    AC --> AD[reconcile() remaining positions]
    AD --> AE[Set state.reconciledCandle = lastCandle]
    AE --> AF[Claim and execute reversals immediately]
    AF --> AG{Are there any eligible new entries?}
    AG -- Yes --> AH[Use Nemotron AI structured tool-call to rank & select one]
    AH --> AI[Execute new trade position]
    AG -- No --> AJ[Skip entries]
    AJ --> AK[Commit state.events and state.lastCandle]
    AI --> AK
    Z --> AK

    AK --> AL[Set running = false & complete tick]
```

---

## 2. Decision and Entry Pipeline

When a new candle finishes, candidate generation begins. Signals are processed independently to isolate immediate reversals from AI-ranked new entries.

```mermaid
graph TD
    A[Eligible Candidates generated from Scan] --> B[Identify candidates starting on latest complete candle]
    B --> C[Classify Candidates using active position directions]

    C --> D[REVERSAL: Candidate opposes current open position]
    C --> E[NEW ENTRY: Pair has no current open positions]
    C --> F[MATCHING: Candidate direction aligns with open position]

    D --> G[Add pair to reversalPairs set]
    G --> H[reconcile() opposes position exclusions to prevent conflict]
    H --> I[Write reversal claim to Durable Object transaction memory]
    I --> J[Execute close order then immediately open new reverse position]

    E --> K{Are there any eligible new entries?}
    K -- Yes --> L[Map candidate parameters to evidence table]
    L --> M[Invoke Nemotron-3 120B AI structured tool-call selectCandidate]
    M --> N[Extract candidate selection from tool arguments]
    N --> O{Did model return an eligible pair?}
    O -- Yes --> P[Execute live entry order for selected pair]
    O -- No --> Q[Fallback: Execute trade on first eligible candidate]
    K -- No --> R[Skip new entry pipeline]

    F --> S[Keep existing position open / No action]
```

---

## 3. Post-Mortem of Resolved Architectural Bugs

### Bug 1: Premature opposed-direction position closures on intermediate ticks
* **Symptom:** Opening a manual trade or modifying automatic configurations triggered premature/incorrect position closures within minutes.
* **Root Cause:** The engine's reconciliation logic was triggered on **every single 60-second heartbeat tick** (cron heartbeat) instead of waiting for a strategy timeframe boundary. Mismatches or temporary stale requirements in memory caused the engine to instantly close the position.
* **Fix Applied:** Introduced `state.reconciledCandle`. The `reconcile()` function is now gated and executes **exactly once per completed candle** at the boundary of your configured timeframe (e.g., M30 or H1). Subsequent 1-minute intermediate cron ticks recognize that `state.reconciledCandle === lastCandle` and bypass position reconciliation, protecting manual trades and preventing premature exit loops.

### Bug 2: Orphaned strategy-version migration and state reset
* **Symptom:** "Won't open, won't reverse." Strategy event changes failed to register or execute trades because of stale event IDs and historical requirements.
* **Root Cause:** `src/engine.js` has a migration reset built into its `tick()` method. However, `src/engine-certified-execution.js` overrides the `tick()` method completely **without invoking `super.tick()`** (to prevent duplicate OANDA API side effects). This left the strategy-version migration path completely dead and unreachable.
* **Fix Applied:** Inlined the strategy-engine version migration directly at the beginning of the overridden `tick()` in `src/engine-certified-execution.js`. On any change of `STRATEGY_ENGINE_VERSION` or `REGISTERED_PERFORMANCE_VERSION`, state variables (`events`, `requirements`, `lastCandle`, `initialized`, `reconciledCandle`) are cleanly wiped and baselined, restoring full trade-generation and reversal reliability.
