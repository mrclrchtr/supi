import type { Theme } from "@earendil-works/pi-coding-agent";
import { describe, expect, it } from "vitest";
import { formatVerdictBadge } from "../../src/tui/common.ts";
import { renderPrepareCall } from "../../src/tui/prepare.ts";
import { renderRunCall, renderRunResult } from "../../src/tui/run.ts";
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
  review: {
    tasks: [{ id: "live-smoke", instructions: "Smoke test.", findingScope: "boy-scout" }],
  },
  workspaceReceipt: {
    status: "verified",
    targetKind: "commit",
    baselineRevision: "b".repeat(40),
    expectedWorkspaceHead: "a".repeat(40),
    observedWorkspaceHead: "a".repeat(40),
    expectedDiffHash: "c".repeat(64),
    observedDiffHash: "c".repeat(64),
    changedPathCount: 2,
  },
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
      findingCounts: {
        total: 0,
        blocking: 0,
        nonBlocking: 0,
        byImpact: { low: 0, medium: 0, high: 0 },
      },
      summary: "Frozen workspace review completed successfully.",
      findings: [],
    },
  ],
};

describe("supi_review_run TUI", () => {
  it("labels advisory findings separately from a clean pass", () => {
    expect(formatVerdictBadge("pass_with_findings", theme)).toBe("PASS WITH FINDINGS");
  });

  it("labels exact-one execution paths in tool calls", () => {
    expect(
      renderRunCall(
        { direct: { target: { comparison: { baseCommit: "9510d68" } }, tasks: [] } },
        theme,
      )
        .render(160)
        .join("\n"),
    ).toContain("supi_review_run direct — comparison");
    expect(
      renderRunCall({ direct: { tasks: [] } }, theme)
        .render(160)
        .join("\n"),
    ).toContain("supi_review_run direct — working-tree");
    expect(
      renderRunCall({ prepared: { planId: "plan-1" } }, theme)
        .render(160)
        .join("\n"),
    ).toContain("supi_review_run prepared — from plan");
    expect(
      renderPrepareCall({ planning: "suggest", target: { commit: { commit: "9510d68" } } }, theme)
        .render(160)
        .join("\n"),
    ).toContain("supi_review_prepare suggest — commit");
  });

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
    expect(output).toContain("scope: boy-scout");
    expect(output).toContain("model: provider/reviewer");
    expect(output).toContain("18 tokens");
    expect(output).toContain("Commit aaaaaaa (2 files · +3 / -1)");
    expect(output).not.toContain("workspace:");
  });

  it("shows the verified workspace receipt when expanded", () => {
    const output = renderRunResult(
      { content: [], details },
      { expanded: true, isPartial: false },
      theme,
    )
      .render(160)
      .join("\n");

    expect(output).toContain("workspace: verified · commit · 2 paths");
    expect(output).toContain("live-smoke (boy-scout)");
  });

  it("shows a workspace placeholder while freezing", () => {
    const output = renderRunResult(
      {
        content: [],
        details: { totalCount: 2, targetTitle: "Commit f2c56ef", taskIds: ["standards", "spec"] },
      },
      { expanded: true, isPartial: true },
      theme,
    )
      .render(160)
      .join("\n");

    expect(output).toContain("Reviewing… (0 of 2 tasks finished)");
    expect(output).toContain("workspace: preparing frozen workspace…");
  });

  it("shows review context with concurrent task state", () => {
    const output = renderRunResult(
      {
        content: [],
        details: {
          completedCount: 0,
          totalCount: 2,
          targetTitle: "Commit f2c56ef",
          workspacePath: "/tmp/supi-review-workspace-test/workspace",
          reviewerModelId: "provider/reviewer",
          sharedContext: "Live smoke test.",
          tasks: [
            { id: "standards", instructions: "Check the renderer." },
            { id: "spec", instructions: "Check the result contract." },
          ],
          taskIds: ["standards", "spec"],
          taskStates: {
            standards: {
              status: "running",
              progress: { turns: 2, toolUses: 3, tokens: { total: 18 } },
            },
            spec: { status: "waiting" },
          },
        },
      },
      { expanded: true, isPartial: true },
      theme,
    )
      .render(160)
      .join("\n");

    expect(output).toContain("Reviewing… (0 of 2 tasks finished)");
    expect(output).toContain("target: Commit f2c56ef");
    expect(output).toContain("reviewer: provider/reviewer");
    expect(output).toContain("workspace: /tmp/supi-review-workspace-test/workspace");
    expect(output).toContain("context: Live smoke test.");
    expect(output).toContain("● standards · 2 turns · 3 tool uses · 18 tokens");
    expect(output).toContain("Check the renderer.");
    expect(output).toContain("○ spec · queued");
    expect(output).toContain("Check the result contract.");
  });
});
