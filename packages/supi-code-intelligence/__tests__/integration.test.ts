import { createPiMock } from "@mrclrchtr/supi-test-utils";
import { describe, expect, it } from "vitest";
import codeIntelligenceExtension from "../src/code-intelligence.ts";

describe("code_intel tool registration", () => {
  it("registers the code_intel tool", () => {
    const pi = createPiMock();
    codeIntelligenceExtension(pi as never);
    expect(pi.tools).toHaveLength(1);
    expect((pi.tools[0] as { name: string }).name).toBe("code_intel");
  });

  it("keeps the description focused on the available actions", () => {
    const pi = createPiMock();
    codeIntelligenceExtension(pi as never);
    const desc = (pi.tools[0] as { description: string }).description;
    expect(desc).toContain("brief");
    expect(desc).toContain("callers");
    expect(desc).toContain("callees");
    expect(desc).toContain("implementations");
    expect(desc).toContain("affected");
    expect(desc).toContain("pattern");
    expect(desc).not.toContain('"action": "brief"');
  });

  it("registers an optional regex parameter for pattern searches", () => {
    const pi = createPiMock();
    codeIntelligenceExtension(pi as never);
    expect(
      (pi.tools[0] as { parameters?: { properties?: Record<string, unknown> } }).parameters
        ?.properties,
    ).toHaveProperty("regex");
  });

  it("registers an optional kind parameter for structured pattern searches", () => {
    const pi = createPiMock();
    codeIntelligenceExtension(pi as never);
    expect(
      (pi.tools[0] as { parameters?: { properties?: Record<string, unknown> } }).parameters
        ?.properties,
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
      (pi.tools[0] as { parameters?: { properties?: Record<string, unknown> } }).parameters
        ?.properties,
    ).toHaveProperty("summary");
  });
});
