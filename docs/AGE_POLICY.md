# AGE — Administrating Great Expectations

AGE is the Nemotron capitalization task for CTE Compound.

## Mandate

**Capitalization and Account Value Proliferation.**

While the FX market is open, idle capital is not a strategic destination. Existing positions must continuously justify the capital they occupy by qualified expected productivity while same-pair reversals and other III-qualified pairs compete for that capital. III remains the signal-qualification authority and certified risk/execution controls remain binding.

Unallocated capital may still exist transiently when no candidate clears qualification, execution, margin, or risk gates; AGE must continue scanning rather than manufacture a trade.

## Great Expectation v2

`AGE_GREAT_EXPECTATION@2.0.0` places continuation, reversal and qualified alternative deployment on one comparable 0–100 Great Expectation index. The index combines synchronized evidence available to the Capitalization Model, including multi-timeframe confidence, optimizer win rate/net/score/sample/drawdown evidence, MAS/IM structural strength, regime, transition probability, R² and pips-per-hour. When pips-per-hour evidence is available AGE also produces an expected pips-per-hour rate alongside the index.

This is an operational comparative expectation measure. It is not represented as a guaranteed return or as a statistically proven percentage return on NAV.

## Capital decisions

AGE distinguishes:

- **Continuation** — whether the currently occupied position still has adequate expectation under current III/MTF/model evidence.
- **Reversal** — a qualified opposing III event on the same pair. A reversal does not automatically inherit the capital.
- **Alternative deployment** — a different III-qualified pair competing for the same capital.

III-opposed positions remain exit obligations under certified reconciliation. Once capital is released, a reversal and other qualified alternatives compete for redeployment.

For a still-valid position, the initial strategic reallocation gate is:

- replacement Great Expectation index **at least 62**, and
- replacement advantage **ΔGE at least 12** over the occupied position's continuation expectation.

The gate is intentionally explicit and conservative against churn. These initial values are operational thresholds and are not described as empirically profit-optimal; future realized AGE decisions and account outcomes should be used to recalibrate them.

Manual protected positions are excluded from AGE strategic displacement.

## Weekend policy

All CTE Compound FX positions are flattened every Friday at **3:57 PM Nashville time** using the IANA time zone `America/Chicago`. New automated entries remain locked through Saturday and until **Sunday 4:05 PM Nashville time** for the ordinary FX reopening window. Holiday and broker-specific closures remain authoritative.

## Authority boundary

Nemotron AGE chooses only among candidates that III and the certified engine have already qualified for deployment. Nemotron cannot invent a signal, pair, direction, order size, risk limit or configuration. The certified execution layer performs exits, selected reversals, strategic displacement, sizing and order submission.

AGE may strategically displace one still-valid occupied position for the selected qualified alternative when the reallocation gate clears. Same-pair reversals compete rather than inheriting capital automatically. The engine records the AGE action, selected expectation, continuation expectation, ΔGE, threshold and resulting execution disposition in runtime telemetry/ledger evidence.
