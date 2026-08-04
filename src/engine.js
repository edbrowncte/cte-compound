import { HtlEngine as HorizonEngine, __horizonTest } from "./engine-horizon-base.js";

export { __horizonTest };

export class HtlEngine extends HorizonEngine {
  async fetch(request) {
    const path = new URL(request.url).pathname;
    if (path === "/manual-trade-action" && request.method === "POST") {
      const entry = await request.json().catch(() => null);
      const allowed = new Set(["MANUAL_TRADE_CLOSE", "MANUAL_TRADE_MODIFY", "MANUAL_CANDIDATE_ORDER"]);
      if (!entry || !allowed.has(entry.type)) {
        return new Response(JSON.stringify({ error: "Invalid manual trade action." }), {
          status: 400,
          headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
        });
      }
      await this.write(entry, false);
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
      });
    }
    return super.fetch(request);
  }

  mtfCandidates(state, rows, lastCandle, fingerprint) {
    const byPair = new Map(
      rows
        .filter(row => row.event?.qualified !== false && row.event?.startTime === lastCandle)
        .map(row => [row.pair, row]),
    );
    const timeframes = ["W","D","H4","H1","M30","M15","M5","M1","S30","S5"];
    return [...byPair.values()].map(row => {
      let score = 0;
      let count = 0;
      for (const timeframe of timeframes) {
        const snapshot = state.mtf?.[timeframe];
        if (snapshot?.fingerprint !== fingerprint) continue;
        const direction = Number(snapshot.directions?.[row.pair] || 0);
        if (direction) {
          score += direction;
          count += 1;
        }
      }
      const consensus = Math.sign(score);
      if (!consensus || count < 3 || consensus !== row.event.direction) return null;
      return { ...row, confidence: Math.abs(score) / count, count };
    }).filter(Boolean).sort((left, right) => right.confidence - left.confidence || right.count - left.count);
  }
}
