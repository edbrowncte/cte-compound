# CTE Compound

`cte-compound` is a live OANDA Cloudflare Worker application for the Criterion Echelon HTL Asset Analytical Compound.

## Runtime

- Live OANDA REST and pricing-stream hosts only.
- OANDA credentials are Cloudflare secrets: `OANDA_ACCOUNT_ID` and `OANDA_API_KEY`.
- One Durable Object (`HTL_ENGINE`) coordinates completed-candle decisions, persistent state, transaction reconciliation, Nemotron ranking, the trading ledger, and an independently scheduled sharded optimizer service.
- Workers AI uses `@cf/nvidia/nemotron-3-120b-a12b` only to rank candidates already admitted by deterministic strategy logic.
- The `OANDA_ENGINE` service binding is currently used only for health reporting.

## Registered CTE Horizon analytical engine

This certification branch restores the checksum-verified strategy implementation from CTE Horizon commit `0a1f4c01ccb6b1dd839f39a0fcb777f368bb744f`:

- Strategy engine: `horizon-strategy-v1`
- Exact strategy-source SHA-256: `5dbf45b24ceff1f1d740dbf6aed7a17012f43210d79506d5a930567b6b391814`
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

## Analytical certification result

**Clean analytical certification: PASS**

The permanent `npm run check` gate verifies:

- checksum-authenticated restoration of the exact Horizon source and implementation adapters;
- the terminal-derived strategy parity fixture;
- six independent strategy event streams;
- next-open entry and opposite-strategy-event exit timing;
- 28 independently hashed pair fixtures;
- 3,000 completed M1 candles for every pair;
- 84,000 completed candles in total;
- exact serialized reproduction of all 168 clean performance rows;
- runtime optimizer generation 7 sharded per pair-timeframe and the registered gross-performance contract.

Frozen clean evidence:

- Aggregate candle snapshot SHA-256: `60f2a9e3353bfe18dc8f0bafe8032438e982b38d8b1f85734440ab3805c56b5d`
- Aggregate candle gzip SHA-256: `675de04da33c2c17d45545e606617756f1bd29b3f65ee1820346f157006b4f08`
- Clean 168-row performance SHA-256: `8a294dbf8be60f87b70367ce780024af87c86a2b67081eb2fc8a9b481a61fe2f`

## Legacy benchmark disclosure

The uploaded July 28 benchmark is preserved as forensic evidence but is **not** accepted as a valid analytical target.

The accompanying trade-ledger audit proves cross-instrument contamination:

- NZD/USD ledger rows: 226
- NZD/CAD ledger rows: 250
- Exact duplicated NZD/USD/NZD/CAD trade tuples: 198
- NZD/USD observed price range: `0.57675–0.81828`
- NZD/CAD observed price range: `0.81317–0.81828`

The duplicated tuples share strategy, side, signal time, entry time and price, and exit time and price. Reproducing those legacy totals would reproduce corrupted NZD/CAD prices inside NZD/USD, not certify the strategy.

Runtime certification therefore reports:

- source/formula parity: PASS;
- terminal-derived fixture parity: PASS;
- clean 28-pair / 168-row numerical parity: PASS;
- contaminated legacy benchmark: `REJECTED_DATA_CONTAMINATION`.

## Performance disclosure

Registered Horizon gross performance and spread-adjusted performance are separate result sets:

- `grossPerformance` reproduces the registered Horizon calculation contract.
- `spreadAdjustedPerformance` is separately labeled and cannot overwrite or relabel registered gross results.

Optimizer generation 6 invalidates the superseded generation-5 shared-crossing records. Compute Configuration uses the restored six-strategy engine and supports the 3,000-bar registered history contract.

## Private-owner trading authorization

The platform owner explicitly authorized the certified private runtime to trade. The engine reports:

- `armed: true`
- `executionCertification: ARMED_PRIVATE_USER`

The analytical wrapper no longer overrides or suppresses automated `execute()` or position `reconcile()`. The inherited OANDA transaction reconciliation, pending-order recovery, no-hedging position handling, minimum-units preference, trade modification/closure routes, and Nemotron candidate ranking remain active beneath the certified six-strategy engine.

This authorization is specific to the owner's private platform. A production Worker must still be deployed from the armed commit before the live Cloudflare runtime reflects it.

## Analytical surfaces

- 28 currency pairs and ten native OANDA timeframes.
- HTL Asset, DARE(N), DARE, COMBO/CSF, NAI, and APEX.
- Completed midpoint candles, schedule, analytical chart, HTL Event Forecast, optimizer registry, Macro performance, account performance, positions, and ledger.

Browser chart cleanup and the full pair/timeframe/strategy/length/filter control restoration are separate UI acceptance boundaries. This branch does not represent the existing browser shared-crossing overlays as visually or analytically certified.

## Security boundary

The repository enforces same-origin browser requests and stores credentials only as Worker secrets. Same-origin enforcement is not user authentication. Protect the production Worker with personal-access control configured outside this repository.

## Validation

```bash
npm ci
npm run check
```

The contaminated legacy comparison remains available only as an explicit forensic delta audit through workflow dispatch. It is not part of the acceptance target.
