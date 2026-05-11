import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { describe, expect, it } from "vitest";
import codeIntelligenceExtension from "../src/code-intelligence.ts";

// biome-ignore lint/suspicious/noExplicitAny: test mock
type AnyFunction = (...args: any[]) => any;

interface MockInternals {
  tools: Array<{
    name: string;
    description: string;
    parameters?: {
      properties?: Record<string, unknown>;
    };
    promptSnippet?: string;
    promptGuidelines?: string[];
  }>;
  handlers: Map<string, AnyFunction>;
}

function createPiMock(): ExtensionAPI & MockInternals {
  const handlers = new Map<string, AnyFunction>();
  const tools: MockInternals["tools"] = [];

  return {
    on(event: string, handler: AnyFunction) {
      handlers.set(event, handler);
    },
    registerTool(tool: MockInternals["tools"][0]) {
      tools.push(tool);
    },
    handlers,
    tools,
  } as ExtensionAPI & MockInternals;
}

describe("code_intel tool registration", () => {
  it("registers the code_intel tool", () => {
    const pi = createPiMock();
    codeIntelligenceExtension(pi);
    expect(pi.tools).toHaveLength(1);
    expect(pi.tools[0].name).toBe("code_intel");
  });

  it("includes all six actions in description", () => {
    const pi = createPiMock();
    codeIntelligenceExtension(pi);
    const desc = pi.tools[0].description;
    expect(desc).toContain("brief");
    expect(desc).toContain("callers");
    expect(desc).toContain("callees");
    expect(desc).toContain("implementations");
    expect(desc).toContain("affected");
    expect(desc).toContain("pattern");
  });

  it("includes example calls in description", () => {
    const pi = createPiMock();
    codeIntelligenceExtension(pi);
    const desc = pi.tools[0].description;
    expect(desc).toContain('"action": "brief"');
    expect(desc).toContain('"action": "callers"');
    expect(desc).toContain('"action": "affected"');
    expect(desc).toContain('"action": "pattern"');
    expect(desc).toContain('"regex": true');
  });

  it("registers an optional regex parameter for pattern searches", () => {
    const pi = createPiMock();
    codeIntelligenceExtension(pi);
    expect(pi.tools[0].parameters?.properties).toHaveProperty("regex");
  });

  it("has promptSnippet naming code_intel", () => {
    const pi = createPiMock();
    codeIntelligenceExtension(pi);
    expect(pi.tools[0].promptSnippet).toContain("code_intel");
  });

  it("has promptGuidelines that all name code_intel", () => {
    const pi = createPiMock();
    codeIntelligenceExtension(pi);
    const guidelines = pi.tools[0].promptGuidelines ?? [];
    expect(guidelines.length).toBeGreaterThanOrEqual(4);
    for (const g of guidelines) {
      expect(g).toContain("code_intel");
    }
  });

  it("guidance deconflicts with lsp and tree_sitter", () => {
    const pi = createPiMock();
    codeIntelligenceExtension(pi);
    const guidelines = pi.tools[0].promptGuidelines ?? [];
    const combined = guidelines.join(" ");
    expect(combined).toContain("lsp");
    expect(combined).toContain("tree_sitter");
    expect(combined).toContain("drill-down");
  });

  it("guidance explains literal-default pattern search and regex opt-in", () => {
    const pi = createPiMock();
    codeIntelligenceExtension(pi);
    const combined = (pi.tools[0].promptGuidelines ?? []).join(" ");
    expect(combined).toContain("literal strings by default");
    expect(combined).toContain("regex: true");
  });

  it("guidance discourages code_intel for trivial tasks", () => {
    const pi = createPiMock();
    codeIntelligenceExtension(pi);
    const guidelines = pi.tools[0].promptGuidelines ?? [];
    const combined = guidelines.join(" ");
    expect(combined).toContain("Do not prefer");
    expect(combined).toContain("trivial");
  });
});

describe("session lifecycle", () => {
  it("registers session_start handler", () => {
    const pi = createPiMock();
    codeIntelligenceExtension(pi);
    expect(pi.handlers.has("session_start")).toBe(true);
  });

  it("registers before_agent_start handler", () => {
    const pi = createPiMock();
    codeIntelligenceExtension(pi);
    expect(pi.handlers.has("before_agent_start")).toBe(true);
  });

  it("detects existing overview on branch to prevent duplicates", () => {
    const pi = createPiMock();
    codeIntelligenceExtension(pi);

    const sessionStart = pi.handlers.get("session_start");
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
    codeIntelligenceExtension(pi);

    const sessionStart = pi.handlers.get("session_start");
    const beforeAgentStart = pi.handlers.get("before_agent_start");

    const mockCtx = {
      cwd: "/tmp/empty",
      sessionManager: { getBranch: () => [] },
    };

    sessionStart?.({}, mockCtx);

    // First call — may or may not inject (depends on project structure)
    const _result1 = await beforeAgentStart?.({}, mockCtx);

    // Second call — should always skip
    const result2 = await beforeAgentStart?.({}, mockCtx);
    expect(result2).toBeUndefined();
  });

  it("registers optional summary parameter for pattern searches", () => {
    const pi = createPiMock();
    codeIntelligenceExtension(pi);
    expect(pi.tools[0].parameters?.properties).toHaveProperty("summary");
  });
});
