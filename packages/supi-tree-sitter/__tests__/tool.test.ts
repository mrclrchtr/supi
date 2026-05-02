import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { afterEach, describe, expect, it, vi } from "vitest";
import treeSitterExtension from "../tree-sitter.ts";

const FIXTURE_DIR = path.resolve(__dirname, "fixtures");

// biome-ignore lint/suspicious/noExplicitAny: test mock
type AnyFunction = (...args: any[]) => any;

interface MockInternals {
  tools: Array<{ name: string; execute: AnyFunction }>;
  handlers: Map<string, AnyFunction>;
}

function createPiMock(): ExtensionAPI & MockInternals {
  const handlers = new Map<string, AnyFunction>();
  const tools: Array<{ name: string; execute: AnyFunction }> = [];

  return {
    on(event: string, handler: AnyFunction) {
      handlers.set(event, handler);
    },
    registerTool(tool: { name: string; execute: AnyFunction }) {
      tools.push(tool);
    },
    handlers,
    tools,
  } as ExtensionAPI & MockInternals;
}

async function executeTool(pi: ExtensionAPI & MockInternals, params: Record<string, unknown>) {
  const tool = pi.tools.find((t) => t.name === "tree_sitter");
  expect(tool).toBeDefined();
  const result = await tool?.execute("test-id", params, undefined, vi.fn(), { cwd: FIXTURE_DIR });
  return (result.content as Array<{ type: string; text: string }>)[0].text;
}

async function startSession(pi: ExtensionAPI & MockInternals, cwd: string) {
  const handler = pi.handlers.get("session_start");
  if (handler) await handler({}, { cwd });
}

function setupWithSession() {
  const pi = createPiMock();
  treeSitterExtension(pi);
  return startSession(pi, FIXTURE_DIR).then(() => pi);
}

describe("tree_sitter tool registration", () => {
  it("registers the tree_sitter tool", () => {
    const pi = createPiMock();
    treeSitterExtension(pi);
    expect(pi.tools.length).toBe(1);
    expect(pi.tools[0].name).toBe("tree_sitter");
  });

  it("returns not initialized before session_start", async () => {
    const pi = createPiMock();
    treeSitterExtension(pi);
    const text = await executeTool(pi, { action: "outline", file: "sample.ts" });
    expect(text).toContain("not initialized");
  });

  it("has standalone-safe prompt guidance that does not name lsp as a sibling tool", () => {
    const pi = createPiMock();
    treeSitterExtension(pi);
    const tool = pi.tools.find((t) => t.name === "tree_sitter");
    expect(tool).toBeDefined();
    const guidelines = (tool as unknown as { promptGuidelines: string[] }).promptGuidelines;
    expect(guidelines).toBeDefined();
    const combined = guidelines.join(" ");
    expect(combined).toContain("structural");
    expect(combined).not.toContain("Use lsp for");
    expect(combined).not.toContain("sibling lsp");
    // Guidance should present tree_sitter as independently usable
    expect(combined).toContain("standalone");
  });
});

describe("tree_sitter tool validation", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("validates missing action before file", async () => {
    const pi = await setupWithSession();
    const text = await executeTool(pi, {});
    expect(text).toContain("Validation error");
    expect(text).toContain("action");
    expect(text).not.toContain("file` is required");
  });

  it("validates unknown action before file", async () => {
    const pi = await setupWithSession();
    const text = await executeTool(pi, { action: "bogus" });
    expect(text).toContain("Validation error");
    expect(text).toContain("Unknown action");
  });

  it("validates missing file when action is present", async () => {
    const pi = await setupWithSession();
    const text = await executeTool(pi, { action: "outline" });
    expect(text).toContain("Validation error");
    expect(text).toContain("file");
  });

  it("validates missing line for node_at", async () => {
    const pi = await setupWithSession();
    const text = await executeTool(pi, { action: "node_at", file: "sample.ts", character: 1 });
    expect(text).toContain("Validation error");
    expect(text).toContain("line");
  });

  it("validates missing character for node_at", async () => {
    const pi = await setupWithSession();
    const text = await executeTool(pi, { action: "node_at", file: "sample.ts", line: 1 });
    expect(text).toContain("Validation error");
    expect(text).toContain("character");
  });

  it("validates non-positive line for node_at", async () => {
    const pi = await setupWithSession();
    const text = await executeTool(pi, {
      action: "node_at",
      file: "sample.ts",
      line: 0,
      character: 1,
    });
    expect(text).toContain("positive 1-based");
  });

  it("validates non-integer line for node_at", async () => {
    const pi = await setupWithSession();
    const text = await executeTool(pi, {
      action: "node_at",
      file: "sample.ts",
      line: 1.5,
      character: 1,
    });
    expect(text).toContain("Validation error");
    expect(text).toContain("line");
  });

  it("validates non-integer character for node_at", async () => {
    const pi = await setupWithSession();
    const text = await executeTool(pi, {
      action: "node_at",
      file: "sample.ts",
      line: 1,
      character: 1.5,
    });
    expect(text).toContain("Validation error");
    expect(text).toContain("character");
  });

  it("validates missing query for query action", async () => {
    const pi = await setupWithSession();
    const text = await executeTool(pi, { action: "query", file: "sample.ts" });
    expect(text).toContain("Validation error");
    expect(text).toContain("query");
  });

  it("validates whitespace query for query action", async () => {
    const pi = await setupWithSession();
    const text = await executeTool(pi, { action: "query", file: "sample.ts", query: "   " });
    expect(text).toContain("Validation error");
    expect(text).toContain("non-empty");
  });
});

describe("tree_sitter tool actions", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns unsupported language for .py files", async () => {
    const pi = await setupWithSession();
    const text = await executeTool(pi, { action: "outline", file: "script.py" });
    expect(text).toContain("Unsupported language");
  });

  it("returns file access error for missing files", async () => {
    const pi = await setupWithSession();
    const text = await executeTool(pi, { action: "imports", file: "missing.ts" });
    expect(text).toContain("File access error");
  });

  it("handles outline action", async () => {
    const pi = await setupWithSession();
    const text = await executeTool(pi, { action: "outline", file: "sample.ts" });
    expect(text).toContain("Outline");
    expect(text).toContain("hello");
    expect(text).toContain("Greeter");
  });

  it("handles imports action", async () => {
    const pi = await setupWithSession();
    const text = await executeTool(pi, { action: "imports", file: "sample.ts" });
    expect(text).toContain("Imports");
    expect(text).toContain("node:fs/promises");
  });

  it("handles exports action", async () => {
    const pi = await setupWithSession();
    const text = await executeTool(pi, { action: "exports", file: "sample.ts" });
    expect(text).toContain("Exports");
    expect(text).toContain("hello");
  });

  it("handles node_at action", async () => {
    const pi = await setupWithSession();
    const text = await executeTool(pi, {
      action: "node_at",
      file: "sample.ts",
      line: 1,
      character: 17,
    });
    expect(text).toContain("Node at");
    expect(text).toContain("Type:");
  });

  it("handles query action", async () => {
    const pi = await setupWithSession();
    const text = await executeTool(pi, {
      action: "query",
      file: "sample.ts",
      query: "(function_declaration name: (identifier) @fn)",
    });
    expect(text).toContain("Query results");
    expect(text).toContain("fn");
  });

  it("handles query with no matches", async () => {
    const pi = await setupWithSession();
    const text = await executeTool(pi, {
      action: "query",
      file: "sample.ts",
      query: "(decorator) @dec",
    });
    expect(text).toContain("No matches");
  });

  it("handles invalid query syntax", async () => {
    const pi = await setupWithSession();
    const text = await executeTool(pi, {
      action: "query",
      file: "sample.ts",
      query: "(((invalid",
    });
    expect(text).toContain("Invalid query");
  });

  it("includes a truncation notice for large output", async () => {
    const tmpDir = mkdtempSync(path.join(os.tmpdir(), "tree-sitter-tool-"));
    try {
      const source = Array.from(
        { length: 105 },
        (_value, index) => `export function fn${index}() { return ${index}; }`,
      ).join("\n");
      writeFileSync(path.join(tmpDir, "large.ts"), source);
      const pi = createPiMock();
      treeSitterExtension(pi);
      await startSession(pi, tmpDir);

      const text = await executeTool(pi, { action: "outline", file: "large.ts" });
      expect(text).toContain("additional outline items omitted");
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("caps nested outline items", async () => {
    const tmpDir = mkdtempSync(path.join(os.tmpdir(), "tree-sitter-tool-"));
    try {
      const methods = Array.from({ length: 105 }, (_value, index) => `  m${index}() {}`);
      const source = ["export class ManyMethods {", ...methods, "}"].join("\n");
      writeFileSync(path.join(tmpDir, "nested.ts"), source);
      const pi = createPiMock();
      treeSitterExtension(pi);
      await startSession(pi, tmpDir);

      const text = await executeTool(pi, { action: "outline", file: "nested.ts" });
      expect(text).toContain("additional outline items omitted");
      expect(text).toContain("m98");
      expect(text).not.toContain("m99");
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("disposes on session_shutdown", async () => {
    const pi = await setupWithSession();
    const shutdownHandler = pi.handlers.get("session_shutdown");
    expect(shutdownHandler).toBeDefined();
    await shutdownHandler?.();
    const text = await executeTool(pi, { action: "outline", file: "sample.ts" });
    expect(text).toContain("not initialized");
  });
});
