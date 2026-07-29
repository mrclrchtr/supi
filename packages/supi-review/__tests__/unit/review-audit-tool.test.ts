import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { createPiMock, getTool } from "@mrclrchtr/supi-test-utils";
import { afterEach, describe, expect, it } from "vitest";
import { LocalReviewAuditStore } from "../../src/audit/local-review-audit-store.ts";
import { registerReviewAuditTool } from "../../src/tool/review-audit-tool.ts";

const directories: string[] = [];

afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

function createStore(): LocalReviewAuditStore {
  const agentDir = mkdtempSync(join(tmpdir(), "supi-review-audit-tool-"));
  directories.push(agentDir);
  return new LocalReviewAuditStore({ agentDir });
}

function record() {
  return {
    task: { id: "spec", instructions: "Review." },
    modelId: "provider/model",
    thinkingLevel: "max",
    protocolPrompt: "Protocol",
    packet: "Packet body",
    packetHash: "a".repeat(64),
    snapshot: {
      requestedTarget: { kind: "working-tree" as const },
      target: { kind: "working-tree" as const, headCommit: "b".repeat(40) },
      title: "Working tree",
      changes: [],
      diffHash: "c".repeat(64),
      stats: { files: 0, additions: 0, deletions: 0 },
    },
    workspaceReceipt: {
      status: "verified" as const,
      targetKind: "working-tree" as const,
      baselineRevision: "b".repeat(40),
      expectedWorkspaceHead: "b".repeat(40),
      observedWorkspaceHead: "b".repeat(40),
      expectedDiffHash: "c".repeat(64),
      observedDiffHash: "c".repeat(64),
      changedPathCount: 0,
    },
    outcome: { kind: "success" },
    trace: {
      startedAt: "2026-01-01T00:00:00.000Z",
      durationMs: 1,
      timeline: [],
      droppedTimelineEntries: 0,
    },
    messages: [],
  };
}

describe("supi_review_audit", () => {
  it("lists and pages protected local replay artifacts", async () => {
    const store = createStore();
    const artifact = await store.create(record());
    const pi = createPiMock();
    registerReviewAuditTool(pi as unknown as ExtensionAPI, store);
    const tool = getTool(pi, "supi_review_audit");

    const listed = (await tool.execute("call", {}, undefined, undefined, {} as never)) as {
      content: Array<{ text: string }>;
    };
    expect(listed.content[0]?.text).toContain(artifact.artifactId);

    const replay = (await tool.execute(
      "call",
      { artifactId: artifact.artifactId },
      undefined,
      undefined,
      {} as never,
    )) as { content: Array<{ text: string }> };
    expect(replay.content[0]?.text).toContain("Packet body");
  });
});
