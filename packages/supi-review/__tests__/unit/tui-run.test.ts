import type { Theme } from "@earendil-works/pi-coding-agent";
import { describe, expect, it } from "vitest";
import { renderRunResult } from "../../src/tui/run.ts";
import type { ReviewBatchDetails } from "../../src/types.ts";

const theme = {
  fg: (_color: string, text: string) => text,
  bold: (text: string) => text,
} as unknown as Theme;

const details: ReviewBatchDetails = {
  kind: "review-batch",
  mode: "direct",
  provenance: "caller-supplied",
  snapshot: {
    requestedTarget: { kind: "commit", commit: "a".repeat(40) },
    target: { kind: "commit", commit: "a".repeat(40), parentCommit: "b".repeat(40) },
    title: "Commit aaaaaaa",
    changes: [
      { status: "M", path: "a.ts", additions: 2, deletions: 1 },
      { status: "A", path: "b.ts", additions: 1, deletions: 0 },
    ],
    diffHash: "c".repeat(64),
    stats: { files: 2, additions: 3, deletions: 1 },
  },
  review: { tasks: [{ id: "live-smoke", instructions: "Smoke test." }] },
  results: [
    {
      status: "completed",
      taskId: "live-smoke",
      modelId: "provider/reviewer",
      packetHash: "d".repeat(64),
      usage: {
        input: 10,
        output: 5,
        cacheRead: 2,
        cacheWrite: 1,
        totalTokens: 18,
        cost: { input: 1, output: 2, cacheRead: 3, cacheWrite: 4, total: 10 },
      },
      verdict: "pass",
      summary: "Frozen workspace review completed successfully.",
      findings: [],
    },
  ],
};

describe("supi_review_run TUI", () => {
  it("keeps the collapsed result informative", () => {
    const output = renderRunResult(
      { content: [], details },
      { expanded: false, isPartial: false },
      theme,
    )
      .render(160)
      .join("\n");

    expect(output).toContain("live-smoke: PASS");
    expect(output).toContain("Frozen workspace review completed successfully.");
    expect(output).toContain("model: provider/reviewer");
    expect(output).toContain("18 tokens");
    expect(output).toContain("Commit aaaaaaa (2 files · +3 / -1)");
  });
});
