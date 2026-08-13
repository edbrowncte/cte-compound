# Indicator Signal Chain Inspection

Routine inspection cadence: 12:00 AM and 12:00 PM America/Chicago.

For every registered indicator (`ASSET`, `DARE_N`, `DARE`, `COMBO`, `NAI`, `APEX`, and any subsequently registered indicator), inspect the complete analytical-to-execution provenance chain without changing trading behavior:

1. Every canonical indicator signal-generating crossing or state transition must resolve to exactly one registered signal event.
2. Every signal event must identify a completed source candle and therefore a deterministic source signal price: the completed source candle close represented by the registered event `openPrice`.
3. Every signal event must preserve pair, timeframe, indicator, direction, source signal time, configuration/version lineage, and stable event identity.
4. Normal execution registration must retain the full requirement/event object so the source signal price is available independently from any later OANDA fill price.
5. Indicator Only candidates must retain the complete registered event when passed to execution.
6. For HTL ASSET specifically, independently recount Asset/Asset Inverse crossings and require a one-to-one match with ASSET signals.
7. Flag any dropped, duplicated, repriced, misattributed, identity-less, time-less, or price-less signal.
8. Distinguish source signal price from execution fill price. They are different provenance fields and must never be substituted for one another.
9. Include the Rate Fluctuation / Event Outcome corroboration contract in the same inspection: FINAL event outcomes must retain finite `profitPips`, and a successful maximum-history request that yields 4,999 completed candles must not be mislabeled as degraded solely because the requested cap was 5,000.

This is an inspection contract only. It does not change signal qualification, execution eligibility, position sizing, risk policy, stale-signal handling, or OANDA order submission.
