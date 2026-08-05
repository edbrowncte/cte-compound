# CTE Compound

`cte-compound` is a live OANDA Cloudflare Worker application for the Criterion Echelon HTL Asset Analytical Compound.

## Runtime

- Live OANDA REST and pricing-stream hosts only.
- OANDA credentials are Cloudflare secrets: `OANDA_ACCOUNT_ID` and `OANDA_API_KEY`.
- One Durable Object (`HTL_ENGINE`) coordinates completed-candle decisions, optimizer records, persistent state, transaction reconciliation, Nemotron ranking, and the trading ledger.
- Workers AI uses `@cf/nvidia/nemotron-3-120b-a12b` only to rank candidates already admitted by deterministic strategy logic.
- The `OANDA_ENGINE` service binding is currently used only for health reporting.

## Registered CTE Horizon analytical engine

This certification branch restores the checksum-verified strategy implementation from CTE Horizon commit `0a1f4c01ccb6b1dd839f39a0fcb777f368bb744f`:

- Strategy engine: `horizon-strategy-v1`
- Registered gross-performance engine: `registered-horizon-performance-v1`
- History contract: 3,000 completed candles
- Entry: next candle open after that strategy's event
- Exit: next candle open after that strategy's opposite event
- HTL Asset: Asset / recovered-inverse crossings
- DARE: Mean / Mean-Inverse crossings
- DARE(N): independently normalized Mean / Mean-Inverse state changes
- NAI: independently normalized Asset / Inverse state changes
- APEX: independent `zup` / `puz` threshold events
- COMBO/CSF: the registered TWO_OPINIONS, REGIME_TRIGGER, or CONFLICT_CONSENSUS method and roles

DARE(N), DARE, COMBO, NAI, and APEX are not forced onto the HTL Asset crossing clock.

## Analytical certification status

The repository contains two separate gates:

1. **Offline source and formula certification**
   - Reconstructs the original source and fixtures from checksum-verified compressed bundles.
   - Verifies the exact `src/strategies.js` SHA-256.
   - Verifies the terminal-derived parity fixture.
   - Verifies independent event streams, next-open entries, opposite-strategy-event exits, and the complete 168-row registered-result schema and configuration.

2. **Live saved-record certification**
   - Requests the original 3,000-candle OANDA history window for all 28 pairs.
   - Recomputes all six strategies.
   - Compares every saved performance field across all 168 rows numerically.
   - Runs manually through `npm run certify:horizon-live` or the workflow-dispatch live replay.

The saved 168-row record is not declared matched until the live replay passes. Rounded ledger exports are not substituted for the original candle history.

## Performance disclosure

Registered Horizon gross performance and spread-adjusted performance are separate result sets:

- `grossPerformance` reproduces the original registered calculation contract.
- `spreadAdjustedPerformance` is separately labeled and is not allowed to overwrite or relabel registered gross results.

Optimizer generation 6 invalidates the superseded generation-5 shared-crossing records. Compute Configuration uses the restored six-strategy engine and supports the 3,000-bar registered history contract.

## Trading containment during certification

Automated broker execution and position reconciliation are blocked on this branch until the saved 168-row historical replay passes. The engine status reports:

- `armed: false`
- `executionCertification: BLOCKED_PENDING_SAVED_RECORD_PARITY`

The existing OANDA transaction reconciliation, pending-order records, minimum-units preference, trade modification/closure routes, and Nemotron telemetry remain present beneath the analytical adapter, but the restored analytical results cannot take custody of positions before certification.

## Analytical surfaces

- 28 currency pairs and ten native OANDA timeframes.
- HTL Asset, DARE(N), DARE, COMBO/CSF, NAI, and APEX.
- Completed midpoint candles, schedule, analytical chart, HTL Event Forecast, optimizer registry, Macro performance, account performance, positions, and ledger.

Browser chart cleanup and the full pair/timeframe/strategy/length/filter control restoration are separate UI acceptance boundaries. This branch does not represent the existing browser shared-crossing overlays as analytically certified.

## Security boundary

The repository enforces same-origin browser requests and stores credentials only as Worker secrets. Same-origin enforcement is not user authentication. Protect the production Worker with personal-access control configured outside this repository.

## Validation

```bash
npm ci
npm run check
```

Optional exact historical replay:

```bash
OANDA_API_KEY=... npm run certify:horizon-live
```

Do not merge or deploy this branch until the offline certification is green and the live saved-record replay result is explicitly reviewed. Production is not considered analytically certified merely because the application builds or deploys.
