import type { Theme } from "@earendil-works/pi-coding-agent";
import { describe, expect, it } from "vitest";
import { renderRunCall, renderRunResult } from "../../src/tool/review_run/render.ts";
import type { ReviewBatchDetails } from "../../src/types.ts";

const theme = {
  fg: (_color: string, text: string) => text,
  bold: (text: string) => text,
} as unknown as Theme;

const details: ReviewBatchDetails = {
  kind: "review-batch",
  provenance: "caller-supplied",
  snapshot: {
    requestedTarget: {},
    target: {
      fromCommit: "a".repeat(40),
      toCommit: "a".repeat(40),
      includeUncommittedChanges: true,
    },
    title: "Current filesystem",
    changes: [{ status: "M", path: "a.ts", additions: 2, deletions: 1 }],
    diffHash: "b".repeat(64),
    stats: { files: 1, additions: 2, deletions: 1 },
  },
  review: { tasks: [{ id: "state", instructions: "Check state.", mode: "state" }] },
  workspaceReceipt: {
    status: "verified",
    fromCommit: "a".repeat(40),
    toCommit: "a".repeat(40),
    includeUncommittedChanges: true,
    expectedWorkspaceHead: "a".repeat(40),
    observedWorkspaceHead: "a".repeat(40),
    expectedDiffHash: "b".repeat(64),
    observedDiffHash: "b".repeat(64),
    changedPathCount: 1,
  },
  results: [
    {
      status: "completed",
      taskId: "state",
      mode: "state",
      modelId: "provider/reviewer",
      packetHash: "c".repeat(64),
      verdict: "pass",
      findingCounts: {
        total: 0,
        blocking: 0,
        nonBlocking: 0,
        byImpact: { low: 0, medium: 0, high: 0 },
      },
      summary: "Clean.",
      findings: [],
      criteriaCoverage: { status: "complete" },
    },
  ],
};

describe("review_run TUI", () => {
  it.each([
    [
      "a current filesystem state batch",
      { tasks: [{ mode: "state" }] },
      "requested target: current filesystem · task modes: state · repository-wide",
    ],
    [
      "a committed requested range",
      {
        target: { committed: { from: "base", to: "HEAD" } },
        tasks: [{ mode: "change" }],
      },
      'requested target: from "base" · to "HEAD" · uncommitted changes excluded · task modes: change · repository-wide',
    ],
    [
      "a committed range with a default after endpoint",
      { target: { committed: { from: "main" } }, tasks: [{ mode: "change" }] },
      'requested target: from "main" · default to "HEAD" · uncommitted changes excluded · task modes: change · repository-wide',
    ],
    [
      "a historical requested state",
      { target: { committed: { to: "v1.2.3" } }, tasks: [{ mode: "state" }] },
      'requested target: to "v1.2.3" · uncommitted changes excluded · task modes: state · repository-wide',
    ],
    [
      "a batch with both task modes",
      {
        target: { workingTree: { from: "base" } },
        paths: ["src/a.ts", "docs"],
        tasks: [{ mode: "change" }, { mode: "state" }],
      },
      'requested target: from "base" · uncommitted changes included · task modes: change, state · path focus: 2 paths',
    ],
  ])("renders requested target facts, task modes, and scope for %s", (_name, args, expected) => {
    const output = renderRunCall(args, theme).render(200).join("\n");

    expect(output).toContain(expected);
    expect(output).not.toContain("resolved");
  });

  it("shows task Review Mode, scope focus, and resolved workspace facts", () => {
    const scopedDetails: ReviewBatchDetails = { ...details, scope: { paths: ["src/a.ts"] } };
    const output = renderRunResult(
      { content: [], details: scopedDetails },
      { expanded: true, isPartial: false },
      theme,
    )
      .render(200)
      .join("\n");

    expect(output).toContain("state (state)");
    expect(output).toContain("focus: path focus: 1 path");
    expect(output).toContain("workspace: verified · from");
  });

  it("uses render context for tool failures", () => {
    const output = renderRunResult(
      { content: [], details },
      { expanded: false, isPartial: false },
      theme,
      { isError: true },
    )
      .render(200)
      .join("\n");

    expect(output).toContain("review_run failed");
  });

  it("does not present state-only output as a changed-file review", () => {
    const output = renderRunResult(
      { content: [], details },
      { expanded: false, isPartial: false },
      theme,
    )
      .render(200)
      .join("\n");

    expect(output).toContain("state: PASS · state");
    expect(output).toContain("Current filesystem");
    expect(output).toContain("repository-wide");
    expect(output).toContain("frozen after state");
    expect(output).not.toContain("Filesystem changes");
    expect(output).not.toContain("+2 / -1");
  });
});
