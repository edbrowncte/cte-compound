import { HtlEngine as CloseRetryEngine } from "./engine-close-retry.js";
import { credentials } from "./engine-base.js";
import { EXECUTION_CLOCK_SOURCE, executionClockCandle } from "./execution-candle-clock.js";
import {
  STRATEGY_ENGINE_VERSION,
  normalizeStrategyId,
  normalizeStrategySettings,
  strategyConfigHash,
} from "./horizon-strategy-v1.js";
import { REGISTERED_PERFORMANCE_VERSION } from "./horizon-registered-performance.js";
import { TIMEFRAMES } from "./horizon-platform-engine.js";

const API = "https://api-fxtrade.oanda.com";
export const SIGNAL_PROVENANCE_VERSION = "INDICATOR_SIGNAL_PROVENANCE@1.0.0";
export const EXECUTION_CLOCK_AUTHORITY_VERSION = "EXECUTION_CLOCK_AUTHORITY@1.0.0";
const SIGNAL_REGISTRY_LIMIT = 512;
const EARLY_CLOCK_PROBE_MAX_AGE_MS = 120_000;

function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function indicatorOnlyActive(state = {}) {
  if (state?.indicatorOnly?.enabled) return true;
  return Array.isArray(state?.indicatorOnlyTickets) && state.indicatorOnlyTickets.some(ticket => ticket?.enabled);
}

function effectiveTimeframe(state = {}) {
  const timeframe = String(state?.config?.timeframe || "").toUpperCase();
  return TIMEFRAMES.includes(timeframe) ? timeframe : "M15";
}

function canonicalIndicator(value) {
  try {
    return normalizeStrategyId(value);
  } catch {
    return value ? String(value).toUpperCase() : null;
  }
}

function canonicalSourceEventId(candidate, config, indicator, timeframe, signalTime) {
  const event = candidate?.event || {};
  if (!candidate?.IO) return event.id || null;
  const pair = candidate?.pair || null;
  const direction = Number(event.direction || 0);
  const rawSettings = candidate?.configuration?.settings;
  if (!pair || !timeframe || !indicator || !signalTime || !direction || !rawSettings) return event.id || null;
  try {
    const settings = normalizeStrategySettings(rawSettings);
    return `${STRATEGY_ENGINE_VERSION}:${strategyConfigHash(settings)}:${pair}:${timeframe}:${indicator}:${signalTime}:${direction}`;
  } catch {
    return event.id || null;
  }
}

export function buildSignalProvenance(candidate = {}, config = {}) {
  const event = candidate?.event || {};
  const pair = candidate?.pair || null;
  const timeframe = candidate?.IO?.timeframe || config?.timeframe || null;
  const indicator = canonicalIndicator(candidate?.IO?.indicator || config?.strategy || null);
  const directionValue = Number(event.direction || 0);
  const direction = directionValue > 0 ? "BUY" : directionValue < 0 ? "SELL" : null;
  const signalTime = event.startTime || event.crossingTime || null;
  const signalPrice = finiteNumber(event.openPrice);
  const executionEventId = event.id || null;
  const sourceEventId = canonicalSourceEventId(candidate, config, indicator, timeframe, signalTime);
  let configurationHash = null;
  try {
    if (candidate?.configuration?.settings) configurationHash = strategyConfigHash(normalizeStrategySettings(candidate.configuration.settings));
  } catch {
    configurationHash = null;
  }
  const sourceKind = String(executionEventId || "").startsWith("MTF:") ? "MTF_DECISION" : "INDICATOR_EVENT";
  const complete = Boolean(pair && timeframe && indicator && direction && signalTime && signalPrice !== null && sourceEventId && executionEventId);
  return {
    signalProvenanceVersion: SIGNAL_PROVENANCE_VERSION,
    pair,
    timeframe,
    indicator,
    direction,
    directionValue,
    signalTime,
    signalPrice,
    sourceEventId,
    executionEventId,
    sourceKind,
    sourcePriceBasis: "COMPLETED_SOURCE_CANDLE_CLOSE",
    fillPriceBasis: "OANDA_ORDER_FILL_PRICE_SEPARATE",
    configurationHash,
    strategyEngineVersion: event.strategyEngineVersion || STRATEGY_ENGINE_VERSION,
    performanceVersion: event.performanceVersion || REGISTERED_PERFORMANCE_VERSION,
    qualificationResult: event.qualificationResult || null,
    qualificationReason: event.qualificationReason || null,
    indicatorOnly: Boolean(candidate?.IO),
    indicatorOnlyTicket: candidate?.IO?.ticket ?? null,
    complete,
  };
}

export function registerSignalProvenance(state, provenance, now = new Date().toISOString()) {
  const record = {
    ...provenance,
    registeredAt: now,
    status: provenance?.complete ? "REGISTERED" : "INCOMPLETE",
  };
  const prior = Array.isArray(state.executionSignalRegistry) ? state.executionSignalRegistry : [];
  state.executionSignalRegistry = [...prior.filter(item => item?.executionEventId !== record.executionEventId), record].slice(-SIGNAL_REGISTRY_LIMIT);
  state.lastSignalProvenance = record;
  state.signalProvenanceVersion = SIGNAL_PROVENANCE_VERSION;
  return record;
}

export function executionClockProbeDue(state = {}, now = Date.now()) {
  if (indicatorOnlyActive(state)) return false;
  if (!state.executionClockCandle || !state.executionClockProbeAt || state.executionClockSource !== EXECUTION_CLOCK_SOURCE) return true;
  if (state.executionClockTimeframe && state.executionClockTimeframe !== effectiveTimeframe(state)) return true;
  const last = Date.parse(state.executionClockProbeAt);
  return !Number.isFinite(last) || now - last >= EARLY_CLOCK_PROBE_MAX_AGE_MS;
}

async function callOandaRead(path, token) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(API + path, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      redirect: "manual",
      cache: "no-store",
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw Object.assign(new Error(payload.errorMessage || payload.errorCode || `OANDA HTTP ${response.status}`), { status: response.status, payload });
    return payload;
  } catch (error) {
    if (controller.signal.aborted) throw Object.assign(new Error("OANDA execution clock request timed out"), { status: 504 });
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function resolveClockAccount(state, token, configured) {
  if (state.resolvedAccountId) return state.resolvedAccountId;
  const payload = await callOandaRead("/v3/accounts", token);
  const accounts = Array.isArray(payload.accounts) ? payload.accounts : [];
  const eligible = accounts.filter(account => {
    const id = String(account?.id || "");
    const tags = Array.isArray(account?.tags) ? account.tags.map(tag => String(tag).toUpperCase()) : [];
    const properties = String(JSON.stringify(account?.properties || {})).toUpperCase();
    return id.endsWith("-001") && !id.toUpperCase().includes("MT4") && !tags.some(tag => tag.includes("MT4")) && !properties.includes("MT4");
  });
  const exact = eligible.find(account => account.id === configured);
  const selected = exact || eligible[0];
  if (!selected?.id) throw new Error("Execution clock could not resolve an authorized non-MT4 -001 account");
  state.resolvedAccountId = selected.id;
  return selected.id;
}

async function earlyExecutionClockProbe(engine, state) {
  const timeframe = effectiveTimeframe(state);
  const { token, accountId: configured } = credentials(engine.env);
  const accountId = await resolveClockAccount(state, token, configured);
  const candle = await executionClockCandle(path => callOandaRead(path, token), accountId, timeframe);
  const probedAt = new Date().toISOString();
  state.executionClockSource = EXECUTION_CLOCK_SOURCE;
  state.executionClockCandle = candle;
  state.executionClockProbeAt = probedAt;
  state.executionClockTimeframe = timeframe;
  state.executionClockEarlyProbeAt = probedAt;
  state.executionClockEarlyProbeStatus = "PASS";
  state.executionClockEarlyProbeError = null;
  return { candle, probedAt, timeframe };
}

export class HtlEngine extends CloseRetryEngine {
  decisionContext(candidate, config) {
    return { ...super.decisionContext(candidate, config), ...buildSignalProvenance(candidate, config) };
  }

  async persistSignalRegistration(candidate, config, state) {
    const provenance = buildSignalProvenance(candidate, config);
    const record = registerSignalProvenance(state, provenance);
    await this.ctx.storage.put("state", state);
    await this.write({ type: "SIGNAL_PROVENANCE_REGISTERED", ...record, message: record.complete ? `${record.indicator} ${record.direction} source signal registered independently from any OANDA fill price` : "Signal provenance registration is incomplete" }, false);
    return record;
  }

  async execute(candidate, token, accountId, state) {
    const config = state?.config || {};
    await this.persistSignalRegistration(candidate, config, state);
    return super.execute(candidate, token, accountId, state);
  }

  async executeIndicatorOnlyUnits(candidate, token, accountId, state) {
    await this.persistSignalRegistration(candidate, {}, state);
    return super.executeIndicatorOnlyUnits(candidate, token, accountId, state);
  }

  async tick() {
    const state = (await this.ctx.storage.get("state")) || {};
    const ioActive = indicatorOnlyActive(state);
    const parentProbeBefore = state.executionClockProbeAt || null;
    let earlyProbeAt = null;

    state.executionClockAuthorityVersion = EXECUTION_CLOCK_AUTHORITY_VERSION;
    state.executionClockAuthorityEnteredAt = new Date().toISOString();

    if (!ioActive && executionClockProbeDue(state)) {
      try {
        const probe = await earlyExecutionClockProbe(this, state);
        earlyProbeAt = probe.probedAt;
      } catch (error) {
        state.executionClockEarlyProbeAt = new Date().toISOString();
        state.executionClockEarlyProbeStatus = "FAIL";
        state.executionClockEarlyProbeError = String(error?.message || error);
      }
    } else if (ioActive) {
      state.executionClockEarlyProbeStatus = "NOT_APPLICABLE_INDICATOR_ONLY";
      state.executionClockEarlyProbeError = null;
    }

    const parentMarker = state.executionClockProbeAt || parentProbeBefore;
    await this.ctx.storage.put("state", state);

    let result;
    try {
      result = await super.tick();
      return result;
    } finally {
      const after = (await this.ctx.storage.get("state")) || {};
      const afterProbe = after.executionClockProbeAt || null;
      const parentAdvanced = !ioActive && Boolean(afterProbe && afterProbe !== parentMarker);
      after.executionClockAuthorityVersion = EXECUTION_CLOCK_AUTHORITY_VERSION;
      after.executionClockAuthorityCheckedAt = new Date().toISOString();
      after.executionClockParentProbeBefore = parentMarker || null;
      after.executionClockParentProbeAfter = afterProbe;
      after.executionClockParentProbeObserved = ioActive ? null : parentAdvanced;
      after.executionClockEarlyProbeUsed = Boolean(earlyProbeAt);
      after.executionClockAuthorityState = ioActive ? "INDICATOR_ONLY" : after.executionClockCandle ? "OBSERVED" : "MISSING";
      await this.ctx.storage.put("state", after);
    }
  }

  async status() {
    const status = await super.status();
    const state = (await this.ctx.storage.get("state")) || {};
    return {
      ...status,
      signalProvenanceVersion: SIGNAL_PROVENANCE_VERSION,
      signalProvenanceRegistryCount: Array.isArray(state.executionSignalRegistry) ? state.executionSignalRegistry.length : 0,
      lastSignalProvenance: state.lastSignalProvenance || null,
      executionClockAuthorityVersion: EXECUTION_CLOCK_AUTHORITY_VERSION,
      executionClockAuthorityState: state.executionClockAuthorityState || null,
      executionClockTimeframe: state.executionClockTimeframe || null,
      executionClockEarlyProbeAt: state.executionClockEarlyProbeAt || null,
      executionClockEarlyProbeStatus: state.executionClockEarlyProbeStatus || null,
      executionClockEarlyProbeError: state.executionClockEarlyProbeError || null,
      executionClockParentProbeObserved: state.executionClockParentProbeObserved ?? null,
      executionClockParentProbeBefore: state.executionClockParentProbeBefore || null,
      executionClockParentProbeAfter: state.executionClockParentProbeAfter || null,
      executionClockAuthorityCheckedAt: state.executionClockAuthorityCheckedAt || null,
    };
  }
}

export const __signalProvenanceTest = Object.freeze({
  SIGNAL_PROVENANCE_VERSION,
  EXECUTION_CLOCK_AUTHORITY_VERSION,
  SIGNAL_REGISTRY_LIMIT,
  EARLY_CLOCK_PROBE_MAX_AGE_MS,
  indicatorOnlyActive,
  effectiveTimeframe,
  canonicalSourceEventId,
});
