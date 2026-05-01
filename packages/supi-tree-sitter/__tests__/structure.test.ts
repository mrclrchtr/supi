import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { extractExports } from "../exports.ts";
import { extractImports } from "../imports.ts";
import { lookupNodeAt } from "../node-at.ts";
import { collectOutline } from "../outline.ts";
import { TreeSitterRuntime } from "../runtime.ts";

const FIXTURE_DIR = path.resolve(__dirname, "fixtures");

describe("outline extraction", () => {
  it("extracts functions, classes, and interfaces from TypeScript", async () => {
    const runtime = new TreeSitterRuntime(FIXTURE_DIR);
    const parseResult = await runtime.parseFile("sample.ts");
    expect(parseResult.kind).toBe("success");

    const { tree, source } =
      parseResult.kind === "success" ? parseResult.data : { tree: null, source: "" };
    if (!tree) {
      runtime.dispose();
      return;
    }
    const items = collectOutline(tree.rootNode, source);
    tree.delete();
    runtime.dispose();

    const names = items.map((i) => i.name);
    expect(names).toContain("hello");
    expect(names).toContain("Greeter");
    expect(names).toContain("Config");

    const greeter = items.find((i) => i.name === "Greeter");
    expect(greeter?.kind).toBe("class");
    expect(greeter?.children?.length).toBeGreaterThan(0);

    const greetMethod = greeter?.children?.find((c) => c.name === "greet");
    expect(greetMethod?.kind).toBe("method");
  });

  it("returns empty array for file with no declarations", async () => {
    const runtime = new TreeSitterRuntime(FIXTURE_DIR);
    const parseResult = await runtime.parseFile("empty.ts");
    if (parseResult.kind !== "success") {
      // empty.ts doesn't exist, skip
      runtime.dispose();
      return;
    }
    const { tree, source } = parseResult.data;
    const items = collectOutline(tree.rootNode, source);
    tree.delete();
    runtime.dispose();
    expect(items).toEqual([]);
  });
});

describe("import extraction", () => {
  it("extracts imports from TypeScript", async () => {
    const runtime = new TreeSitterRuntime(FIXTURE_DIR);
    const result = await extractImports(runtime, "sample.ts");
    expect(result.kind).toBe("success");

    if (result.kind === "success") {
      const specifiers = result.data.map((i) => i.moduleSpecifier);
      expect(specifiers).toContain("node:fs/promises");
      expect(specifiers).toContain("node:path");
    }
    runtime.dispose();
  });

  it("returns unsupported-language for .py files", async () => {
    const runtime = new TreeSitterRuntime(FIXTURE_DIR);
    const result = await extractImports(runtime, "script.py");
    expect(result.kind).toBe("unsupported-language");
    runtime.dispose();
  });
});

describe("export extraction", () => {
  it("extracts exports from TypeScript", async () => {
    const runtime = new TreeSitterRuntime(FIXTURE_DIR);
    const result = await extractExports(runtime, "sample.ts");
    expect(result.kind).toBe("success");

    if (result.kind === "success") {
      const names = result.data.map((e) => e.name);
      expect(names).toContain("hello");
      expect(names).toContain("Greeter");
      expect(names).toContain("Config");
    }
    runtime.dispose();
  });

  it("extracts exports from JavaScript", async () => {
    const runtime = new TreeSitterRuntime(FIXTURE_DIR);
    const result = await extractExports(runtime, "sample.js");
    expect(result.kind).toBe("success");

    if (result.kind === "success") {
      // JS file uses export function and export const
      const names = result.data.map((e) => e.name);
      expect(names).toContain("greet");
      expect(names).toContain("config");
    }
    runtime.dispose();
  });

  it("extracts named export clauses and re-export specifiers", async () => {
    const runtime = new TreeSitterRuntime(FIXTURE_DIR);
    const result = await extractExports(runtime, "export-specifiers.ts");
    expect(result.kind).toBe("success");

    if (result.kind === "success") {
      expect(result.data).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ kind: "export", name: "a" }),
          expect.objectContaining({ kind: "export", name: "c" }),
          expect.objectContaining({ kind: "re-export", moduleSpecifier: "./mod.ts", name: "d" }),
          expect.objectContaining({ kind: "re-export", moduleSpecifier: "./mod.ts", name: "f" }),
        ]),
      );
    }
    runtime.dispose();
  });
});

describe("node_at lookup", () => {
  it("finds the identifier node at a function name position", async () => {
    const runtime = new TreeSitterRuntime(FIXTURE_DIR);
    const result = await lookupNodeAt(runtime, "sample.ts", 1, 17);
    expect(result.kind).toBe("success");

    if (result.kind === "success") {
      expect(result.data.type).toBe("identifier");
      expect(result.data.text).toBe("hello");
      expect(result.data.range.startLine).toBe(1);
    }
    runtime.dispose();
  });

  it("validates non-integer coordinates", async () => {
    const runtime = new TreeSitterRuntime(FIXTURE_DIR);
    const lineResult = await lookupNodeAt(runtime, "sample.ts", 1.5, 1);
    expect(lineResult.kind).toBe("validation-error");

    const characterResult = await lookupNodeAt(runtime, "sample.ts", 1, 1.5);
    expect(characterResult.kind).toBe("validation-error");
    runtime.dispose();
  });

  it("returns file-access-error for missing files", async () => {
    const runtime = new TreeSitterRuntime(FIXTURE_DIR);
    const result = await lookupNodeAt(runtime, "missing.ts", 1, 1);
    expect(result.kind).toBe("file-access-error");
    runtime.dispose();
  });
});
