import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  detectGrammar,
  getSupportedExtension,
  isSupportedFile,
  resolveGrammarWasmPath,
} from "../src/language.ts";

describe("isSupportedFile", () => {
  it.each([
    ["file.ts", true],
    ["file.tsx", true],
    ["file.js", true],
    ["file.jsx", true],
    ["file.mts", true],
    ["file.cts", true],
    ["file.mjs", true],
    ["file.cjs", true],
    ["file.py", true],
    ["file.pyi", true],
    ["file.rs", true],
    ["file.go", true],
    ["file.mod", true],
    ["file.c", true],
    ["file.cpp", true],
    ["file.java", true],
    ["file.kt", true],
    ["file.kts", true],
    ["file.rb", true],
    ["file.sh", true],
    ["file.bash", true],
    ["file.zsh", true],
    ["file.html", true],
    ["file.htm", true],
    ["file.xhtml", true],
    ["file.r", true],
    ["file.sql", true],
    ["Makefile", false],
    ["file.TS", true], // case-insensitive
  ])("%s → %s", (filePath, expected) => {
    expect(isSupportedFile(filePath)).toBe(expected);
  });
});

describe("getSupportedExtension", () => {
  it("returns the extension for supported files", () => {
    expect(getSupportedExtension("index.ts")).toBe(".ts");
    expect(getSupportedExtension("component.tsx")).toBe(".tsx");
    expect(getSupportedExtension("main.py")).toBe(".py");
    expect(getSupportedExtension("lib.rs")).toBe(".rs");
  });

  it("returns undefined for unsupported files", () => {
    expect(getSupportedExtension("Makefile")).toBeUndefined();
    expect(getSupportedExtension("readme.txt")).toBeUndefined();
  });
});

describe("detectGrammar", () => {
  it("maps JS-family extensions to javascript grammar", () => {
    expect(detectGrammar("app.js")).toBe("javascript");
    expect(detectGrammar("app.jsx")).toBe("javascript");
    expect(detectGrammar("app.mjs")).toBe("javascript");
    expect(detectGrammar("app.cjs")).toBe("javascript");
  });

  it("maps TS extensions to typescript grammar", () => {
    expect(detectGrammar("mod.ts")).toBe("typescript");
    expect(detectGrammar("mod.mts")).toBe("typescript");
    expect(detectGrammar("mod.cts")).toBe("typescript");
  });

  it("maps TSX extension to tsx grammar", () => {
    expect(detectGrammar("comp.tsx")).toBe("tsx");
  });

  it("maps Python extensions to python grammar", () => {
    expect(detectGrammar("main.py")).toBe("python");
    expect(detectGrammar("types.pyi")).toBe("python");
  });

  it("maps Rust extensions to rust grammar", () => {
    expect(detectGrammar("lib.rs")).toBe("rust");
  });

  it("maps Go extensions to go grammar", () => {
    expect(detectGrammar("main.go")).toBe("go");
    expect(detectGrammar("go.mod")).toBe("go");
  });

  it("maps C/C++ extensions to c and cpp grammars", () => {
    expect(detectGrammar("main.c")).toBe("c");
    expect(detectGrammar("main.h")).toBe("c");
    expect(detectGrammar("main.cpp")).toBe("cpp");
    expect(detectGrammar("main.hpp")).toBe("cpp");
  });

  it("maps Java extensions to java grammar", () => {
    expect(detectGrammar("App.java")).toBe("java");
  });

  it("maps Kotlin extensions to kotlin grammar", () => {
    expect(detectGrammar("App.kt")).toBe("kotlin");
    expect(detectGrammar("build.gradle.kts")).toBe("kotlin");
  });

  it("maps Ruby extensions to ruby grammar", () => {
    expect(detectGrammar("app.rb")).toBe("ruby");
  });

  it("maps Shell extensions to bash grammar", () => {
    expect(detectGrammar("script.sh")).toBe("bash");
    expect(detectGrammar("script.bash")).toBe("bash");
    expect(detectGrammar("script.zsh")).toBe("bash");
  });

  it("maps HTML extensions to html grammar", () => {
    expect(detectGrammar("index.html")).toBe("html");
    expect(detectGrammar("index.htm")).toBe("html");
    expect(detectGrammar("index.xhtml")).toBe("html");
  });

  it("maps R extension to r grammar", () => {
    expect(detectGrammar("analysis.r")).toBe("r");
  });

  it("maps SQL extension to sql grammar", () => {
    expect(detectGrammar("schema.sql")).toBe("sql");
  });

  it("returns undefined for unsupported extensions", () => {
    expect(detectGrammar("main.txt")).toBeUndefined();
  });
});

describe("resolveGrammarWasmPath", () => {
  it("resolves javascript grammar WASM path", () => {
    const path = resolveGrammarWasmPath("javascript");
    expect(path).toContain("tree-sitter-javascript");
    expect(path).toMatch(/tree-sitter-javascript\.wasm$/);
  });

  it("resolves typescript grammar WASM path", () => {
    const path = resolveGrammarWasmPath("typescript");
    expect(path).toContain("tree-sitter-typescript");
    expect(path).toMatch(/tree-sitter-typescript\.wasm$/);
  });

  it("resolves tsx grammar WASM path", () => {
    const path = resolveGrammarWasmPath("tsx");
    expect(path).toContain("tree-sitter-typescript");
    expect(path).toMatch(/tree-sitter-tsx\.wasm$/);
  });

  it("resolves python grammar WASM path", () => {
    const path = resolveGrammarWasmPath("python");
    expect(path).toContain("tree-sitter-python");
    expect(path).toMatch(/tree-sitter-python\.wasm$/);
  });

  it("resolves rust grammar WASM path", () => {
    const path = resolveGrammarWasmPath("rust");
    expect(path).toContain("tree-sitter-rust");
    expect(path).toMatch(/tree-sitter-rust\.wasm$/);
  });

  it("resolves Kotlin to the vendored fwcd WASM", () => {
    const wasmPath = resolveGrammarWasmPath("kotlin");
    expect(wasmPath).toMatch(/resources[\\/]grammars[\\/]kotlin/);
    expect(wasmPath).toMatch(/tree-sitter-kotlin\.wasm$/);
    expect(existsSync(wasmPath)).toBe(true);
  });

  it("resolves bash grammar WASM path", () => {
    const wasmPath = resolveGrammarWasmPath("bash");
    expect(wasmPath).toContain("tree-sitter-bash");
    expect(wasmPath).toMatch(/tree-sitter-bash\.wasm$/);
  });

  it("resolves html grammar WASM path", () => {
    const wasmPath = resolveGrammarWasmPath("html");
    expect(wasmPath).toContain("tree-sitter-html");
    expect(wasmPath).toMatch(/tree-sitter-html\.wasm$/);
  });

  it("resolves r grammar WASM path", () => {
    const wasmPath = resolveGrammarWasmPath("r");
    expect(wasmPath).toContain("@davisvaughan");
    expect(wasmPath).toMatch(/tree-sitter-r\.wasm$/);
  });

  it("resolves SQL to the vendored WASM", () => {
    const wasmPath = resolveGrammarWasmPath("sql");
    expect(wasmPath).toMatch(/resources[\\/]grammars[\\/]sql/);
    expect(wasmPath).toMatch(/tree-sitter-sql\.wasm$/);
    expect(existsSync(wasmPath)).toBe(true);
  });
});
