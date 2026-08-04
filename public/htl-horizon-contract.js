(function installCteHorizonContract(root) {
  "use strict";

  const VERSION = "CTE_HORIZON_HTL_ASSET_CROSSING@1.0.0";

  const finite = Number.isFinite;
  const mean = values => values.length
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : 0;

  function average(values, length) {
    const size = Math.max(1, Math.trunc(Number(length) || 1));
    let total = 0;
    return values.map((value, index) => {
      total += value;
      if (index >= size) total -= values[index - size];
      return total / size;
    });
  }

  function stdev(values, length) {
    const size = Math.max(1, Math.trunc(Number(length) || 1));
    const output = Array(values.length).fill(null);
    if (values.length < size) return output;
    for (let index = size - 1; index < values.length; index += 1) {
      const window = values.slice(index - size + 1, index + 1);
      if (!window.every(finite)) continue;
      const center = mean(window);
      output[index] = Math.sqrt(mean(window.map(value => (value - center) ** 2)));
    }
    return output;
  }

  function wma(values, length) {
    const size = Math.max(1, Math.trunc(Number(length) || 1));
    const output = Array(values.length).fill(null);
    const denominator = size * (size + 1) / 2;
    for (let index = size - 1; index < values.length; index += 1) {
      const window = values.slice(index - size + 1, index + 1);
      if (!window.every(finite)) continue;
      output[index] = window.reduce(
        (sum, value, position) => sum + ((position + 1) * value),
        0,
      ) / denominator;
    }
    return output;
  }

  const pairAverage = (left, right) => left.map((value, index) =>
    finite(value) && finite(right[index]) ? (value + right[index]) / 2 : null,
  );

  const normalizedDifference = (left, right, deviation) => left.map((value, index) =>
    finite(value) && finite(right[index]) && finite(deviation[index]) && deviation[index] !== 0
      ? (value - right[index]) / deviation[index]
      : null,
  );

  const recoverInverse = (z, deviation, center) => z.map((value, index) =>
    finite(value) && finite(deviation[index]) && finite(center[index])
      ? (-value * deviation[index]) + center[index]
      : null,
  );

  function crossDirection(left, right, index) {
    if (index < 1) return 0;
    const values = [left[index], right[index], left[index - 1], right[index - 1]];
    if (!values.every(finite)) return 0;
    if (left[index] > right[index] && left[index - 1] <= right[index - 1]) return 1;
    if (left[index] < right[index] && left[index - 1] >= right[index - 1]) return -1;
    return 0;
  }

  function coreSeries(candles, length) {
    const close = candles.map(candle => Number(candle.close));
    const high = candles.map(candle => Number(candle.high));
    const low = candles.map(candle => Number(candle.low));
    const center = average(close, length);
    const deviation = stdev(close, length);
    const zero = deviation.map(value => finite(value) && value !== 0 ? 0 : null);
    const u = zero.map((value, index) =>
      finite(value) && finite(deviation[index]) ? (value * deviation[index]) + center[index] : null,
    );
    const wmaU = wma(u, length);
    const zu = normalizedDifference(u, wmaU, deviation);
    const i = recoverInverse(zu, deviation, wmaU);
    const hl2 = high.map((value, index) => (value + low[index]) / 2);
    const mui = pairAverage(i, u);
    const wmaMui = wma(mui, length);
    const zui = normalizedDifference(mui, wmaMui, deviation);
    const iuz = zui.map(value => finite(value) ? -value : null);
    const ui = recoverInverse(zui, deviation, wmaMui);
    const uim = pairAverage(mui, ui);
    const wmaUim = wma(uim, length);
    const zim = normalizedDifference(uim, wmaUim, deviation);
    const uir = recoverInverse(zim, deviation, wmaUim);
    const miu = pairAverage(uim, uir);
    const wmaMiu = wma(miu, length);
    const zmiu = normalizedDifference(miu, wmaMiu, deviation);
    const ia = zmiu.map((value, index) =>
      finite(value) && finite(deviation[index]) && finite(wmaMiu[index])
        ? ((value + 1) * deviation[index]) + wmaMiu[index]
        : null,
    );
    const id = zmiu.map((value, index) =>
      finite(value) && finite(deviation[index]) && finite(wmaMiu[index])
        ? ((value - 1) * deviation[index]) + wmaMiu[index]
        : null,
    );
    const up = pairAverage(ia, id);
    const wmaUp = wma(up, length);
    const zup = normalizedDifference(close, wmaUp, deviation);
    const upr = recoverInverse(zup, deviation, wmaUp);
    return {
      close,
      high,
      low,
      center,
      deviation,
      hl2,
      mui,
      zui,
      iuz,
      ui,
      zup,
      puz: zup.map(value => finite(value) ? -value : null),
      upr,
    };
  }

  function crossingStream(candles, series) {
    const families = [
      { key: "F_UPR", left: series.hl2, right: series.upr },
      { key: "MUI_UI", left: series.mui, right: series.ui },
      { key: "ZUI_IUZ", left: series.zui, right: series.iuz },
    ];
    const rawEvents = [];
    for (let index = 1; index < candles.length; index += 1) {
      for (const family of families) {
        const direction = crossDirection(family.left, family.right, index);
        if (!direction) continue;
        rawEvents.push({
          version: VERSION,
          index,
          time: candles[index].time,
          direction,
          family: family.key,
          left: family.left[index],
          right: family.right[index],
          price: series.hl2[index],
        });
      }
    }
    const grouped = new Map();
    for (const event of rawEvents) {
      if (!grouped.has(event.index)) grouped.set(event.index, []);
      grouped.get(event.index).push(event);
    }
    const events = [];
    const conflicts = [];
    for (const [index, signals] of grouped.entries()) {
      const vote = signals.reduce((sum, event) => sum + event.direction, 0);
      if (!vote) {
        conflicts.push({
          version: VERSION,
          index,
          time: candles[index].time,
          signals,
          status: "SIMULTANEOUS_DIRECTION_CONFLICT_NO_HTL_BOUNDARY",
        });
        continue;
      }
      const direction = Math.sign(vote);
      const agreeing = signals.filter(event => event.direction === direction);
      events.push({
        version: VERSION,
        index,
        time: candles[index].time,
        direction,
        vote,
        signals,
        families: agreeing.map(event => event.family),
        price: series.hl2[index],
      });
    }
    return { rawEvents, events, conflicts };
  }

  function extremaAsset(candles, stream) {
    const anchors = [];
    let active = null;
    const begin = event => ({ index: event.index, direction: event.direction });
    const finalize = (episode, endIndex, status) => {
      let price = episode.direction > 0 ? -Infinity : Infinity;
      let extremeIndex = episode.index;
      for (let index = episode.index; index <= endIndex; index += 1) {
        const value = episode.direction > 0 ? candles[index].high : candles[index].low;
        if ((episode.direction > 0 && value > price) || (episode.direction < 0 && value < price)) {
          price = value;
          extremeIndex = index;
        }
      }
      return {
        version: VERSION,
        index: extremeIndex,
        time: candles[extremeIndex]?.time || null,
        price,
        direction: episode.direction,
        kind: episode.direction > 0 ? "INSTRUMENT_HIGHEST_HIGH" : "INSTRUMENT_LOWEST_LOW",
        status,
        episodeStartIndex: episode.index,
      };
    };
    for (const event of stream.events) {
      if (active && event.direction !== active.direction) {
        anchors.push(finalize(active, Math.max(active.index, event.index - 1), "FINAL"));
        active = begin(event);
      } else if (!active) {
        active = begin(event);
      }
    }
    if (active) anchors.push(finalize(active, candles.length - 1, "PROVISIONAL"));
    anchors.sort((left, right) => left.index - right.index);
    const deduplicated = [];
    for (const anchor of anchors) {
      if (deduplicated.length && deduplicated.at(-1).index === anchor.index) {
        deduplicated[deduplicated.length - 1] = anchor;
      } else {
        deduplicated.push(anchor);
      }
    }
    const values = Array(candles.length).fill(null);
    if (deduplicated.length) {
      const first = deduplicated[0];
      for (let index = 0; index <= first.index; index += 1) values[index] = first.price;
      for (let position = 1; position < deduplicated.length; position += 1) {
        const from = deduplicated[position - 1];
        const to = deduplicated[position];
        const span = Math.max(1, to.index - from.index);
        for (let index = from.index; index <= to.index; index += 1) {
          const progress = (index - from.index) / span;
          values[index] = from.price + ((to.price - from.price) * progress);
        }
      }
      const last = deduplicated.at(-1);
      for (let index = last.index; index < candles.length; index += 1) values[index] = last.price;
    }
    return { anchors: deduplicated, values };
  }

  function assetCrossings(candles, asset, inverse) {
    const events = [];
    for (let index = 1; index < candles.length; index += 1) {
      const direction = crossDirection(asset, inverse, index);
      if (!direction) continue;
      events.push({
        version: VERSION,
        index,
        time: candles[index].time,
        direction,
        side: direction > 0 ? "BUY" : "SELL",
        priorAsset: asset[index - 1],
        priorInverse: inverse[index - 1],
        asset: asset[index],
        inverse: inverse[index],
        candleClose: candles[index].close,
      });
    }
    return events;
  }

  function sourceTotals(size, sourceEvents) {
    const output = Array(size).fill(0);
    let total = 0;
    let position = 0;
    for (let index = 0; index < size; index += 1) {
      while (position < sourceEvents.length && sourceEvents[position].index === index) {
        total += 1;
        position += 1;
      }
      output[index] = total;
    }
    return output;
  }

  function fnv1a(value) {
    let hash = 0x811c9dc5;
    const text = String(value);
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 0x01000193);
    }
    return (hash >>> 0).toString(16).padStart(8, "0");
  }

  function crossingIdentity({ pair, timeframe, strategy = "ASSET", length, filter = 0, crossing }) {
    if (!crossing) return null;
    const canonical = [
      VERSION,
      pair,
      timeframe,
      strategy,
      Number(length),
      Number(filter),
      crossing.time,
      crossing.direction,
      crossing.priorAsset,
      crossing.priorInverse,
      crossing.asset,
      crossing.inverse,
    ].join("|");
    return `${VERSION}:${fnv1a(canonical)}`;
  }

  function build(candles, length) {
    const normalizedLength = Math.max(3, Math.trunc(Number(length) || 50));
    const clean = (Array.isArray(candles) ? candles : []).map(candle => ({
      ...candle,
      open: Number(candle.open),
      high: Number(candle.high),
      low: Number(candle.low),
      close: Number(candle.close),
    })).filter(candle => candle.time && [candle.open, candle.high, candle.low, candle.close].every(finite));
    const series = coreSeries(clean, normalizedLength);
    const stream = crossingStream(clean, series);
    const assetResult = extremaAsset(clean, stream);
    const assetMean = wma(assetResult.values, normalizedLength);
    const assetDeviation = stdev(assetResult.values, normalizedLength);
    const assetZ = normalizedDifference(assetResult.values, assetMean, assetDeviation);
    const inverse = recoverInverse(assetZ, assetDeviation, assetMean);
    const crossings = assetCrossings(clean, assetResult.values, inverse);
    return {
      version: VERSION,
      length: normalizedLength,
      candles: clean,
      series,
      asset: assetResult.values,
      inverse,
      assetMean,
      assetDeviation,
      assetZ,
      anchors: assetResult.anchors,
      sourceCrosses: stream.events,
      rawSourceCrosses: stream.rawEvents,
      sourceConflicts: stream.conflicts,
      sourceTotal: sourceTotals(clean.length, stream.events),
      crossings,
      currentCrossing: crossings.at(-1) || null,
      latestCompletedCrossing: crossings.at(-1)?.index === clean.length - 1 ? crossings.at(-1) : null,
    };
  }

  const api = Object.freeze({
    VERSION,
    build,
    coreSeries,
    crossingStream,
    extremaAsset,
    crossDirection,
    assetCrossings,
    crossingIdentity,
    wma,
    stdev,
    normalizedDifference,
    recoverInverse,
  });

  root.CTE_HORIZON_HTL = api;
})(typeof globalThis !== "undefined" ? globalThis : self);
