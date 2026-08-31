import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { createPiMock, getTool } from "@mrclrchtr/supi-test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LocalReviewAuditStore } from "../../src/audit/local-review-audit-store.ts";
import type { ReviewAuditRecordInput } from "../../src/audit/review-audit.ts";
import { MAX_PAGE_CHARACTERS } from "../../src/tool/output-page.ts";
import { registerReviewAuditTool } from "../../src/tool/review_audit/register.ts";

const directories: string[] = [];
const secrets = {
  text: "UNIQUE_OUTLINE_MESSAGE_SECRET",
  error: "UNIQUE_OUTLINE_PROVIDER_SECRET",
  argument: "UNIQUE_OUTLINE_ARGUMENT_SECRET",
  result: "UNIQUE_OUTLINE_RESULT_SECRET",
};

afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

function createStore(): LocalReviewAuditStore {
  const agentDir = mkdtempSync(join(tmpdir(), "supi-review-audit-tool-"));
  directories.push(agentDir);
  return new LocalReviewAuditStore({ agentDir });
}

function record(): ReviewAuditRecordInput {
  return {
    task: { id: "spec", instructions: "Review.", mode: "change" as const },
    modelId: "provider/model",
    thinkingLevel: "max",
    requestedThinkingLevel: "max",
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
    outcome: { kind: "failed", failureCode: "missing-structured-output" },
    trace: {
      startedAt: "2026-01-01T00:00:00.000Z",
      durationMs: 1,
      timeline: [
        { atMs: 0, type: "recovery_turn_start" as const, modelId: "provider/model" },
        { atMs: 1, type: "model_switch_failed" as const, modelId: "other/recovery" },
      ],
      droppedTimelineEntries: 0,
    },
    messages: [
      {
        role: "assistant",
        content: [
          { type: "text", text: secrets.text },
          { type: "toolCall", name: "read", arguments: { path: secrets.argument } },
        ],
        stopReason: "toolUse",
      },
      {
        role: "toolResult",
        toolName: "read",
        content: [{ type: "text", text: secrets.result }],
        details: { value: secrets.result },
      },
      {
        role: "assistant",
        content: [],
        stopReason: "error",
        errorMessage: secrets.error,
      },
      "non-object message",
    ],
  };
}

async function setup() {
  const store = createStore();
  const artifact = await store.create(record());
  const pi = createPiMock();
  registerReviewAuditTool(pi as unknown as ExtensionAPI, store);
  return { store, artifact, tool: getTool(pi, "review_audit") };
}

describe("review_audit views", () => {
  it("keeps listing unchanged and uses metadata-only outline by default", async () => {
    const { artifact, tool } = await setup();
    const listed = (await tool.execute("call", {}, undefined, undefined, {} as never)) as {
      content: Array<{ text: string }>;
      details: { mode: string };
    };
    expect(listed.details.mode).toBe("list");
    expect(listed.content[0]?.text).toContain(artifact.artifactId);

    const outlined = (await tool.execute(
      "call",
      { artifactId: artifact.artifactId },
      undefined,
      undefined,
      {} as never,
    )) as {
      content: Array<{ text: string }>;
      details: { mode: string; totalMessages: number; messageIndexes: number[] };
    };
    expect(outlined.details).toMatchObject({
      mode: "outline",
      totalMessages: 4,
      messageIndexes: [0, 1, 2, 3],
    });
    expect(outlined.content[0]?.text).toContain("[0] · role=assistant");
    expect(outlined.content[0]?.text).not.toContain("model_switch_failed");
    const allOutput = JSON.stringify(outlined);
    for (const secret of Object.values(secrets)) expect(allOutput).not.toContain(secret);
    expect(allOutput).not.toContain("Packet body");
  });

  it("returns one stable indexed message with paging", async () => {
    const { artifact, tool } = await setup();
    const result = (await tool.execute(
      "call",
      { artifactId: artifact.artifactId, view: "message", messageIndex: 1, limit: 512 },
      undefined,
      undefined,
      {} as never,
    )) as {
      content: Array<{ text: string }>;
      details: { mode: string; messageIndex: number; nextOffset?: number };
    };

    expect(result.details).toMatchObject({ mode: "message", messageIndex: 1 });
    expect(result.content[0]?.text).toContain(secrets.result);
    expect(result.content[0]?.text).not.toContain(secrets.text);
  });

  it("preserves exact raw JSON access and paging", async () => {
    const { store, artifact, tool } = await setup();
    const exact = await store.read(artifact.artifactId);
    const result = (await tool.execute(
      "call",
      { artifactId: artifact.artifactId, view: "raw" },
      undefined,
      undefined,
      {} as never,
    )) as { content: Array<{ text: string }>; details: { mode: string } };

    expect(result.details.mode).toBe("raw");
    expect(result.content[0]?.text).toBe(exact);
  });

  it("rejects each invalid view combination with a correction", async () => {
    const { artifact, tool } = await setup();
    const cases = [
      [{ view: "outline" }, "view requires artifactId"],
      [{ messageIndex: 0 }, 'messageIndex is valid only with view: "message"'],
      [
        { artifactId: artifact.artifactId, view: "message" },
        'view: "message" requires a non-negative integer messageIndex',
      ],
      [{ artifactId: artifact.artifactId, view: "message", messageIndex: 99 }, "is out of range"],
    ] as const;
    for (const [params, message] of cases) {
      await expect(tool.execute("call", params, undefined, undefined, {} as never)).rejects.toThrow(
        message,
      );
    }
  });

  it("rejects unknown fields and unknown view values through the schema", async () => {
    const { artifact, tool } = await setup();
    await expect(
      tool.execute(
        "call",
        { artifactId: artifact.artifactId, view: "future" },
        undefined,
        undefined,
        {} as never,
      ),
    ).rejects.toThrow("Invalid review audit input");
    await expect(
      tool.execute(
        "call",
        { artifactId: artifact.artifactId, extra: true },
        undefined,
        undefined,
        {} as never,
      ),
    ).rejects.toThrow("Invalid review audit input");
  });

  it("rejects unsupported records for projected views but keeps raw access", async () => {
    const raw = '{"format":"supi-review-audit/v2","messages":[]}';
    const store = {
      read: vi.fn().mockResolvedValue(raw),
      list: vi.fn().mockResolvedValue([]),
    } as unknown as LocalReviewAuditStore;
    const pi = createPiMock();
    registerReviewAuditTool(pi as unknown as ExtensionAPI, store);
    const tool = getTool(pi, "review_audit");

    await expect(
      tool.execute(
        "call",
        { artifactId: "review-audit-11111111-1111-1111-1111-111111111111" },
        undefined,
        undefined,
        {} as never,
      ),
    ).rejects.toThrow('Use view: "raw"');
    const result = (await tool.execute(
      "call",
      { artifactId: "review-audit-11111111-1111-1111-1111-111111111111", view: "raw" },
      undefined,
      undefined,
      {} as never,
    )) as { content: Array<{ text: string }> };
    expect(result.content[0]?.text).toBe(raw);
  });

  it("pages an unbounded replay listing", async () => {
    const audits = Array.from({ length: 300 }, (_, index) => ({
      artifactId: `review-audit-${index.toString().padStart(36, "0")}`,
      expiresAt: "2026-01-08T00:00:00.000Z",
    }));
    const store = { list: vi.fn().mockResolvedValue(audits) } as unknown as LocalReviewAuditStore;
    const pi = createPiMock();
    registerReviewAuditTool(pi as unknown as ExtensionAPI, store);

    const result = (await getTool(pi, "review_audit").execute(
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
    expect(result.details.nextOffset).toBeDefined();
    expect(result.details.audits.length).toBeLessThan(result.details.totalAudits);
  });

  it("reports expired artifacts and honors cancellation", async () => {
    const pi = createPiMock();
    registerReviewAuditTool(pi as unknown as ExtensionAPI, createStore());
    const tool = getTool(pi, "review_audit");
    await expect(
      tool.execute(
        "call",
        { artifactId: "review-audit-11111111-1111-1111-1111-111111111111" },
        undefined,
        undefined,
        {} as never,
      ),
    ).rejects.toThrow("not found or has expired");

    const controller = new AbortController();
    controller.abort();
    await expect(
      tool.execute("call", {}, controller.signal, undefined, {} as never),
    ).rejects.toThrow();
  });
});
