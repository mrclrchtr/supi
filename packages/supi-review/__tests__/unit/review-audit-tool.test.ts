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
import { expectStructuredContent } from "../helpers/structured-result.ts";

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

async function setup(input = record()) {
  const store = createStore();
  const artifact = await store.create(input);
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
    expect(expectStructuredContent(tool, listed)).toEqual({
      mode: "list",
      audits: [artifact],
      totalAudits: 1,
      text: `# Local Reviewer Replays\n\n- ${artifact.artifactId} (expires ${artifact.expiresAt})`,
      offset: 0,
      totalCharacters: listed.content[0]?.text.length,
    });
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
    const native = expectStructuredContent(tool, outlined);
    expect(native).toMatchObject({
      mode: "outline",
      artifactId: artifact.artifactId,
      totalMessages: 4,
      messageIndexes: [0, 1, 2, 3],
      text: outlined.content[0]?.text,
      offset: 0,
      totalCharacters: outlined.content[0]?.text.length,
      rows: [
        {
          index: 0,
          role: "assistant",
          contentKinds: ["text", "toolCall"],
          toolNames: ["read"],
          stopReason: "toolUse",
          hasError: false,
        },
        {
          index: 1,
          role: "toolResult",
          contentKinds: ["text"],
          toolNames: ["read"],
          hasError: false,
        },
        {
          index: 2,
          role: "assistant",
          contentKinds: [],
          toolNames: [],
          stopReason: "error",
          hasError: true,
        },
        {
          index: 3,
          role: "unknown",
          contentKinds: ["unknown"],
          contentCharacters: 0,
          toolNames: [],
          hasError: false,
        },
      ],
    });
    expect(outlined.content[0]?.text).toContain("[0] · role=assistant");
    expect(outlined.content[0]?.text).not.toContain("model_switch_failed");
    const allOutput = JSON.stringify(outlined);
    for (const secret of Object.values(secrets)) expect(allOutput).not.toContain(secret);
    expect(allOutput).not.toContain("Packet body");
  });

  it("returns one stable indexed message with paging", async () => {
    const input = record();
    input.messages[1] = {
      role: "toolResult",
      toolName: "read",
      content: [{ type: "text", text: secrets.result.repeat(100) }],
    };
    const { artifact, tool } = await setup(input);
    const result = (await tool.execute(
      "call",
      { artifactId: artifact.artifactId, view: "message", messageIndex: 1, limit: 1_024 },
      undefined,
      undefined,
      {} as never,
    )) as {
      content: Array<{ text: string }>;
      details: { mode: string; messageIndex: number; nextOffset?: number };
    };

    const native = expectStructuredContent(tool, result);
    expect(native).toMatchObject({
      mode: "message",
      artifactId: artifact.artifactId,
      messageIndex: 1,
      offset: 0,
      nextOffset: 512,
    });
    expect(native.text).not.toContain("[output paged;");
    expect(result.content[0]?.text).toContain('"view":"message","messageIndex":1,"offset":512');
    let text = String(native.text);
    let offset = native.nextOffset as number | undefined;
    while (offset !== undefined) {
      const next = await tool.execute(
        "call",
        { artifactId: artifact.artifactId, view: "message", messageIndex: 1, offset, limit: 1_024 },
        undefined,
        undefined,
        {} as never,
      );
      const page = expectStructuredContent(tool, next);
      text += page.text;
      offset = page.nextOffset as number | undefined;
    }
    expect(text).toBe(JSON.stringify(input.messages[1], null, 2));
    expect(JSON.stringify(native)).not.toContain(secrets.text);
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
    expect(expectStructuredContent(tool, result)).toEqual({
      mode: "raw",
      artifactId: artifact.artifactId,
      text: exact,
      offset: 0,
      totalCharacters: exact?.length,
    });

    let reconstructed = "";
    let offset: number | undefined = 0;
    while (offset !== undefined) {
      const page = expectStructuredContent(
        tool,
        await tool.execute(
          "call",
          {
            artifactId: artifact.artifactId,
            view: "raw",
            offset,
            limit: 1_024,
          },
          undefined,
          undefined,
          {} as never,
        ),
      );
      expect(page.text).not.toContain("[output paged;");
      expect(String(page.text).length).toBeLessThanOrEqual(1_024);
      reconstructed += page.text;
      offset = page.nextOffset as number | undefined;
    }
    expect(reconstructed).toBe(exact);
  });

  it("selects list identities and complete outline rows without promoting split rows", async () => {
    const input = record();
    input.messages = Array.from({ length: 20 }, () => ({ role: "user", content: secrets.text }));
    const { artifact, tool } = await setup(input);
    const listed = expectStructuredContent(
      tool,
      await tool.execute("call", {}, undefined, undefined, {} as never),
    );
    const idStart = String(listed.text).indexOf(artifact.artifactId);
    expect(idStart).toBeGreaterThan(0);
    for (const [offset, audits] of [
      [idStart, [artifact]],
      [idStart + 1, []],
    ] as const) {
      const page = expectStructuredContent(
        tool,
        await tool.execute("call", { offset }, undefined, undefined, {} as never),
      );
      expect(page).toMatchObject({ mode: "list", audits, totalAudits: 1 });
    }

    const split = expectStructuredContent(
      tool,
      await tool.execute(
        "call",
        { artifactId: artifact.artifactId, limit: 512 },
        undefined,
        undefined,
        {} as never,
      ),
    );
    expect(split).toMatchObject({
      mode: "outline",
      text: "[",
      rows: [],
      messageIndexes: [],
      totalMessages: 20,
      nextOffset: 1,
    });
    const continued = await tool.execute(
      "call",
      { artifactId: artifact.artifactId, offset: 1 },
      undefined,
      undefined,
      {} as never,
    );
    const native = expectStructuredContent(tool, continued);
    expect(native.messageIndexes).toEqual(Array.from({ length: 19 }, (_, index) => index + 1));
    expect((native.rows as Array<{ index: number }>).map((row) => row.index)).toEqual(
      native.messageIndexes,
    );
    expect((continued as { details: { messageIndexes: number[] } }).details.messageIndexes).toEqual(
      native.messageIndexes,
    );
    expect(JSON.stringify(native)).not.toContain(secrets.text);
  });

  it("returns clean empty text at end offsets in every audit mode", async () => {
    const { artifact, tool } = await setup();
    const selections = [
      {},
      { artifactId: artifact.artifactId },
      { artifactId: artifact.artifactId, view: "message", messageIndex: 1 },
      { artifactId: artifact.artifactId, view: "raw" },
    ];
    for (const selection of selections) {
      const first = expectStructuredContent(
        tool,
        await tool.execute("call", selection, undefined, undefined, {} as never),
      );
      const result = await tool.execute(
        "call",
        { ...selection, offset: first.totalCharacters },
        undefined,
        undefined,
        {} as never,
      );
      const native = expectStructuredContent(tool, result);
      expect(native.text).toBe("");
      expect(native.nextOffset).toBeUndefined();
      if (native.mode === "list") expect(native.audits).toEqual([]);
      if (native.mode === "outline") {
        expect(native.rows).toEqual([]);
        expect(native.messageIndexes).toEqual([]);
      }
      expect((result as { content: Array<{ text: string }> }).content[0]?.text).toBe(
        "[no content]",
      );
    }
  });

  it("keeps empty lists and message arrays as successful metadata-only results", async () => {
    const pi = createPiMock();
    registerReviewAuditTool(pi as unknown as ExtensionAPI, createStore());
    const emptyList = expectStructuredContent(
      getTool(pi, "review_audit"),
      await getTool(pi, "review_audit").execute("call", {}, undefined, undefined, {} as never),
    );
    expect(emptyList).toMatchObject({
      mode: "list",
      audits: [],
      totalAudits: 0,
      text: "No non-expired local reviewer replays were found.",
    });
    const { artifact, tool } = await setup({ ...record(), messages: [] });
    const emptyOutline = expectStructuredContent(
      tool,
      await tool.execute(
        "call",
        { artifactId: artifact.artifactId },
        undefined,
        undefined,
        {} as never,
      ),
    );
    expect(emptyOutline).toMatchObject({
      mode: "outline",
      rows: [],
      messageIndexes: [],
      totalMessages: 0,
      text: "[no messages]",
    });
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
