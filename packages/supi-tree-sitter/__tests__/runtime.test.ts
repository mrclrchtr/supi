import * as path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TreeSitterRuntime } from "../src/runtime.ts";

const FIXTURE_DIR = path.resolve(__dirname, "fixtures");

describe("TreeSitterRuntime", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("parseFile — unsupported language", () => {
    it("returns unsupported-language for .lua files", async () => {
      const runtime = new TreeSitterRuntime("/tmp");
      const result = await runtime.parseFile("script.lua");
      expect(result.kind).toBe("unsupported-language");
      if (result.kind === "unsupported-language") {
        expect(result.file).toBe("script.lua");
        expect(result.message).toContain(".lua");
      }
      runtime.dispose();
    });

    it("returns unsupported-language for unknown extensions", async () => {
      const runtime = new TreeSitterRuntime("/tmp");
      const result = await runtime.parseFile("Makefile");
      expect(result.kind).toBe("unsupported-language");
      runtime.dispose();
    });
  });

  describe("parseFile — file access errors", () => {
    it("returns file-access-error for missing files", async () => {
      const runtime = new TreeSitterRuntime("/tmp");
      const result = await runtime.parseFile("nonexistent.ts");
      expect(result.kind).toBe("file-access-error");
      if (result.kind === "file-access-error") {
        expect(result.file).toBe("nonexistent.ts");
        expect(result.message).toBeTruthy();
      }
      runtime.dispose();
    });
  });

  describe("parseFile — success", () => {
    it("parses a TypeScript file successfully", async () => {
      const runtime = new TreeSitterRuntime(FIXTURE_DIR);
      const result = await runtime.parseFile("sample.ts");
      expect(result.kind).toBe("success");
      if (result.kind === "success") {
        expect(result.data.source).toContain("export function hello");
        expect(result.data.grammarId).toBe("typescript");
        expect(result.data.resolvedPath).toContain("sample.ts");
      }
      runtime.dispose();
    });

    it("parses a JavaScript file successfully", async () => {
      const runtime = new TreeSitterRuntime(FIXTURE_DIR);
      const result = await runtime.parseFile("sample.js");
      expect(result.kind).toBe("success");
      if (result.kind === "success") {
        expect(result.data.grammarId).toBe("javascript");
      }
      runtime.dispose();
    });

    it("parses a TSX file successfully", async () => {
      const runtime = new TreeSitterRuntime(FIXTURE_DIR);
      const result = await runtime.parseFile("sample.tsx");
      expect(result.kind).toBe("success");
      if (result.kind === "success") {
        expect(result.data.grammarId).toBe("tsx");
      }
      runtime.dispose();
    });
  });

  describe("parser reuse", () => {
    it("reuses parser across multiple calls", async () => {
      const runtime = new TreeSitterRuntime(FIXTURE_DIR);
      const result1 = await runtime.parseFile("sample.ts");
      const result2 = await runtime.parseFile("sample.ts");
      expect(result1.kind).toBe("success");
      expect(result2.kind).toBe("success");
      runtime.dispose();
    });
  });

  describe("queryFile", () => {
    it("executes a valid query", async () => {
      const runtime = new TreeSitterRuntime(FIXTURE_DIR);
      const result = await runtime.queryFile(
        "sample.ts",
        "(function_declaration name: (identifier) @fn-name)",
      );
      expect(result.kind).toBe("success");
      if (result.kind === "success") {
        expect(result.data.length).toBeGreaterThan(0);
        const capture = result.data[0];
        expect(capture.name).toBe("fn-name");
        expect(capture.text).toBe("hello");
        expect(capture.range.startLine).toBeGreaterThanOrEqual(1);
      }
      runtime.dispose();
    });

    it.each([
      "(((invalid",
      "(not_a_node) @x",
      "(identifier) @",
      "(identifier) (#eq?)",
    ])("returns validation error for invalid query %s", async (query) => {
      const runtime = new TreeSitterRuntime(FIXTURE_DIR);
      const result = await runtime.queryFile("sample.ts", query);
      expect(result.kind).toBe("validation-error");
      if (result.kind === "validation-error") {
        expect(result.message).toContain("Invalid query");
      }
      runtime.dispose();
    });

    it("returns validation error for empty query", async () => {
      const runtime = new TreeSitterRuntime(FIXTURE_DIR);
      const result = await runtime.queryFile("sample.ts", "");
      expect(result.kind).toBe("validation-error");
      runtime.dispose();
    });

    it("returns validation error for whitespace-only query", async () => {
      const runtime = new TreeSitterRuntime(FIXTURE_DIR);
      const result = await runtime.queryFile("sample.ts", "   ");
      expect(result.kind).toBe("validation-error");
      runtime.dispose();
    });

    it("returns unsupported-language for unsupported files", async () => {
      const runtime = new TreeSitterRuntime(FIXTURE_DIR);
      const result = await runtime.queryFile("readme.md", "(identifier)");
      expect(result.kind).toBe("unsupported-language");
      runtime.dispose();
    });
  });

  describe("dispose", () => {
    it("cleans up resources without error", () => {
      const runtime = new TreeSitterRuntime("/tmp");
      expect(() => runtime.dispose()).not.toThrow();
    });
  });
});
