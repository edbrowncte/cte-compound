# CTE Compound

`cte-compound` is a live OANDA Cloudflare Worker application for the Criterion Echelon HTL Asset Analytical Compound.

## Runtime

- Live OANDA REST and pricing-stream hosts only.
- OANDA credentials are Cloudflare secrets: `OANDA_ACCOUNT_ID` and `OANDA_API_KEY`.
- One Durable Object (`HTL_ENGINE`) runs completed-candle decisions, optimizer rotation, position reconciliation, order execution, and the trading ledger.
- Workers AI uses `@cf/nvidia/nemotron-3-120b-a12b` only to rank multiple already-eligible deterministic candidates. Nemotron cannot invent, reverse, veto, or delay a canonical crossing. Its recommendation, selection, and every fallback are recorded.
- The `OANDA_ENGINE` service binding is currently used only for its health endpoint; it is not the OANDA account-data or trading path.

## Canonical crossing contract

The entire platform consumes one versioned CTE Horizon Asset / recovered-inverse calculation:

- `CTE_HORIZON_HTL_ASSET_CROSSING@1.0.0`
- BUY when the completed-candle Asset crosses above its recovered inverse.
- SELL when the completed-candle Asset crosses below its recovered inverse.
- The crossing candle is the event. The engine does not wait for extrema-anchor finalization or the next opposite crossing.
- `CTE_HORIZON_STRATEGY_QUALIFICATION@1.0.0` applies HTL Asset, DARE(N), DARE, COMBO/CSF, NAI, and APEX qualification to that same raw crossing clock. Filters qualify a crossing after it occurs; they do not move or redefine it.
- Browser charts, schedule, Event Forecast, Compute Configuration, Macro performance, optimizer registry, A/B/C candidates, Nemotron evidence, execution, reconciliation, diagnostics, and ledger records use the same calculation and qualification identities.
- Optimizer generation 5 invalidates pre-contract optimizer records.

## Trading behavior

- The engine is live and armed.
- Automated execution requires a qualified canonical crossing on the latest completed OANDA candle.
- Existing same-direction positions are retained; qualified opposite crossings are reconciled before reversal entry.
- Entry size uses OANDA's directional `unitsAvailable.default`, requires positive available margin, and obeys the persisted minimum-units setting, default `1000`.
- OANDA client order IDs and durable pending-order state suppress duplicate entry submission after a lost response.
- A/B/C candidate orders are revalidated immediately before submission for crossing identity, strategy qualification, open position, directional capacity, minimum units, and duplicate client order identity.
- The Automated Trading Control Panel can revalidate and modify an open trade's GTC stop-loss/take-profit orders or fully close the selected live OANDA trade.
- Trading records retain effective pair, timeframe, strategy, length, filter, crossing values, qualification result, Nemotron evidence, and broker identifiers.

## Analytical surfaces

- 28 currency pairs and ten native OANDA timeframes.
- HTL Asset, DARE(N), DARE, COMBO/CSF, NAI, and APEX.
- Completed midpoint candles, timeframe schedule, analytical chart, HTL Event Forecast, multi-timeframe qualification, optimizer registry, Macro and OANDA account performance, positions, and trading ledger.
- Both chart surfaces display the effective currency pair, timeframe, strategy, length, and filter.
- Compute Configuration discloses the Horizon-versus-Compound parameter, validation, scoring, ownership, and formula-parity boundaries while preserving strategy-scoped Compound optimizer records.
- Server optimizer records are the resolved pair × timeframe configuration source when `OPTIMIZED` is selected.

## Security boundary

The repository enforces same-origin browser requests and stores credentials only as Worker secrets. Same-origin enforcement is not user authentication. Protect the production Worker with the personal-access control configured outside this repository.

## Validation and deployment

```bash
npm install
npm run check
npx wrangler deploy
```

Cloudflare deploys `main` to the Worker named `cte-compound` using `wrangler.toml`. Production is not considered current until the deployed Worker reports the reviewed calculation version and commit identity through Platform Diagnostic Scan.
