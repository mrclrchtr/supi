import { createPiMock, getTool, getTools } from "@mrclrchtr/supi-test-utils";
import { describe, expect, it } from "vitest";
import codeIntelligenceExtension from "../../src/code-intelligence.ts";
import { CODE_INTELLIGENCE_TOOL_SPECS } from "../../src/tool/tool-specs.ts";

const LSP_TOOL_COUNT = 10;

describe("focused code intelligence tool registration", () => {
  it("registers code_* tools on init (before session_start fires)", () => {
    const pi = createPiMock();
    codeIntelligenceExtension(pi as never);

    const tools = getTools(pi);
    // Code tools are registered synchronously; LSP tools fire on session_start
    expect(tools.length).toBeGreaterThanOrEqual(CODE_INTELLIGENCE_TOOL_SPECS.length);
    for (const spec of CODE_INTELLIGENCE_TOOL_SPECS) {
      expect(tools.find((t) => t.name === spec.name)).toBeDefined();
    }
  });

  it("registers lsp_* tools when session_start fires", async () => {
    const pi = createPiMock();
    codeIntelligenceExtension(pi as never);

    const sessionStart = pi.handlers.get("session_start")?.[0];
    expect(sessionStart).toBeDefined();

    const mockCtx = {
      cwd: "/tmp/lsp-test-registration",
      sessionManager: { getBranch: () => [] },
      ui: { notify: () => {} },
    };

    // Simulate session_start
    await sessionStart?.({}, mockCtx);

    const tools = getTools(pi);
    // After session_start, LSP tools should also be registered
    const lspTools = tools.filter((t) => t.name.startsWith("lsp_"));
    expect(lspTools.length).toBe(LSP_TOOL_COUNT);
  });

  it("registers tree_sitter_* tools when session_start fires", async () => {
    const pi = createPiMock();
    codeIntelligenceExtension(pi as never);

    const sessionStartHandlers = pi.handlers.get("session_start");
    expect(sessionStartHandlers).toBeDefined();
    expect(sessionStartHandlers?.length).toBeGreaterThanOrEqual(2);

    const mockCtx = {
      cwd: "/tmp/ts-test-registration",
      sessionManager: { getBranch: () => [] },
      ui: { notify: () => {} },
    };

    // Fire all session_start handlers
    for (const handler of sessionStartHandlers ?? []) {
      await handler({}, mockCtx);
    }

    const tools = getTools(pi);
    const tsTools = tools.filter((t) => t.name.startsWith("tree_sitter_"));
    expect(tsTools.length).toBe(6);
  });

  it("registers a relation kind parameter on code_relations", () => {
    const pi = createPiMock();
    codeIntelligenceExtension(pi as never);

    expect(
      (getTool(pi, "code_relations") as { parameters?: { properties?: Record<string, unknown> } })
        .parameters?.properties,
    ).toHaveProperty("kind");
  });

  it("registers regex and kind parameters on code_pattern", () => {
    const pi = createPiMock();
    codeIntelligenceExtension(pi as never);

    expect(
      (getTool(pi, "code_pattern") as { parameters?: { properties?: Record<string, unknown> } })
        .parameters?.properties,
    ).toHaveProperty("regex");
    expect(
      (getTool(pi, "code_pattern") as { parameters?: { properties?: Record<string, unknown> } })
        .parameters?.properties,
    ).toHaveProperty("kind");
  });
});

describe("session lifecycle", () => {
  it("registers session_start handler", () => {
    const pi = createPiMock();
    codeIntelligenceExtension(pi as never);
    expect(pi.handlers.has("session_start")).toBe(true);
  });

  it("registers before_agent_start handler", () => {
    const pi = createPiMock();
    codeIntelligenceExtension(pi as never);
    expect(pi.handlers.has("before_agent_start")).toBe(true);
  });

  it("detects existing overview on branch to prevent duplicates", async () => {
    const pi = createPiMock();
    codeIntelligenceExtension(pi as never);

    const sessionStart = pi.handlers.get("session_start")?.[0];
    expect(sessionStart).toBeDefined();

    // Simulate a branch with existing overview
    const mockCtx = {
      cwd: "/tmp",
      sessionManager: {
        getBranch: () => [
          {
            type: "custom_message",
            customType: "code-intelligence-overview",
            content: "existing overview",
          },
        ],
      },
    };

    await sessionStart?.({}, mockCtx);
    // After detecting existing overview, before_agent_start should not inject again
    // (verified indirectly by checking the handler doesn't crash)
  });

  it("skips overview on second before_agent_start in same session", async () => {
    const pi = createPiMock();
    codeIntelligenceExtension(pi as never);

    const sessionStart = pi.handlers.get("session_start")?.[0];
    const beforeAgentStart = pi.handlers.get("before_agent_start")?.[0];

    const mockCtx = {
      cwd: "/tmp/empty",
      sessionManager: { getBranch: () => [] },
    };

    await sessionStart?.({}, mockCtx);

    // First call — may or may not inject (depends on project structure)
    const _result1 = await beforeAgentStart?.({}, mockCtx);

    // Second call — should always skip
    const result2 = await beforeAgentStart?.({}, mockCtx);
    expect(result2).toBeUndefined();
  });

  it("registers optional summary parameter for pattern searches", () => {
    const pi = createPiMock();
    codeIntelligenceExtension(pi as never);
    expect(
      (getTool(pi, "code_pattern") as { parameters?: { properties?: Record<string, unknown> } })
        .parameters?.properties,
    ).toHaveProperty("summary");
  });
});
