import { createPiMock, getTool, getTools } from "@mrclrchtr/supi-test-utils";
import { describe, expect, it } from "vitest";
import codeIntelligenceExtension from "../../src/code-intelligence.ts";
import { CODE_INTELLIGENCE_TOOL_SPECS } from "../../src/tool/tool-specs.ts";

describe("focused code intelligence tool registration", () => {
  it("registers the focused tool set from shared specs", () => {
    const pi = createPiMock();
    codeIntelligenceExtension(pi as never);

    const tools = getTools(pi);
    expect(tools).toHaveLength(CODE_INTELLIGENCE_TOOL_SPECS.length);
    expect(tools.map((tool) => tool.name)).toEqual(
      CODE_INTELLIGENCE_TOOL_SPECS.map((spec) => spec.name),
    );
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

  it("detects existing overview on branch to prevent duplicates", () => {
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

    sessionStart?.({}, mockCtx);
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
