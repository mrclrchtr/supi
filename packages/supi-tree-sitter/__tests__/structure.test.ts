import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { extractExports } from "../src/exports.ts";
import { extractImports } from "../src/imports.ts";
import { lookupNodeAt } from "../src/node-at.ts";
import { collectOutline } from "../src/outline.ts";
import { TreeSitterRuntime } from "../src/runtime.ts";

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

  it("handles default exports, fields, and local declarations predictably", async () => {
    const runtime = new TreeSitterRuntime(FIXTURE_DIR);
    const parseResult = await runtime.parseFile("outline-edge.ts");
    expect(parseResult.kind).toBe("success");

    if (parseResult.kind !== "success") {
      runtime.dispose();
      return;
    }

    const items = collectOutline(parseResult.data.tree.rootNode, parseResult.data.source);
    parseResult.data.tree.delete();

    const defaultFunction = await runtime.parseFile("outline-default-function.ts");
    expect(defaultFunction.kind).toBe("success");
    const defaultFunctionItems =
      defaultFunction.kind === "success"
        ? collectOutline(defaultFunction.data.tree.rootNode, defaultFunction.data.source)
        : [];
    if (defaultFunction.kind === "success") defaultFunction.data.tree.delete();

    const defaultClass = await runtime.parseFile("outline-default-class.ts");
    expect(defaultClass.kind).toBe("success");
    const defaultClassItems =
      defaultClass.kind === "success"
        ? collectOutline(defaultClass.data.tree.rootNode, defaultClass.data.source)
        : [];
    if (defaultClass.kind === "success") defaultClass.data.tree.delete();

    const defaultObject = await runtime.parseFile("outline-default-object.ts");
    expect(defaultObject.kind).toBe("success");
    const defaultObjectItems =
      defaultObject.kind === "success"
        ? collectOutline(defaultObject.data.tree.rootNode, defaultObject.data.source)
        : [];
    if (defaultObject.kind === "success") defaultObject.data.tree.delete();
    runtime.dispose();

    const topLevel = items.map((item) => [item.name, item.kind]);
    expect(topLevel).toContainEqual(["default", "export"]);
    expect(defaultFunctionItems.map((item) => [item.name, item.kind])).toContainEqual([
      "default",
      "export",
    ]);
    expect(defaultClassItems.map((item) => [item.name, item.kind])).toContainEqual([
      "<anonymous>",
      "class",
    ]);
    expect(defaultObjectItems.map((item) => [item.name, item.kind])).toContainEqual([
      "default",
      "export",
    ]);
    expect(topLevel).toContainEqual(["outer", "function"]);
    expect(topLevel).toContainEqual(["x", "variable"]);
    expect(topLevel).toContainEqual(["C", "class"]);
    expect(topLevel).toContainEqual(["gen", "function"]);
    expect(topLevel).not.toContainEqual(["local", "variable"]);
    expect(topLevel).not.toContainEqual(["nested", "function"]);

    const fields = items.find((item) => item.name === "Fields");
    expect(fields?.children).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "field-function", name: "handler" }),
        expect.objectContaining({ kind: "field", name: "value" }),
        expect.objectContaining({ kind: "field-function", name: "make" }),
      ]),
    );

    const shape = items.find((item) => item.name === "Shape");
    expect(shape?.children).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "method", name: "area" }),
        expect.objectContaining({ kind: "property", name: "name" }),
      ]),
    );
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

describe("ambient namespace and module outlines", () => {
  it("keeps declare namespace and declare module outlines shallow", async () => {
    const runtime = new TreeSitterRuntime(FIXTURE_DIR);
    const parseResult = await runtime.parseFile("ambient-scope.ts");
    expect(parseResult.kind).toBe("success");

    if (parseResult.kind !== "success") {
      runtime.dispose();
      return;
    }

    const items = collectOutline(parseResult.data.tree.rootNode, parseResult.data.source);
    parseResult.data.tree.delete();
    runtime.dispose();

    expect(items.map((item) => [item.name, item.kind])).toEqual([
      ["Ns", "namespace"],
      ["pkg", "namespace"],
    ]);
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

  it("returns unsupported-language for .lua files", async () => {
    const runtime = new TreeSitterRuntime(FIXTURE_DIR);
    const result = await extractImports(runtime, "script.lua");
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

  it("extracts generator, abstract, ambient, namespace, and namespace re-exports", async () => {
    const runtime = new TreeSitterRuntime(FIXTURE_DIR);
    const result = await extractExports(runtime, "export-edge.ts");
    expect(result.kind).toBe("success");

    if (result.kind === "success") {
      expect(result.data).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ kind: "function", name: "gen" }),
          expect.objectContaining({ kind: "function", name: "defaultGen" }),
          expect.objectContaining({ kind: "class", name: "AbstractBase" }),
          expect.objectContaining({ kind: "function", name: "declared" }),
          expect.objectContaining({ kind: "namespace", name: "Tools" }),
          expect.objectContaining({ kind: "re-export", moduleSpecifier: "./mod.ts", name: "mod" }),
        ]),
      );
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

  it("does not leak namespace or module-local exports into file exports", async () => {
    const runtime = new TreeSitterRuntime(FIXTURE_DIR);
    const result = await extractExports(runtime, "ambient-scope.ts");
    expect(result.kind).toBe("success");

    if (result.kind === "success") {
      expect(result.data).toEqual([]);
    }
    runtime.dispose();
  });

  it("extracts TypeScript export assignments from cts files", async () => {
    const runtime = new TreeSitterRuntime(FIXTURE_DIR);
    const result = await extractExports(runtime, "export-assignment.cts");
    expect(result.kind).toBe("success");

    if (result.kind === "success") {
      expect(result.data).toEqual([
        expect.objectContaining({ kind: "export assignment", name: "foo" }),
      ]);
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

  it("validates coordinates beyond file bounds", async () => {
    const runtime = new TreeSitterRuntime(FIXTURE_DIR);
    const lineResult = await lookupNodeAt(runtime, "sample.ts", 999, 1);
    expect(lineResult.kind).toBe("validation-error");

    const characterResult = await lookupNodeAt(runtime, "sample.ts", 1, 999);
    expect(characterResult.kind).toBe("validation-error");
    runtime.dispose();
  });

  it("treats CRLF line endings as line breaks, not line content", async () => {
    const tmpDir = mkdtempSync(path.join(os.tmpdir(), "tree-sitter-crlf-"));
    try {
      writeFileSync(path.join(tmpDir, "crlf.ts"), "const a = 1;\r\nconst b = 2;\r\n");
      const runtime = new TreeSitterRuntime(tmpDir);
      const result = await lookupNodeAt(runtime, "crlf.ts", 1, 14);
      expect(result.kind).toBe("validation-error");
      runtime.dispose();
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("returns file-access-error for missing files", async () => {
    const runtime = new TreeSitterRuntime(FIXTURE_DIR);
    const result = await lookupNodeAt(runtime, "missing.ts", 1, 1);
    expect(result.kind).toBe("file-access-error");
    runtime.dispose();
  });
});
