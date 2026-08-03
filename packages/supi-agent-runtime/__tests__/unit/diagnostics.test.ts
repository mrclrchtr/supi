import type { AgentSession } from "@earendil-works/pi-coding-agent";
import { describe, expect, it } from "vitest";
import {
  buildAgentRunDiagnostics,
  formatAgentRunDiagnostics,
  sanitizeAgentRunErrorText,
} from "../../src/api.ts";

function build(session: unknown) {
  return buildAgentRunDiagnostics({
    progress: { turns: 1, toolUses: 1 },
    session: session as AgentSession,
    lifecycleTrace: { entries: [{ type: "agent_settled" }], droppedCount: 0 },
    recentActivity: [],
  });
}

describe("Agent Run diagnostics", () => {
  it("retains bounded safe metadata without assistant content or private tools", () => {
    const session = {
      messages: [
        {
          role: "assistant",
          content: [
            { type: "text", text: "private assistant content" },
            { type: "toolCall", name: "read" },
            { type: "toolCall", name: "private_tool" },
          ],
          stopReason: "error",
          errorMessage: `\u001b[31mAuthorization: Bearer private-token {"apiKey":"private-json-key"}\nAuthorization: Basic dXNlcjpwYXNz\nAuthorization: Digest username="a;b", response="private-digest" ${"x".repeat(700)}`,
        },
      ],
      getActiveToolNames: () => ["read"],
      getSessionStats: () => ({ tokens: { input: 1, output: 2, total: 3 } }),
    };

    const diagnostics = build(session);
    expect(diagnostics.lastAssistantToolCalls).toEqual(["read"]);
    expect(diagnostics.lastAssistantErrorText).toContain("[REDACTED]");
    expect(diagnostics.lastAssistantErrorText?.length).toBeLessThanOrEqual(500);
    expect(JSON.stringify(diagnostics)).not.toContain("private assistant content");
    expect(JSON.stringify(diagnostics)).not.toContain("private-token");
    expect(JSON.stringify(diagnostics)).not.toContain("private-json-key");
    expect(JSON.stringify(diagnostics)).not.toContain("dXNlcjpwYXNz");
    expect(JSON.stringify(diagnostics)).not.toContain("private-digest");
    expect(JSON.stringify(diagnostics)).not.toContain("private_tool");
    expect(JSON.stringify(diagnostics)).not.toContain("\u001b");
  });

  it("redacts escaped JSON credentials and ANSI-split authorization headers", () => {
    const text = sanitizeAgentRunErrorText(
      '{"authorization":"Digest username=\\"u\\", response=\\"private-digest\\"}"',
    );
    const escapedQuote = String.fromCharCode(92);
    const escapedKeyText = sanitizeAgentRunErrorText(
      `{${escapedQuote}"authorization${escapedQuote}":${escapedQuote}"Basic escaped-value${escapedQuote}"}`,
    );
    const ansiText = sanitizeAgentRunErrorText(
      `\u001b[31mAuthorization\u001b[0m: Basic private-ansi-credential`,
    );
    const splitBearerText = sanitizeAgentRunErrorText(`Bearer abc\u001b[0mdef`);
    const naturalLabelText = sanitizeAgentRunErrorText(
      `API key: ${"api-value"}; credential = ${"credential-value"}`,
    );

    expect(text).not.toContain("private-digest");
    expect(escapedKeyText).not.toContain("escaped-value");
    expect(ansiText).not.toContain("private-ansi-credential");
    expect(splitBearerText).not.toContain("abcdef");
    expect(splitBearerText).not.toContain("def");
    expect(naturalLabelText).not.toContain("api-value");
    expect(naturalLabelText).not.toContain("credential-value");
  });

  it("bounds assistant tool metadata and discloses omitted calls", () => {
    const names = Array.from({ length: 12 }, (_, index) => `tool-${index}`);
    const diagnostics = build({
      messages: [
        {
          role: "assistant",
          content: names.map((name) => ({ type: "toolCall", name })),
        },
      ],
      getActiveToolNames: () => names,
    });

    expect(diagnostics.lastAssistantToolCalls).toHaveLength(10);
    expect(diagnostics.lastAssistantToolCallsDropped).toBe(2);
    expect(formatAgentRunDiagnostics(diagnostics).join("\n")).toContain("+2 omitted");
  });

  it("omits unknown stop reasons and fails closed when tool lookup throws", () => {
    const diagnostics = build({
      messages: [
        {
          role: "assistant",
          content: [{ type: "toolCall", name: "private_tool" }],
          stopReason: "private_stop_reason",
        },
      ],
      getActiveToolNames: () => {
        throw new Error("private lookup error");
      },
      getSessionStats: () => ({ tokens: { input: 0, output: 0, total: 0 } }),
    });

    expect(diagnostics.lastAssistantStopReason).toBeUndefined();
    expect(diagnostics.lastAssistantToolCalls).toBeUndefined();
    expect(JSON.stringify(diagnostics)).not.toContain("private_");
  });

  it("tolerates throwing message and nested-content getters without retaining errors", () => {
    const assistant = { role: "assistant", stopReason: "error" } as Record<string, unknown>;
    Object.defineProperty(assistant, "content", {
      get() {
        throw new Error("private nested getter error");
      },
    });
    expect(() => build({ messages: [assistant], getActiveToolNames: () => [] })).not.toThrow();

    const diagnostics = build({
      get messages() {
        throw new Error("private messages getter error");
      },
      getActiveToolNames: () => [],
    });
    expect(diagnostics.lastAssistantStopReason).toBeUndefined();
    expect(JSON.stringify(diagnostics)).not.toContain("private");
  });
});
