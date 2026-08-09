import {
  STRATEGY_ENGINE_VERSION,
  DEFAULT_STRATEGY_SETTINGS,
  normalizeCandles,
  normalizeStrategySettings,
  buildIntegratedHtlAsset,
  buildDareSignals,
  buildDareNPackage,
  buildNaiPackage,
  buildIntegratedIIICore,
  buildCausalApexEvents,
  evaluateStrategyWindow,
  normalizeStrategyId,
  strategyConfigHash,
} from "./horizon-strategy-v1.js";

import {
  REGISTERED_PERFORMANCE_VERSION,
  buildRegisteredTrades,
  summarizeRegisteredTrades,
  evaluateRegisteredPerformance,
  registeredExportRows,
} from "./horizon-registered-performance.js";

import {
  VALIDATION,
  LENGTH_GRID,
  FILTER_GRID,
  STRATEGIES,
  ANALYTICAL_CERTIFICATION,
  OPTIMIZER_TTL_MS,
  PAIRS,
  TIMEFRAMES,
  candles,
  candlesForRange,
  currentEvent,
} from "./horizon-platform-engine.js";

export const RUNTIME_OPTIMIZER_VERSION = 7;
export const RUNTIME_OPTIMIZER_HISTORY_BARS = 5000;

export function currentRuntimeOptimizer(records){
  const now=Date.now();
  return Object.fromEntries(Object.entries(records||{}).filter(([,record])=>record?.version===RUNTIME_OPTIMIZER_VERSION&&record?.strategyEngineVersion===STRATEGY_ENGINE_VERSION&&now-Date.parse(record?.computedAt||record?.stamp||0)<OPTIMIZER_TTL_MS));
}

const responseError = (message, status = 400) => Object.assign(new Error(message), { status });

function token(env) {
  const value = String(env.OANDA_API_KEY || "").trim();
  if (value.length < 20) throw responseError("OANDA secrets unavailable.", 503);
  return value;
}

function scoreStats(stats) {
  return stats.trades >= 2 ? stats.net - (0.25 * stats.maxDrawdown) : -Infinity;
}

function entryFor(strategy, settings, stats) {
  const length = strategy === "DARE_N" ? settings.dareNLength :
                 strategy === "NAI" ? settings.naiLength :
                 strategy === "APEX" ? settings.apexLength :
                 settings.assetLength;
  const filter = strategy === "DARE_N" ? settings.dareNFilter :
                 strategy === "NAI" ? settings.naiFilter :
                 strategy === "APEX" ? settings.apexFilter :
                 0;
  return {
    length,
    filter,
    score: scoreStats(stats),
    trades: stats.trades,
    net: stats.net,
    maxDrawdown: stats.maxDrawdown,
    winRate: stats.trades ? stats.wins / stats.trades : 0,
    grossPerformance: stats,
    validation: VALIDATION,
    strategyEngineVersion: STRATEGY_ENGINE_VERSION
  };
}

export function settingsFromEntry(strategyInput, entry, baseSettings = DEFAULT_STRATEGY_SETTINGS) {
  const strategy = normalizeStrategyId(strategyInput);
  const settings = normalizeStrategySettings(baseSettings);
  const length = Math.max(3, Math.min(500, Math.trunc(Number(entry?.length) || 50)));
  const filter = Math.max(0, Math.min(10, Number(entry?.filter) || 0));
  if (strategy === "ASSET" || strategy === "DARE" || strategy === "COMBO") settings.assetLength = length;
  if (strategy === "DARE_N") {
    settings.dareNLength = length;
    settings.dareNFilter = filter;
  }
  if (strategy === "NAI") {
    settings.naiLength = length;
    settings.naiFilter = filter;
  }
  if (strategy === "APEX") {
    settings.apexLength = length;
    settings.apexFilter = filter;
  }
  return normalizeStrategySettings(settings);
}

export function fullSettings(engine, config, optimizer, pair, timeframe) {
  const record = optimizer?.[`${pair}|${timeframe}`];
  if (config.configurationSource === "OPTIMIZED" && record?.settings) return normalizeStrategySettings(record.settings);
  const effective = engine.pairConfig(config, optimizer, pair, timeframe);
  return settingsFromEntry(effective.strategy, effective.primary, DEFAULT_STRATEGY_SETTINGS);
}

export function optimizedOptimizeDataset(data, pair, timeframe = "UNSPECIFIED", baseSettings = DEFAULT_STRATEGY_SETTINGS) {
  const normalizedBase = normalizeStrategySettings(baseSettings);
  const candles = normalizeCandles(data);
  const best = {};

  // Precompute baseline htl (assetLength = 50)
  const htl_50 = buildIntegratedHtlAsset(candles, normalizedBase.assetLength);
  const dareSignals_50 = buildDareSignals(candles, htl_50);

  for (const strategy of STRATEGIES) {
    const lengths = strategy === "COMBO" ? [normalizedBase.assetLength] : LENGTH_GRID.filter(length => length * 3 < candles.length);
    const filters = FILTER_GRID[strategy];
    let selected = null;

    for (const length of lengths) {
      for (const filter of filters) {
        // Construct settings for this candidate
        const settings = {
          ...normalizedBase,
          assetLength: strategy === "ASSET" || strategy === "DARE" || strategy === "COMBO" ? length : normalizedBase.assetLength,
          dareNLength: strategy === "DARE_N" ? length : normalizedBase.dareNLength,
          dareNFilter: strategy === "DARE_N" ? filter : normalizedBase.dareNFilter,
          naiLength: strategy === "NAI" ? length : normalizedBase.naiLength,
          naiFilter: strategy === "NAI" ? filter : normalizedBase.naiFilter,
          apexLength: strategy === "APEX" ? length : normalizedBase.apexLength,
          apexFilter: strategy === "APEX" ? filter : normalizedBase.apexFilter,
        };

        let stats;
        if (strategy === "ASSET") {
          const htl = length === normalizedBase.assetLength ? htl_50 : buildIntegratedHtlAsset(candles, length);
          const trades = buildRegisteredTrades(candles, htl.signals, pair);
          stats = summarizeRegisteredTrades(trades);
        } else if (strategy === "DARE") {
          const htl = length === normalizedBase.assetLength ? htl_50 : buildIntegratedHtlAsset(candles, length);
          const dareSignals = length === normalizedBase.assetLength ? dareSignals_50 : buildDareSignals(candles, htl);
          const trades = buildRegisteredTrades(candles, dareSignals, pair);
          stats = summarizeRegisteredTrades(trades);
        } else if (strategy === "DARE_N") {
          const dareN = buildDareNPackage(htl_50, length, filter);
          const trades = buildRegisteredTrades(candles, dareN.events, pair);
          stats = summarizeRegisteredTrades(trades);
        } else if (strategy === "NAI") {
          const nai = buildNaiPackage(htl_50, length, filter);
          const trades = buildRegisteredTrades(candles, nai.events, pair);
          stats = summarizeRegisteredTrades(trades);
        } else if (strategy === "APEX") {
          const apexCore = buildIntegratedIIICore(candles, length);
          const apexEvents = buildCausalApexEvents(apexCore.zup, apexCore.puz, filter);
          const trades = buildRegisteredTrades(candles, apexEvents, pair);
          stats = summarizeRegisteredTrades(trades);
        } else if (strategy === "COMBO") {
          // COMBO uses normalizedBase entirely
          const result = evaluateRegisteredPerformance(candles, pair, normalizedBase);
          stats = result.strategies.COMBO.stats;
        }

        const candidate = {
          settings,
          entry: entryFor(strategy, settings, stats)
        };

        if (!selected || candidate.entry.score > selected.entry.score) {
          selected = candidate;
        }
      }
    }
    best[strategy] = selected;
  }

  const settings = {
    ...normalizedBase,
    assetLength: best.ASSET.settings.assetLength,
    dareNLength: best.DARE_N.settings.dareNLength,
    dareNFilter: best.DARE_N.settings.dareNFilter,
    naiLength: best.NAI.settings.naiLength,
    naiFilter: best.NAI.settings.naiFilter,
    apexLength: best.APEX.settings.apexLength,
    apexFilter: best.APEX.settings.apexFilter,
    csf: normalizedBase.csf
  };

  const finalResult = evaluateRegisteredPerformance(candles, pair, settings);
  const config = {};
  for (const strategy of STRATEGIES) {
    config[strategy] = {
      ...entryFor(strategy, settings, finalResult.strategies[strategy].stats),
      candidateLengths: [...LENGTH_GRID],
      candidateFilters: [...FILTER_GRID[strategy]]
    };
  }

  return {
    settings: normalizeStrategySettings(settings),
    config,
    grossPerformance: registeredExportRows(finalResult, pair, timeframe)
  };
}

export async function optimizedComputeConfiguration(engine, value = {}) {
  let stage = "validation";
  try {
    const pair = String(value.pair || "").toUpperCase();
    const timeframe = String(value.timeframe || "").toUpperCase();
    const startDate = String(value.startDate || "");
    const endDate = String(value.endDate || "");
    const hasDateRange = Boolean(startDate || endDate);
    if (!PAIRS.includes(pair)) throw responseError("Invalid Compute Configuration currency pair.");
    if (!TIMEFRAMES.includes(timeframe)) throw responseError("Invalid Compute Configuration timeframe.");
    if (hasDateRange && (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate))) {
      throw responseError("Both dates are required when an explicit range is supplied.");
    }
    stage = "credentials";
    const apiToken = token(engine.env);
    stage = "oanda-history";
    const data = hasDateRange ? await candlesForRange(pair, apiToken, timeframe, startDate, endDate) : await candles(pair, apiToken, timeframe, RUNTIME_OPTIMIZER_HISTORY_BARS);
    if (data.length < 150) throw responseError(`Insufficient completed candles for registered Horizon computation: ${data.length}.`);
    stage = "registered-horizon-optimization";
    const optimized = optimizedOptimizeDataset(data, pair, timeframe);
    const stamp = data.at(-1)?.time || new Date().toISOString();
    stage = "durable-storage";
    const records = (await engine.ctx.storage.get("optimizer")) || {};
    const key = `${pair}|${timeframe}`;
    const record = {
      version: RUNTIME_OPTIMIZER_VERSION,
      strategyEngineVersion: STRATEGY_ENGINE_VERSION,
      performanceVersion: REGISTERED_PERFORMANCE_VERSION,
      stamp,
      computedAt: new Date().toISOString(),
      source: "COMPUTE_CONFIGURATION",
      optimizerHistoryBars: RUNTIME_OPTIMIZER_HISTORY_BARS,
      validation: VALIDATION,
      analyticalCertification: ANALYTICAL_CERTIFICATION,
      range: {
        startDate: hasDateRange ? startDate : null,
        endDate: hasDateRange ? endDate : null,
        firstCandle: data[0]?.time || null,
        lastCandle: data.at(-1)?.time || null,
        bars: data.length
      },
      settings: optimized.settings,
      config: optimized.config,
      grossPerformance: optimized.grossPerformance,
      spreadAdjustedPerformance: { status: "SEPARATE_NOT_COMPUTED", rows: [] }
    };
    records[key] = record;
    await engine.ctx.storage.put("optimizer", records);
    return { key, record };
  } catch (error) {
    if (!error.stage) error.stage = stage;
    throw error;
  }
}

export async function optimizedOptimizeNext(engine, state, apiToken) {
  const total = PAIRS.length * TIMEFRAMES.length;
  const index = Number(state.optimizerCycleIndex || 0) % total;
  const pair = PAIRS[index % PAIRS.length];
  const timeframe = TIMEFRAMES[Math.floor(index / PAIRS.length)];
  const key = `${pair}|${timeframe}`;
  const records = (await engine.ctx.storage.get("optimizer")) || {};
  const existing = records[key];
  state.optimizerCycleIndex = (index + 1) % total;
  if (existing?.version === RUNTIME_OPTIMIZER_VERSION && existing?.strategyEngineVersion === STRATEGY_ENGINE_VERSION && existing?.source === "COMPUTE_CONFIGURATION" && Date.now() - Date.parse(existing.computedAt || 0) < OPTIMIZER_TTL_MS) {
    state.optimizerLastDataset = key;
    state.optimizerLastRun = new Date().toISOString();
    state.optimizerLastError = null;
    return { records: currentRuntimeOptimizer(records), key, record: existing };
  }
  const data = await candles(pair, apiToken, timeframe, RUNTIME_OPTIMIZER_HISTORY_BARS);
  const optimized = optimizedOptimizeDataset(data, pair, timeframe);
  const stamp = data.at(-1)?.time || new Date().toISOString();
  const record = {
    version: RUNTIME_OPTIMIZER_VERSION,
    strategyEngineVersion: STRATEGY_ENGINE_VERSION,
    performanceVersion: REGISTERED_PERFORMANCE_VERSION,
    stamp,
    computedAt: new Date().toISOString(),
    source: "SERVER",
    optimizerHistoryBars: RUNTIME_OPTIMIZER_HISTORY_BARS,
    validation: VALIDATION,
    analyticalCertification: ANALYTICAL_CERTIFICATION,
    range: {
      startDate: null,
      endDate: null,
      firstCandle: data[0]?.time || null,
      lastCandle: data.at(-1)?.time || null,
      bars: data.length
    },
    settings: optimized.settings,
    config: optimized.config,
    grossPerformance: optimized.grossPerformance,
    spreadAdjustedPerformance: { status: "SEPARATE_NOT_COMPUTED", rows: [] }
  };
  records[key] = record;
  await engine.ctx.storage.put("optimizer", records);
  state.optimizerLastDataset = key;
  state.optimizerLastRun = new Date().toISOString();
  state.optimizerLastError = null;
  return { records: currentRuntimeOptimizer(records), key, record };
}

export async function optimizedScan(engine, apiToken, config, timeframe = config.timeframe, optimizer = {}) {
  const rows = [];
  const errors = [];
  const concurrencyLimit = 4; // Fetch up to 4 pairs concurrently

  const queue = [...PAIRS];
  const workers = Array(concurrencyLimit).fill(null).map(async () => {
    while (queue.length > 0) {
      const pair = queue.shift();
      try {
        const settings = fullSettings(engine, config, optimizer, pair, timeframe);
        const data = await candles(pair, apiToken, timeframe);
        const event = currentEvent(data, pair, timeframe, config.strategy, settings);
        if (event) {
          rows.push({
            pair,
            event,
            configuration: {
              primary: engine.pairConfig(config, optimizer, pair, timeframe).primary,
              settings,
              strategyEngineVersion: STRATEGY_ENGINE_VERSION
            }
          });
        }
      } catch (error) {
        errors.push({ pair, error: String(error?.message || error) });
      }
    }
  });

  await Promise.all(workers);

  if (errors.length) {
    await engine.write({
      type: "SCAN_PARTIAL",
      timeframe,
      strategyEngineVersion: STRATEGY_ENGINE_VERSION,
      message: `${timeframe}: ${rows.length} pairs loaded, ${errors.length} failed`,
      failures: errors
    }, false);
  }
  return rows;
}
