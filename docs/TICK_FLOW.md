# CTE Compound Runtime Flow

This document describes the current production runtime after the 2026-08-07 diagnostic remediation. It is descriptive; the registered strategy and performance contracts remain authoritative in their protected source files.

## 1. Scheduler and Durable Object

`wrangler.toml` schedules `cte-compound` once per minute. The Worker first forwards the trading heartbeat to the singleton `HTL_ENGINE` Durable Object (`HtlEngine`), then invokes the independent optimizer service budget. The Durable Object prevents overlapping trading ticks with its in-memory `running` guard.

A cron heartbeat is **not** itself a trading signal. Position reconciliation is gated by `state.reconciledCandle` and occurs once for a newly completed configured candle. New entries are additionally gated by registered event identity and/or MTF decision transitions.

## 2. Configuration changes

`PUT /api/engine/config` is forwarded to the Durable Object with caller attribution (`CF-Connecting-IP` and `User-Agent`). A fingerprint-changing configuration update intentionally invalidates event/requirement/candle initialization state so stale strategy state cannot survive a material configuration change.

Rapid fingerprint-changing updates are tracked over a 15-minute rolling window. Repeated changes still apply, but a `CONFIGURATION_CHURN_WARNING` ledger record is emitted with notifications enabled. This exists because repeated configuration resets can repeatedly re-baseline events and suppress the condition that an event must be new before entry.

## 3. Account resolution and backoff

The certified runtime uses only the live OANDA origin. Account discovery excludes MT4-linked accounts and resolves an authorized non-MT4 account ending in `-001`, preferring the configured account identity. Failed resolution enters bounded exponential backoff (2, 4, 8, 15, then 30 minutes) instead of hammering OANDA on every cron heartbeat.

## 4. Transaction recovery and reversal recovery

Before scanning for new entries, the engine synchronizes OANDA transactions from the last known transaction ID. This recovers broker-side fills and lifecycle events that may have occurred even if the original Worker response was lost.

Durable reversal claims are processed before new-entry selection. An opposing eligible event is therefore not dependent on the single-candidate selection path: reversal claims are persisted, retried, and removed only after execution/reconciliation succeeds.

## 5. Independent optimizer and multi-timeframe rotation

Trading and optimization no longer share one failure boundary. The trading heartbeat reads the current sharded optimizer snapshot but never performs 5,000-candle optimization work. After the trading request completes, `OptimizerRuntimeService` advances one dataset through the internal `/optimizer/tick` route and persists its cycle/error telemetry under `optimizerRuntimeState`.

Optimizer records remain server-managed and use one `optimizer:v7:<pair>|<timeframe>` key per dataset. A failed or oversized dataset records an optimizer error and advances the persisted cycle independently; it cannot abort transaction synchronization, completed-candle scanning, reconciliation, or order execution.

The engine also rotates one timeframe from:

`W, D, H4, H1, M30, M15, M5, M1, S30, S5`

Each MTF snapshot is tied to the current configuration fingerprint. Stale snapshots from another configuration are discarded.

The former Evaluation-only `slopeHistory` polling loop is retired. MAS/IM Evaluation statistics now use the canonical browser/engine calculator and live completed-candle caches rather than a Durable Object raw-slope-history API.

## 6. Completed-candle gate

The configured timeframe is probed for its latest completed candle. If the candle has not changed, the tick does not discover new entries. If reconciliation for that candle has not yet completed, open positions are loaded and reconciled once; subsequent cron heartbeats on the same candle do not repeat reconciliation.

Status therefore reports:

`reconciliationCadence: "new-completed-candle-only"`

## 7. Registered event and qualification path

On a new completed candle, the registered Horizon analytics produce pair requirements. The execution layer accepts only qualified registered events carrying a completed-candle `startTime`.

The engine baselines pre-existing events when initialization is required. It does not submit those already-active events as new entries. Later event candidates must represent a new event identity starting on the current completed candle. MTF candidates must represent a qualifying direction transition under the current fingerprint.

## 8. Open-position reconciliation

The certified execution layer loads OANDA `openPositions`, not account-lifetime `positions`. Flat historical instruments therefore do not inflate the runtime position snapshot.

For an open position whose registered requirement points in the opposite direction, generic reconciliation closes the opposed position unless that pair is being handled as a durable reversal claim or is covered by an active manual-position protection rule.

## 9. New entries and Nemotron

Reversals are separated from new entries first. Nemotron is **not** called for reversals and is **not** called when only one new-entry candidate exists.

When more than one eligible new-entry candidate exists, the engine invokes Workers AI model:

`@cf/nvidia/nemotron-3-120b-a12b`

Policy:

`MULTI_NEW_ENTRY_CANDIDATES_ONLY`

The model receives only the compact eligible candidate set and must choose one pair from a JSON-schema enum containing those exact pair names. It cannot create a pair, change direction, alter sizing/risk controls, change configuration, or manage reversals. The returned pair is validated against the candidate set before execution.

A missing AI binding, invalid model output, timeout, or inference failure falls back to deterministic candidate ranking. AI decisions/fallbacks are persisted in `aiTelemetry` and the ledger. The public conversational Assistant/chat surface is not part of this orchestration.

## 10. Order execution

Before a new order, the engine reconciles pending client-order identity and current live position state to suppress duplicate submission after lost responses.

Order size is bounded by directional OANDA units available and the configured `POSITION_UNITS` cap. Positive but low margin (`marginAvailable < 20% of marginUsed`) scales the candidate units by 50%. If calculated units are below the user preference `minimumUnits` but remain at least 1, the current certified path **logs a configuration warning and proceeds**; `minimumUnits` is not a hard execution veto in that path. Zero/negative margin, zero directional capacity, failed reversal closure, or broker rejection prevents a new order.

Orders are live OANDA `MARKET`, `FOK`, `DEFAULT` fills with durable client-order identity where the certified automated path submits them.

## 11. Observability

The engine ledger records configuration changes, churn warnings, initialization/migrations, partial scans, broker transactions, AI decisions/fallbacks, order fills/rejections, position closes, reversal retries/resolution, and runtime errors.

The production status surface exposes execution certification, reconciliation cadence, optimizer coverage, independent optimizer service/storage health, pending reversals/orders, last run/error information, and Nemotron binding/model/policy/telemetry. The control-status surface additionally exposes account/margin and pair-selection state.

## 12. Protected analytical boundaries

Production remediation must not casually modify the registered analytical standard. In particular, changes to these areas require explicit analytical recertification rather than operational cleanup:

- `src/horizon-strategy-v1.js`
- `src/horizon-registered-performance.js`
- `source-code/`
- `test/fixtures/`

Operational fixes should preserve the registered strategy/performance checksums and parity tests unless the work order explicitly changes the analytical standard.
