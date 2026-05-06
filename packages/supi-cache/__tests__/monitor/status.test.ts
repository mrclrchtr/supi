import { describe, expect, it } from "vitest";
import { CacheMonitorState } from "../../src/monitor/state.ts";
import { formatCacheStatus } from "../../src/monitor/status.ts";

describe("formatCacheStatus", () => {
  it("returns undefined when no turns recorded", () => {
    const state = new CacheMonitorState();
    expect(formatCacheStatus(state)).toBeUndefined();
  });

  it("shows hit rate without trend on first turn", () => {
    const state = new CacheMonitorState();
    state.recordTurn({ cacheRead: 8000, cacheWrite: 2000, input: 2000 }, 1000);
    expect(formatCacheStatus(state)).toBe("cache: 80%");
  });

  it("shows 0% on cold start", () => {
    const state = new CacheMonitorState();
    state.recordTurn({ cacheRead: 0, cacheWrite: 5000, input: 5000 }, 1000);
    expect(formatCacheStatus(state)).toBe("cache: 0%");
  });

  it("shows ↑ when hit rate increased", () => {
    const state = new CacheMonitorState();
    state.recordTurn({ cacheRead: 5000, cacheWrite: 2000, input: 5000 }, 1000);
    state.recordTurn({ cacheRead: 8000, cacheWrite: 0, input: 2000 }, 2000);
    expect(formatCacheStatus(state)).toBe("cache: 80% ↑");
  });

  it("shows ↓ when hit rate decreased", () => {
    const state = new CacheMonitorState();
    state.recordTurn({ cacheRead: 8000, cacheWrite: 0, input: 2000 }, 1000);
    state.recordTurn({ cacheRead: 5000, cacheWrite: 0, input: 5000 }, 2000);
    expect(formatCacheStatus(state)).toBe("cache: 50% ↓");
  });

  it("shows no trend arrow when hit rate unchanged", () => {
    const state = new CacheMonitorState();
    state.recordTurn({ cacheRead: 8000, cacheWrite: 0, input: 2000 }, 1000);
    state.recordTurn({ cacheRead: 8000, cacheWrite: 0, input: 2000 }, 2000);
    expect(formatCacheStatus(state)).toBe("cache: 80%");
  });

  it("shows — when cacheSupported is false", () => {
    const state = new CacheMonitorState();
    state.recordTurn({ cacheRead: 0, cacheWrite: 0, input: 5000 }, 1000);
    expect(state.cacheSupported).toBe(false);
    expect(formatCacheStatus(state)).toBe("cache: —");
  });

  it("shows — when current turn has undefined hitRate", () => {
    const state = new CacheMonitorState();
    state.recordTurn({ cacheRead: 8000, cacheWrite: 0, input: 2000 }, 1000);
    state.recordTurn({ cacheRead: 0, cacheWrite: 0, input: 0 }, 2000);
    expect(formatCacheStatus(state)).toBe("cache: —");
  });

  it("shows — when switching to a non-cache provider after cache-capable turn", () => {
    const state = new CacheMonitorState();
    // First turn: cache-capable (cacheSupported becomes true)
    state.recordTurn({ cacheRead: 8000, cacheWrite: 0, input: 2000 }, 1000);
    // Second turn: no cache metrics (cacheRead=0, cacheWrite=0, input>0)
    state.recordTurn({ cacheRead: 0, cacheWrite: 0, input: 5000 }, 2000);
    // Should show — not 0%, because this turn has no cache data
    expect(state.cacheSupported).toBe(true);
    expect(formatCacheStatus(state)).toBe("cache: —");
  });

  it("skips trend when previous turn has undefined hitRate", () => {
    const state = new CacheMonitorState();
    state.recordTurn({ cacheRead: 100, cacheWrite: 0, input: 100 }, 1000);
    state.recordTurn({ cacheRead: 0, cacheWrite: 0, input: 0 }, 2000);
    state.recordTurn({ cacheRead: 8000, cacheWrite: 0, input: 2000 }, 3000);
    // Previous is the undefined hitRate turn → no trend
    expect(formatCacheStatus(state)).toBe("cache: 80%");
  });
});
