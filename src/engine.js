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
}
