import { describe, expect, it } from "vitest";
import {
  detectGrammar,
  getSupportedExtension,
  isSupportedFile,
  resolveGrammarWasmPath,
} from "../language.ts";

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
    ["file.py", false],
    ["file.rs", false],
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
  });

  it("returns undefined for unsupported files", () => {
    expect(getSupportedExtension("main.py")).toBeUndefined();
    expect(getSupportedExtension("Makefile")).toBeUndefined();
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

  it("returns undefined for unsupported extensions", () => {
    expect(detectGrammar("main.py")).toBeUndefined();
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
});
