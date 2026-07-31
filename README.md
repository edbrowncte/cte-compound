# CRITERION ECHELON · HTL Asset Analytical Compound

Independent Cloudflare Worker application for live, read-only OANDA candle analysis.

## Included

- 28 FX instruments.
- Six analytical compartments: HTL Asset, DARE(N), DARE, COMBO/CSF, NAI, and APEX.
- Ten OANDA granularities: W, D, H4, H1, M30, M15, M5, M1, S30, and S5.
- Completed midpoint candles only.
- A 28 × 10 BUY/SELL timeframe schedule.
- Interactive canvas candlestick chart with pair, timeframe, and strategy selectors.
- Zoom, pan, indentation, maximize, strategy markers, and a y-axis-attached price crosshair.
- Live OANDA account ID and token inputs held only in page memory.
- Same-origin Cloudflare Worker relay to the live OANDA API.

## Security model

The application does not store credentials in localStorage, sessionStorage, cookies, GitHub, Worker variables, or Cloudflare secrets. The browser sends the credentials to the same-origin Worker only for the active request. The Worker forwards them to `api-fxtrade.oanda.com` and does not persist them.

This application is read-only. It does not expose order-creation, order-modification, or position-closing routes.

## Local validation

```bash
npm install
npm run check
npm run dev
```

## Cloudflare deployment

Create a new Workers & Pages application from this repository or run:

```bash
npm install
npx wrangler deploy
```

The Worker name is defined as `cte-compound` in `wrangler.toml`. Static assets are served from `public/`, and all `/api/*` requests run through `src/worker.js`.
