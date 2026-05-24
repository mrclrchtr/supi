import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import treeSitterExtension from "../src/tree-sitter.ts";

const FIXTURE_DIR = path.resolve(__dirname, "fixtures");

import { createPiMock } from "@mrclrchtr/supi-test-utils";

async function executeTool(
  pi: ReturnType<typeof createPiMock>,
  toolName: string,
  params: Record<string, unknown>,
) {
  const tool = pi.tools.find((t) => (t as { name: string }).name === toolName) as
    | { execute: (...args: unknown[]) => Promise<unknown> }
    | undefined;
  expect(tool).toBeDefined();
  const result = await tool?.execute("test-id", params, undefined, vi.fn(), { cwd: FIXTURE_DIR });
  return (result as { content: Array<{ type: string; text: string }> }).content[0].text;
}

async function startSession(pi: ReturnType<typeof createPiMock>, cwd: string) {
  const handler = pi.handlers.get("session_start")?.[0];
  if (handler) await handler({}, { cwd });
}

function setupWithSession() {
  const pi = createPiMock();
  treeSitterExtension(pi as never);
  return startSession(pi, FIXTURE_DIR).then(() => pi);
}

describe("tree_sitter tool registration", () => {
  it("registers 6 focused tools", () => {
    const pi = createPiMock();
    treeSitterExtension(pi as never);
    expect(pi.tools.length).toBe(6);
    expect((pi.tools[0] as { name: string }).name).toBe("tree_sitter_outline");
  });

  it("returns not initialized before session_start", async () => {
    const pi = createPiMock();
    treeSitterExtension(pi as never);
    const text = await executeTool(pi, "tree_sitter_outline", { file: "sample.ts" });
    expect(text).toContain("not initialized");
  });
});

describe("tree_sitter tool file validation", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("validates missing file", async () => {
    const pi = await setupWithSession();
    const text = await executeTool(pi, "tree_sitter_outline", {});
    expect(text).toContain("Validation error");
    expect(text).toContain("file");
  });

  it("returns unsupported language for .lua files on outline", async () => {
    const pi = await setupWithSession();
    const text = await executeTool(pi, "tree_sitter_outline", { file: "script.lua" });
    expect(text).toContain("Unsupported language");
  });

  it("returns file access error for missing files", async () => {
    const pi = await setupWithSession();
    const text = await executeTool(pi, "tree_sitter_imports", { file: "missing.ts" });
    expect(text).toContain("File access error");
  });
});

describe("tree_sitter tool actions", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("handles outline action", async () => {
    const pi = await setupWithSession();
    const text = await executeTool(pi, "tree_sitter_outline", { file: "sample.ts" });
    expect(text).toContain("Outline");
    expect(text).toContain("hello");
    expect(text).toContain("Greeter");
  });

  it("handles imports action", async () => {
    const pi = await setupWithSession();
    const text = await executeTool(pi, "tree_sitter_imports", { file: "sample.ts" });
    expect(text).toContain("Imports");
    expect(text).toContain("node:fs/promises");
  });

  it("handles exports action", async () => {
    const pi = await setupWithSession();
    const text = await executeTool(pi, "tree_sitter_exports", { file: "sample.ts" });
    expect(text).toContain("Exports");
    expect(text).toContain("hello");
  });

  it("handles node_at action", async () => {
    const pi = await setupWithSession();
    const text = await executeTool(pi, "tree_sitter_node_at", {
      file: "sample.ts",
      line: 1,
      character: 17,
    });
    expect(text).toContain("Node at");
    expect(text).toContain("Type:");
  });

  it("handles query action", async () => {
    const pi = await setupWithSession();
    const text = await executeTool(pi, "tree_sitter_query", {
      file: "sample.ts",
      query: "(function_declaration name: (identifier) @fn)",
    });
    expect(text).toContain("Query results");
    expect(text).toContain("fn");
  });

  it("handles query with no matches", async () => {
    const pi = await setupWithSession();
    const text = await executeTool(pi, "tree_sitter_query", {
      file: "sample.ts",
      query: "(decorator) @dec",
    });
    expect(text).toContain("No matches");
  });

  it("handles invalid query syntax", async () => {
    const pi = await setupWithSession();
    const text = await executeTool(pi, "tree_sitter_query", {
      file: "sample.ts",
      query: "(((invalid",
    });
    expect(text).toContain("Invalid query");
  });

  it("includes a truncation notice for large outline output", async () => {
    const tmpDir = mkdtempSync(path.join(os.tmpdir(), "tree-sitter-tool-"));
    try {
      const source = Array.from(
        { length: 105 },
        (_value, index) => `export function fn${index}() { return ${index}; }`,
      ).join("\n");
      writeFileSync(path.join(tmpDir, "large.ts"), source);
      const pi = createPiMock();
      treeSitterExtension(pi as never);
      await startSession(pi, tmpDir);

      const text = await executeTool(pi, "tree_sitter_outline", { file: "large.ts" });
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
      treeSitterExtension(pi as never);
      await startSession(pi, tmpDir);

      const text = await executeTool(pi, "tree_sitter_outline", { file: "nested.ts" });
      expect(text).toContain("additional outline items omitted");
      expect(text).toContain("m98");
      expect(text).not.toContain("m99");
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("handles callees action for a TypeScript file", async () => {
    const tmpDir = mkdtempSync(path.join(os.tmpdir(), "tree-sitter-tool-"));
    try {
      writeFileSync(
        path.join(tmpDir, "sample.ts"),
        [
          "export function myFunction() {",
          "  doSomething();",
          // biome-ignore lint/security/noSecrets: test fixture
          "  doSomethingElse(42);",
          "  return 0;",
          "}",
        ].join("\n"),
      );
      const pi = createPiMock();
      treeSitterExtension(pi as never);
      await startSession(pi, tmpDir);

      const text = await executeTool(pi, "tree_sitter_callees", {
        file: "sample.ts",
        line: 1,
        character: 22,
      });
      expect(text).toContain("Callees");
      expect(text).toContain("doSomething");
      expect(text).toContain("doSomethingElse");
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("disposes on session_shutdown", async () => {
    const pi = await setupWithSession();
    const shutdownHandler = pi.handlers.get("session_shutdown")?.[0];
    expect(shutdownHandler).toBeDefined();
    await shutdownHandler?.();
    const text = await executeTool(pi, "tree_sitter_outline", { file: "sample.ts" });
    expect(text).toContain("not initialized");
  });
});
