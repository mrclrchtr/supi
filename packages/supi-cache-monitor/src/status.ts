// Footer status line formatting for cache health.

import type { CacheMonitorState } from "./state.ts";

/**
 * Format the compact footer status string.
 *
 * - `cache: 87% ↑` — hit rate with trend arrow
 * - `cache: 0%` — first turn (no trend)
 * - `cache: —` — no cache data available
 */
export function formatCacheStatus(state: CacheMonitorState): string | undefined {
  const latest = state.getLatestTurn();
  if (!latest) return undefined;

  // No cache data: unsupported provider or zero denominator
  if (!state.cacheSupported || latest.hitRate === undefined) {
    return "cache: —";
  }

  const previous = state.getPreviousTurn();
  let trend = "";

  if (previous?.hitRate !== undefined) {
    if (latest.hitRate > previous.hitRate) {
      trend = " ↑";
    } else if (latest.hitRate < previous.hitRate) {
      trend = " ↓";
    }
  }

  return `cache: ${latest.hitRate}%${trend}`;
}
