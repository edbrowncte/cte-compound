# Rate Fluctuation / Event Outcome Corroboration

The Rate Fluctuation Ranking corroboration path consumes FINAL Event Outcome records from the same maximum-history event-row path used by the Event Ledger.

Required invariants:

- Canonical HTL event objects retain Result / Profit fields (`closePrice`, `profitPips`, `result`) in addition to crossing geometry and event statistics.
- `profitPips` is direction-adjusted from event open to event close using the pair's pip scale.
- A support row is corroborated only when FINAL events contain finite event P/L evidence.
- A successful maximum-history request may return one fewer completed candle than the request cap because an in-progress candle is excluded. That one-candle difference alone is not a degraded-history condition.
- The actual completed-candle count remains visible; it is never rewritten to the requested cap.
- Materially shorter fallback history remains degraded.
