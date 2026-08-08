# MAS / IM Antagonist Pressure Model v2

Version: `MAS_ANTAGONIST_PRESSURE@2.0.0`

This document defines the Evaluation facility's Measure of Antagonist Sentiment (MAS) and Inverse Measure (IM). It does not change the registered Horizon trading strategy or its certified performance standard.

## 1. Timeframe hierarchy

The canonical completed-candle ladder is:

`S5 → S30 → M1 → M5 → M15 → M30 → H1 → H4 → D → W`

For a signal on timeframe `T`, its enclosing hierarchy is `T` plus every larger timeframe. Examples:

- `D → W`
- `H1 → H4 → D → W`
- `S5 → S30 → M1 → M5 → M15 → M30 → H1 → H4 → D → W`

No lower timeframe is included below the signal timeframe. The same hierarchy is read in opposite weighting directions for MAS and IM.

## 2. Timestamp synchronization

A hierarchy observation is anchored to a completed signal-timeframe candle. For every enclosing timeframe, the calculator selects the most recent slope observation whose candle completion time is less than or equal to that anchor.

The historical calculation therefore does not equate “one lag” of M1 with “one lag” of W. All component observations are synchronized to the same clock time.

For historical bars, candle completion is the next candle's start time when available. The final completed candle uses the timeframe's nominal duration.

## 3. Atomic trend power

For every timeframe, use the last 50 completed closes by default and fit log price against elapsed hours:

`log(P) = α + β t + ε`

The regression produces:

- log slope per hour `β`;
- `R²`;
- slope t-statistic;
- regression F-statistic (`t²` for one explanatory variable);
- significance p-value;
- price slope and pips/hour for human-readable velocity.

The dimensionless trend-power field is:

`F = sign(β) × tanh(|t| / 3) × sqrt(R²)`

Thus `F ∈ [-1, 1]`. Raw price magnitude is absent from the force statistic, so equivalent percentage/log paths at 1.20 and 150.00 produce equivalent trend power.

The F-statistic and p-value are retained as diagnostics rather than multiplied into the force a second time.

## 4. Signal orientation

Let the HTL signal direction be:

- `d = +1` for BUY;
- `d = -1` for SELL.

For each timeframe:

`Q_j = d × F_j`

Then:

- `Q_j > 0` supports the signal;
- `Q_j < 0` opposes the signal.

This makes “antagonist” explicitly relative to the evaluated HTL signal.

## 5. MAS — top-down antagonist pressure

For a hierarchy containing `n` levels, MAS weights increase from the signal timeframe toward Weekly:

`w_MAS(j) = j + 1`

where the signal timeframe is index 0.

Antagonist contribution:

`A_j = max(0, -Q_j)`

MAS is:

`MAS = Σ[w_MAS(j) × A_j] / Σw_MAS`

Weekly therefore has the greatest top-down inertia.

## 6. IM — reverse-cadence supporting pressure

IM uses the exact reverse weights:

`w_IM(j) = n - j`

Supporting contribution:

`S_j = max(0, Q_j)`

IM is:

`IM = Σ[w_IM(j) × S_j] / Σw_IM`

The same hierarchy is therefore read bottom-up for IM and top-down for MAS.

## 7. Pressure ratio

The displayed pressure ratio is literal:

`R = IM / MAS`

If MAS is zero and IM is positive, the mathematical ratio is infinite. A separate finite model ratio is capped at 20 only for empirical transition calibration. The displayed `IM/MAS` is not replaced by that cap.

## 8. Pressure acceleration and deterioration

The current signal direction is held fixed while recent synchronized hierarchy states are reconstructed. The calculator returns five-observation OLS rates by default:

- `MAS ROC`;
- `IM ROC`;
- `Ratio ROC`.

Typical interpretation:

- `MAS ROC > 0`: antagonist force is accelerating;
- `MAS ROC < 0`: antagonist force is deteriorating;
- `IM ROC > 0`: signal-supporting force is propagating upward;
- `Ratio ROC > 0`: the signal is gaining relative to the antagonist field.

## 9. Event power and convexity

For consecutive HTL events on the selected signal timeframe:

`v_E = direction_current × log(P_current / P_previous) / elapsed_hours`

The current event velocity is standardized causally against prior event velocities:

`Event Angle Z = (v_E - μ_prior) / σ_prior`

The display angle is:

`Event Angle = atan(Event Angle Z)`

expressed in degrees. The z-score remains the primary dimensionless event-power statistic.

Convexity is the change in causal event-power z-score from the previous measurable event:

`Convexity = EventAngleZ_current - EventAngleZ_previous`

Positive convexity means event power is accelerating relative to its own historical cadence.

## 10. Empirical transition threshold

Historical HTL events that begin against the current top-down macro force are transition candidates.

For each completed historical event:

1. reconstruct MAS and IM at the event's completed-candle time;
2. record its finite model pressure ratio;
3. observe the signal-timeframe anchors until the next HTL event;
4. mark success if the top-down weighted macro force changes to the event direction for two consecutive completed signal-timeframe observations.

If there are at least six usable antagonist events with both successes and failures, the calculator selects the pressure-ratio threshold that maximizes balanced classification accuracy.

That learned value is `R*`.

If the history is insufficient, `R* = 1.0` is explicitly labeled `PARITY_FALLBACK` rather than represented as empirically learned.

Required supporting force is:

`Required IM = R* × MAS`

If the macro field is already aligned with the signal, Required IM is zero because no antagonist transition remains to be achieved.

## 11. Transition probability

Transition probability is estimated from completed historical antagonist events with a kernel-smoothed local success rate in `log(1 + ratio)` space, with light empirical-prior shrinkage.

It is unavailable when there is not enough historical event evidence. It is not fabricated from synthetic history.

If the macro force is already aligned with the signal, transition probability is reported as 1 because the transition condition has already been satisfied.

## 12. Regimes

The model emits one of:

- `TREND_ALIGNED` — top-down macro force already agrees with the HTL signal;
- `TRANSITION` — pressure ratio is at/above the learned threshold and ratio momentum is non-negative;
- `CHALLENGE` — IM has reached or exceeded MAS but has not satisfied the stronger transition condition;
- `ANTAGONIST_DETERIORATING` — MAS is falling while IM rises;
- `ANTAGONIST_ACCELERATING` — MAS is rising while IM is not;
- `REVERSION_PRESSURE` — the signal remains structurally countertrend without one of the above developments;
- `NEUTRAL` — insufficient signal or synchronized data.

`TYPE` remains a coarse compatibility classification of `TREND_FOLLOWING` versus `REVERSION` based on whether the current top-down macro force agrees with the HTL event direction.

## 13. Evaluation output contract

The primary table fields are:

`Pair · Signal TF · Signal · MAS · IM · IM/MAS · MAS ROC · IM ROC · Ratio ROC · Event Angle Z · Convexity · R² · F · p · Pips/Hr · Required IM · Transition Probability · Regime`

Legacy MAS/IM z-series remain available for oscillator/debug compatibility, but they are no longer the definition of MAS or IM.

## 14. Protected analytical boundary

This model belongs to the Evaluation/diagnostic facility. It must not silently modify:

- `src/horizon-strategy-v1.js`;
- `src/horizon-registered-performance.js`;
- `source-code/`;
- `test/fixtures/`.

Any future use of MAS/IM as an execution gate requires a separate explicit strategy work order and analytical recertification.
