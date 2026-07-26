import { describe, expect, it } from "vitest";
import { analyzeContextCapacity, createContextPressureSnapshot } from "../../src/capacity.ts";

describe("Context Pressure Snapshot capacity analysis", () => {
  it("uses the compaction reserve only when auto-compaction is enabled", () => {
    const capacity = analyzeContextCapacity({
      contextWindow: 100_000,
      usedTokens: 50_000,
      compactionEnabled: true,
      configuredReserveTokens: 16_000,
      compacted: true,
      approximationNote: null,
    });

    expect(capacity).toEqual({
      contextWindow: 100_000,
      usedTokens: 50_000,
      usagePercent: 50,
      compactionEnabled: true,
      reserveTokens: 16_000,
      headroomTokens: 34_000,
      pressurePercent: 59.5,
      compacted: true,
      approximationNote: null,
    });
  });

  it("uses the raw window as the active limit when auto-compaction is disabled", () => {
    const capacity = analyzeContextCapacity({
      contextWindow: 100_000,
      usedTokens: 50_000,
      compactionEnabled: false,
      configuredReserveTokens: 16_000,
      compacted: false,
      approximationNote: null,
    });

    expect(capacity.reserveTokens).toBe(0);
    expect(capacity.headroomTokens).toBe(50_000);
    expect(capacity.usagePercent).toBe(50);
    expect(capacity.pressurePercent).toBe(50);
  });

  it("preserves overflow pressure above 100 percent", () => {
    const capacity = analyzeContextCapacity({
      contextWindow: 100_000,
      usedTokens: 100_000,
      compactionEnabled: true,
      configuredReserveTokens: 16_000,
      compacted: false,
      approximationNote: null,
    });

    expect(capacity.headroomTokens).toBe(0);
    expect(capacity.usagePercent).toBe(100);
    expect(capacity.pressurePercent).toBe(119);
  });

  it("returns null for context-window-derived values while retaining estimated usage", () => {
    const capacity = analyzeContextCapacity({
      contextWindow: null,
      usedTokens: 1_234,
      compactionEnabled: true,
      configuredReserveTokens: 16_000,
      compacted: false,
      approximationNote: "Approximate (no usage data available)",
    });

    expect(capacity).toMatchObject({
      contextWindow: null,
      usedTokens: 1_234,
      usagePercent: null,
      reserveTokens: 16_000,
      headroomTokens: null,
      pressurePercent: null,
      approximationNote: "Approximate (no usage data available)",
    });
  });

  it("creates the constant-shape agent snapshot", () => {
    const capacity = analyzeContextCapacity({
      contextWindow: 100_000,
      usedTokens: 50_000,
      compactionEnabled: true,
      configuredReserveTokens: 16_000,
      compacted: true,
      approximationNote: null,
    });
    const snapshot = createContextPressureSnapshot("Test Model", capacity);

    expect(Object.keys(snapshot)).toEqual([
      "modelName",
      "contextWindow",
      "usedTokens",
      "usagePercent",
      "compactionEnabled",
      "reserveTokens",
      "headroomTokens",
      "pressurePercent",
      "compacted",
      "approximationNote",
    ]);
    expect(snapshot.modelName).toBe("Test Model");
    expect(snapshot.compacted).toBe(true);
  });
});
