import { describe, expect, it } from "vitest";
import {
  breakdownCauses,
  detectIdleRegressions,
  findHotspots,
} from "../../src/forensics/queries.ts";
import type { ForensicsFinding } from "../../src/forensics/types.ts";

function makeFinding(overrides: Partial<ForensicsFinding> = {}): ForensicsFinding {
  return {
    sessionId: "test-session",
    turnIndex: 1,
    previousRate: 80,
    currentRate: 10,
    drop: 70,
    cause: { type: "unknown" },
    toolsBefore: [],
    ...overrides,
  };
}

describe("findHotspots", () => {
  it("returns empty array when no findings", () => {
    expect(findHotspots([], 0)).toEqual([]);
  });

  it("sorts by drop descending", () => {
    const findings = [
      makeFinding({ drop: 30 }),
      makeFinding({ drop: 70 }),
      makeFinding({ drop: 50 }),
    ];
    const result = findHotspots(findings, 0);
    expect(result.map((f) => f.drop)).toEqual([70, 50, 30]);
  });

  it("filters by minDrop", () => {
    const findings = [
      makeFinding({ drop: 10 }),
      makeFinding({ drop: 30 }),
      makeFinding({ drop: 50 }),
    ];
    const result = findHotspots(findings, 25);
    expect(result).toHaveLength(2);
    expect(result.map((f) => f.drop)).toEqual([50, 30]);
  });
});

describe("breakdownCauses", () => {
  it("tallies all causes", () => {
    const findings = [
      makeFinding({ cause: { type: "compaction" } }),
      makeFinding({ cause: { type: "compaction" } }),
      makeFinding({ cause: { type: "prompt_change" } }),
      makeFinding({ cause: { type: "idle", idleGapMinutes: 10 } }),
      makeFinding({ cause: { type: "unknown" } }),
    ];
    const result = breakdownCauses(findings);
    expect(result).toEqual({
      compaction: 2,
      model_change: 0,
      prompt_change: 1,
      unknown: 1,
      idle: 1,
    });
  });
});

describe("detectIdleRegressions", () => {
  it("reclassifies unknown with gap >= threshold as idle", () => {
    const findings = [
      makeFinding({ cause: { type: "unknown" }, idleGapMinutes: 10 }),
      makeFinding({ cause: { type: "unknown" }, idleGapMinutes: 3 }),
    ];
    detectIdleRegressions(findings, 5);
    expect(findings[0].cause).toEqual({ type: "idle", idleGapMinutes: 10 });
    expect(findings[1].cause).toEqual({ type: "unknown" });
  });

  it("does not reclassify non-unknown causes", () => {
    const findings = [makeFinding({ cause: { type: "compaction" }, idleGapMinutes: 10 })];
    detectIdleRegressions(findings, 5);
    expect(findings[0].cause).toEqual({ type: "compaction" });
  });
});
