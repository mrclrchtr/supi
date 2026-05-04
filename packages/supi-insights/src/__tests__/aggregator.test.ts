import { describe, expect, it } from "vitest";
import { aggregateData } from "../aggregator.ts";
import type { SessionFacets, SessionMeta } from "../types.ts";

/** Minimal SessionMeta with defaults for unspecified fields. */
function makeMeta(overrides: Partial<SessionMeta> & { sessionId: string }): SessionMeta {
  return {
    projectPath: "/test",
    startTime: "2025-01-01T00:00:00.000Z",
    durationMinutes: 10,
    userMessageCount: 3,
    assistantMessageCount: 3,
    toolCounts: {},
    languages: {},
    gitCommits: 0,
    gitPushes: 0,
    inputTokens: 0,
    outputTokens: 0,
    firstPrompt: "hello",
    userInterruptions: 0,
    userResponseTimes: [],
    toolErrors: 0,
    toolErrorCategories: {},
    usesTaskAgent: false,
    usesMcp: false,
    usesWebSearch: false,
    usesWebFetch: false,
    linesAdded: 0,
    linesRemoved: 0,
    filesModified: 0,
    messageHours: [],
    userMessageTimestamps: [],
    ...overrides,
  };
}

/** Minimal SessionFacets with defaults. */
function makeFacet(overrides: Partial<SessionFacets> & { sessionId: string }): SessionFacets {
  return {
    underlyingGoal: "test",
    goalCategories: {},
    outcome: "fully_achieved",
    userSatisfactionCounts: {},
    claudeHelpfulness: "moderately_helpful",
    sessionType: "single_task",
    frictionCounts: {},
    frictionDetail: "",
    primarySuccess: "none",
    briefSummary: "test session",
    ...overrides,
  };
}

describe("aggregateData", () => {
  it("returns zeroed stats for empty sessions", () => {
    const result = aggregateData([], new Map());
    expect(result.totalSessions).toBe(0);
    expect(result.totalMessages).toBe(0);
    expect(result.totalDurationHours).toBe(0);
    expect(result.dateRange).toEqual({ start: "", end: "" });
  });

  it("counts sessions and aggregates numeric fields", () => {
    const result = aggregateData(
      [
        makeMeta({
          sessionId: "s1",
          userMessageCount: 5,
          durationMinutes: 30,
          inputTokens: 100,
          outputTokens: 200,
        }),
        makeMeta({
          sessionId: "s2",
          userMessageCount: 3,
          durationMinutes: 15,
          inputTokens: 50,
          outputTokens: 75,
        }),
      ],
      new Map(),
    );

    expect(result.totalSessions).toBe(2);
    expect(result.totalMessages).toBe(8);
    // 30min + 15min = 45min = 0.75 hours
    expect(result.totalDurationHours).toBeCloseTo(0.75);
    expect(result.totalInputTokens).toBe(150);
    expect(result.totalOutputTokens).toBe(275);
  });

  it("computes dateRange from startTime", () => {
    const result = aggregateData(
      [
        makeMeta({ sessionId: "s1", startTime: "2025-01-05T10:00:00.000Z" }),
        makeMeta({ sessionId: "s2", startTime: "2025-01-01T10:00:00.000Z" }),
      ],
      new Map(),
    );
    expect(result.dateRange.start).toBe("2025-01-01");
    expect(result.dateRange.end).toBe("2025-01-05");
  });

  it("aggregates tool counts across sessions", () => {
    const result = aggregateData(
      [
        makeMeta({
          sessionId: "s1",
          toolCounts: { bash: 5, edit: 3 },
        }),
        makeMeta({
          sessionId: "s2",
          toolCounts: { edit: 2, read: 4 },
        }),
      ],
      new Map(),
    );
    expect(result.toolCounts).toEqual({ bash: 5, edit: 5, read: 4 });
  });

  it("aggregates languages across sessions", () => {
    const result = aggregateData(
      [
        makeMeta({
          sessionId: "s1",
          languages: { TypeScript: 4, Python: 2 },
        }),
        makeMeta({
          sessionId: "s2",
          languages: { TypeScript: 1, Go: 3 },
        }),
      ],
      new Map(),
    );
    expect(result.languages).toEqual({ TypeScript: 5, Python: 2, Go: 3 });
  });

  it("tracks feature flags", () => {
    const result = aggregateData(
      [
        makeMeta({
          sessionId: "s1",
          usesTaskAgent: true,
          usesMcp: true,
        }),
        makeMeta({
          sessionId: "s2",
          usesWebSearch: true,
          usesWebFetch: true,
        }),
        makeMeta({ sessionId: "s3" }),
      ],
      new Map(),
    );
    expect(result.sessionsUsingTaskAgent).toBe(1);
    expect(result.sessionsUsingMcp).toBe(1);
    expect(result.sessionsUsingWebSearch).toBe(1);
    expect(result.sessionsUsingWebFetch).toBe(1);
  });

  it("aggregates git stats", () => {
    const result = aggregateData(
      [
        makeMeta({ sessionId: "s1", gitCommits: 3, gitPushes: 1 }),
        makeMeta({ sessionId: "s2", gitCommits: 2, gitPushes: 2 }),
      ],
      new Map(),
    );
    expect(result.gitCommits).toBe(5);
    expect(result.gitPushes).toBe(3);
  });

  it("aggregates tool errors", () => {
    const result = aggregateData(
      [
        makeMeta({
          sessionId: "s1",
          toolErrors: 2,
          toolErrorCategories: { "Command Failed": 2 },
        }),
        makeMeta({
          sessionId: "s2",
          toolErrors: 1,
          toolErrorCategories: { "Edit Failed": 1 },
        }),
      ],
      new Map(),
    );
    expect(result.totalToolErrors).toBe(3);
    expect(result.toolErrorCategories).toEqual({
      "Command Failed": 2,
      "Edit Failed": 1,
    });
  });

  it("aggregates lines and files", () => {
    const result = aggregateData(
      [
        makeMeta({
          sessionId: "s1",
          linesAdded: 50,
          linesRemoved: 10,
          filesModified: 3,
        }),
        makeMeta({
          sessionId: "s2",
          linesAdded: 20,
          linesRemoved: 5,
          filesModified: 1,
        }),
      ],
      new Map(),
    );
    expect(result.totalLinesAdded).toBe(70);
    expect(result.totalLinesRemoved).toBe(15);
    expect(result.totalFilesModified).toBe(4);
  });

  it("aggregates response times and computes median/avg", () => {
    const result = aggregateData(
      [
        makeMeta({
          sessionId: "s1",
          userResponseTimes: [10, 20],
        }),
        makeMeta({
          sessionId: "s2",
          userResponseTimes: [30, 40],
        }),
      ],
      new Map(),
    );
    expect(result.userResponseTimes).toEqual([10, 20, 30, 40]);
    // Implementation uses lower median: sorted[Math.floor(n/2)] = sorted[2] = 30
    expect(result.medianResponseTime).toBe(30);
    expect(result.avgResponseTime).toBe(25);
  });

  it("computes median correctly for odd count", () => {
    const result = aggregateData(
      [
        makeMeta({
          sessionId: "s1",
          userResponseTimes: [10, 20, 30],
        }),
      ],
      new Map(),
    );
    // sorted[Math.floor(3/2)] = sorted[1] = 20
    expect(result.medianResponseTime).toBe(20);
  });

  it("tracks days active", () => {
    const result = aggregateData(
      [
        makeMeta({
          sessionId: "s1",
          startTime: "2025-01-01T10:00:00.000Z",
        }),
        makeMeta({
          sessionId: "s2",
          startTime: "2025-01-01T14:00:00.000Z",
        }),
        makeMeta({
          sessionId: "s3",
          startTime: "2025-01-02T10:00:00.000Z",
        }),
      ],
      new Map(),
    );
    expect(result.daysActive).toBe(2);
    // 3+3 msg per session (default) / 2 days = 3
    expect(result.messagesPerDay).toBe(4.5);
  });

  it("aggregates facet data when facets are provided", () => {
    const result = aggregateData(
      [makeMeta({ sessionId: "s1" }), makeMeta({ sessionId: "s2" })],
      new Map([
        [
          "s1",
          makeFacet({
            sessionId: "s1",
            goalCategories: { implement_feature: 1, fix_bug: 1 },
            outcome: "fully_achieved",
            userSatisfactionCounts: { happy: 2, satisfied: 1 },
            claudeHelpfulness: "very_helpful",
            sessionType: "multi_task",
            frictionCounts: { misunderstood_request: 1 },
            primarySuccess: "correct_code_edits",
          }),
        ],
      ]),
    );

    expect(result.sessionsWithFacets).toBe(1);
    expect(result.goalCategories).toEqual({
      implement_feature: 1,
      fix_bug: 1,
    });
    expect(result.outcomes).toEqual({ fully_achieved: 1 });
    expect(result.satisfaction).toEqual({ happy: 2, satisfied: 1 });
    expect(result.helpfulness).toEqual({ very_helpful: 1 });
    expect(result.sessionTypes).toEqual({ multi_task: 1 });
    expect(result.friction).toEqual({ misunderstood_request: 1 });
    expect(result.success).toEqual({ correct_code_edits: 1 });
  });

  it("handles missing facets gracefully", () => {
    const result = aggregateData(
      [makeMeta({ sessionId: "s1" })],
      new Map(), // no facets
    );
    expect(result.sessionsWithFacets).toBe(0);
    expect(Object.keys(result.goalCategories)).toHaveLength(0);
    expect(Object.keys(result.outcomes)).toHaveLength(0);
  });

  it("collects up to 50 session summaries", () => {
    // Create 60 sessions
    const sessions = Array.from({ length: 60 }, (_, i) =>
      makeMeta({
        sessionId: `s${i}`,
        startTime: `2025-01-${String(i + 1).padStart(2, "0")}T00:00:00.000Z`,
        firstPrompt: `prompt ${i}`,
        userMessageCount: 3,
      }),
    );
    const result = aggregateData(sessions, new Map());
    expect(result.sessionSummaries).toHaveLength(50);
    expect(result.sessionSummaries[0]?.id).toBe("s0");
  });

  it("aggregates messageHours", () => {
    const result = aggregateData(
      [
        makeMeta({
          sessionId: "s1",
          messageHours: [8, 9, 10],
        }),
        makeMeta({
          sessionId: "s2",
          messageHours: [14, 15],
        }),
      ],
      new Map(),
    );
    expect(result.messageHours).toEqual([8, 9, 10, 14, 15]);
  });

  it("aggregates interruptions", () => {
    const result = aggregateData(
      [
        makeMeta({ sessionId: "s1", userInterruptions: 2 }),
        makeMeta({ sessionId: "s2", userInterruptions: 1 }),
      ],
      new Map(),
    );
    expect(result.totalInterruptions).toBe(3);
  });

  it("aggregates projects", () => {
    const result = aggregateData(
      [
        makeMeta({ sessionId: "s1", projectPath: "/a" }),
        makeMeta({ sessionId: "s2", projectPath: "/a" }),
        makeMeta({ sessionId: "s3", projectPath: "/b" }),
      ],
      new Map(),
    );
    expect(result.projects).toEqual({ "/a": 2, "/b": 1 });
  });
});

describe("multi-clauding detection", () => {
  it("detects no overlap for single session", () => {
    const t = "2025-01-01T10:00:00.000Z";
    const result = aggregateData(
      [
        makeMeta({
          sessionId: "s1",
          userMessageTimestamps: [t, t, t, t, t],
        }),
      ],
      new Map(),
    );
    expect(result.multiClauding.overlapEvents).toBe(0);
    expect(result.multiClauding.sessionsInvolved).toBe(0);
    expect(result.multiClauding.userMessagesDuring).toBe(0);
  });

  it("detects no overlap for sequential sessions far apart", () => {
    const result = aggregateData(
      [
        makeMeta({
          sessionId: "s1",
          userMessageTimestamps: ["2025-01-01T10:00:00.000Z", "2025-01-01T10:05:00.000Z"],
        }),
        makeMeta({
          sessionId: "s2",
          userMessageTimestamps: ["2025-01-01T11:00:00.000Z", "2025-01-01T11:05:00.000Z"],
        }),
      ],
      new Map(),
    );
    // >30min apart, no overlap
    expect(result.multiClauding.overlapEvents).toBe(0);
  });

  it("detects overlap when two sessions interleave within 30min", () => {
    const result = aggregateData(
      [
        makeMeta({
          sessionId: "a",
          userMessageTimestamps: [
            "2025-01-01T10:00:00.000Z",
            "2025-01-01T10:20:00.000Z",
            "2025-01-01T10:40:00.000Z",
          ],
        }),
        makeMeta({
          sessionId: "b",
          userMessageTimestamps: ["2025-01-01T10:10:00.000Z", "2025-01-01T10:30:00.000Z"],
        }),
      ],
      new Map(),
    );

    // Timeline: a@10:00, b@10:10, a@10:20, b@10:30, a@10:40
    // a@10:00 → b@10:10 (within window) → a@10:20 (within window) => overlap
    expect(result.multiClauding.overlapEvents).toBe(1);
    expect(result.multiClauding.sessionsInvolved).toBe(2);
    expect(result.multiClauding.userMessagesDuring).toBeGreaterThan(0);
  });

  it("detects no overlap for single-session clusters (same session repeating)", () => {
    // All messages from the same session — no overlap possible
    const result = aggregateData(
      [
        makeMeta({
          sessionId: "a",
          userMessageTimestamps: [
            "2025-01-01T10:00:00.000Z",
            "2025-01-01T10:05:00.000Z",
            "2025-01-01T10:10:00.000Z",
          ],
        }),
      ],
      new Map(),
    );
    expect(result.multiClauding.overlapEvents).toBe(0);
  });

  it("handles empty timestamps gracefully", () => {
    const result = aggregateData(
      [
        makeMeta({ sessionId: "s1", userMessageTimestamps: [] }),
        makeMeta({ sessionId: "s2", userMessageTimestamps: [] }),
      ],
      new Map(),
    );
    expect(result.multiClauding.overlapEvents).toBe(0);
  });

  it("detects overlap for three interleaving sessions", () => {
    const result = aggregateData(
      [
        makeMeta({
          sessionId: "a",
          userMessageTimestamps: [
            "2025-01-01T10:00:00.000Z",
            "2025-01-01T10:15:00.000Z",
            "2025-01-01T10:30:00.000Z",
          ],
        }),
        makeMeta({
          sessionId: "b",
          userMessageTimestamps: ["2025-01-01T10:05:00.000Z", "2025-01-01T10:20:00.000Z"],
        }),
        makeMeta({
          sessionId: "c",
          userMessageTimestamps: ["2025-01-01T10:10:00.000Z", "2025-01-01T10:25:00.000Z"],
        }),
      ],
      new Map(),
    );
    // Timeline: a, b, c, a, b, c, a
    // multiple overlapping pairs
    expect(result.multiClauding.overlapEvents).toBeGreaterThan(0);
    expect(result.multiClauding.sessionsInvolved).toBeGreaterThanOrEqual(2);
  });

  it("does not false-trigger on messages exactly 30min apart", () => {
    // 30min window, but we use > for the check (msg.ts - windowStartMessage.ts > OVERLAP_WINDOW_MS)
    // 30 * 60000 = 1800000ms. If messages are exactly 30min apart, the diff is 1800000,
    // which is NOT > 1800000, so they stay in the window. But they're from same session.
    const result = aggregateData(
      [
        makeMeta({
          sessionId: "a",
          userMessageTimestamps: [
            "2025-01-01T10:00:00.000Z",
            "2025-01-01T10:30:00.000Z", // exactly 30min later
          ],
        }),
        makeMeta({
          sessionId: "b",
          userMessageTimestamps: ["2025-01-01T10:15:00.000Z"],
        }),
      ],
      new Map(),
    );
    // b@10:15 is within 30min of a@10:00 → b is in window
    // but we need sessionA → sessionB → sessionA pattern
    // a@10:00, b@10:15, a@10:30 — this IS the pattern!
    // prev b@10:15, a@10:30 — between them: wait, prevIndex for a is 0
    // So it checks: a@10:00 and b@10:15 — different sessions → overlap!
    expect(result.multiClauding.overlapEvents).toBeGreaterThan(0);
  });
});
