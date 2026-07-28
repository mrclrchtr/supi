import type { AgentSession } from "@earendil-works/pi-coding-agent";
import { describe, expect, it } from "vitest";
import { buildChildFailureDiagnostics } from "../../src/tool/child-failure-diagnostics.ts";

describe("child failure diagnostic builder", () => {
  it("retains only registered assistant tool names and no assistant text or error", () => {
    const session = {
      messages: [
        {
          role: "assistant",
          content: [
            { type: "text", text: "private assistant text" },
            { type: "toolCall", name: "submit_review" },
            { type: "toolCall", name: "private_unregistered_tool" },
          ],
          stopReason: "toolUse",
          errorMessage: "private assistant error",
        },
      ],
      getActiveToolNames: () => ["submit_review"],
      getSessionStats: () => ({ tokens: { input: 1, output: 2, total: 3 } }),
    } as unknown as AgentSession;

    const diagnostics = buildChildFailureDiagnostics({
      progress: { turns: 1, toolUses: 1 },
      session,
      lifecycleTrace: { entries: [{ type: "agent_settled" }], droppedCount: 0 },
      recentActivity: [],
    });

    expect(diagnostics.lastAssistantToolCalls).toEqual(["submit_review"]);
    expect(JSON.stringify(diagnostics)).not.toContain("private assistant text");
    expect(JSON.stringify(diagnostics)).not.toContain("private assistant error");
    expect(JSON.stringify(diagnostics)).not.toContain("private_unregistered_tool");
  });

  it("retains only a bounded redacted canonical provider error summary", () => {
    const session = {
      messages: [
        {
          role: "assistant",
          content: [{ type: "text", text: "private assistant content" }],
          stopReason: "error",
          errorMessage: `Authorization: Bearer private-token {"apiKey":"private-json-key"}\u001b[31m ${"x".repeat(700)}`,
          error: "private fallback error",
          reason: "private broad-scan value",
        },
      ],
      getActiveToolNames: () => [],
      getSessionStats: () => ({}),
    } as unknown as AgentSession;

    const diagnostics = buildChildFailureDiagnostics({
      progress: { turns: 1, toolUses: 0 },
      session,
      lifecycleTrace: { entries: [], droppedCount: 0 },
      recentActivity: [],
    });

    expect(diagnostics.lastAssistantErrorText).toContain("[REDACTED]");
    expect(diagnostics.lastAssistantErrorText?.length).toBeLessThanOrEqual(501);
    expect(diagnostics.lastAssistantErrorText).not.toContain("private-token");
    expect(diagnostics.lastAssistantErrorText).not.toContain("private-json-key");
    expect(diagnostics.lastAssistantErrorText).not.toContain("\u001b");
    expect(JSON.stringify(diagnostics)).not.toContain("private assistant content");
    expect(JSON.stringify(diagnostics)).not.toContain("private fallback error");
    expect(JSON.stringify(diagnostics)).not.toContain("private broad-scan value");
  });

  it("omits a non-Pi assistant stop reason", () => {
    const session = {
      messages: [
        {
          role: "assistant",
          content: [],
          stopReason: "private_stop_reason",
        },
      ],
      getActiveToolNames: () => [],
      getSessionStats: () => ({}),
    } as unknown as AgentSession;

    const diagnostics = buildChildFailureDiagnostics({
      progress: { turns: 0, toolUses: 0 },
      session,
      lifecycleTrace: { entries: [], droppedCount: 0 },
      recentActivity: [],
    });

    expect(diagnostics.lastAssistantStopReason).toBeUndefined();
    expect(JSON.stringify(diagnostics)).not.toContain("private_stop_reason");
  });

  it("tolerates throwing nested assistant metadata without retaining its error", () => {
    const assistant = { role: "assistant", stopReason: "error" } as Record<string, unknown>;
    Object.defineProperty(assistant, "content", {
      get() {
        throw new Error("private nested assistant getter error");
      },
    });
    const session = {
      messages: [assistant],
      getActiveToolNames: () => [],
      getSessionStats: () => ({}),
    } as unknown as AgentSession;

    expect(() =>
      buildChildFailureDiagnostics({
        progress: { turns: 0, toolUses: 0 },
        session,
        lifecycleTrace: { entries: [], droppedCount: 0 },
        recentActivity: [],
      }),
    ).not.toThrow();

    const diagnostics = buildChildFailureDiagnostics({
      progress: { turns: 0, toolUses: 0 },
      session,
      lifecycleTrace: { entries: [], droppedCount: 0 },
      recentActivity: [],
    });
    expect(diagnostics.lastAssistantStopReason).toBeUndefined();
    expect(diagnostics.lastAssistantToolCalls).toBeUndefined();
    expect(JSON.stringify(diagnostics)).not.toContain("private nested assistant getter error");
  });

  it("tolerates a throwing session-message getter without retaining its error", () => {
    const session = {
      get messages() {
        throw new Error("private session message getter error");
      },
      getActiveToolNames: () => [],
      getSessionStats: () => ({}),
    } as unknown as AgentSession;

    const diagnostics = buildChildFailureDiagnostics({
      progress: { turns: 0, toolUses: 0 },
      session,
      lifecycleTrace: { entries: [], droppedCount: 0 },
      recentActivity: [],
    });

    expect(diagnostics.lastAssistantStopReason).toBeUndefined();
    expect(diagnostics.lastAssistantToolCalls).toBeUndefined();
    expect(JSON.stringify(diagnostics)).not.toContain("private session message getter error");
  });
});
