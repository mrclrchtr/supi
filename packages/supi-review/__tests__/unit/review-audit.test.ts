import { existsSync, mkdtempSync, rmSync, statSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { LocalReviewAuditStore } from "../../src/audit/local-review-audit-store.ts";
import {
  captureReplayMessages,
  REVIEW_AUDIT_TIMELINE_MAX,
  ReviewAuditTraceCollector,
} from "../../src/audit/review-audit.ts";

const receipt = {
  status: "verified" as const,
  targetKind: "working-tree" as const,
  baselineRevision: "a".repeat(40),
  expectedWorkspaceHead: "a".repeat(40),
  observedWorkspaceHead: "a".repeat(40),
  expectedDiffHash: "b".repeat(64),
  observedDiffHash: "b".repeat(64),
  changedPathCount: 1,
};

function recordInput() {
  return {
    task: { id: "spec", instructions: "Review the contract." },
    modelId: "provider/model",
    thinkingLevel: "max",
    protocolPrompt: "Review protocol",
    packet: "Exact review packet",
    packetHash: "c".repeat(64),
    snapshot: {
      requestedTarget: { kind: "working-tree" as const },
      target: { kind: "working-tree" as const, headCommit: "a".repeat(40) },
      title: "Working tree changes",
      changes: [{ status: "M", path: "a.ts", additions: 1, deletions: 0 }],
      diffHash: "b".repeat(64),
      stats: { files: 1, additions: 1, deletions: 0 },
    },
    workspaceReceipt: receipt,
    outcome: { kind: "success" },
    trace: {
      startedAt: "2026-01-01T00:00:00.000Z",
      durationMs: 12,
      timeline: [],
      droppedTimelineEntries: 0,
    },
    messages: [],
  };
}

describe("review audit capture", () => {
  it("keeps provider-visible messages while removing thinking content and signatures", () => {
    const messages = captureReplayMessages([
      {
        role: "assistant",
        content: [
          { type: "thinking", thinking: "private reasoning", thinkingSignature: "secret" },
          { type: "text", text: "Visible." },
          {
            type: "toolCall",
            id: "call-1",
            name: "bash",
            arguments: { command: "git diff" },
            thoughtSignature: "opaque",
          },
        ],
      },
      {
        role: "toolResult",
        toolCallId: "call-1",
        toolName: "bash",
        content: [{ type: "text", text: "diff" }],
        details: undefined,
        usage: undefined,
      },
    ]);

    expect(JSON.stringify(messages)).toContain("Visible.");
    expect(JSON.stringify(messages)).toContain("git diff");
    expect(JSON.stringify(messages)).not.toContain("private reasoning");
    expect(JSON.stringify(messages)).not.toContain("thinkingSignature");
    expect(JSON.stringify(messages)).not.toContain("thoughtSignature");
    expect(JSON.stringify(messages)).not.toContain('"undefined"');
  });

  it("keeps a bounded tail when a reviewer produces excessive lifecycle events", () => {
    const trace = new ReviewAuditTraceCollector();
    for (let index = 0; index <= REVIEW_AUDIT_TIMELINE_MAX; index++) {
      trace.observe({ type: "turn_start" });
    }

    const captured = trace.snapshot({ messages: [] } as never);
    expect(captured.trace.timeline).toHaveLength(REVIEW_AUDIT_TIMELINE_MAX);
    expect(captured.trace.droppedTimelineEntries).toBe(1);
  });

  it("records a compact session timeline beside final messages", () => {
    let now = 1_000;
    const trace = new ReviewAuditTraceCollector(() => now);
    trace.observe({ type: "agent_start" });
    now += 5;
    trace.observe({
      type: "tool_execution_start",
      toolCallId: "call-1",
      toolName: "bash",
      args: {},
    });
    now += 7;
    trace.observe({
      type: "tool_execution_end",
      toolCallId: "call-1",
      toolName: "bash",
      result: {},
      isError: false,
    });

    const captured = trace.snapshot({ messages: [] } as never);
    expect(captured.trace.timeline).toEqual([
      { atMs: 0, type: "agent_start" },
      { atMs: 5, type: "tool_start", toolCallId: "call-1", toolName: "bash" },
      { atMs: 12, type: "tool_end", toolCallId: "call-1", toolName: "bash", isError: false },
    ]);
  });
});

describe("LocalReviewAuditStore", () => {
  it("keeps active temporary replays while pruning expired files", async () => {
    const agentDir = mkdtempSync(join(tmpdir(), "supi-review-audit-"));
    try {
      const store = new LocalReviewAuditStore({ agentDir });
      await store.create(recordInput());
      const temporary = join(agentDir, "supi-review", "audits", "in-flight.tmp");
      writeFileSync(temporary, "in progress");

      await store.list();
      expect(existsSync(temporary)).toBe(true);

      const expired = new Date(Date.now() - 8 * 24 * 60 * 60 * 1_000);
      utimesSync(temporary, expired, expired);
      await store.list();
      expect(existsSync(temporary)).toBe(false);
    } finally {
      rmSync(agentDir, { recursive: true, force: true });
    }
  });

  it("writes private local replays and removes them after seven days", async () => {
    const agentDir = mkdtempSync(join(tmpdir(), "supi-review-audit-"));
    try {
      const store = new LocalReviewAuditStore({ agentDir });
      const reference = await store.create(recordInput());
      const path = join(agentDir, "supi-review", "audits", `${reference.artifactId}.json`);

      expect(statSync(path).mode & 0o077).toBe(0);
      await expect(store.list()).resolves.toEqual([
        expect.objectContaining({ artifactId: reference.artifactId }),
      ]);
      expect(await store.read(reference.artifactId)).toContain("Exact review packet");

      const expired = new Date(Date.now() - 8 * 24 * 60 * 60 * 1_000);
      utimesSync(path, expired, expired);
      expect(await store.list()).toEqual([]);
      expect(await store.read(reference.artifactId)).toBeUndefined();
    } finally {
      rmSync(agentDir, { recursive: true, force: true });
    }
  });
});
