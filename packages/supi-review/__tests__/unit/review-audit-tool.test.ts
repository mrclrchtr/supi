import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { createPiMock, getTool } from "@mrclrchtr/supi-test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LocalReviewAuditStore } from "../../src/audit/local-review-audit-store.ts";
import { MAX_PAGE_CHARACTERS } from "../../src/tool/output-page.ts";
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
    task: { id: "spec", instructions: "Review.", mode: "change" as const },
    modelId: "provider/model",
    thinkingLevel: "max",
    protocolPrompt: "Protocol",
    packet: "Packet body",
    packetHash: "a".repeat(64),
    snapshot: {
      requestedTarget: {},
      target: {
        fromCommit: "b".repeat(40),
        toCommit: "b".repeat(40),
        includeUncommittedChanges: true,
      },
      title: "Filesystem changes",
      changes: [],
      diffHash: "c".repeat(64),
      stats: { files: 0, additions: 0, deletions: 0 },
    },
    workspaceReceipt: {
      status: "verified" as const,
      fromCommit: "b".repeat(40),
      toCommit: "b".repeat(40),
      includeUncommittedChanges: true,
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
    expect(JSON.stringify(tool.parameters)).toContain("/supi-review");

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

  it("pages an unbounded replay listing", async () => {
    const audits = Array.from({ length: 300 }, (_, index) => ({
      artifactId: `review-audit-${index.toString().padStart(36, "0")}`,
      expiresAt: "2026-01-08T00:00:00.000Z",
    }));
    const store = { list: vi.fn().mockResolvedValue(audits) } as unknown as LocalReviewAuditStore;
    const pi = createPiMock();
    registerReviewAuditTool(pi as unknown as ExtensionAPI, store);

    const result = (await getTool(pi, "supi_review_audit").execute(
      "call",
      {},
      undefined,
      undefined,
      {} as never,
    )) as {
      content: Array<{ text: string }>;
      details: { audits: unknown[]; nextOffset?: number; totalAudits: number };
    };

    expect(result.content[0]?.text.length).toBeLessThanOrEqual(MAX_PAGE_CHARACTERS);
    expect(result.content[0]?.text).toContain('"offset":');
    expect(result.details.nextOffset).toBeDefined();
    expect(result.details.audits.length).toBeLessThan(result.details.totalAudits);
  });

  it("stops before reading when the call is canceled", async () => {
    const pi = createPiMock();
    registerReviewAuditTool(pi as unknown as ExtensionAPI, createStore());
    const controller = new AbortController();
    controller.abort();

    await expect(
      getTool(pi, "supi_review_audit").execute(
        "call",
        {},
        controller.signal,
        undefined,
        {} as never,
      ),
    ).rejects.toThrow();
  });
});
