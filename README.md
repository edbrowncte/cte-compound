# CTE Compound

`cte-compound` is a live OANDA Cloudflare Worker application for the Criterion Echelon HTL Asset Analytical Compound.

## Runtime

- Live OANDA REST and pricing-stream hosts only.
- OANDA credentials are Cloudflare secrets: `OANDA_ACCOUNT_ID` and `OANDA_API_KEY`.
- One Durable Object (`HTL_ENGINE`) runs completed-candle decisions, optimizer rotation, position reconciliation, order execution, and the trading ledger.
- Workers AI uses `@cf/nvidia/nemotron-3-120b-a12b` only to rank multiple already-eligible deterministic candidates. Its selection and every fallback are recorded.
- The `OANDA_ENGINE` service binding is currently used only for its health endpoint; it is not the OANDA account-data or trading path.

## Trading behavior

- The engine is live and armed.
- Decisions occur only when a newly completed candle produces an eligible event.
- Existing same-direction positions are retained; opposite positions are closed before a reversal entry.
- Entry size uses OANDA's directional `unitsAvailable.default` and requires positive available margin.
- OANDA client order IDs and durable pending-order state suppress duplicate entry submission after a lost response.
- Trading records are retained in the Durable Object ledger and exposed for the in-app/export view.

## Analytical surfaces

- 28 currency pairs and ten native OANDA timeframes.
- HTL Asset, DARE(N), DARE, COMBO/CSF, NAI, and APEX.
- Completed midpoint candles, timeframe schedule, analytical chart, causal HTL Event Forecast, multi-timeframe forecast, optimizer registry, Macro/Micro performance, positions, and trading ledger.
- Server optimizer records are the resolved pair × timeframe configuration source when `OPTIMIZED` is selected.

## Security boundary

The repository enforces same-origin browser requests and stores credentials only as Worker secrets. Same-origin enforcement is not user authentication. Protect the production Worker with the personal-access control configured outside this repository.

## Validation and deployment

```bash
npm install
npm run check
npx wrangler deploy
```

Cloudflare deploys `main` to the Worker named `cte-compound` using `wrangler.toml`.
