export const STRATEGY_ENGINE_VERSION = "horizon-strategy-v1";
export const STRATEGY_IDS = Object.freeze(["ASSET", "DARE_N", "DARE", "COMBO", "NAI", "APEX"]);
export const CSF_METHODS = Object.freeze(["TWO_OPINIONS", "REGIME_TRIGGER", "CONFLICT_CONSENSUS"]);

export const DEFAULT_STRATEGY_SETTINGS = Object.freeze({
  assetLength: 50,
  dareNLength: 50,
  dareNFilter: 0,
  naiLength: 50,
  naiFilter: 0,
  apexLength: 20,
  apexFilter: 2,
  csf: Object.freeze({
    selected: Object.freeze(["DARE", "NAI"]),
    method: "TWO_OPINIONS",
    regime: "DARE",
    trigger: "NAI"
  })
});

const CSF_LABELS = Object.freeze({
  ASSET: "HTL Asset",
  DARE_N: "DARE(N)",
  DARE: "DARE",
  NAI: "NAI",
  APEX: "APEX"
});

const CSF_METHOD_LABELS = Object.freeze({
  TWO_OPINIONS: "Two Opinions",
  REGIME_TRIGGER: "Regime()–Trigger()",
  CONFLICT_CONSENSUS: "Conflict Consensus"
});

const TIMEFRAME_SECONDS = Object.freeze({
  S5: 5, S15: 15, S30: 30,
  M1: 60, M2: 120, M3: 180, M5: 300, M15: 900, M30: 1800,
  H1: 3600, H2: 7200, H4: 14400,
  D: 86400, W: 604800
});

export function timeframeSeconds(timeframe) {
  return TIMEFRAME_SECONDS[String(timeframe || "").toUpperCase()] || 60;
}

function boundedInteger(value, fallback, minimum, maximum) {
  const parsed = Math.trunc(Number(value));
  return Number.isFinite(parsed) ? Math.max(minimum, Math.min(maximum, parsed)) : fallback;
}

function boundedNumber(value, fallback, minimum, maximum) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(minimum, Math.min(maximum, parsed)) : fallback;
}

export function normalizeStrategyId(value) {
  const normalized = String(value || "").trim().toUpperCase().replace(/[\s/-]+/g, "_");
  const aliases = {
    HTL_ASSET: "ASSET",
    DARE_N_: "DARE_N",
    "DARE(N)": "DARE_N",
    COMBO_CSF: "COMBO",
    CSF: "COMBO"
  };
  const strategy = aliases[normalized] || normalized;
  if (!STRATEGY_IDS.includes(strategy)) throw new Error(`STRATEGY_NOT_ALLOWED:${value}`);
  return strategy;
}

function validateCsfConfig(input = DEFAULT_STRATEGY_SETTINGS.csf) {
  const selected = [...new Set((input.selected || DEFAULT_STRATEGY_SETTINGS.csf.selected).map(normalizeStrategyId))]
    .filter(strategy => strategy !== "COMBO");
  const method = String(input.method || DEFAULT_STRATEGY_SETTINGS.csf.method).toUpperCase();
  if (!CSF_METHODS.includes(method)) throw new Error("CSF_METHOD_NOT_ALLOWED");
  const regime = normalizeStrategyId(input.regime || DEFAULT_STRATEGY_SETTINGS.csf.regime);
  const trigger = normalizeStrategyId(input.trigger || DEFAULT_STRATEGY_SETTINGS.csf.trigger);
  if (regime === "COMBO" || trigger === "COMBO") throw new Error("CSF_RECURSION_NOT_ALLOWED");
  if (method === "TWO_OPINIONS" && selected.length !== 2) throw new Error("CSF_TWO_OPINIONS_REQUIRES_TWO_STRATEGIES");
  if (method === "REGIME_TRIGGER") {
    if (regime === trigger) throw new Error("CSF_REGIME_TRIGGER_MUST_DIFFER");
    if (!selected.includes(regime) || !selected.includes(trigger)) throw new Error("CSF_REGIME_TRIGGER_NOT_SELECTED");
  }
  if (method === "CONFLICT_CONSENSUS" && selected.length < 2) throw new Error("CSF_CONSENSUS_REQUIRES_TWO_STRATEGIES");
  return { selected, method, regime, trigger };
}

export function normalizeStrategySettings(input = {}) {
  return {
    assetLength: boundedInteger(input.assetLength, DEFAULT_STRATEGY_SETTINGS.assetLength, 3, 500),
    dareNLength: boundedInteger(input.dareNLength, DEFAULT_STRATEGY_SETTINGS.dareNLength, 3, 500),
    dareNFilter: boundedNumber(input.dareNFilter, DEFAULT_STRATEGY_SETTINGS.dareNFilter, 0, 10),
    naiLength: boundedInteger(input.naiLength, DEFAULT_STRATEGY_SETTINGS.naiLength, 3, 500),
    naiFilter: boundedNumber(input.naiFilter, DEFAULT_STRATEGY_SETTINGS.naiFilter, 0, 10),
    apexLength: boundedInteger(input.apexLength, DEFAULT_STRATEGY_SETTINGS.apexLength, 3, 500),
    apexFilter: boundedNumber(input.apexFilter, DEFAULT_STRATEGY_SETTINGS.apexFilter, 0, 10),
    csf: validateCsfConfig(input.csf || DEFAULT_STRATEGY_SETTINGS.csf)
  };
}

export function normalizeCandles(candles) {
  if (!Array.isArray(candles)) throw new Error("CANDLES_REQUIRED");
  return candles
    .filter(candle => candle?.complete !== false)
    .map((candle, index) => {
      const time = new Date(candle.time);
      const output = {
        index,
        time: time.toISOString(),
        open: Number(candle.open),
        high: Number(candle.high),
        low: Number(candle.low),
        close: Number(candle.close),
        complete: true
      };
      if (Number.isNaN(time.getTime()) || ![output.open, output.high, output.low, output.close].every(Number.isFinite)) {
        throw new Error(`INVALID_CANDLE:${index}`);
      }
      return output;
    })
    .sort((left, right) => left.time.localeCompare(right.time))
    .map((candle, index) => ({ ...candle, index }));
}

function htlMean(values) {
  const finite = values.filter(Number.isFinite);
  return finite.length ? finite.reduce((sum, value) => sum + value, 0) / finite.length : Number.NaN;
}

function htlPineAverage(values, length) {
  let total = 0;
  return values.map((value, index) => {
    total += value;
    if (index >= length) total -= values[index - length];
    return total / length;
  });
}

function htlRollingStdev(values, length) {
  const output = Array(values.length).fill(null);
  for (let index = length - 1; index < values.length; index++) {
    const windowValues = values.slice(index - length + 1, index + 1);
    if (windowValues.some(value => !Number.isFinite(value))) continue;
    const center = htlMean(windowValues);
    output[index] = Math.sqrt(htlMean(windowValues.map(value => (value - center) ** 2)));
  }
  return output;
}

function htlWma(values, length) {
  const output = Array(values.length).fill(null);
  const denominator = length * (length + 1) / 2;
  for (let index = length - 1; index < values.length; index++) {
    let weighted = 0;
    let valid = true;
    for (let offset = 0; offset < length; offset++) {
      const value = values[index - length + 1 + offset];
      if (!Number.isFinite(value)) { valid = false; break; }
      weighted += (offset + 1) * value;
    }
    if (valid) output[index] = weighted / denominator;
  }
  return output;
}

function htlAverageSeries(left, right) {
  return left.map((value, index) => Number.isFinite(value) && Number.isFinite(right[index]) ? (value + right[index]) / 2 : null);
}

function htlNormalizedDifference(left, right, deviation) {
  return left.map((value, index) => {
    const other = right[index];
    const sigma = deviation[index];
    return Number.isFinite(value) && Number.isFinite(other) && Number.isFinite(sigma) && sigma !== 0
      ? (value - other) / sigma
      : null;
  });
}

function htlRecoverInverse(zValues, deviation, center) {
  return zValues.map((value, index) => Number.isFinite(value) && Number.isFinite(deviation[index]) && Number.isFinite(center[index])
    ? (-value * deviation[index]) + center[index]
    : null);
}

function htlCrossDirection(left, right, index) {
  if (index < 1) return 0;
  const values = [left[index], right[index], left[index - 1], right[index - 1]];
  if (!values.every(Number.isFinite)) return 0;
  if (left[index] > right[index] && left[index - 1] <= right[index - 1]) return 1;
  if (left[index] < right[index] && left[index - 1] >= right[index - 1]) return -1;
  return 0;
}

export function buildIntegratedIIICore(rawCandles, length) {
  const data = rawCandles;
  const close = data.map(candle => candle.close);
  const high = data.map(candle => candle.high);
  const low = data.map(candle => candle.low);
  const average = htlPineAverage(close, length);
  const deviation = htlRollingStdev(close, length);
  const zero = deviation.map(sigma => Number.isFinite(sigma) && sigma !== 0 ? 0 : null);
  const u = zero.map((value, index) => Number.isFinite(value) && Number.isFinite(deviation[index]) ? (value * deviation[index]) + average[index] : null);
  const wmaU = htlWma(u, length);
  const zu = htlNormalizedDifference(u, wmaU, deviation);
  const i = htlRecoverInverse(zu, deviation, wmaU);
  const hl2 = high.map((value, index) => (value + low[index]) / 2);
  const mui = htlAverageSeries(i, u);
  const wmaMui = htlWma(mui, length);
  const zui = htlNormalizedDifference(mui, wmaMui, deviation);
  const iuz = zui.map(value => Number.isFinite(value) ? -value : null);
  const ui = htlRecoverInverse(zui, deviation, wmaMui);
  const uim = htlAverageSeries(mui, ui);
  const wmaUim = htlWma(uim, length);
  const zim = htlNormalizedDifference(uim, wmaUim, deviation);
  const uir = htlRecoverInverse(zim, deviation, wmaUim);
  const miu = htlAverageSeries(uim, uir);
  const wmaMiu = htlWma(miu, length);
  const zmiu = htlNormalizedDifference(miu, wmaMiu, deviation);
  const ia = zmiu.map((value, index) => Number.isFinite(value) && Number.isFinite(deviation[index]) && Number.isFinite(wmaMiu[index])
    ? ((value + 1) * deviation[index]) + wmaMiu[index]
    : null);
  const id = zmiu.map((value, index) => Number.isFinite(value) && Number.isFinite(deviation[index]) && Number.isFinite(wmaMiu[index])
    ? ((value - 1) * deviation[index]) + wmaMiu[index]
    : null);
  const up = htlAverageSeries(ia, id);
  const wmaUp = htlWma(up, length);
  const zup = htlNormalizedDifference(close, wmaUp, deviation);
  const puz = zup.map(value => Number.isFinite(value) ? -value : null);
  const upr = htlRecoverInverse(zup, deviation, wmaUp);
  return { average, deviation, wmaUp, hl2, mui, zui, iuz, ui, zu, zup, puz, upr };
}

export function buildIntegratedHtlAsset(data, length) {
  const series = buildIntegratedIIICore(data, length);
  const families = [[series.hl2, series.upr], [series.mui, series.ui], [series.zui, series.iuz]];
  const sourceCrosses = [];
  for (let index = 1; index < data.length; index++) {
    const directions = families.map(([left, right]) => htlCrossDirection(left, right, index)).filter(Boolean);
    const vote = directions.reduce((sum, direction) => sum + direction, 0);
    if (vote) sourceCrosses.push({ index, direction: Math.sign(vote) });
  }
  const anchors = [];
  let active = null;
  const finalize = (episode, endIndex, status) => {
    let price = episode.direction > 0 ? -Infinity : Infinity;
    let extremeIndex = episode.index;
    for (let index = episode.index; index <= endIndex; index++) {
      const value = episode.direction > 0 ? data[index].high : data[index].low;
      if ((episode.direction > 0 && value > price) || (episode.direction < 0 && value < price)) {
        price = value;
        extremeIndex = index;
      }
    }
    return { index: extremeIndex, price, direction: episode.direction, status };
  };
  sourceCrosses.forEach(event => {
    if (active && event.direction !== active.direction) {
      anchors.push(finalize(active, Math.max(active.index, event.index - 1), "FINAL"));
      active = event;
    } else if (!active) active = event;
  });
  if (active) anchors.push(finalize(active, data.length - 1, "PROVISIONAL"));
  anchors.sort((left, right) => left.index - right.index);
  const deduplicated = [];
  anchors.forEach(anchor => {
    const previous = deduplicated[deduplicated.length - 1];
    if (previous && previous.index === anchor.index) deduplicated[deduplicated.length - 1] = anchor;
    else deduplicated.push(anchor);
  });
  const asset = Array(data.length).fill(null);
  if (deduplicated.length) {
    for (let index = 0; index <= deduplicated[0].index; index++) asset[index] = deduplicated[0].price;
    for (let point = 1; point < deduplicated.length; point++) {
      const from = deduplicated[point - 1];
      const to = deduplicated[point];
      const span = Math.max(1, to.index - from.index);
      for (let index = from.index; index <= to.index; index++) {
        asset[index] = from.price + (to.price - from.price) * ((index - from.index) / span);
      }
    }
    const last = deduplicated[deduplicated.length - 1];
    for (let index = last.index; index < data.length; index++) asset[index] = last.price;
  }
  const assetMean = htlWma(asset, length);
  const inverseAsset = asset.map((value, index) => Number.isFinite(value) && Number.isFinite(assetMean[index]) ? (2 * assetMean[index]) - value : null);
  const meanAsset = asset.map((value, index) => Number.isFinite(value) && Number.isFinite(inverseAsset[index]) ? (value + inverseAsset[index]) / 2 : null);
  const meanCenter = htlWma(meanAsset, length);
  const meanInverse = meanAsset.map((value, index) => Number.isFinite(value) && Number.isFinite(meanCenter[index]) ? (2 * meanCenter[index]) - value : null);
  const signals = [];
  for (let index = 1; index < asset.length; index++) {
    const direction = htlCrossDirection(asset, inverseAsset, index);
    if (direction) signals.push({ signalIndex: index, direction });
  }
  return { asset, inverseAsset, assetMean, meanAsset, meanInverse, signals, anchors: deduplicated, series };
}

export function buildDareSignals(data, htl) {
  const signals = [];
  const mean = htl.meanAsset || [];
  const meanInverse = htl.meanInverse || [];
  for (let index = 1; index < Math.min(mean.length, meanInverse.length); index++) {
    const direction = htlCrossDirection(mean, meanInverse, index);
    if (!direction) continue;
    signals.push({
      signalIndex: index,
      sourceIndex: index,
      direction,
      source: direction > 0 ? "DARE BUY · Mean crossed above Mean Inverse" : "DARE SELL · Mean crossed below Mean Inverse"
    });
  }
  return signals;
}

export function qualifiedNaiDirection(assetNormalized, inverseNormalized, filter) {
  if (![assetNormalized, inverseNormalized, filter].every(Number.isFinite)) return 0;
  const spread = assetNormalized - inverseNormalized;
  if (spread > filter) return 1;
  if (spread < -filter) return -1;
  return 0;
}

export function buildNaiCrossoverEvents(assetValues, inverseValues, filter) {
  const events = [];
  let activeDirection = 0;
  for (let index = 0; index < Math.min(assetValues.length, inverseValues.length); index++) {
    const naiAsset = assetValues[index];
    const naiInverse = inverseValues[index];
    const direction = qualifiedNaiDirection(naiAsset, naiInverse, filter);
    if (!direction || direction === activeDirection) continue;
    const spread = naiAsset - naiInverse;
    events.push({
      sourceIndex: index,
      signalIndex: index,
      direction,
      score: naiAsset,
      naiAsset,
      naiInverse,
      spread,
      threshold: filter,
      source: direction > 0
        ? `NAI BUY · normalized Asset crossed above normalized Inverse · spread ${spread.toFixed(2)}`
        : `NAI SELL · normalized Asset crossed below normalized Inverse · spread ${spread.toFixed(2)}`
    });
    activeDirection = direction;
  }
  return events;
}

export function buildNaiPackage(htl, length, filter) {
  const assetCenter = htlWma(htl.asset, length);
  const inverseCenter = htlWma(htl.inverseAsset, length);
  const assetDeviation = htlRollingStdev(htl.asset, length);
  const inverseDeviation = htlRollingStdev(htl.inverseAsset, length);
  const assetNormalized = htlNormalizedDifference(htl.asset, assetCenter, assetDeviation);
  const inverseNormalized = htlNormalizedDifference(htl.inverseAsset, inverseCenter, inverseDeviation);
  return {
    series: { assetCenter, inverseCenter, assetDeviation, inverseDeviation, assetNormalized, inverseNormalized },
    events: buildNaiCrossoverEvents(assetNormalized, inverseNormalized, filter)
  };
}

export function buildDareNPackage(htl, length, filter) {
  const assetCenter = htlWma(htl.meanAsset, length);
  const inverseCenter = htlWma(htl.meanInverse, length);
  const assetDeviation = htlRollingStdev(htl.meanAsset, length);
  const inverseDeviation = htlRollingStdev(htl.meanInverse, length);
  const assetNormalized = htlNormalizedDifference(htl.meanAsset, assetCenter, assetDeviation);
  const inverseNormalized = htlNormalizedDifference(htl.meanInverse, inverseCenter, inverseDeviation);
  const events = buildNaiCrossoverEvents(assetNormalized, inverseNormalized, filter).map(event => ({
    ...event,
    dareNMean: event.naiAsset,
    dareNInverse: event.naiInverse,
    source: event.direction > 0
      ? `DARE(N) BUY · normalized Mean crossed above normalized Mean Inverse · spread ${event.spread.toFixed(2)}`
      : `DARE(N) SELL · normalized Mean crossed below normalized Mean Inverse · spread ${event.spread.toFixed(2)}`
  }));
  return { series: { assetCenter, inverseCenter, assetDeviation, inverseDeviation, assetNormalized, inverseNormalized }, events };
}

export function qualifiedApexDirection(zup, puz, filter) {
  if (![zup, puz, filter].every(Number.isFinite)) return 0;
  const sell = zup >= filter && puz <= -filter;
  const buy = zup <= -filter && puz >= filter;
  return sell === buy ? 0 : sell ? -1 : buy ? 1 : 0;
}

export function buildCausalApexEvents(zupValues, puzValues, filter) {
  const events = [];
  let activeDirection = 0;
  for (let index = 0; index < zupValues.length; index++) {
    const zup = zupValues[index];
    const puz = puzValues[index];
    if (![zup, puz].every(Number.isFinite)) continue;
    const direction = qualifiedApexDirection(zup, puz, filter);
    if (!direction || direction === activeDirection) continue;
    events.push({
      sourceIndex: index,
      signalIndex: index,
      direction,
      score: zup,
      zup,
      puz,
      threshold: filter,
      source: direction < 0
        ? `APEX SELL · zup ≥ ${filter.toFixed(1)} & puz ≤ −${filter.toFixed(1)}`
        : `APEX BUY · zup ≤ −${filter.toFixed(1)} & puz ≥ ${filter.toFixed(1)}`
    });
    activeDirection = direction;
  }
  return events;
}

function csfRetainedEventState(length, signals) {
  const events = new Map();
  signals.forEach(signal => {
    if (Number.isInteger(signal.signalIndex) && signal.signalIndex >= 0 && signal.signalIndex < length) events.set(signal.signalIndex, signal.direction);
  });
  const states = new Array(length).fill(0);
  let active = 0;
  for (let index = 0; index < length; index++) {
    if (events.has(index)) active = events.get(index);
    states[index] = active;
  }
  return states;
}

function csfRetainedRelationState(left, right, filter = 0) {
  const length = Math.min(left?.length || 0, right?.length || 0);
  const states = new Array(length).fill(0);
  let active = 0;
  for (let index = 0; index < length; index++) {
    if (![left[index], right[index]].every(Number.isFinite)) {
      states[index] = active;
      continue;
    }
    const spread = left[index] - right[index];
    if (spread > filter) active = 1;
    else if (spread < -filter) active = -1;
    states[index] = active;
  }
  return states;
}

function buildCsfCatalog(data, htl, dareN, dareNFilter, dareSignals, nai, naiFilter, apexEvents) {
  return {
    ASSET: { signals: htl.signals, states: csfRetainedRelationState(htl.asset, htl.inverseAsset) },
    DARE_N: { signals: dareN.events, states: csfRetainedRelationState(dareN.series.assetNormalized, dareN.series.inverseNormalized, dareNFilter) },
    DARE: { signals: dareSignals, states: csfRetainedRelationState(htl.meanAsset, htl.meanInverse) },
    NAI: { signals: nai.events, states: csfRetainedRelationState(nai.series.assetNormalized, nai.series.inverseNormalized, naiFilter) },
    APEX: { signals: apexEvents, states: csfRetainedEventState(data.length, apexEvents) }
  };
}

export function buildCsfPackage(data, catalog, configInput) {
  const config = validateCsfConfig(configInput);
  const length = data.length;
  const comboState = new Array(length).fill(0);
  const desiredState = new Array(length).fill(0);
  const conflicts = new Array(length).fill(false);
  const signals = [];
  const eventMaps = {};
  Object.entries(catalog).forEach(([key, value]) => { eventMaps[key] = new Map(value.signals.map(signal => [signal.signalIndex, signal.direction])); });
  let activeDirection = 0;
  for (let index = 0; index < length; index++) {
    let desired = 0;
    let conflict = false;
    const currentStates = Object.fromEntries(config.selected.map(key => [key, catalog[key]?.states[index] || 0]));
    if (config.method === "TWO_OPINIONS") {
      const [left, right] = config.selected;
      const leftState = currentStates[left];
      const rightState = currentStates[right];
      if (leftState && leftState === rightState) desired = leftState;
      else if (leftState && rightState && leftState !== rightState) conflict = true;
    } else if (config.method === "REGIME_TRIGGER") {
      const regimeState = catalog[config.regime]?.states[index] || 0;
      const triggerEvent = eventMaps[config.trigger]?.get(index) || 0;
      if (triggerEvent && triggerEvent === regimeState) desired = triggerEvent;
      else if (triggerEvent && regimeState && triggerEvent !== regimeState) conflict = true;
    } else {
      const buyVotes = Object.values(currentStates).filter(state => state > 0).length;
      const sellVotes = Object.values(currentStates).filter(state => state < 0).length;
      const required = Math.floor(config.selected.length / 2) + 1;
      if (buyVotes >= required) desired = 1;
      else if (sellVotes >= required) desired = -1;
      else if (buyVotes && sellVotes) conflict = true;
    }
    desiredState[index] = desired;
    conflicts[index] = conflict;
    if (desired && desired !== activeDirection) {
      const eventing = config.selected.filter(key => eventMaps[key]?.get(index) === desired);
      const confirmers = eventing.length ? eventing : config.selected.filter(key => currentStates[key] === desired);
      const methodLabel = CSF_METHOD_LABELS[config.method] || config.method;
      signals.push({
        signalIndex: index,
        sourceIndex: index,
        direction: desired,
        comboOrigins: confirmers,
        csfMethod: config.method,
        source: `COMBO ${desired > 0 ? "BUY" : "SELL"} · CSF ${methodLabel} · ${confirmers.map(key => CSF_LABELS[key]).join(" + ")}`
      });
      activeDirection = desired;
    }
    comboState[index] = activeDirection;
  }
  return { valid: true, config, catalog, signals, comboState, desiredState, conflicts };
}

function signDifference(left, right) {
  return ![left, right].every(Number.isFinite) ? 0 : left > right ? 1 : left < right ? -1 : 0;
}

function latestEvent(events) {
  return events.length ? events[events.length - 1] : null;
}

export function evaluateStrategyWindow(rawCandles, inputSettings = {}) {
  const candles = normalizeCandles(rawCandles);
  const settings = normalizeStrategySettings(inputSettings);
  if (!candles.length) throw new Error("NO_COMPLETED_CANDLES");
  const required = Math.max(settings.assetLength, settings.dareNLength, settings.naiLength, settings.apexLength) * 3;
  if (candles.length < required) throw new Error(`INSUFFICIENT_CANDLES:${candles.length}:${required}`);
  const htl = buildIntegratedHtlAsset(candles, settings.assetLength);
  const dareSignals = buildDareSignals(candles, htl);
  const dareN = buildDareNPackage(htl, settings.dareNLength, settings.dareNFilter);
  const nai = buildNaiPackage(htl, settings.naiLength, settings.naiFilter);
  const apexCore = buildIntegratedIIICore(candles, settings.apexLength);
  const apexEvents = buildCausalApexEvents(apexCore.zup, apexCore.puz, settings.apexFilter);
  const csfCatalog = buildCsfCatalog(candles, htl, dareN, settings.dareNFilter, dareSignals, nai, settings.naiFilter, apexEvents);
  const csf = buildCsfPackage(candles, csfCatalog, settings.csf);
  const index = candles.length - 1;
  const completedCandleTime = candles[index].time;
  const endpoints = {
    ASSET: {
      mode: "ENDPOINT_CROSS",
      relation: signDifference(htl.asset[index], htl.inverseAsset[index]),
      left: htl.asset[index], right: htl.inverseAsset[index]
    },
    DARE_N: {
      mode: "ENDPOINT_QUALIFIED",
      direction: qualifiedNaiDirection(dareN.series.assetNormalized[index], dareN.series.inverseNormalized[index], settings.dareNFilter),
      left: dareN.series.assetNormalized[index], right: dareN.series.inverseNormalized[index]
    },
    DARE: {
      mode: "ENDPOINT_CROSS",
      relation: signDifference(htl.meanAsset[index], htl.meanInverse[index]),
      left: htl.meanAsset[index], right: htl.meanInverse[index]
    },
    COMBO: {
      mode: "CSF_EVENT",
      activeDirection: csf.comboState[index] || 0,
      eventDirection: csf.signals.find(signal => signal.signalIndex === index)?.direction || 0,
      configSignature: `${settings.csf.method}:${settings.csf.selected.join("-")}:${settings.csf.regime}:${settings.csf.trigger}`
    },
    NAI: {
      mode: "ENDPOINT_QUALIFIED",
      direction: qualifiedNaiDirection(nai.series.assetNormalized[index], nai.series.inverseNormalized[index], settings.naiFilter),
      left: nai.series.assetNormalized[index], right: nai.series.inverseNormalized[index]
    },
    APEX: {
      mode: "LATEST_EVENT",
      latestEvent: (() => {
        const event = latestEvent(apexEvents);
        return event ? { ...event, sourceSignalTime: candles[event.signalIndex]?.time || null } : null;
      })()
    }
  };
  return { version: STRATEGY_ENGINE_VERSION, settings, candles, completedCandleTime, completedIndex: index, endpoints, diagnostics: { htl, dareSignals, dareN, nai, apexEvents, csf } };
}

function canonicalize(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalize(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}

export function stableHash(value) {
  const text = typeof value === "string" ? value : canonicalize(value);
  let left = 0x811c9dc5;
  let right = 0x9e3779b9;
  for (let index = 0; index < text.length; index++) {
    const code = text.charCodeAt(index);
    left ^= code;
    left = Math.imul(left, 0x01000193) >>> 0;
    right ^= code + index;
    right = Math.imul(right, 0x85ebca6b) >>> 0;
  }
  return `${left.toString(16).padStart(8, "0")}${right.toString(16).padStart(8, "0")}`;
}

export function strategyConfigHash(settings) {
  return stableHash(normalizeStrategySettings(settings));
}

function eventKey(context, strategy, sourceSignalTime, direction) {
  const canonical = [
    STRATEGY_ENGINE_VERSION,
    context.configRevision,
    context.instrument,
    context.timeframe,
    strategy,
    context.completedCandleTime,
    sourceSignalTime,
    direction,
    context.configHash
  ].join("|");
  return `${STRATEGY_ENGINE_VERSION}:${stableHash(canonical)}:${strategy}:${context.instrument}:${context.completedCandleTime}:${direction}`;
}

function baseState(context, endpoint) {
  return {
    version: STRATEGY_ENGINE_VERSION,
    configRevision: context.configRevision,
    configHash: context.configHash,
    lastCompletedCandleTime: context.completedCandleTime,
    endpoint
  };
}

export function observeStrategyEndpoint(previous, strategyInput, evaluation, contextInput) {
  const strategy = normalizeStrategyId(strategyInput);
  const endpoint = evaluation.endpoints[strategy];
  const context = {
    instrument: contextInput.instrument,
    timeframe: contextInput.timeframe,
    configRevision: Number(contextInput.configRevision || 0),
    configHash: contextInput.configHash || strategyConfigHash(evaluation.settings),
    completedCandleTime: evaluation.completedCandleTime,
    completedCandleCloseTime: contextInput.completedCandleCloseTime || new Date(new Date(evaluation.completedCandleTime).getTime() + timeframeSeconds(contextInput.timeframe) * 1000).toISOString()
  };
  const incompatible = !previous || previous.version !== STRATEGY_ENGINE_VERSION || previous.configRevision !== context.configRevision || previous.configHash !== context.configHash;
  if (incompatible) return { baseline: true, state: baseState(context, endpoint), candidate: null };
  if (context.completedCandleTime <= previous.lastCompletedCandleTime) return { baseline: false, state: previous, candidate: null };

  let direction = 0;
  let sourceSignalTime = context.completedCandleTime;
  if (endpoint.mode === "ENDPOINT_CROSS") {
    const priorRelation = Number(previous.endpoint?.relation || 0);
    if (priorRelation <= 0 && endpoint.relation > 0) direction = 1;
    else if (priorRelation >= 0 && endpoint.relation < 0) direction = -1;
  } else if (endpoint.mode === "ENDPOINT_QUALIFIED") {
    const priorDirection = Number(previous.endpoint?.activeDirection ?? previous.endpoint?.direction ?? 0);
    if (endpoint.direction && endpoint.direction !== priorDirection) direction = endpoint.direction;
    endpoint.activeDirection = endpoint.direction || priorDirection;
  } else if (endpoint.mode === "CSF_EVENT") {
    const priorDirection = Number(previous.endpoint?.activeDirection || 0);
    if (endpoint.eventDirection && endpoint.eventDirection !== priorDirection) direction = endpoint.eventDirection;
    endpoint.activeDirection = direction || priorDirection;
  } else if (endpoint.mode === "LATEST_EVENT") {
    const latest = endpoint.latestEvent;
    const previousEvent = previous.endpoint?.latestEvent || null;
    if (latest) {
      sourceSignalTime = latest.sourceSignalTime || context.completedCandleTime;
      const previousSource = previousEvent?.sourceSignalTime || "";
      if (!previousEvent || sourceSignalTime > previousSource || (sourceSignalTime === previousSource && latest.direction !== previousEvent.direction)) direction = latest.direction;
    }
  }

  const state = baseState(context, endpoint);
  if (!direction) return { baseline: false, state, candidate: null };
  const key = eventKey(context, strategy, sourceSignalTime, direction);
  return {
    baseline: false,
    state,
    candidate: {
      version: STRATEGY_ENGINE_VERSION,
      key,
      requestId: `hzn-${stableHash(key)}`,
      instrument: context.instrument,
      timeframe: context.timeframe,
      strategy,
      direction,
      signalTime: context.completedCandleTime,
      sourceSignalTime,
      candleCloseTime: context.completedCandleCloseTime,
      configRevision: context.configRevision,
      configHash: context.configHash
    }
  };
}

export function evaluateEnabledStrategies(previousByStrategy, enabledStrategies, evaluation, context) {
  const next = { ...(previousByStrategy || {}) };
  const candidates = [];
  const baselines = [];
  for (const strategyValue of enabledStrategies) {
    const strategy = normalizeStrategyId(strategyValue);
    const observation = observeStrategyEndpoint(next[strategy], strategy, evaluation, context);
    next[strategy] = observation.state;
    if (observation.baseline) baselines.push(strategy);
    if (observation.candidate) candidates.push(observation.candidate);
  }
  candidates.sort((left, right) => left.sourceSignalTime.localeCompare(right.sourceSignalTime) || left.strategy.localeCompare(right.strategy));
  return { strategyState: next, candidates, baselines };
}
