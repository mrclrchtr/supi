import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createAgentSession: vi.fn(),
  createAgentSessionRuntime: vi.fn(),
  createModelRuntime: vi.fn(async () => ({
    getProviders: vi.fn(() => []),
    registerNativeProvider: vi.fn(),
    refresh: vi.fn(async () => undefined),
  })),
}));

vi.mock("@earendil-works/pi-coding-agent", async (original) => ({
  ...(await original()),
  ModelRuntime: { create: mocks.createModelRuntime },
  createAgentSession: mocks.createAgentSession,
  createAgentSessionRuntime: mocks.createAgentSessionRuntime,
}));

import type { AgentRunDiagnostics } from "../../src/api.ts";
import { formatAgentRunDiagnostics, startAgentRun } from "../../src/api.ts";
import { createHarness, inputs } from "../helpers/agent-run-harness.ts";

beforeEach(() => vi.clearAllMocks());

async function failureDiagnostics(
  configure: (harness: ReturnType<typeof createHarness>) => void,
): Promise<AgentRunDiagnostics> {
  const harness = createHarness(mocks);
  configure(harness);
  const outcome = await startAgentRun({
    inputs: inputs(),
    prompt: "collect diagnostics",
    completionResolver: () => undefined,
  }).result;
  if (outcome.kind !== "failed" || outcome.failureCode === "session-creation-failed") {
    throw new Error("Expected an Agent Run failure with diagnostics");
  }
  return outcome.diagnostics;
}

describe("Agent Run diagnostics", () => {
  it("retains bounded safe metadata without assistant content or private tools", async () => {
    const diagnostics = await failureDiagnostics((harness) => {
      harness.session.messages = [
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
      ];
    });

    expect(diagnostics.lastAssistantToolCalls).toEqual(["read"]);
    expect(diagnostics.lastAssistantErrorText).toContain("[REDACTED]");
    expect(diagnostics.lastAssistantErrorText?.length).toBeLessThanOrEqual(500);
    const retained = JSON.stringify(diagnostics);
    for (const privateValue of [
      "private assistant content",
      "private-token",
      "private-json-key",
      "dXNlcjpwYXNz",
      "private-digest",
      "private_tool",
      "\u001b",
    ]) {
      expect(retained).not.toContain(privateValue);
    }
  });

  it("redacts provider credential forms through the Agent Run outcome", async () => {
    const escapedQuote = String.fromCharCode(92);
    const cases = [
      {
        error: '{"authorization":"Digest username=\\"u\\", response=\\"private-digest\\"}"',
        secrets: ["private-digest"],
      },
      {
        error: `{${escapedQuote}"authorization${escapedQuote}":${escapedQuote}"Basic escaped-value${escapedQuote}"}`,
        secrets: ["escaped-value"],
      },
      {
        error: `\u001b[31mAuthorization\u001b[0m: Basic ${"private-ansi-credential"}`,
        secrets: ["private-ansi-credential"],
      },
      {
        error: `Bearer ${["abc", "def"].join("\u001b[0m")}`,
        secrets: ["abcdef", "def"],
      },
      {
        error: `API key: ${"api-value"}; credential = ${"credential-value"}`,
        secrets: ["api-value", "credential-value"],
      },
      {
        error: `Incorrect API key provided: ${["sk", "example", "value"].join("-")}`,
        secrets: ["sk-example-value"],
      },
    ];

    for (const entry of cases) {
      const diagnostics = await failureDiagnostics((harness) => {
        harness.session.messages = [
          { role: "assistant", content: [], stopReason: "error", errorMessage: entry.error },
        ];
      });
      for (const secret of entry.secrets) {
        expect(diagnostics.lastAssistantErrorText).not.toContain(secret);
      }
    }

    const diagnostics = await failureDiagnostics((harness) => {
      harness.session.messages = [
        {
          role: "assistant",
          content: [],
          stopReason: "error",
          errorMessage: "provider returned a response body with repository evidence",
        },
      ];
    });
    expect(diagnostics.lastAssistantErrorText).toBe("provider error");
  });

  it("bounds assistant tool metadata and discloses omitted calls", async () => {
    const names = Array.from({ length: 100 }, (_, index) => `tool-${index}`);
    const diagnostics = await failureDiagnostics((harness) => {
      harness.session.getActiveToolNames.mockReturnValue(names);
      harness.session.messages = [
        {
          role: "assistant",
          content: names.map((name) => ({ type: "toolCall", name })),
        },
      ];
    });

    expect(diagnostics.lastAssistantToolCalls?.length).toBeLessThan(names.length);
    expect(diagnostics.lastAssistantToolCallsDropped).toBeGreaterThan(0);
    expect(formatAgentRunDiagnostics(diagnostics).join("\n")).toContain("omitted");
  });

  it("fails closed for unknown metadata and throwing getters", async () => {
    const unknown = await failureDiagnostics((harness) => {
      harness.session.getActiveToolNames.mockImplementation(() => {
        throw new Error("private lookup error");
      });
      harness.session.messages = [
        {
          role: "assistant",
          content: [{ type: "toolCall", name: "private_tool" }],
          stopReason: "private_stop_reason",
        },
      ];
    });
    expect(unknown.lastAssistantStopReason).toBeUndefined();
    expect(unknown.lastAssistantToolCalls).toBeUndefined();
    expect(JSON.stringify(unknown)).not.toContain("private_");

    const assistant = { role: "assistant", stopReason: "error" } as Record<string, unknown>;
    Object.defineProperty(assistant, "content", {
      get() {
        throw new Error("private nested getter error");
      },
    });
    const nested = await failureDiagnostics((harness) => {
      harness.session.messages = [assistant];
    });
    expect(JSON.stringify(nested)).not.toContain("private");

    const throwing = await failureDiagnostics((harness) => {
      Object.defineProperty(harness.session, "messages", {
        get() {
          throw new Error("private messages getter error");
        },
      });
    });
    expect(throwing.lastAssistantStopReason).toBeUndefined();
    expect(JSON.stringify(throwing)).not.toContain("private");
  });

  it("keeps allowlisted lifecycle activity and bounds retained history", async () => {
    const longName = `tool-${"x".repeat(200)}`;
    const diagnostics = await failureDiagnostics((harness) => {
      harness.session.getActiveToolNames.mockReturnValue(["read", longName]);
      harness.session.prompt.mockImplementationOnce(async (_prompt, options) => {
        options?.preflightResult?.(true);
        for (let index = 0; index < 100; index++) {
          harness.session.emit({ type: "agent_start" });
        }
        harness.session.emit({
          type: "tool_execution_start",
          toolName: "read",
          args: { private: "argument" },
        });
        harness.session.emit({
          type: "tool_execution_start",
          toolName: "private_tool",
          args: { private: "argument" },
        });
        harness.session.emit({ type: "tool_execution_start", toolName: longName });
        harness.session.emit({ type: "agent_settled" });
      });
    });

    expect(diagnostics.lifecycleTrace.entries.length).toBeLessThan(101);
    expect(diagnostics.lifecycleTrace.droppedCount).toBeGreaterThan(0);
    expect(diagnostics.lifecycleTrace.entries.at(-1)).toEqual({ type: "agent_settled" });
    expect(diagnostics.recentActivity).toContain("tool:start:read");
    const boundedName = diagnostics.recentActivity?.find((entry) =>
      entry.startsWith("tool:start:tool-"),
    );
    expect(boundedName?.length).toBeLessThan(`tool:start:${longName}`.length);
    expect(JSON.stringify(diagnostics)).not.toContain("private");
    expect(formatAgentRunDiagnostics(diagnostics).join("\n")).toContain(
      "Agent Run Lifecycle Trace",
    );
  });
});
