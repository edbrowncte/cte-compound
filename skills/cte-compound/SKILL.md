# CTE Compound Project Skill

## Purpose

Use this skill whenever working on `edbrowncte/cte-compound`, the live CTE Compound trading platform, its Cloudflare Worker, Durable Object engine, OANDA integration, HTL Asset analytics, MAS/IM analytical layer, Mentor, proof/benchmarking facilities, execution controls, documentation, production diagnostics, or related commercialization work.

This file is the canonical durable project-context catalog distilled from the user's conversations. It is intended to prevent context loss between sessions and agents. Preserve it as a living operational specification: update it when a decision becomes stable, when production behavior changes, or when a prior assumption is disproven.

Do not treat speculative discussion as certified implementation. Distinguish:

- `CURRENT`: implemented and intended behavior.
- `REQUIRED`: agreed requirement not necessarily complete.
- `EXPERIMENT`: hypothesis to test before giving execution authority.
- `HISTORICAL`: superseded terminology/design retained for provenance.

---

# 1. Product identity and separation

## CURRENT

Primary production platform: **CTE Compound**.

Repository: `edbrowncte/cte-compound`.

Production target: Cloudflare Worker `cte-compound`, with a singleton `HTL_ENGINE` Durable Object and live OANDA v20 REST/streaming integration.

CTE Compound is the production/deployment platform. Keep it distinct from **CTE Horizon**, which is the research/analytical counterpart. Do not collapse the two models casually:

- `cte-horizon`: research-oriented causal Horizon model.
- `cte-compound`: deployment-oriented HTL/Compound geometry, live OANDA operation, trading, ledger, Mentor, diagnostics, and proof facilities.

The platform must use **live OANDA only**. No practice, paper, demo, or synthetic trading environment may be presented as production.

## HISTORICAL naming context

Project/agent names have evolved through Summa FX, CTEFX, CTEAI, FXAICTE, and related terminology. Preserve current repository/product naming unless explicitly performing historical migration work.

Earlier AIS/HIS terminology was superseded by PA1/PA2 when dual-agent cognition/execution separation was discussed.

---

# 2. Broker, instruments, account, and execution scope

## CURRENT / REQUIRED

Broker API: OANDA v20 REST, with Pricing Streaming where useful.

Canonical 28 FX pairs:

`EUR_USD, GBP_USD, USD_JPY, USD_CAD, USD_CHF, AUD_USD, NZD_USD, EUR_GBP, EUR_JPY, EUR_CHF, EUR_AUD, EUR_CAD, EUR_NZD, GBP_JPY, GBP_CHF, GBP_AUD, GBP_CAD, GBP_NZD, AUD_JPY, AUD_CHF, AUD_CAD, AUD_NZD, NZD_JPY, NZD_CHF, NZD_CAD, CAD_JPY, CAD_CHF, CHF_JPY`

Supported platform timeframe ladder:

`S5 → S30 → M1 → M5 → M15 → M30 → H1 → H4 → D → W`

OANDA account operation is owned by the Cloudflare runtime through Variables/Secrets. The browser should not require users to re-enter persistent OANDA credentials.

No-hedging is a platform constraint. Per-pair position cap is one position. Global position/risk limits should remain explicit and inspectable.

## Position reconciliation

The certified execution engine must use:

`GET /v3/accounts/{accountId}/openPositions`

not the account-lifetime `/positions` endpoint when determining current open exposure.

Opposite live positions are intentionally reconciled against the current registered strategy direction. An opposed position may be closed with the reason equivalent to:

`Position opposed current strategy direction`

This mechanism is not itself a bug. However, repeated configuration resets previously caused event state instability and could amplify apparent ping-pong behavior. Any future excessive closing/reversing must be audited by explicit exit reason rather than guessed.

## REQUIRED production closure taxonomy

Every closure should ultimately be classifiable as one of:

- `SIGNAL_REVERSAL`
- `STOP_LOSS`
- `TAKE_PROFIT`
- `MANUAL`
- broker/margin/risk cause
- other explicitly named cause

Do not leave unexplained closures in a production/prospectus evidence stream.

---

# 3. Production incident lessons — Aug 6–7, 2026

## CURRENT remediations

Two root causes of a live trading dormancy incident were identified:

1. A transposed digit in `OANDA_ACCOUNT_ID` caused approximately eight hours of total dormancy.
2. Repeated production `PUT /config` calls during debugging reset `state.events`, `requirements`, candle markers, and `initialized`, repeatedly re-arming the rule that an event must be new before entry.

The following remediations are now part of the production contract:

- `openPositions` replaces account-lifetime `positions` for execution snapshots.
- Configuration writes record `callerIp` and `callerAgent` from `CF-Connecting-IP` and `User-Agent`.
- Fingerprint-changing configuration changes are tracked in a rolling 15-minute window.
- Multiple fingerprint-changing updates inside 15 minutes still apply but emit `CONFIGURATION_CHURN_WARNING` with notifications enabled.
- Engine status reports reconciliation cadence truthfully as `new-completed-candle-only`.

A cron heartbeat is not equivalent to a new trading signal.

Reconciliation is gated by the most recent completed candle and should occur once per new completed candle, not on every cron tick.

---

# 4. HTL Asset analytical model

## CURRENT conceptual role

The HTL Asset engine detects Asset/Inverse relationships and registered events. It must support BUY/SELL event states, event opening price, event duration, event geometry, and current/next event interpretation.

The main user question remains operationally simple even when the internals are sophisticated:

**When should this pair be bought, sold, or held, with what probability/structural context?**

## HTL length

Historical default requirement: HTL length 10 unless a specific experiment/configuration overrides it.

## EXPERIMENT — Parent-span HTL profile

The user proposed setting the HTL Asset length approximately equal to one immediate parent-timeframe span. This is now a preregistered experimental configuration rather than an intuition to deploy untested.

Proposed mapping:

| Signal TF | Immediate parent | Parent-span length |
|---|---|---:|
| S5 | S30 | 6 |
| S30 | M1 | 3* |
| M1 | M5 | 5 |
| M5 | M15 | 3 |
| M15 | M30 | 3* |
| M30 | H1 | 3* |
| H1 | H4 | 4 |
| H4 | D | 6 |
| D | W | 5 |
| W | — | retain optimizer |

`*` Exact temporal composition would be two bars, but HTL minimum-length constraints require a nearby permitted value.

The economic hypothesis is that a signal geometry spanning approximately one parent bar may align naturally with the MAS/IM hierarchy.

Do not give this experiment live execution authority until it beats the current configuration under rolling-origin, out-of-sample, after-cost evaluation.

---

# 5. MAS / IM — Measure of Antagonist Sentiment and Inverse Measure

## CURRENT meaning

**MAS = Measure of Antagonist Sentiment.**

It measures top-down opposing pressure acting against the current HTL signal.

**IM = Inverse Measure.**

It measures supportive bottom-up pressure propagating with the signal through the same enclosing hierarchy using the reverse weighting cadence.

For a signal timeframe `T`, the hierarchy includes the signal timeframe and every enclosing parent up to W.

Examples:

- Daily signal: `D → W`
- H1 signal: `H1 → H4 → D → W`
- M15 signal: `M15 → M30 → H1 → H4 → D → W`
- S5 signal: `S5 → S30 → M1 → M5 → M15 → M30 → H1 → H4 → D → W`

The components must be aligned by actual completed-candle timestamps, not equal numerical lag indices across incompatible timeframes.

## Atomic force

Use scale-independent log-price OLS trend force, based on elapsed time rather than raw bar index.

A canonical trend-force form is:

`F = sign(beta) × tanh(|t| / 3) × sqrt(R²)`

where:

- `beta` is the OLS slope of log price versus elapsed hours,
- `t` is the slope t-statistic,
- `R²` measures fit.

Orient the force to the signal direction `d ∈ {+1,-1}`:

`Q_j = d × F_j`

Then:

- `Q_j > 0`: timeframe supports the signal.
- `Q_j < 0`: timeframe opposes the signal.

## MAS / IM weighting

MAS reads the hierarchy top-down with greater macro weight toward Weekly.

IM reads the same hierarchy through the reverse weighting cadence, giving relatively greater local/signal-timeframe influence.

Conceptually:

`MAS = weighted antagonist pressure`

`IM = weighted supportive pressure`

## Pressure ratio

`R = IM / MAS`

Interpretation:

- `R < 1`: antagonist pressure dominates.
- `R ≈ 1`: pressure parity.
- `R > 1`: supportive pressure exceeds current antagonist pressure.

An infinite displayed ratio occurs when MAS is effectively zero while IM remains positive. This does **not** mean infinite market strength. It means the antagonist denominator has collapsed.

Internal modeling must bound or otherwise robustly handle the zero-denominator case so infinity cannot destabilize probability or calibration logic.

Preferred display language:

`∞ (MAS≈0)`

rather than an unexplained infinity.

## Transition semantics

Transition Probability is meaningful only while a signal is confronting opposing macro pressure.

If macro direction is already aligned with the signal, do not display `100% Transition` as though it were a future forecast. Use a semantic state such as:

`ALREADY ALIGNED`

and treat future transition probability / required IM as not applicable.

## Learned threshold

The required supportive pressure should be estimated from historical transition outcomes:

`Required IM = R* × MAS`

where `R*` is a pair/timeframe-specific empirically learned transition threshold.

A parity threshold of 1.0 is only a fallback when history is inadequate. Do not represent it as a learned value.

## Dynamics

MAS and IM must not be treated only as static values. Track:

- MAS ROC
- IM ROC
- Ratio ROC

These distinguish a stable opposition state from antagonist deterioration or acceleration.

## Regimes

Current regime vocabulary includes:

- `TREND ALIGNED`
- `TRANSITION`
- `CHALLENGE`
- `ANTAGONIST DETERIORATING`
- `ANTAGONIST ACCELERATING`
- `REVERSION PRESSURE`
- `NEUTRAL`

---

# 6. Event Angle, event power, and convexity

Event Angle is a separate factor from MAS/IM structural resistance.

Do not collapse these prematurely into a single arbitrary ratio such as `EVENT_ANGLE/MAS`.

Use event-to-event log-price velocity normalized against the pair/timeframe's historical event velocities.

Conceptually:

`v_event = log(P1/P0) / elapsed_hours`

`EventAngleZ = (v_event - mean(history)) / stdev(history)`

A display angle may be derived from normalized velocity, but the invariant quantity is the normalized event power, not a raw price-per-bar angle.

Convexity measures whether event power is accelerating or decelerating.

Transition interpretation should consider both:

1. structural resistance/support (`MAS`, `IM`, `IM/MAS`, dynamics), and
2. event power (`EventAngleZ`, convexity).

---

# 7. Evaluation facility

## CURRENT table intent

The Evaluation facility should expose the decision-relevant analytical state across all 28 pairs.

Current canonical columns include:

`Pair · Signal TF · Signal · MAS · IM · IM/MAS · MAS ROC · IM ROC · Ratio ROC · Event Angle Z · Convexity · R² · F · Significance (p) · Pips/Hr · Required IM · Transition P/State · Regime`

Do not silently convert `IM/MAS` into `IM_Z/MAS_Z`.

Do not fabricate slope histories or synthetic denominator series when live/history data are insufficient. Show unavailable/insufficient-history state instead.

## Four-card rotator

The four-card selector divides candidates into structural categories such as BUY/SELL and trend-following/reversion/transition states.

It must not rank solely by `IM/MAS` magnitude. An infinite ratio caused by MAS≈0 can be less economically important than a finite but high ratio with much stronger absolute IM, Event Angle Z, fit, and transition evidence.

When a card rotates from one pair to another, the Mentor should explain why.

---

# 8. New factor research — time series accountability to HTL Asset

## EXPERIMENT / REQUIRED research direction

The user wants the raw time series itself held accountable to the HTL Asset using correlation and/or elasticity, while explicitly recognizing regime instability, chop, news spikes, low volume, and low liquidity.

This factor family should be tested for incremental information rather than added merely because more factors sound sophisticated.

### Candidate factor 1 — HTL correlation

Prefer correlation on stationary transformations rather than raw price levels.

Candidate forms:

- rolling Pearson correlation between log returns and HTL Asset changes,
- rolling Spearman correlation for robustness to outliers/nonlinearity,
- partial correlation controlling for broad USD/JPY/base-currency effects where appropriate.

Do not use high raw-level correlation as proof of predictive relationship; nonstationary price levels can create spurious correlation.

### Candidate factor 2 — HTL elasticity

Candidate definition:

`elasticity = beta from regression of Δlog(price) on Δlog(HTL Asset representation)`

or an equivalent standardized local beta when the HTL construct can cross zero or is not naturally log-scaled.

Interpretation:

- magnitude: sensitivity of price to HTL movement,
- sign: aligned/inverse response,
- stability: whether the relationship survives rolling windows and event regimes.

### Candidate factor 3 — explanatory power

Track rolling `R²`, slope significance, and out-of-sample contribution. A factor should earn its place by increasing predictive/economic utility after costs, not merely in-sample fit.

### Volatility navigation

A little volatility is desirable because the platform must overcome spreads and produce movement. The goal is not zero volatility but **tradable volatility**.

Track at minimum:

- standard deviation / realized volatility,
- downside semideviation,
- upside semideviation where useful,
- ATR or normalized true range,
- volatility-of-volatility,
- event spike indicator.

Semideviation is particularly useful because adverse volatility and favorable volatility have different economic meaning relative to trade direction.

### Chop / regime quality

Candidate controls:

- efficiency ratio / directional persistence,
- Hurst-like persistence diagnostics,
- sign-change frequency,
- slope-fit deterioration,
- residual variance around the HTL/OLS path.

### Calendar/news-event mitigation

News spikes can dominate ordinary statistical relationships. Any model using correlation, elasticity, or volatility must distinguish scheduled-event regimes from ordinary flow.

Preferred treatment:

- maintain a calendar-event mask/window,
- classify pre-event / release / post-event regimes,
- avoid training ordinary-state elasticities on unflagged event spikes,
- separately measure whether event-spike behavior has useful conditional predictive structure.

Do not simply delete all high volatility: some of the best economic opportunity may be high-volatility but liquid/structured movement.

### Liquidity / low-volume mitigation

OANDA FX spot feeds do not provide centralized exchange volume. Treat candle/tick volume as activity proxy rather than true consolidated market volume.

Candidate gates should consider:

- spread widening,
- quote/update frequency,
- time-of-day/session,
- activity proxy,
- directional units available,
- abnormal slippage/fill behavior.

A factor that appears strong only in illiquid periods should be heavily discounted.

### Factor admission rule

New factors should be added incrementally and held accountable by ablation:

1. Baseline model.
2. Baseline + candidate factor.
3. Compare rolling-origin/out-of-sample net expectancy, drawdown, calibration, and stability.
4. Retain only if the candidate contributes reproducible incremental value.

The lesson from multi-factor institutional models is not “more factors are better”; it is that each additional factor must explain a distinct, stable part of the state.

---

# 9. Risk, SL/TP, and prop-firm readiness

## CURRENT finding

The platform contains stop-loss/take-profit trade-management capability for existing trades, but the certified automated market-entry payload was recently found not to guarantee that every automated entry is created with `stopLossOnFill` and `takeProfitOnFill`.

Therefore:

`Can manage SL/TP after entry` ≠ `Every automated entry is born protected`.

## REQUIRED production blocker

Before prop-firm deployment, ensure every automated position is protected according to the intended risk policy from the moment of entry or through a transactionally safe immediate protection sequence.

Risk controls must be suitable for prop-firm drawdown rules, not merely ordinary account survival.

Required risk concepts include:

- per-pair one-position rule,
- maximum exposure / units,
- margin-aware sizing,
- daily drawdown guard,
- maximum drawdown kill switch,
- VaR / Expected Shortfall where retained,
- broker-compliant stop loss and take profit,
- no hedging.

---

# 10. Bottom-line proof / prospectus evidence

## CURRENT strategic priority

The user is now concentrating on the **bottom line**. Advanced analytics earn their place by improving after-cost profitability, drawdown control, and reproducible evidence.

A sophisticated factor receives no credit merely for being mathematically interesting.

## Preregistered proof principle

The platform should automatically maintain a live success/economic proof surface based on actual OANDA outcomes.

Avoid repeatedly recomputed ordinary fixed-sample p-values as if optional stopping preserved their significance.

Preferred primary success-rate evidence is an **anytime-valid sequential e-process/e-value** for a preregistered null such as:

`H0: net win probability ≤ 0.50`

versus:

`H1: net win probability > 0.50`

Suggested evidence thresholds:

- e-value ≥ 20: 5% anytime-valid evidence boundary,
- e-value ≥ 100: 1% anytime-valid evidence boundary.

Require a minimum completed-trade sample before declaring the hypothesis established.

## Economic proof must accompany win-rate proof

Track at minimum:

- completed trades,
- wins / losses / flats,
- cumulative realized net P/L,
- profit factor,
- expectancy per trade,
- average winner,
- average loser,
- payoff ratio,
- maximum drawdown,
- start/end balance/NAV,
- financing,
- commission/fees,
- estimated spread/slippage cost where attributable,
- strategy/timeframe/configuration lineage,
- deterministic evidence hash chain over broker records.

A high win rate with negative expectancy is failure.

Use preregistered checkpoints such as 30/50/100/200 completed trades for prospectus-grade summaries.

Use language such as **pre-registered OANDA-derived live performance evidence**, not “proof of future profits.”

---

# 11. Nemotron and proactive Mentor

## CURRENT execution-orchestration boundary

Workers AI Nemotron is intended for selective decision orchestration, not indiscriminate AI calls.

Policy: invoke Nemotron only when there are multiple eligible **new-entry** candidates requiring adjudication.

Do not use Nemotron to create pairs, change direction, alter risk controls, resize positions outside certified rules, manage reversals, or change configuration.

Use constrained structured output and deterministic fallback when AI is unavailable/invalid/timed out.

Persist AI telemetry and expose status/model/latency/selection/fallback information.

## CURRENT Mentor behavior requirement

The user does not want a passive dashboard that only answers questions. The platform should act as a resident market instructor.

The Mentor should be aggressively forthcoming but analytically disciplined:

- explain what changed,
- explain why a card/pair rotated,
- distinguish mathematical anomalies from economic strength,
- identify deterioration/acceleration,
- teach the meaning of statistics in context,
- recommend posture and what to watch next,
- warn about regime/liquidity/news conditions,
- surface result notifications,
- sharpen the user's market awareness rather than merely output numbers.

Example style:

- “AUD/CHF’s infinite IM/MAS is denominator collapse, not infinite strength. CAD/CHF outranks it because absolute IM and Event Angle Z are materially stronger.”
- “This BUY remains trend aligned, but IM has deteriorated for several observations; continuation posture deserves less confidence if MAS reappears.”
- “This SELL is countertrend. MAS still dominates, but MAS is deteriorating while IM accelerates. This is a challenge, not yet a transition.”

The Mentor may advise and teach but does not independently obtain execution authority from prose.

## REQUIRED evolution

Build a headless 24/7 market-awareness sentinel in the Durable Object/cron path so material analytical changes can generate lessons/alerts even when the dashboard is closed.

Do not have Nemotron chatter every minute. Trigger narrative generation on material state changes.

---

# 12. Notifications and observability

Use the ledger as an evidentiary spine.

Relevant record classes include configuration, churn warnings, initialization/migrations, partial scans, OANDA transactions, AI decisions/fallbacks, Mentor alerts, order fills/rejections, position closes, reversal retries/resolution, and runtime errors.

Notifications should be event-driven and material.

Existing alert infrastructure may include Twilio SMS and other configured channels. Do not claim a notification channel is live unless deployment secrets/bindings confirm it.

---

# 13. UI / interaction conventions

The platform is often used on desktop and tablet/mobile browsers. Maintain dense, forensic, high-information layouts without forcing unnecessary navigation.

Core conventions:

- dark analytical UI,
- 28-pair sortable tables,
- keyboard row navigation where appropriate,
- color-coded BUY/SELL states,
- chart date/time axis,
- interactive zoom/indent/crosshair/maximize,
- schedule above chart where required,
- collapsible ledger,
- instrument name display distinct from instrument selector,
- do not show preemptive error/warning labels before an attempted action,
- do not display placeholder 404s or “reconnect” before a first connection attempt,
- all data should populate after successful connection.

Avoid “preemptive undermining prose coding.”

---

# 14. Data/statistics discipline

## Scale invariance

Never compare raw-price OLS slopes across pairs without normalization. JPY and non-JPY nominal price scales differ materially.

Use log-price and elapsed-time transformations where appropriate.

## Historical-data causality

No future event/candle information may leak into optimizer scoring, event construction, MAS/IM histories, or validation.

Use rolling-origin / causal validation.

## Missing data

Do not fabricate synthetic history to make a statistic look populated.

Unavailable data should remain unavailable and be explained.

## Multiple-testing awareness

As the factor count grows, guard against data-mining and false discovery. Preregister economically motivated candidate factors, use ablation, and evaluate out of sample.

---

# 15. Strategy / performance protected boundaries

Operational repairs must not casually change the registered analytical standard.

Protected areas include:

- `src/horizon-strategy-v1.js`
- `src/horizon-registered-performance.js`
- `source-code/`
- `test/fixtures/`

Changes to those areas require explicit analytical recertification rather than being smuggled into operational cleanup.

`npm run check` and registered/certified execution gates must remain green for production changes.

---

# 16. Deployment discipline

Do not equate a GitHub merge with a production deployment.

Before claiming production is updated, verify the actual Cloudflare Worker deployment/version.

Cloudflare Variables/Secrets are acceptable for persistent OANDA credentials.

The application should fail clearly when required secrets are absent, but avoid preemptive warnings before the user actually attempts the relevant operation.

A future control-plane authentication layer should protect configuration/trading controls; same-origin headers alone are not equivalent to authentication. Coordinate any fail-closed access-token requirement with secret provisioning before merge/deploy.

---

# 17. Commercialization / external claims

The project may later support:

- prop-firm qualification,
- investor/venture discussions,
- prospectus-like evidence packages,
- NFT-related commercialization.

Keep external claims evidence-based.

Do not promise that a statistical model guarantees profits, a prop challenge pass, or future returns.

Where an NFT or token is marketed with return/profit participation characteristics, flag the need for appropriate legal/securities review.

---

# 18. Manual requirement

The final CTE Compound Platform Manual must be more than a button glossary.

It should teach how to reason with the platform.

Required manual sections:

1. System architecture and live-data provenance.
2. HTL Asset geometry and event logic.
3. MAS/IM and hierarchy interpretation.
4. Event Angle, convexity, correlation/elasticity, volatility factors.
5. Four-card selector and ranking.
6. Evaluation table field-by-field interpretation.
7. Market Mentor language and posture guidance.
8. Configuration and optimizer behavior.
9. Execution, reversal, SL/TP, sizing, and risk controls.
10. Prop-firm guardrails.
11. Ledger, diagnostics, observability, and alerting.
12. Proof/e-process and performance evidence.
13. Common mathematical-but-misleading values such as infinity, zero Required IM, and already-aligned transition states.
14. Worked examples comparing real pair states.
15. Troubleshooting and production incident history.

---

# 19. How an assistant/agent should behave on this project

When handling CTE Compound work:

1. Prefer forensic diagnosis over superficial patching.
2. Inspect the repository/runtime before asserting implementation details.
3. Separate current behavior from desired behavior.
4. Treat live trading errors as production incidents with causal evidence.
5. Preserve broker/account/risk constraints.
6. Avoid synthetic/demo shortcuts.
7. Do not let mathematical sophistication substitute for after-cost economic proof.
8. Explain anomalies in trader language, not only formulas.
9. Proactively identify hidden semantic defects (e.g. `100% Transition` when already aligned).
10. Add regression tests for every repaired production defect.
11. Keep Mentor/AI advisory authority separate from certified execution authority.
12. Keep documentation synchronized with the actual runtime.
13. Update this skill when stable decisions change.

---

# 20. Current weekend tightening priorities

At the time of this catalog, the project is in final production-hardening mode.

Highest-priority remaining work:

1. Guarantee automated SL/TP protection consistent with prop-risk requirements.
2. Certify closure/reversal reason lineage and eliminate any unexplained ping-pong behavior.
3. Implement/complete immutable live profitability proof and hypothesis-test surface.
4. Run parent-span HTL configuration as a preregistered A/B experiment against the current optimized profile.
5. Add time-series accountability factors (correlation/elasticity) only after robust event/liquidity/volatility treatment and out-of-sample ablation.
6. Build the headless Mentor/Sentinel for proactive notifications with the dashboard closed.
7. Finalize production deployment verification and then stop redesigning during the evidence run.

The platform is considered successful only when the complete system demonstrates sustainable, after-cost, risk-contained profitability—not when individual components merely look statistically sophisticated.
