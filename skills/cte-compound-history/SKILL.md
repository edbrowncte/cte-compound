# CTE Compound — Aggregated Conversation History Skill

## Purpose

Use this skill when the user asks to recall, reconstruct, continue, audit, compare, explain, or preserve the **historical evolution** of the CTE trading/AI project from its earliest available conversations through the present CTE Compound production system.

This is an **aggregated historical reconstruction**, not a verbatim transcript of every message. It consolidates the available conversation record, uploaded/library artifacts, prior project decisions, code-review findings, and stable remembered milestones into a chronological institutional history. Where an exact date is not recoverable, the phase is labeled as approximate or undated rather than invented.

The operational/current specification lives in `skills/cte-compound/SKILL.md`. This history skill explains **how and why the current system came to exist**, including superseded designs, naming changes, failed paths, production incidents, and major conceptual breakthroughs.

Historical facts should be tagged mentally as one of:

- `ORIGIN`: earliest concept or naming lineage.
- `EVOLUTION`: later architectural or analytical development.
- `SUPERSEDED`: an approach that was replaced.
- `INCIDENT`: a failure or diagnostic discovery that materially changed the system.
- `CERTIFIED`: a change that became part of the production/repository contract.
- `OPEN`: an idea or requirement still under evaluation.

---

# 1. Earliest lineage — before CTE Compound

## ORIGIN — Summa FX / CTEFX / CTEAI / FXAICTE

The earliest remembered lineage began as a forex intelligence/trading concept under names including **Summa FX**, **CTEFX**, **CTEAI**, and **FXAICTE**.

The central ambition was never merely a chart indicator. The project repeatedly pushed toward a single AI market entity that could:

- ingest live market/account data,
- maintain internal state,
- reason about signals and performance,
- learn over time,
- make trading decisions,
- preserve an audit trail,
- and eventually operate with bounded autonomy.

Early designs explored a dual-agent or dual-cognition split. Earlier terms such as AIS/HIS were later replaced by **PA1 / PA2**, reflecting a desire to separate cognition from execution and reduce the risk that one monolithic agent would both invent and act without internal challenge.

The identity requirement evolved toward an AI entity called **FXAICTE**, with persistent state, confidence/belief tracking, hourly evolution, live perception, market action, and an internal token/economic layer.

This early identity layer is historically important even though the current production repository is CTE Compound rather than an FXAICTE-branded runtime.

---

# 2. April 2026 — CTEAI as vertically integrated market intelligence

## ORIGIN / EVOLUTION — 2026-04-24

The earliest retrieved business/architecture material describes **CTEAI** as an “Intelligence-as-a-Service” system whose core flow was:

`Data → Intelligence → Tokens → Decisions → UI → Revenue`

Key ideas already present:

- OANDA as the market-data source.
- Deterministic normalization/data conditioning.
- Statistical + machine-learning feature synthesis.
- Dual-LLM reasoning: one layer for signal interpretation and one for performance evaluation.
- Market State Tokens and Performance Tokens as an internal decision economy.
- Cloudflare-hosted UI and API surfaces.
- Institutional positioning, subscriptions, API access, performance fees, and eventual token-marketplace ideas.

The system was conceived as integrated rather than fragmented: data, reasoning, evaluation, internal economy, UI, and commercialization were meant to reinforce each other.

Early feature families included or anticipated:

- OLS / OLSm,
- z-score,
- standard deviation,
- mean,
- drift,
- Hurst/persistence,
- slope,
- ROI,
- R-squared matrices,
- account-state awareness,
- correlation and regime context.

The architecture contemplated Cloudflare Functions/Workers, schemas for market/performance state, environment-variable credentials, and later GPU/LLM inference.

---

# 3. May 2026 — EDB Cloudflare forex AI agent

## EVOLUTION — around 2026-05-10

A later retrieved stage was an **EDB Cloudflare Worker forex AI agent**.

Its stated objective was to:

- learn from OLS/OLSm/drift/z-score/engineering signals,
- communicate through in-app AI chat,
- run 24/7 by cron,
- log trades for audit,
- and execute disciplined forex trades.

At that stage the environment was still explicitly **demo-only**, with a 1% risk-per-trade concept and manual override required before production.

This period matters because it established several ideas that survived into later systems:

- persistent Cloudflare runtime,
- scheduled autonomous operation,
- in-app AI communication,
- trading audit/logging,
- eventual Vectorize/memory ambitions,
- and explicit risk constraints.

It was later superseded by the insistence that the production system use **live OANDA only**, not demo/practice/synthetic environments.

---

# 4. Spring 2026 — normalization, scale problems, and cross-pair comparability

## EVOLUTION

A recurring analytical problem was nominal-price scale distortion between JPY pairs and non-JPY pairs.

A key correction became **Corrected Inverted Log-OLS + Elasticity**:

- OLS on `log(close)`.
- Residual `r = log(close) - log(OLS)`.
- Residual z-score.
- ATR / true-range normalization by prior close.
- Elasticity metrics such as `elasticity(z_log50, price)`.

The purpose was to prevent a 90–210 JPY quote scale from dominating a 0.45–2.30 non-JPY quote scale.

Signal interpretations at that stage included:

- BUY when residual was unusually negative, price below log-OLS trend, with z-score evidence of downside exhaustion.
- SELL when residual was unusually positive, price above log-OLS trend, with upside-extension confirmation.

Additional statistical ambitions included:

- 8×8 base-currency R² correlation matrix,
- pair-level derived correlation statistic,
- ANOVA F-stat / p-value,
- cumulative probability strength ranking,
- forecast price derived from board statistics,
- multi-timeframe operation from seconds through weekly bars.

Many of these ideas later reappeared in more mature form inside HTL/MAS/IM and the Evaluation facility.

---

# 5. June–July 2026 — Criterion Tapestry Echelon becomes the governing identity

## EVOLUTION — 2026-06-30 onward

A major conceptual shift renamed/reframed the autonomous system as **Criterion Tapestry Echelon (CTE)**.

The retrieved Core Specification defined CTE as a **persistent autonomous agent**, not “a trading system with a personality skin.” Trading was one skill pack carried by the agent.

The name encoded three governing ideas:

- **Criterion** — every action is judged against a standard before execution.
- **Tapestry** — persistent accumulated memory/context.
- **Echelon** — tiered authority and earned autonomy.

Core principles included:

- persistent identity,
- earned authority,
- one non-delegable kill switch,
- full auditability,
- modular skills,
- bounded action authority,
- approval/oversight infrastructure.

This phase significantly influenced the later production emphasis on auditability, Durable Objects, explicit authority, and separation between analytical intelligence and execution rights.

---

# 6. Criterion repository / Cloudflare runtime period

## EVOLUTION / INCIDENT

The project moved into a Cloudflare-native runtime with concepts including:

- Worker `criterion`,
- Durable Object `CriterionPersona`,
- binding `CRITERION`,
- R2 / Vectorize / Workers AI integrations,
- live OANDA connectivity,
- persistent identity/state.

A production incident occurred during Workers AI degradation when live Worker fetches timed out. At that time, access limitations prevented some direct GitHub/CI execution.

A major architectural decision followed:

- freeze `/20` as legacy production/rollback,
- build `/21` as a selective clean-room reconstruction,
- stage as `criterion-next`,
- use read-only OANDA and execution-disabled staging,
- preserve Durable Object identity, bindings, migrations, routes, secrets, and stored memory during cutover.

This was an important lesson in **preserving runtime identity/state while replacing implementation underneath it**.

A related commercialization idea was to later extract a neutral reusable runtime/template into a separate repository, excluding production identity, credentials, market mandate, and protected IP.

---

# 7. July 2026 — III / Inverse Infinite analytical architecture

## EVOLUTION

The **III / Inverse Infinite** work greatly expanded the analytical field.

A forensic handbook documented:

- 23 price-domain series,
- 13 transform/response series,
- completed-bar OANDA ingestion,
- synchronized chart panels,
- algebraic recoveries/reflections,
- cumulative-agreement inference,
- strict anti-double-counting rules.

A key conclusion was that apparent complexity must not be mistaken for 36 independent votes. Many lines were algebraically related. The correct interpretation was a **connected geometry with distinct evidence families**, requiring de-duplication.

This anti-double-counting principle remains relevant to every later multi-factor expansion.

The III period also exposed UI/test discipline problems: a repository could contain click listeners and string-presence tests without proving the controls actually worked in-browser. This helped motivate later DOM/browser tests in CTE Compound.

---

# 8. July 2026 — IIE / APEX / strategy custody and forensic compliance

## EVOLUTION

The III work evolved into formal event/custody structures including IIE standards and APEX qualification.

Historical compliance artifacts tracked:

- event identifiers,
- pair/timeframe/length,
- direction,
- event start/end,
- actual high/low,
- MFE/MAE,
- maturity scores,
- crossing distance,
- custody direction,
- APEX threshold authority,
- multiple possible exit policies.

The APEX work reinforced a recurring project principle: **raw events may exist, but only qualified events should have authority**.

This distinction eventually matured into registered Horizon qualification and CTE Compound execution boundaries.

---

# 9. July 2026 — HTL Asset geometry and event forecasting

## EVOLUTION

The project shifted toward forecasting the **next HTL Asset Event**, not merely the next price.

Core event concepts included:

- Asset and Inverse crossings,
- event direction (BUY/SELL),
- event duration in bars,
- event high/low envelope,
- slope/mean/variance characteristics,
- event onset and completion,
- right-censoring for unfinished events,
- rolling-origin validation.

Terminology included:

- `AA` = above average,
- `BA` = below average.

Required definitions included:

- exact Asset formula,
- exact Inverse formula,
- crossing rule,
- hysteresis threshold,
- persistence rule,
- event start/termination,
- feature schema,
- prediction targets,
- treatment of incomplete events.

Validation metrics included:

- eligible completed events,
- Duration MAE,
- Envelope MAE,
- Onset Brier score,
- Historical Brier score,
- rolling-origin validation.

The user repeatedly insisted that `PROVISIONAL` labels be removed from the production-facing UI when they created clutter or misleading interpretation.

---

# 10. July 2026 — HTL Schedule UI

## EVOLUTION

The HTL Schedule became a major operating surface.

Key requirements accumulated:

- 28 currency pairs.
- Ten native OANDA timeframes.
- HTL length control.
- Account/currency/balance/NAV/margin available.
- Units available and units.
- BUY / SELL controls.
- Sortable columns.
- Keyboard row navigation.
- Color-coded BUY/SELL states.
- Schedule above chart.
- Interactive chart with zoom, indent, crosshair, maximize.
- Instrument name display distinct from instrument selector.
- Date/time x-axis.
- Indicators displayed on chart.
- Collapsible ledger.
- All data loaded after connection.

A recurring UI philosophy emerged:

- no preemptive failure prose,
- no `reconnect` before first connection,
- no `forbidden`/authorization warnings before an attempt,
- no placeholder HTTP 404 messages,
- minimal necessary connection flow.

This became the “no preemptive undermining prose coding” standard.

---

# 11. July 2026 — standalone HTML / Cloudflare Workers / OANDA connection debugging

## INCIDENT / EVOLUTION

CTE Horizon and CTE Compound were developed as standalone HTML/Worker applications.

Important production connection defects included:

- `/api/oanda/connect` returning 502,
- invalid `redirect` option values in fetch,
- browser showing reconnect/forbidden states before first connection,
- “Connected but no data,”
- stale/revoked prior Worker credentials,
- Worker/API proxy mismatch.

The diagnostic lesson was that **successful authentication and successful data flow are separate contracts**.

A minimal USD/JPY app was used as a known-good connection path, and that minimal OANDA connection logic was later ported into CTE Compound.

The user preferred two simple credential inputs during standalone experiments, but the later production architecture moved credentials into Worker Variables/Secrets.

---

# 12. July 2026 — six-strategy registered performance work

## EVOLUTION

The platform developed and compared six strategy families:

- HTL Asset / ASSET,
- DARE(N),
- DARE,
- COMBO,
- NAI,
- APEX.

Trade-ledger audits recorded exact trigger language, signal/entry/exit times, next-open execution semantics, MFE/MAE, net pips, and state/wait reasons.

Examples included:

- DARE Mean/Mean Inverse crossings,
- DARE(N) normalized Mean/Inverse crossings,
- NAI normalized Asset/Inverse crossings,
- APEX simultaneous zup/puz threshold events,
- COMBO “two opinions” logic,
- HTL Asset opposite-signal exits.

The registered-strategy work increasingly emphasized:

- causal event generation,
- next-open execution,
- duplicate-state suppression,
- gross vs spread-adjusted separation,
- reproducible performance snapshots.

This eventually became a protected analytical standard whose source files should not be modified casually by operational repairs.

---

# 13. Late July 2026 — one-minute-or-less trading focus

## EVOLUTION

The user explicitly framed the assistant as a **1-minute-or-less Forex Trading specialist** and supplied live chart screenshots for rapid trade selection.

This period increased emphasis on:

- immediate market posture,
- chart visibility,
- event timing,
- avoiding technically correct but ill-timed trades,
- recognizing continuation vs reversion zones,
- using the platform as an active market-awareness instrument rather than a static research dashboard.

This user experience expectation later fed directly into the Market Mentor requirement.

---

# 14. Late July / early August 2026 — CTE Horizon versus CTE Compound separation

## EVOLUTION

The project split more clearly into two related but distinct systems:

- **CTE Horizon** — causal/research-oriented analytical model and registered performance standard.
- **CTE Compound** — production/deployment platform with live OANDA execution, HTL/Compound geometry, browser UI, ledger, optimizer, diagnostics, and AI orchestration.

The user repeatedly insisted that CTE Compound not be silently replaced with unrelated temporary USD/JPY examples or generic Horizon behavior.

This separation remains important: research improvements may inform production, but production code must preserve certified boundaries.

---

# 15. 2026-08-04 — forensic line-upon-line CTE Compound review

## INCIDENT

A deep read-only repository audit determined that CTE Compound had become a **live, continuously scheduled, account-authorized trading system**, not merely a dashboard.

It contained:

- server-held OANDA credentials,
- minute cron,
- Durable Object execution,
- broker reconciliation,
- optimizer,
- Nemotron adjudication,
- transaction ingestion,
- durable ledger.

The audit also found serious defects at that point, including:

- browser manual BUY/SELL path mismatch,
- full directional `unitsAvailable` sizing without adequate repository-level risk budget,
- no guaranteed stop-loss/exposure/drawdown kill switch in that reviewed version,
- hard-coded armed state,
- account fallback risk,
- browser/engine parameter divergence,
- ledger lineage ambiguity,
- repaint-prone historical calculations,
- unsafe optimizer input trust.

Many of these findings triggered the intensive August remediation sequence.

---

# 16. Early August 2026 — performance paradox and forensic audit posture

## INCIDENT / EVOLUTION

A trading ledger showed roughly thirty-plus trades with balance maintained but very little net profit.

That result shifted attention from “the engine trades” to **why the engine fails to retain enough edge after execution**.

The user requested an intensive “Forensic Auditory discover/disclose” diagnostic spanning system height, width, depth, length, and breadth.

This reinforced the principle that a high trade count is not success. The platform must explain:

- entry quality,
- exit quality,
- spread/fees,
- reversal churn,
- MFE capture,
- MAE exposure,
- opportunity cost,
- account utilization,
- and strategy-state correctness.

---

# 17. 2026-08-06 to 2026-08-07 — production dormancy incident

## INCIDENT / CERTIFIED

Live trading became dormant.

Two confirmed causes were identified through direct ledger/status inspection:

1. A transposed digit in the `OANDA_ACCOUNT_ID` secret caused approximately eight hours of total dormancy on Aug 6.
2. Repeated `PUT /config` calls during debugging/deploy activity reset event/requirement/initialization state more than a dozen times in roughly thirty hours, preventing signals from being recognized as new.

The resulting remediation work established:

- `openPositions` for live position snapshots,
- caller IP/User-Agent attribution on configuration writes,
- 15-minute rolling config-churn warnings with notifications,
- truthful `reconciliationCadence: new-completed-candle-only`,
- regression tests for the incident conditions.

This became a canonical production lesson: **configuration is stateful and operationally consequential; changing it is not a harmless UI action**.

---

# 18. August 2026 — look-ahead and strategy inheritance defects

## INCIDENT / CERTIFIED

Additional diagnostic concerns included:

- historical optimizer scoring using future event information (look-ahead bias),
- confirmation strategy inheriting the primary strategy’s optimized length/filter,
- configuration changes not immediately clearing/reinitializing the right state.

These issues strengthened the repository’s causal-validation discipline and the requirement that strategy-specific configuration remain independent.

---

# 19. August 2026 — analytical display failures and localized frontend repair

## INCIDENT

Screenshots showed some UI compartments failing to open or display data.

The conclusion was that the core analytical engine remained present, while a localized frontend state/rendering defect prevented the display from surfacing it correctly.

This led to a principle used repeatedly afterward: **separate analytical failure from observability failure before changing the model**.

---

# 20. August 2026 — Nemotron integration evolves from concept to constrained orchestration

## EVOLUTION / CERTIFIED

The user asked whether Nemotron was actually integrated and wanted available AI capacity used deliberately rather than wasted.

The agreed pattern became:

**observable Nemotron decision orchestration, not indiscriminate AI calls.**

The final narrow role:

- only when there are multiple eligible **new-entry** candidates,
- never for reversals,
- never for a single obvious candidate,
- structured output constrained to the eligible candidate set,
- no authority to create instruments, alter direction, change sizing/risk, or modify configuration,
- deterministic fallback on missing binding, timeout, invalid output, or AI failure,
- telemetry persisted and shown in status/UI.

The public conversational/coprocessor surface was deliberately separated from the internal candidate-adjudication role.

---

# 21. August 2026 — MAS/IM z-score defect discovered

## INCIDENT

The user identified that the existing z-score formulation was fundamentally wrong for the intended **MAS statistic**.

An initial repair removed several defects:

- raw-price scale distortion,
- synthetic/pseudo-random history fabrication,
- per-frame z-score averaging,
- invalid `IM_Z / MAS_Z` labeling as IM/MAS,
- price-space recovery of dimensionless statistics.

A canonical shared browser/engine MAS/IM calculator was introduced.

However, handwritten notes then clarified that even this corrected z-score formulation was not the final intended construct.

---

# 22. August 2026 — MAS redefined as Measure of Antagonist Sentiment

## EVOLUTION / CERTIFIED

The handwritten specification established:

**MAS = Measure of Antagonist Sentiment**

**IM = Inverse Measure**

The insight was hierarchical:

- the signal exists inside progressively larger bars/timeframes,
- the higher timeframe supplies antagonist or supporting structural force,
- the same hierarchy should be read top-down for MAS and with reverse weighting for IM.

Timeframe ladder:

`S5 → S30 → M1 → M5 → M15 → M30 → H1 → H4 → D → W`

Examples:

- D uses `D → W`.
- H1 uses `H1 → H4 → D → W`.
- M15 uses `M15 → M30 → H1 → H4 → D → W`.
- S5 uses the full hierarchy through W.

Equal numerical lag across timeframes was rejected because one lag in W and one lag in M1 do not describe the same historical instant. Components must be synchronized by **actual timestamps**.

A scale-independent trend-power statistic was adopted conceptually:

`F = sign(beta) × tanh(|t|/3) × sqrt(R²)`

with log-price OLS slope per elapsed hour.

Every timeframe force is oriented to the HTL signal direction.

MAS measures weighted opposing force.

IM measures weighted supportive force using the reverse cadence.

---

# 23. August 2026 — IM/MAS pressure ratio and transition threshold

## EVOLUTION

The core pressure ratio became:

`R = IM / MAS`

Interpretation:

- below 1: antagonist dominates,
- near 1: parity,
- above 1: supportive pressure exceeds antagonist pressure.

The user’s key question was: **how much lower-timeframe force is required to alter a higher timeframe?**

This led to an empirical threshold:

`Required IM = R* × MAS`

where `R*` should be learned from historical pair/timeframe transition outcomes rather than hard-coded.

Static pressure was deemed insufficient, so the model also tracks:

- MAS ROC,
- IM ROC,
- Ratio ROC.

This distinguishes antagonist deterioration from antagonist acceleration.

---

# 24. August 2026 — Event Angle and convexity become a second independent factor family

## EVOLUTION

The handwritten notes distinguished two major dimensions:

1. structural pressure (`MAS`, `IM`, ratio),
2. event power (`Event Angle`, convexity).

Raw price-per-bar angle was rejected as scale/timeframe dependent.

The preferred form uses event-to-event log-price velocity normalized against historical event velocity:

`v_event = log(P1/P0) / elapsed_hours`

then a z-like event-power statistic and optional display angle.

Convexity measures whether event power is accelerating or deteriorating.

This allows distinctions such as:

- trend aligned,
- countertrend/reversion pressure,
- challenge,
- transition,
- antagonist deteriorating,
- antagonist accelerating.

---

# 25. August 2026 — MAS/IM v2 Evaluation surface

## CERTIFIED

The Evaluation facility evolved into a cross-pair structural table with fields including:

`Pair · Signal TF · Signal · MAS · IM · IM/MAS · MAS ROC · IM ROC · Ratio ROC · Event Angle Z · Convexity · R² · F · p · Pips/Hr · Required IM · Transition P/State · Regime`

The four-card rotator no longer treats every BUY/SELL as equivalent. It separates structural categories such as trend-following versus reversion/transition candidates.

A critical semantic lesson emerged from AUD/CHF and CAD/CHF examples:

- `IM/MAS = ∞` can simply mean MAS≈0, not infinite strength.
- A finite ratio with much stronger absolute IM and Event Angle can be economically superior to an infinite ratio.
- `100% Transition` is misleading when the macro is **already aligned**; the correct state is `ALREADY ALIGNED` rather than a future-transition forecast.

Preferred display language for denominator collapse:

`∞ (MAS≈0)`

---

# 26. August 2026 — proactive CTE Market Mentor

## EVOLUTION / REQUIRED

The user explicitly rejected a passive application that only answers questions when asked.

The desired platform behavior became:

- aggressively forthcoming,
- continuously teaching/tutoring,
- explaining pair/card rotations,
- sharpening market awareness,
- guiding posture,
- giving suggestions/recommendations,
- monitoring the user’s best interest,
- sending notifications of material results,
- distinguishing mathematical artifacts from economic meaning.

The Mentor should speak in trader-aware language such as:

- an infinite ratio is denominator collapse, not infinite strength,
- a pair rotated into Best BUY because of stronger absolute IM, Event Angle, and fit,
- a countertrend signal is a challenge rather than a confirmed transition,
- weakening MAS plus rising IM changes posture even before parity is crossed.

The Mentor may advise forcefully but must not gain execution authority merely because it generated prose.

A further required evolution is a **headless Market Awareness Sentinel** that can teach/notify from the Durable Object/cron path even when the browser is closed.

---

# 27. August 2026 — bottom-line turn: statistical sophistication must justify itself economically

## EVOLUTION

The user declared a strategic shift toward the **bottom line**.

The platform’s statistics, AI, event geometry, and Mentor are no longer judged primarily by elegance. They must improve:

- after-cost profitability,
- expectancy,
- profit factor,
- drawdown,
- risk containment,
- consistency,
- and reproducible evidence.

This reframed the project from feature accumulation toward proof.

---

# 28. August 2026 — preregistered live profitability proof

## OPEN / REQUIRED

A new requirement is an automatically updating hypothesis/evidence test for platform success, intended to support prospectus-grade proof.

The evidence design should be **preregistered before observing future outcomes**.

Because repeatedly checking an ordinary fixed-sample p-value invalidates its nominal level, the preferred success-rate evidence is an anytime-valid sequential **e-process / e-value**.

Example hypotheses:

`H0: net win probability ≤ 0.50`

`H1: net win probability > 0.50`

Illustrative evidence thresholds:

- e-value ≥ 20 for an anytime-valid 5% boundary,
- e-value ≥ 100 for an anytime-valid 1% boundary.

But win rate is not enough. The proof surface must also include:

- realized net P/L,
- profit factor,
- expectancy/trade,
- average winner/loser,
- payoff ratio,
- max drawdown,
- starting/ending balance/NAV,
- financing,
- commissions/fees,
- strategy/configuration lineage,
- deterministic hash-chain/evidence lineage over OANDA records.

Suggested reporting checkpoints include 30/50/100/200 completed trades.

External language should be “pre-registered OANDA-derived live performance evidence,” not “proof of future profits.”

---

# 29. August 2026 — parent-span HTL experiment

## OPEN / EXPERIMENT

The user proposed simplifying HTL Asset length selection by setting length approximately equal to the immediate higher-timeframe span.

Example mapping:

- M1→M5 = 5,
- M5→M15 = 3,
- H1→H4 = 4,
- H4→D = 6,
- D→W = 5,
- with minimum-length approximations where exact span is 2.

The intuition is structurally coherent: HTL geometry would measure roughly one parent bar while MAS/IM judges the same nested hierarchy.

However, the experiment must be compared against the current optimized profile using rolling-origin/out-of-sample, after-cost performance and drawdown before it obtains live authority.

---

# 30. August 2026 — stop-loss/take-profit production gap

## INCIDENT / OPEN

A critical distinction was identified:

The platform can manage stop-loss and take-profit for existing trades, but the automated entry payload was found not to guarantee that every automated trade is born with `stopLossOnFill` and `takeProfitOnFill` protection.

Therefore:

`Can manage SL/TP after entry` does not imply `every automated entry is protected at creation`.

This is a production blocker before prop-firm deployment.

The system also needs explicit closure-reason certification to distinguish:

- signal reversal,
- stop loss,
- take profit,
- manual action,
- margin/risk closure,
- broker cause.

---

# 31. August 2026 — prop-firm / commercialization ambitions

## EVOLUTION / OPEN

The user described an intended post-hardening trajectory including:

- active production trading,
- prop-firm qualification,
- potential NFT commercialization,
- venture/investor approaches,
- prospectus-style evidence.

Velotrade qualification was discussed as a concrete target.

The operating lesson is to distinguish ambition from externally supportable claims. Timelines and qualification rules must be verified against the actual prop-firm rules, and commercialization claims must be based on auditable evidence.

If an NFT/token is marketed with profit participation or investment-return expectations, legal/securities review may be required.

---

# 32. August 2026 — factor-model expansion and “time series accountability”

## OPEN / EXPERIMENT

The user compared the platform’s expanding factor set to institutional/FOMC-style models that grew from a few factors to many more.

A new proposed factor family asks the **raw time series itself to be held accountable to HTL Asset**, using correlation and/or elasticity.

Potential components:

- rolling Pearson correlation of stationary transformations,
- rolling Spearman correlation for robustness,
- elasticity/local beta of price response to HTL movement,
- rolling R²,
- slope significance,
- standard deviation / realized volatility,
- downside semideviation,
- upside semideviation,
- ATR / normalized true range,
- volatility-of-volatility,
- event spike indicator,
- chop/persistence measures,
- spread/liquidity/activity gates.

The user explicitly recognized the difficulty posed by:

- choppy markets,
- news spikes,
- scheduled calendar events,
- low volume/activity,
- poor liquidity.

The design principle is **not to eliminate volatility**. Some volatility is needed to beat spreads and create profit opportunity. The goal is to distinguish **tradable structured volatility** from unstructured/adverse volatility.

News/event regimes should be explicitly masked/classified rather than mixed blindly into ordinary-state relationships.

OANDA FX “volume” is an activity proxy, not centralized exchange volume.

Every new factor must earn admission through ablation and rolling-origin/out-of-sample economic improvement. More factors are not automatically better.

---

# 33. Risk and execution philosophy through the entire project

## EVOLUTION

Risk controls changed substantially over time.

Earlier stages included:

- 1% risk-per-trade concepts,
- an 80% equity utilization cap,
- max five concurrent positions,
- $1 micro-profit harvesting ideas.

Later design moved toward an institutional risk engine with:

- dynamic unit sizing,
- per-pair position cap = 1,
- no hedging,
- VaR,
- Expected Shortfall,
- max-drawdown kill switch,
- portfolio position limits,
- OANDA-compliant SL/TP,
- margin-aware execution.

A recurring tension has been that some desired risk controls existed conceptually or in UI but were not always guaranteed in the certified automated entry path. Future work must verify execution code, not infer protection from UI controls or design prose.

---

# 34. Testing and forensic standards accumulated over time

## CERTIFIED philosophy

The project’s testing discipline hardened through repeated incidents.

Current lessons include:

- string-presence tests are not enough for interactive UI,
- browser/DOM behavior must be exercised,
- strategy performance must be causal,
- no future bars may influence historical optimizer scoring,
- missing data must not be silently fabricated,
- model/UI/runtime calculations must share canonical formulas where possible,
- every production defect should receive a regression test,
- GitHub merge does not prove Cloudflare deployment,
- connection success does not prove data success,
- status labels must describe actual runtime behavior.

Protected analytical areas require explicit recertification before modification.

---

# 35. Persistent user design preferences across the history

## CURRENT preference pattern

Throughout the project, the user has consistently preferred:

- forensic disclosure over vague assurances,
- live data over mock/demo placeholders,
- self-contained artifacts when possible,
- minimal unnecessary prose in production UI,
- dense analytical information,
- explicit evidence and diagnostics,
- automated operation after controls are trustworthy,
- AI that teaches rather than merely answers,
- one integrated platform rather than disconnected tools,
- precise BUY/SELL/HOLD/posture conclusions from complex internals,
- persistent context so the project does not lose its own history.

The user also repeatedly requests that merged/approved repository changes proceed without unnecessary repeated confirmation when the work is already clearly authorized.

---

# 36. Commercial/technical arc in one sentence

The project evolved from a **tokenized forex intelligence concept**, through **Cloudflare autonomous-agent experiments**, into **Criterion Tapestry Echelon with persistent identity and bounded authority**, then through **III/IIE/HTL analytical research**, into **CTE Horizon as the registered causal research standard** and **CTE Compound as the live OANDA production platform**, which is now being hardened around **MAS/IM structural pressure, Event Angle, Mentor guidance, certified execution, risk protection, and preregistered profitability evidence**.

---

# 37. How to use this historical catalog

When a future user message says things such as:

- “we already solved this,”
- “go back to the original geometry,”
- “what did we decide about Nemotron?”,
- “why did we remove that?”,
- “was this once demo-only?”,
- “what happened during the dormancy incident?”,
- “where did MAS come from?”,
- “what was the original AI architecture?”,
- “what did Horizon replace?”,
- “what should go in the manual/prospectus?”,

consult this skill together with `skills/cte-compound/SKILL.md` before answering or modifying production code.

If an old decision conflicts with the current operational skill, the current operational skill wins unless the user explicitly asks to restore/reconsider the historical approach.

---

# 38. Maintenance rule

This history is intended to be **append-only in meaning**.

Do not erase superseded phases just because they are no longer current. Mark them as superseded and add the later decision.

When new conversations materially change the project, update:

1. `skills/cte-compound/SKILL.md` for current requirements/behavior.
2. `skills/cte-compound-history/SKILL.md` for the historical chronology and rationale.

The purpose is to give future agents both **present truth** and **institutional memory**.
