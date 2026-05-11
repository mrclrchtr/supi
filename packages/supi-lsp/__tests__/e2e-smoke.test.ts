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
import { afterEach, describe, expect, it } from "vitest";
import codeIntelligenceExtension from "../../supi-code-intelligence/src/code-intelligence.ts";
import treeSitterExtension from "../../supi-tree-sitter/src/tree-sitter.ts";
import lspExtension from "../src/lsp.ts";

// ── Helpers ───────────────────────────────────────────────────────────

// biome-ignore lint/suspicious/noExplicitAny: test mock internals
type AnyFunction = (...args: any[]) => any;

interface RegisteredTool {
  name: string;
  description: string;
  parameters?: { properties?: Record<string, unknown> };
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
  it("registers all three expected tools with correct names", () => {
    const pi = createPiMock();
    lspExtension(pi);
    treeSitterExtension(pi);
    codeIntelligenceExtension(pi);

    const toolNames = pi.tools.map((t) => t.name);
    expect(toolNames).toContain("lsp");
    expect(toolNames).toContain("tree_sitter");
    expect(toolNames).toContain("code_intel");
    // LSP also registers read/write/edit overrides for inline diagnostics
    expect(toolNames).toContain("read");
    expect(toolNames).toContain("write");
    expect(toolNames).toContain("edit");
    expect(pi.tools).toHaveLength(6);
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
      expect(tool.parameters?.properties).toBeDefined();
    }
  });

  it("lsp tool has action enum with all expected actions", () => {
    const pi = createPiMock();
    lspExtension(pi);
    const lspTool = pi.tools.find((t) => t.name === "lsp");
    expect(lspTool).toBeDefined();

    // Check the action enum in description
    const desc = lspTool?.description;
    expect(desc).toContain("hover");
    expect(desc).toContain("definition");
    expect(desc).toContain("references");
    expect(desc).toContain("diagnostics");
    expect(desc).toContain("symbols");
    expect(desc).toContain("rename");
    expect(desc).toContain("code_actions");
    expect(desc).toContain("workspace_symbol");
    expect(desc).toContain("search");
    expect(desc).toContain("symbol_hover");
    expect(desc).toContain("recover");
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
    expect(desc).toContain("Supported extensions");
  });

  it("code_intel tool has action enum with all expected actions", () => {
    const pi = createPiMock();
    codeIntelligenceExtension(pi);
    const ciTool = pi.tools.find((t) => t.name === "code_intel");
    expect(ciTool).toBeDefined();

    const desc = ciTool?.description;
    expect(desc).toContain("brief");
    expect(desc).toContain("callers");
    expect(desc).toContain("callees");
    expect(desc).toContain("implementations");
    expect(desc).toContain("affected");
    expect(desc).toContain("pattern");
    expect(desc).toContain("index");
  });

  it("each SuPi-specific tool has prompt guidelines and snippet", () => {
    const pi = createPiMock();
    lspExtension(pi);
    treeSitterExtension(pi);
    codeIntelligenceExtension(pi);

    // lsp, tree_sitter, and code_intel are registered via pi.registerTool with full metadata.
    // The read/write/edit overrides come from createReadTool etc. and are AgentTools
    // which wrap ToolDefinitions but strip promptGuidelines/promptSnippet.
    const supiTools = pi.tools.filter((t) => ["lsp", "tree_sitter", "code_intel"].includes(t.name));
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

  it("code_intel registers before_agent_start handler", () => {
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

describe("SuPi e2e smoke – code-intel overview injection", () => {
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
    expect(overviewMsg2?.content!).toContain("code_intel brief");
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

    // After shutdown, tool execution should report not initialized
    const text = await exec(pi, { action: "outline", file: "math.ts" });
    expect(text).toContain("not initialized");
  });

  it("stays standalone-safe — guidance does not name lsp as sibling", () => {
    // Tree-sitter guidance must be usable without LSP being present
    const pi = createPiMock();
    treeSitterExtension(pi);
    const tool = pi.tools.find((t) => t.name === "tree_sitter")!;
    const combined = (tool.promptGuidelines ?? []).join(" ");
    expect(combined).toContain("structural");
    expect(combined).toContain("standalone");
    expect(combined).not.toContain("Use lsp for");
    expect(combined).not.toContain("sibling lsp");
  });
});

describe("SuPi e2e smoke – code_intel tool availability", () => {
  let tmpDir: string;

  afterEach(() => {
    if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
  });

  it("code_intel tool executes brief action on project", async () => {
    tmpDir = createTempProjectDir();
    const pi = createPiMock();
    codeIntelligenceExtension(pi);

    // Register a basic tool execute call
    const tool = pi.tools.find((t) => t.name === "code_intel")!;
    const result = await tool.execute("test-id", { action: "index" }, undefined, () => {}, {
      cwd: tmpDir,
    });

    expect(result).toBeDefined();
    expect(result.content).toBeDefined();
    const text = result.content[0].text;
    expect(text).toContain("Project Map");
    // The index action should give us file counts
    expect(text).toContain(".ts");
  });

  it("code_intel tool validates missing action parameter", async () => {
    const pi = createPiMock();
    codeIntelligenceExtension(pi);

    const tool = pi.tools.find((t) => t.name === "code_intel")!;
    const result = await tool.execute("test-id", {}, undefined, () => {}, { cwd: "/tmp" });

    expect(result).toBeDefined();
    const text = result.content[0].text;
    expect(text).toContain("Unknown action");
  });

  it("code_intel tool rejects unknown action", async () => {
    const pi = createPiMock();
    codeIntelligenceExtension(pi);

    const tool = pi.tools.find((t) => t.name === "code_intel")!;
    const result = await tool.execute("test-id", { action: "bogus" }, undefined, () => {}, {
      cwd: "/tmp",
    });

    const text = result.content[0].text;
    expect(text).toContain("Unknown action");
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

    // 1. Load all three extensions
    lspExtension(pi);
    treeSitterExtension(pi);
    codeIntelligenceExtension(pi);

    // 2. Verify tools registered (lsp also registers read/write/edit overrides)
    expect(pi.tools.map((t) => t.name).sort()).toEqual([
      "code_intel",
      "edit",
      "lsp",
      "read",
      "tree_sitter",
      "write",
    ]);

    // 3. Start session (fires all registered session_start handlers)
    await pi.emit("session_start", {}, createSessionCtx(tmpDir));

    // 4. Before agent start — overview injection (from code-intelligence)
    // Only code-intel's before_agent_start returns overview; LSP's is diagnostic-only
    const beforeAgentStart = pi.handlers.get("before_agent_start")!;
    const overview = (await beforeAgentStart({}, createSessionCtx(tmpDir))) as
      | BeforeAgentStartEventResult
      | undefined;
    expect(overview).toBeDefined();
    const overviewMsg3 = (overview as BeforeAgentStartEventResult).message;
    expect(overviewMsg3).toBeDefined();
    expect(overviewMsg3?.customType).toBe("code-intelligence-overview");
    expect(overviewMsg3?.display).toBe(false);

    // 5. Tree-sitter tool execution (real parse)
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

    // Import re-check (re-exports have no plain imports)
    const tsImportResult = await tsTool.execute(
      "test-id",
      { action: "imports", file: "index.ts" },
      undefined,
      () => {},
      { cwd: tmpDir },
    );
    expect(tsImportResult.content[0].text).toContain("No imports");

    // 6. Code_intel tool execution
    const ciTool = pi.tools.find((t) => t.name === "code_intel")!;
    const ciResult = await ciTool.execute("test-id", { action: "index" }, undefined, () => {}, {
      cwd: tmpDir,
    });
    expect(ciResult.content[0].text).toContain("Project Map");

    // 7. Shutdown — fires all registered session_shutdown handlers
    let shutdownError: Error | undefined;
    try {
      await pi.emit("session_shutdown");
    } catch (e) {
      shutdownError = e as Error;
    }
    expect(shutdownError).toBeUndefined();

    // 8. After shutdown, tree-sitter should report not initialized
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
  it("registers lsp tool with all expected promptGuidelines", () => {
    const pi = createPiMock();
    lspExtension(pi);
    const lspTool = pi.tools.find((t) => t.name === "lsp")!;

    const guidelines = lspTool.promptGuidelines ?? [];
    const combined = guidelines.join(" ");

    // Must contain core diagnostic guidance
    expect(combined).toContain("automatically delivered");
    expect(combined).toContain("inline after every write/edit tool result");
    expect(combined).toContain("stop and fix the root cause");
    expect(combined).toContain("lsp recover");
    expect(combined).toContain("pnpm install");
  });

  it("has promptSnippet that encourages LSP use", () => {
    const pi = createPiMock();
    lspExtension(pi);
    const lspTool = pi.tools.find((t) => t.name === "lsp")!;
    expect(lspTool.promptSnippet).toContain("semantic code intelligence");
  });
});

describe("SuPi e2e smoke – runtime error resilience", () => {
  let e2eTmpDir: string;

  afterEach(() => {
    if (e2eTmpDir) rmSync(e2eTmpDir, { recursive: true, force: true });
  });

  it("multiple session_start calls without crash", async () => {
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
