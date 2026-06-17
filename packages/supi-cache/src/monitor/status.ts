// Footer status line formatting for cache health.

import type { CacheMonitorState } from "./state.ts";

/**
 * Format the compact footer status string for the stats line.
 *
 * - `TCH87%↑` — hit rate with trend arrow
 * - `TCH100%` — first turn (no trend)
 * - `undefined` — no cache data available (contribution suppressed)
 */
export function formatCacheStatus(state: CacheMonitorState): string | undefined {
  const latest = state.getLatestTurn();
  if (!latest) return undefined;

  // No cache data: unsupported provider or zero denominator
  if (!state.cacheSupported || latest.hitRate === undefined) {
    return undefined;
  }

  const previous = state.getPreviousTurn();
  let trend = "";

  if (previous?.hitRate !== undefined) {
    if (latest.hitRate > previous.hitRate) {
      trend = "↑";
    } else if (latest.hitRate < previous.hitRate) {
      trend = "↓";
    }
  }

  return `TCH${latest.hitRate}%${trend}`;
}
