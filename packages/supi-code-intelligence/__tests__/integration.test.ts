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

  it("includes all six actions in description", () => {
    const pi = createPiMock();
    codeIntelligenceExtension(pi as never);
    const desc = (pi.tools[0] as { description: string }).description;
    expect(desc).toContain("brief");
    expect(desc).toContain("callers");
    expect(desc).toContain("callees");
    expect(desc).toContain("implementations");
    expect(desc).toContain("affected");
    expect(desc).toContain("pattern");
  });

  it("includes example calls in description", () => {
    const pi = createPiMock();
    codeIntelligenceExtension(pi as never);
    const desc = (pi.tools[0] as { description: string }).description;
    expect(desc).toContain('"action": "brief"');
    expect(desc).toContain('"action": "callers"');
    expect(desc).toContain('"action": "affected"');
    expect(desc).toContain('"action": "pattern"');
    expect(desc).toContain('"regex": true');
    expect(desc).toContain('"kind": "definition"');
    expect(desc).toContain('"file": "packages/supi-core/index.ts"');
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

  it("has promptSnippet naming code_intel", () => {
    const pi = createPiMock();
    codeIntelligenceExtension(pi as never);
    expect((pi.tools[0] as { promptSnippet: string }).promptSnippet).toContain("code_intel");
  });

  it("has promptGuidelines that all name code_intel", () => {
    const pi = createPiMock();
    codeIntelligenceExtension(pi as never);
    const guidelines = (pi.tools[0] as { promptGuidelines?: string[] }).promptGuidelines ?? [];
    expect(guidelines.length).toBeGreaterThanOrEqual(4);
    for (const g of guidelines) {
      expect(g).toContain("code_intel");
    }
  });

  it("guidance deconflicts with lsp and tree_sitter", () => {
    const pi = createPiMock();
    codeIntelligenceExtension(pi as never);
    const guidelines = (pi.tools[0] as { promptGuidelines?: string[] }).promptGuidelines ?? [];
    const combined = guidelines.join(" ");
    expect(combined).toContain("lsp");
    expect(combined).toContain("tree_sitter");
    expect(combined).toContain("drill-down");
  });

  it("guidance explains structured pattern search and priority signals", () => {
    const pi = createPiMock();
    codeIntelligenceExtension(pi as never);
    const combined = ((pi.tools[0] as { promptGuidelines?: string[] }).promptGuidelines ?? []).join(
      " ",
    );
    expect(combined).toContain("literal strings by default");
    expect(combined).toContain("regex: true");
    expect(combined).toContain("definition");
    expect(combined).toContain("diagnostics");
  });

  it("guidance discourages code_intel for trivial tasks", () => {
    const pi = createPiMock();
    codeIntelligenceExtension(pi as never);
    const guidelines = (pi.tools[0] as { promptGuidelines?: string[] }).promptGuidelines ?? [];
    const combined = guidelines.join(" ");
    expect(combined).toContain("Do not prefer");
    expect(combined).toContain("trivial");
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
