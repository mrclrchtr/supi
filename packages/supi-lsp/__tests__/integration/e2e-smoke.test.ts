// biome-ignore-all lint/style/noNonNullAssertion: test assertions use ! after guard checks
// biome-ignore-all lint/suspicious/noNonNullAssertedOptionalChain: test patterns with guard checks

/**
 * End-to-end smoke test for the SuPi code-intelligence stack.
 *
 * Exercises the three extensions (supi-lsp, supi-tree-sitter, supi-code-intelligence)
 * together through a simulated pi lifecycle — extension load, tool registration,
 * first-turn overview injection, tree-sitter parse, session lifecycle, dedup,
 * and cleanup.
 *
 * This is NOT a unit test. It tests real extension behavior as pi would invoke it.
 */

import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { BeforeAgentStartEventResult, ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Check } from "typebox/value";
import { afterEach, describe, expect, it } from "vitest";
import codeIntelligenceExtension from "../../../supi-code-intelligence/src/code-intelligence.ts";
import treeSitterExtension from "../../../supi-tree-sitter/src/tree-sitter.ts";
import lspExtension from "../../src/lsp.ts";

// ── Helpers ───────────────────────────────────────────────────────────

// biome-ignore lint/suspicious/noExplicitAny: test mock internals
type AnyFunction = (...args: any[]) => any;

interface RegisteredTool {
  name: string;
  description: string;
  parameters?: {
    type?: string;
    properties?: Record<string, unknown>;
    [key: string]: unknown;
  };
  execute: AnyFunction;
  promptGuidelines?: string[];
  promptSnippet?: string;
}

interface MockInternals {
  tools: RegisteredTool[];
  /**
   * Map of event → single handler (last-registered wins).
   * For single-extension tests, use `handlers.get(event)!` directly.
   * For multi-extension tests, use `emit(event, ...)` which fires ALL registered handlers.
   */
  handlers: Map<string, AnyFunction>;
  renderers: Map<string, AnyFunction>;
  activeTools: string[];
  setActiveTools: (tools: string[]) => void;
  /** Internal: all registered handlers per event (for multi-extension support) */
  _allHandlers: Map<string, AnyFunction[]>;
  /** Invoke ALL handlers registered for an event, in registration order */
  emit: (event: string, ...args: unknown[]) => Promise<void>;
}

function createPiMock(): ExtensionAPI & MockInternals {
  const handlers = new Map<string, AnyFunction>();
  const allHandlers = new Map<string, AnyFunction[]>();
  const tools: RegisteredTool[] = [];
  const renderers = new Map<string, AnyFunction>();
  let activeTools: string[] = [];

  function recordHandler(event: string, handler: AnyFunction) {
    // For single-handler access (backward compat)
    handlers.set(event, handler);
    // For multi-handler support
    const existing = allHandlers.get(event);
    if (existing) {
      existing.push(handler);
    } else {
      allHandlers.set(event, [handler]);
    }
  }

  const pi = {
    on(event: string, handler: AnyFunction) {
      recordHandler(event, handler);
    },
    registerTool(tool: RegisteredTool) {
      tools.push(tool);
    },
    registerCommand(_name: string, _handler: unknown) {
      // no-op in smoke test
    },
    registerMessageRenderer(customType: string, renderer: AnyFunction) {
      renderers.set(customType, renderer);
    },
    getActiveTools: () => activeTools,
    setActiveTools: (tools: string[]) => {
      activeTools = tools;
    },
    appendEntry: () => {},
    tools,
    handlers,
    _allHandlers: allHandlers,
    renderers,
    activeTools,
    emit: async (event: string, ...args: unknown[]) => {
      const eventHandlers = allHandlers.get(event);
      if (!eventHandlers) return;
      for (const handler of eventHandlers) {
        await handler(...args);
      }
    },
  };
  return pi as unknown as ExtensionAPI & MockInternals;
}

function createSessionCtx(cwd: string) {
  return {
    cwd,
    ui: {
      notify: () => {},
      setStatus: () => {},
      setWidget: () => {},
      removeWidget: () => {},
      theme: {
        fg: (_color: string, text: string) => text,
        bg: (_color: string, text: string) => text,
      },
    },
    sessionManager: {
      getBranch: () => [],
    },
  };
}

// ── Fixture helpers ───────────────────────────────────────────────────

function createTempProjectDir(): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), "supi-e2e-"));
  writeFileSync(
    path.join(dir, "package.json"),
    JSON.stringify({
      name: "test-project",
      description: "A test project for SuPi e2e smoke tests",
      private: true,
    }),
  );
  writeFileSync(
    path.join(dir, "math.ts"),
    [
      "/** Adds two numbers */",
      "export function add(a: number, b: number): number {",
      "  return a + b;",
      "}",
      "",
      "export const PI = 3.14159;",
      "",
      "export class Calculator {",
      "  sum(a: number, b: number): number {",
      "    return add(a, b);",
      "  }",
      "}",
      "",
    ].join("\n"),
  );
  writeFileSync(path.join(dir, "index.ts"), 'export { add, PI, Calculator } from "./math.ts";\n');
  writeFileSync(
    path.join(dir, "utils.ts"),
    `export function greet(name: string): string {\n  return \`Hello, \${name}!\`;\n}\n`,
  );
  return dir;
}

const CODE_INTELLIGENCE_TOOL_NAMES = [
  "code_brief",
  "code_map",
  "code_relations",
  "code_affected",
  "code_pattern",
] as const;

const LSP_TOOL_NAMES = [
  "lsp_lookup",
  "lsp_document_symbols",
  "lsp_workspace_symbols",
  "lsp_diagnostics",
  "lsp_refactor",
  "lsp_recover",
] as const;

// ── Test Suite ────────────────────────────────────────────────────────

describe("SuPi e2e smoke – extension load", () => {
  it("supi-lsp extension loads without error", () => {
    const pi = createPiMock();
    expect(() => lspExtension(pi)).not.toThrow();
  });

  it("supi-tree-sitter extension loads without error", () => {
    const pi = createPiMock();
    expect(() => treeSitterExtension(pi)).not.toThrow();
  });

  it("supi-code-intelligence extension loads without error", () => {
    const pi = createPiMock();
    expect(() => codeIntelligenceExtension(pi)).not.toThrow();
  });

  it("all three extensions load together without error", () => {
    const pi = createPiMock();
    expect(() => {
      lspExtension(pi);
      treeSitterExtension(pi);
      codeIntelligenceExtension(pi);
    }).not.toThrow();
  });
});

describe("SuPi e2e smoke – tool registration", () => {
  it("registers the expert LSP toolset plus tree_sitter and the focused code-intelligence tools", () => {
    const pi = createPiMock();
    lspExtension(pi);
    treeSitterExtension(pi);
    codeIntelligenceExtension(pi);

    const toolNames = pi.tools.map((t) => t.name);
    for (const toolName of LSP_TOOL_NAMES) {
      expect(toolNames).toContain(toolName);
    }
    for (const toolName of CODE_INTELLIGENCE_TOOL_NAMES) {
      expect(toolNames).toContain(toolName);
    }
    expect(toolNames).toContain("tree_sitter");
    // LSP also registers read/write/edit overrides for inline diagnostics
    expect(toolNames).toContain("read");
    expect(toolNames).toContain("write");
    expect(toolNames).toContain("edit");
    expect(pi.tools).toHaveLength(15);
  });

  it("each tool has execute function, description, and parameters", () => {
    const pi = createPiMock();
    lspExtension(pi);
    treeSitterExtension(pi);
    codeIntelligenceExtension(pi);

    for (const tool of pi.tools) {
      expect(tool.execute).toBeDefined();
      expect(typeof tool.execute).toBe("function");
      expect(tool.description).toBeDefined();
      expect(tool.description.length).toBeGreaterThan(0);
      expect(tool.parameters).toBeDefined();
    }
  });

  it("expert LSP tool descriptions advertise the split semantic workflow", () => {
    const pi = createPiMock();
    lspExtension(pi);

    expect(pi.tools.find((t) => t.name === "lsp_lookup")?.description).toContain("hover");
    expect(pi.tools.find((t) => t.name === "lsp_lookup")?.description).toContain("implementation");
    expect(pi.tools.find((t) => t.name === "lsp_document_symbols")?.description).toContain(
      "semantic declarations",
    );
    expect(pi.tools.find((t) => t.name === "lsp_workspace_symbols")?.description).toContain(
      "symbol-name lookup",
    );
    expect(pi.tools.find((t) => t.name === "lsp_diagnostics")?.description).toContain(
      "diagnostics",
    );
    expect(pi.tools.find((t) => t.name === "lsp_refactor")?.description).toContain("rename");
    expect(pi.tools.find((t) => t.name === "lsp_recover")?.description).toContain(
      "refresh diagnostics",
    );
  });

  it("tree_sitter tool has action enum with all expected actions", () => {
    const pi = createPiMock();
    treeSitterExtension(pi);
    const tsTool = pi.tools.find((t) => t.name === "tree_sitter");
    expect(tsTool).toBeDefined();

    const desc = tsTool?.description;
    expect(desc).toContain("outline");
    expect(desc).toContain("imports");
    expect(desc).toContain("exports");
    expect(desc).toContain("node_at");
    expect(desc).toContain("query");
    expect(desc).toContain("callees");
    expect(desc).toContain("supported files");
  });

  it("focused code-intelligence tools expose split descriptions and parameter schemas", () => {
    const pi = createPiMock();
    codeIntelligenceExtension(pi);

    const briefTool = pi.tools.find((t) => t.name === "code_brief");
    const mapTool = pi.tools.find((t) => t.name === "code_map");
    const relationsTool = pi.tools.find((t) => t.name === "code_relations");
    const affectedTool = pi.tools.find((t) => t.name === "code_affected");
    const patternTool = pi.tools.find((t) => t.name === "code_pattern");

    expect(briefTool?.description).toContain("interpretive orientation");
    expect(mapTool?.description).toContain("factual inventory");
    expect(relationsTool?.description).toContain("callers, callees, or implementations");
    expect(affectedTool?.description).toContain("blast radius");
    expect(patternTool?.description).toContain("literal, regex, or structured search");

    expect(Check(briefTool?.parameters as object, { path: "src" })).toBe(true);
    expect(Check(mapTool?.parameters as object, { path: "src" })).toBe(true);
    expect(Check(mapTool?.parameters as object, { file: "src/index.ts" })).toBe(false);
    expect(
      Check(relationsTool?.parameters as object, {
        kind: "callers",
        file: "src/index.ts",
        line: 1,
        character: 1,
      }),
    ).toBe(true);
    expect(Check(affectedTool?.parameters as object, { symbol: "Widget" })).toBe(true);
    expect(Check(patternTool?.parameters as object, { pattern: "Widget" })).toBe(true);
    expect(Check(patternTool?.parameters as object, {})).toBe(false);
  });

  it("each SuPi-specific tool has prompt guidelines and snippet", () => {
    const pi = createPiMock();
    lspExtension(pi);
    treeSitterExtension(pi);
    codeIntelligenceExtension(pi);

    // The expert LSP tools, tree_sitter, and focused code-intelligence tools are
    // registered via pi.registerTool with full metadata. The read/write/edit overrides
    // come from createReadTool etc. and are AgentTools which wrap ToolDefinitions but
    // strip promptGuidelines/promptSnippet.
    const supiTools = pi.tools.filter((t) =>
      [...LSP_TOOL_NAMES, "tree_sitter", ...CODE_INTELLIGENCE_TOOL_NAMES].includes(t.name),
    );
    for (const tool of supiTools) {
      expect(tool.promptGuidelines).toBeDefined();
      expect(tool.promptGuidelines?.length).toBeGreaterThan(0);
      expect(tool.promptSnippet).toBeDefined();
      expect(tool.promptSnippet?.length).toBeGreaterThan(0);
    }
  });
});

describe("SuPi e2e smoke – message renderer registration (supi-lsp)", () => {
  it("registers lsp-context message renderer", () => {
    const pi = createPiMock();
    lspExtension(pi);
    expect(pi.renderers.has("lsp-context")).toBe(true);
  });

  it("lsp-context renderer produces valid output", () => {
    const pi = createPiMock();
    lspExtension(pi);
    const renderer = pi.renderers.get("lsp-context")!;

    const result = renderer(
      {
        role: "custom",
        customType: "lsp-context",
        content: "LSP diagnostics injected",
        display: true,
        details: {
          diagnostics: [{ file: "test.ts", errors: 2, warnings: 1, information: 0, hints: 0 }],
        },
        timestamp: Date.now(),
      },
      { expanded: false },
      { fg: (_c: string, t: string) => t, bg: (_c: string, t: string) => t },
    );

    expect(result).toBeDefined();
    expect(result.render).toBeDefined();
    const rendered = result.render(80).join("\n");
    expect(rendered).toContain("LSP diagnostics injected");
  });

  it("lsp-context renderer renders expanded view", () => {
    const pi = createPiMock();
    lspExtension(pi);
    const renderer = pi.renderers.get("lsp-context")!;

    const result = renderer(
      {
        role: "custom",
        customType: "lsp-context",
        content: "LSP diagnostics injected",
        display: true,
        details: {
          contextToken: "lsp-context-1",
          diagnostics: [{ file: "test.ts", errors: 1, warnings: 0, information: 0, hints: 0 }],
        },
        timestamp: Date.now(),
      },
      { expanded: true },
      { fg: (_c: string, t: string) => t, bg: (_c: string, t: string) => t },
    );

    const rendered = result.render(80).join("\n");
    expect(rendered).toContain("test.ts");
    expect(rendered).toContain("lsp-context-1");
  });
});

describe("SuPi e2e smoke – session lifecycle (all three extensions)", () => {
  let tmpDir: string;

  afterEach(() => {
    if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
  });

  it("all extensions attach session_start handler", () => {
    const pi = createPiMock();
    lspExtension(pi);
    treeSitterExtension(pi);
    codeIntelligenceExtension(pi);

    expect(pi.handlers.has("session_start")).toBe(true);
  });

  it("all extensions attach session_shutdown handler", () => {
    const pi = createPiMock();
    lspExtension(pi);
    treeSitterExtension(pi);
    codeIntelligenceExtension(pi);

    expect(pi.handlers.has("session_shutdown")).toBe(true);
  });

  it("session_start runs without error for all three extensions", async () => {
    tmpDir = createTempProjectDir();
    const pi = createPiMock();
    lspExtension(pi);
    treeSitterExtension(pi);
    codeIntelligenceExtension(pi);

    // Use emit() to fire all registered session_start handlers
    let caught: Error | undefined;
    try {
      await pi.emit("session_start", {}, createSessionCtx(tmpDir));
    } catch (e) {
      caught = e as Error;
    }
    expect(caught).toBeUndefined();
  });

  it("session_shutdown runs without error for all three extensions", async () => {
    tmpDir = createTempProjectDir();
    const pi = createPiMock();
    lspExtension(pi);
    treeSitterExtension(pi);
    codeIntelligenceExtension(pi);

    await pi.emit("session_start", {}, createSessionCtx(tmpDir));

    let caught: Error | undefined;
    try {
      await pi.emit("session_shutdown");
    } catch (e) {
      caught = e as Error;
    }
    expect(caught).toBeUndefined();
  });

  it("session_shutdown after session_start cleans up without error (double shutdown safe)", async () => {
    const pi = createPiMock();
    lspExtension(pi);
    treeSitterExtension(pi);
    codeIntelligenceExtension(pi);

    const safeEmit = async (event: string, ...args: unknown[]) => {
      let caught: Error | undefined;
      try {
        await pi.emit(event, ...args);
      } catch (e) {
        caught = e as Error;
      }
      return caught;
    };

    // Shutdown before start — should be safe
    expect(await safeEmit("session_shutdown")).toBeUndefined();
    // Shutdown again — should still be safe
    expect(await safeEmit("session_shutdown")).toBeUndefined();
  });

  it("code-intelligence registers before_agent_start handler", () => {
    const pi = createPiMock();
    codeIntelligenceExtension(pi);
    expect(pi.handlers.has("before_agent_start")).toBe(true);
  });

  it("lsp registers before_agent_start handler", () => {
    const pi = createPiMock();
    lspExtension(pi);
    expect(pi.handlers.has("before_agent_start")).toBe(true);
  });
});

describe("SuPi e2e smoke – code-intelligence overview injection", () => {
  let tmpDir: string;

  afterEach(() => {
    if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
  });

  it("injects overview on first agent start turn", async () => {
    tmpDir = createTempProjectDir();
    const pi = createPiMock();
    codeIntelligenceExtension(pi);

    const sessionStart = pi.handlers.get("session_start")!;
    const beforeAgentStart = pi.handlers.get("before_agent_start")!;

    // Start session in our temp project
    await sessionStart({}, createSessionCtx(tmpDir));

    // First turn — should inject overview
    const result = (await beforeAgentStart({}, createSessionCtx(tmpDir))) as
      | BeforeAgentStartEventResult
      | undefined;

    expect(result).toBeDefined();
    expect(result?.message).toBeDefined();
    const overviewMsg = result?.message!;
    expect(overviewMsg.customType).toBe("code-intelligence-overview");
    expect(overviewMsg.display).toBe(false); // TUI-invisible but agent-visible
    expect(overviewMsg.content).toBeDefined();
    expect(overviewMsg.content?.length).toBeGreaterThan(0);
    expect(overviewMsg.content).toContain("Code Intelligence Overview");
  });

  it("does NOT inject overview on second turn (dedup flag)", async () => {
    tmpDir = createTempProjectDir();
    const pi = createPiMock();
    codeIntelligenceExtension(pi);

    const sessionStart = pi.handlers.get("session_start")!;
    const beforeAgentStart = pi.handlers.get("before_agent_start")!;

    await sessionStart({}, createSessionCtx(tmpDir));

    // First turn
    const first = await beforeAgentStart({}, createSessionCtx(tmpDir));
    expect(first).toBeDefined();

    // Second turn — should skip because hasInjectedOverview is true
    const second = await beforeAgentStart({}, createSessionCtx(tmpDir));
    expect(second).toBeUndefined();

    // Verify the overview structure
    const overviewMsg2 = (first as BeforeAgentStartEventResult).message;
    expect(overviewMsg2).toBeDefined();
    expect(overviewMsg2?.content).toBeDefined();
    expect(overviewMsg2?.content!).toContain("## Modules");
    expect(overviewMsg2?.content!).toContain("(leaf)");
    expect(overviewMsg2?.content!).toContain("code_brief");
  });

  it("scans session branch for existing overview to prevent duplicate on reload/resume", async () => {
    tmpDir = createTempProjectDir();
    const pi = createPiMock();
    codeIntelligenceExtension(pi);

    const sessionStart = pi.handlers.get("session_start")!;
    const beforeAgentStart = pi.handlers.get("before_agent_start")!;

    // Simulate a resumed session where the branch already has an overview
    const resumeCtx = {
      cwd: tmpDir,
      ui: { notify: () => {} },
      sessionManager: {
        getBranch: () => [
          {
            type: "custom_message",
            customType: "code-intelligence-overview",
            content: "previous overview",
          },
        ],
      },
    };

    await sessionStart({}, resumeCtx);

    // Even on first before_agent_start, should skip because branch had overview
    const result = await beforeAgentStart({}, resumeCtx);
    expect(result).toBeUndefined();
  });

  it("injects overview on fresh start after reload (no branch history)", async () => {
    tmpDir = createTempProjectDir();
    const pi = createPiMock();
    codeIntelligenceExtension(pi);

    const sessionStart = pi.handlers.get("session_start")!;
    const beforeAgentStart = pi.handlers.get("before_agent_start")!;

    // First session — get overview
    await sessionStart({}, createSessionCtx(tmpDir));
    const first = await beforeAgentStart({}, createSessionCtx(tmpDir));
    expect(first).toBeDefined();

    // Reload — new session_start resets flag
    await sessionStart({}, createSessionCtx(tmpDir));
    const second = await beforeAgentStart({}, createSessionCtx(tmpDir));
    expect(second).toBeDefined();
    const secondMsg = (second as BeforeAgentStartEventResult).message;
    expect(secondMsg).toBeDefined();
    expect(secondMsg?.content).toBeDefined();
  });

  it("skips overview injection for empty/minimal project", async () => {
    // Create a temp dir with NO package.json and NO source files
    tmpDir = mkdtempSync(path.join(os.tmpdir(), "supi-e2e-empty-"));

    const pi = createPiMock();
    codeIntelligenceExtension(pi);

    const sessionStart = pi.handlers.get("session_start")!;
    const beforeAgentStart = pi.handlers.get("before_agent_start")!;

    await sessionStart({}, createSessionCtx(tmpDir));

    const result = await beforeAgentStart({}, createSessionCtx(tmpDir));
    // Empty project — no modules to summarize
    expect(result).toBeUndefined();
  });
});

describe("SuPi e2e smoke – tree_sitter tool execution", () => {
  let tmpDir: string;

  afterEach(() => {
    if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
  });

  async function setup(): Promise<ExtensionAPI & MockInternals> {
    tmpDir = createTempProjectDir();
    const pi = createPiMock();
    treeSitterExtension(pi);

    const sessionStart = pi.handlers.get("session_start")!;
    await sessionStart({}, createSessionCtx(tmpDir));

    return pi;
  }

  async function exec(
    pi: ExtensionAPI & MockInternals,
    params: Record<string, unknown>,
  ): Promise<string> {
    const tool = pi.tools.find((t) => t.name === "tree_sitter")!;
    const result = await tool.execute("test-id", params, undefined, () => {}, {
      cwd: tmpDir,
    });
    return (result.content as Array<{ text: string }>)[0].text;
  }

  it("returns not initialized before session_start", async () => {
    const pi = createPiMock();
    treeSitterExtension(pi);

    const tool = pi.tools.find((t) => t.name === "tree_sitter")!;
    const result = await tool.execute(
      "test-id",
      { action: "outline", file: "x.ts" },
      undefined,
      () => {},
      { cwd: "/" },
    );
    const text = (result.content as Array<{ text: string }>)[0].text;
    expect(text).toContain("not initialized");
  });

  it("parses outline from a TypeScript file", async () => {
    const pi = await setup();
    const text = await exec(pi, { action: "outline", file: "math.ts" });

    expect(text).toContain("Outline");
    expect(text).toContain("add"); // function declaration
    expect(text).toContain("Calculator"); // class declaration
    expect(text).toContain("PI"); // variable declaration
  });

  it("reports no imports for a re-export file", async () => {
    const pi = await setup();
    const text = await exec(pi, { action: "imports", file: "index.ts" });
    // index.ts re-exports — not plain imports — so tree-sitter finds none
    expect(text).toContain("No imports");
  });

  it("parses exports from a TypeScript file", async () => {
    const pi = await setup();
    const text = await exec(pi, { action: "exports", file: "math.ts" });

    expect(text).toContain("Exports");
    expect(text).toContain("function: add");
    expect(text).toContain("variable: PI");
    expect(text).toContain("class: Calculator");
  });

  it("finds node at a given position", async () => {
    const pi = await setup();
    const text = await exec(pi, {
      action: "node_at",
      file: "math.ts",
      line: 2,
      character: 17,
    });

    expect(text).toContain("Node at");
    expect(text).toContain("Type:");
    expect(text).toContain("add");
  });

  it("finds node at first char position", async () => {
    const pi = await setup();
    const text = await exec(pi, {
      action: "node_at",
      file: "math.ts",
      line: 1,
      character: 1,
    });

    expect(text).toContain("Node at");
    expect(text).toContain("Type:");
    // Should find the comment or function declaration at start of file
    expect(text).toContain("Range:");
  });

  it("runs a TS query", async () => {
    const pi = await setup();
    const text = await exec(pi, {
      action: "query",
      file: "math.ts",
      query: "(function_declaration name: (identifier) @fn)",
    });

    expect(text).toContain("Query results");
    expect(text).toContain("fn");
    expect(text).toContain("add");
  });

  it("returns no matches for a query that matches nothing", async () => {
    const pi = await setup();
    const text = await exec(pi, {
      action: "query",
      file: "math.ts",
      query: "(decorator) @dec",
    });

    expect(text).toContain("No matches");
  });

  it("handles invalid query syntax gracefully", async () => {
    const pi = await setup();
    const text = await exec(pi, {
      action: "query",
      file: "math.ts",
      query: "(((invalid",
    });

    // Should not crash — should return an error message
    expect(text).not.toContain("not initialized");
    expect(text).toContain("Invalid query");
  });

  it("returns unsupported language error for non-JS outline", async () => {
    const pi = await setup();
    // Write .py file AFTER setup so tmpDir is valid
    writeFileSync(path.join(tmpDir, "data.py"), "def hello():\n    pass\n");
    const text = await exec(pi, { action: "outline", file: "data.py" });

    expect(text).toContain("Unsupported language");
    expect(text).toContain("outline");
  });

  it("returns file access error for missing file", async () => {
    const pi = await setup();
    const text = await exec(pi, { action: "imports", file: "nonexistent.ts" });

    expect(text).toContain("File access error");
  });

  it("handles callees action for a TypeScript file", async () => {
    const pi = await setup();
    const text = await exec(pi, {
      action: "callees",
      file: "math.ts",
      line: 10,
      character: 12,
    });

    expect(text).toContain("Callees");
    expect(text).toContain("add"); // Calculator.sum calls add()
  });

  it("validates missing parameters", async () => {
    const pi = await setup();
    const noAction = await exec(pi, {});
    expect(noAction).toContain("Validation error");

    const badAction = await exec(pi, { action: "bogus" });
    expect(badAction).toContain("Unknown action");

    const noFile = await exec(pi, { action: "outline" });
    expect(noFile).toContain("file");

    const noLine = await exec(pi, { action: "node_at", file: "math.ts", character: 1 });
    expect(noLine).toContain("line");

    const badLine = await exec(pi, { action: "node_at", file: "math.ts", line: 0, character: 1 });
    expect(badLine).toContain("positive 1-based");
  });

  it("returns unsupported language for callees on HTML files", async () => {
    const pi = await setup();
    const text = await exec(pi, {
      action: "callees",
      file: "test.html",
      line: 1,
      character: 5,
    });
    expect(text).toContain("Unsupported language");
  });

  it("disposes runtime on session_shutdown", async () => {
    const pi = await setup();
    const shutdownHandler = pi.handlers.get("session_shutdown")!;
    await shutdownHandler();

    const text = await exec(pi, { action: "outline", file: "math.ts" });
    expect(text).toContain("not initialized");
  });
});

describe("SuPi e2e smoke – focused code-intelligence tool availability", () => {
  let tmpDir: string;

  afterEach(() => {
    if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
  });

  it("code_map executes on a project directory", async () => {
    tmpDir = createTempProjectDir();
    const pi = createPiMock();
    codeIntelligenceExtension(pi);

    const tool = pi.tools.find((t) => t.name === "code_map")!;
    const result = await tool.execute("test-id", {}, undefined, () => {}, {
      cwd: tmpDir,
    });

    expect(result).toBeDefined();
    expect(result.content).toBeDefined();
    const text = result.content[0].text;
    expect(text).toContain("Code Map");
    expect(text).toContain("TypeScript");
  });

  it("code_pattern validates a missing pattern parameter", async () => {
    const pi = createPiMock();
    codeIntelligenceExtension(pi);

    const tool = pi.tools.find((t) => t.name === "code_pattern")!;
    const result = await tool.execute("test-id", {}, undefined, () => {}, { cwd: "/tmp" });

    expect(result).toBeDefined();
    const text = result.content[0].text;
    expect(text).toContain("pattern");
    expect(text).toContain("requires");
  });

  it("code_relations surfaces target-resolution errors with the split parameter shape", async () => {
    const pi = createPiMock();
    codeIntelligenceExtension(pi);

    const tool = pi.tools.find((t) => t.name === "code_relations")!;
    const result = await tool.execute("test-id", { kind: "callers" }, undefined, () => {}, {
      cwd: "/tmp",
    });

    const text = result.content[0].text;
    expect(text).toContain("anchored coordinates");
    expect(text).not.toContain("Unknown action");
  });
});

describe("SuPi e2e smoke – full lifecycle integration", () => {
  let tmpDir: string;

  afterEach(() => {
    if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
  });

  it("full lifecycle: load → session_start → overview → tool exec → shutdown", async () => {
    tmpDir = createTempProjectDir();
    const pi = createPiMock();

    lspExtension(pi);
    treeSitterExtension(pi);
    codeIntelligenceExtension(pi);

    expect(pi.tools.map((t) => t.name).sort()).toEqual([
      "code_affected",
      "code_brief",
      "code_map",
      "code_pattern",
      "code_relations",
      "edit",
      "lsp_diagnostics",
      "lsp_document_symbols",
      "lsp_lookup",
      "lsp_recover",
      "lsp_refactor",
      "lsp_workspace_symbols",
      "read",
      "tree_sitter",
      "write",
    ]);

    await pi.emit("session_start", {}, createSessionCtx(tmpDir));
    const beforeAgentStart = pi.handlers.get("before_agent_start")!;
    const overview = (await beforeAgentStart({}, createSessionCtx(tmpDir))) as
      | BeforeAgentStartEventResult
      | undefined;
    expect(overview).toBeDefined();
    const overviewMsg3 = (overview as BeforeAgentStartEventResult).message;
    expect(overviewMsg3).toBeDefined();
    expect(overviewMsg3?.customType).toBe("code-intelligence-overview");
    expect(overviewMsg3?.display).toBe(false);

    const tsTool = pi.tools.find((t) => t.name === "tree_sitter")!;
    const tsResult = await tsTool.execute(
      "test-id",
      { action: "outline", file: "math.ts" },
      undefined,
      () => {},
      { cwd: tmpDir },
    );
    const tsText = tsResult.content[0].text;
    expect(tsText).toContain("add");
    expect(tsText).toContain("Calculator");

    const tsImportResult = await tsTool.execute(
      "test-id",
      { action: "imports", file: "index.ts" },
      undefined,
      () => {},
      { cwd: tmpDir },
    );
    expect(tsImportResult.content[0].text).toContain("No imports");

    const codeMapTool = pi.tools.find((t) => t.name === "code_map")!;
    const codeMapResult = await codeMapTool.execute("test-id", {}, undefined, () => {}, {
      cwd: tmpDir,
    });
    expect(codeMapResult.content[0].text).toContain("Code Map");

    let shutdownError: Error | undefined;
    try {
      await pi.emit("session_shutdown");
    } catch (e) {
      shutdownError = e as Error;
    }
    expect(shutdownError).toBeUndefined();

    const tsAfterShutdown = await tsTool.execute(
      "test-id",
      { action: "outline", file: "math.ts" },
      undefined,
      () => {},
      { cwd: tmpDir },
    );
    expect(tsAfterShutdown.content[0].text).toContain("not initialized");
  });
});

describe("SuPi e2e smoke – lsp extension behavior", () => {
  it("uses focused top-level parameter schemas for the split LSP tools", () => {
    const pi = createPiMock();
    lspExtension(pi);
    const lookupTool = pi.tools.find((t) => t.name === "lsp_lookup")!;
    const refactorTool = pi.tools.find((t) => t.name === "lsp_refactor")!;
    const diagnosticsTool = pi.tools.find((t) => t.name === "lsp_diagnostics")!;
    const recoverTool = pi.tools.find((t) => t.name === "lsp_recover")!;

    expect((lookupTool.parameters as { type?: string }).type).toBe("object");
    expect(
      Check(lookupTool.parameters as object, {
        kind: "hover",
        file: "src/index.ts",
        line: 1,
        character: 1,
      }),
    ).toBe(true);
    expect(
      Check(lookupTool.parameters as object, {
        kind: "hover",
        file: "src/index.ts",
        line: 1,
      }),
    ).toBe(false);
    expect(
      Check(refactorTool.parameters as object, {
        kind: "rename",
        file: "src/index.ts",
        line: 1,
        character: 1,
        newName: "nextName",
      }),
    ).toBe(true);
    expect(
      Check(refactorTool.parameters as object, {
        kind: "code_actions",
        file: "src/index.ts",
        line: 1,
        character: 1,
      }),
    ).toBe(true);
    expect(Check(diagnosticsTool.parameters as object, { file: "src/index.ts" })).toBe(true);
    expect(Check(recoverTool.parameters as object, {})).toBe(true);
  });
});

describe("SuPi e2e smoke – runtime error resilience", () => {
  let e2eTmpDir: string;

  afterEach(() => {
    if (e2eTmpDir) rmSync(e2eTmpDir, { recursive: true, force: true });
  });

  it("multiple session_start calls without crash", { timeout: 20_000 }, async () => {
    e2eTmpDir = createTempProjectDir();
    const pi = createPiMock();
    lspExtension(pi);
    treeSitterExtension(pi);
    codeIntelligenceExtension(pi);

    const ctx = createSessionCtx(e2eTmpDir);

    const safeEmit = async (event: string, ...args: unknown[]) => {
      let caught: Error | undefined;
      try {
        await pi.emit(event, ...args);
      } catch (e) {
        caught = e as Error;
      }
      return caught;
    };

    expect(await safeEmit("session_start", {}, ctx)).toBeUndefined();
    expect(await safeEmit("session_start", {}, ctx)).toBeUndefined();
    expect(await safeEmit("session_start", {}, ctx)).toBeUndefined();
  });

  it("missing cwd in session_start does not crash (within reason)", async () => {
    const pi = createPiMock();
    lspExtension(pi);
    treeSitterExtension(pi);
    codeIntelligenceExtension(pi);

    let caught: Error | undefined;
    try {
      await pi.emit("session_start", {}, createSessionCtx("/tmp/nonexistent-12345"));
    } catch (e) {
      caught = e as Error;
    }
    expect(caught).toBeUndefined();
  });
});
