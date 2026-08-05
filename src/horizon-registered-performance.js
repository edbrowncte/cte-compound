import {
  STRATEGY_ENGINE_VERSION,
  normalizeCandles,
  normalizeStrategySettings,
  evaluateStrategyWindow,
} from "./horizon-strategy-v1.js";

export const REGISTERED_PERFORMANCE_VERSION = "registered-horizon-performance-v1";
export const REGISTERED_HISTORY_BARS = 3000;
export const STRATEGY_LABELS = Object.freeze({
  ASSET: "HTL Asset",
  DARE_N: "DARE(N)",
  DARE: "DARE",
  COMBO: "COMBO",
  NAI: "NAI",
  APEX: "APEX",
});

export function pipScaleForPair(pair) {
  return String(pair || "").replaceAll("/", "_").endsWith("JPY") ? 100 : 10000;
}

function signalArrays(evaluation) {
  return {
    ASSET: evaluation.diagnostics.htl.signals,
    DARE_N: evaluation.diagnostics.dareN.events,
    DARE: evaluation.diagnostics.dareSignals,
    COMBO: evaluation.diagnostics.csf.signals,
    NAI: evaluation.diagnostics.nai.events,
    APEX: evaluation.diagnostics.apexEvents,
  };
}

function createTrade(candles, signal, nextSignal, pipScale) {
  const entryIndex = Number(signal.signalIndex) + 1;
  const exitIndex = Number(nextSignal.signalIndex) + 1;
  if (!Number.isInteger(entryIndex) || !Number.isInteger(exitIndex)) return null;
  if (entryIndex >= candles.length || exitIndex >= candles.length || exitIndex <= entryIndex) return null;
  const direction = Math.sign(Number(signal.direction));
  if (!direction) return null;
  const entry = candles[entryIndex].open;
  const exit = candles[exitIndex].open;
  const range = candles.slice(entryIndex, exitIndex);
  if (!range.length) return null;
  const net = (exit - entry) * direction * pipScale;
  const mfe = direction > 0
    ? (Math.max(...range.map(candle => candle.high)) - entry) * pipScale
    : (entry - Math.min(...range.map(candle => candle.low))) * pipScale;
  const mae = direction > 0
    ? (entry - Math.min(...range.map(candle => candle.low))) * pipScale
    : (Math.max(...range.map(candle => candle.high)) - entry) * pipScale;
  return {
    direction,
    signalIndex: signal.signalIndex,
    sourceIndex: signal.sourceIndex ?? signal.signalIndex,
    signalTime: candles[signal.signalIndex]?.time || null,
    entryIndex,
    exitIndex,
    entryTime: candles[entryIndex]?.time || null,
    exitTime: candles[exitIndex]?.time || null,
    entry,
    exit,
    net,
    mfe: Math.max(0, mfe),
    mae: Math.max(0, mae),
    holdingBars: Math.max(1, exitIndex - entryIndex),
    source: signal.source || null,
    audit: "OPPOSITE STRATEGY EVENT · NEXT OPEN",
  };
}

export function buildRegisteredTrades(candlesInput, signals, pair) {
  const candles = normalizeCandles(candlesInput);
  const pipScale = pipScaleForPair(pair);
  const trades = [];
  for (let index = 0; index < signals.length - 1; index += 1) {
    const trade = createTrade(candles, signals[index], signals[index + 1], pipScale);
    if (trade) trades.push(trade);
  }
  return trades;
}

export function summarizeRegisteredTrades(trades) {
  const wins = trades.filter(trade => trade.net > 0);
  const losses = trades.filter(trade => trade.net < 0);
  const flats = trades.filter(trade => trade.net === 0);
  const grossWinning = wins.reduce((sum, trade) => sum + trade.net, 0);
  const grossLosing = Math.abs(losses.reduce((sum, trade) => sum + trade.net, 0));
  const net = trades.reduce((sum, trade) => sum + trade.net, 0);
  const totalMfe = trades.reduce((sum, trade) => sum + trade.mfe, 0);
  const totalMae = trades.reduce((sum, trade) => sum + trade.mae, 0);
  let equity = 0;
  let peak = 0;
  let maxDrawdown = 0;
  let winStreak = 0;
  let lossStreak = 0;
  let longestWinningStreak = 0;
  let longestLosingStreak = 0;
  for (const trade of trades) {
    equity += trade.net;
    peak = Math.max(peak, equity);
    maxDrawdown = Math.max(maxDrawdown, peak - equity);
    if (trade.net > 0) {
      winStreak += 1;
      lossStreak = 0;
      longestWinningStreak = Math.max(longestWinningStreak, winStreak);
    } else if (trade.net < 0) {
      lossStreak += 1;
      winStreak = 0;
      longestLosingStreak = Math.max(longestLosingStreak, lossStreak);
    } else {
      winStreak = 0;
      lossStreak = 0;
    }
  }
  return {
    trades: trades.length,
    wins: wins.length,
    losses: losses.length,
    flats: flats.length,
    net,
    average: trades.length ? net / trades.length : Number.NaN,
    mfeMae: totalMae ? totalMfe / totalMae : totalMfe > 0 ? Infinity : Number.NaN,
    maxDrawdown,
    grossWinning,
    grossLosing,
    averageWin: wins.length ? grossWinning / wins.length : 0,
    averageLoss: losses.length ? grossLosing / losses.length : 0,
    largestWin: wins.length ? Math.max(...wins.map(trade => trade.net)) : 0,
    largestLoss: losses.length ? Math.abs(Math.min(...losses.map(trade => trade.net))) : 0,
    longestWinningStreak,
    longestLosingStreak,
    profitFactor: grossLosing ? grossWinning / grossLosing : grossWinning > 0 ? Infinity : Number.NaN,
    recoveryFactor: maxDrawdown ? net / maxDrawdown : net > 0 ? Infinity : Number.NaN,
  };
}

export function evaluateRegisteredPerformance(rawCandles, pair, inputSettings = {}) {
  const settings = normalizeStrategySettings(inputSettings);
  const evaluation = evaluateStrategyWindow(rawCandles, settings);
  const signals = signalArrays(evaluation);
  const strategies = {};
  for (const strategy of Object.keys(STRATEGY_LABELS)) {
    const trades = buildRegisteredTrades(evaluation.candles, signals[strategy], pair);
    strategies[strategy] = {
      strategy,
      label: STRATEGY_LABELS[strategy],
      signals: signals[strategy],
      trades,
      stats: summarizeRegisteredTrades(trades),
    };
  }
  return {
    strategyEngineVersion: STRATEGY_ENGINE_VERSION,
    performanceVersion: REGISTERED_PERFORMANCE_VERSION,
    historyBars: evaluation.candles.length,
    settings,
    completedCandleTime: evaluation.completedCandleTime,
    strategies,
    evaluation,
  };
}

export function registeredExportRows(result, pair, timeframe) {
  const pairLabel = String(pair).replace("_", " / ");
  const csf = result.settings.csf;
  return Object.values(result.strategies).map(item => {
    const stats = item.stats;
    return {
      Pair: pairLabel,
      Strategy: item.label,
      Timeframe: timeframe,
      Bars: result.historyBars,
      Trades: stats.trades,
      "W/L/Flat": `${stats.wins}/${stats.losses}/${stats.flats}`,
      "Win rate": stats.trades ? (stats.wins / stats.trades) * 100 : 0,
      "Net pips": stats.net,
      Avg: stats.average,
      "MFE/MAE": stats.mfeMae,
      "Max DD": stats.maxDrawdown,
      "Gross winning pips": stats.grossWinning,
      "Gross losing pips": stats.grossLosing,
      "Profit factor": stats.profitFactor,
      "Recovery factor": stats.recoveryFactor,
      "Asset length": result.settings.assetLength,
      "DARE(N) length": result.settings.dareNLength,
      "DARE(N) separation": result.settings.dareNFilter,
      "NAI length": result.settings.naiLength,
      "NAI separation": result.settings.naiFilter,
      "CSF method": csf.method === "REGIME_TRIGGER" ? "Regime()–Trigger()" : csf.method === "TWO_OPINIONS" ? "Two Opinions" : "Conflict Consensus",
      "CSF strategies": csf.selected.join(" + "),
      "CSF regime": csf.regime,
      "CSF trigger": csf.trigger,
      "APEX length": result.settings.apexLength,
      "APEX threshold": result.settings.apexFilter,
      "As of": result.completedCandleTime,
    };
  });
}
