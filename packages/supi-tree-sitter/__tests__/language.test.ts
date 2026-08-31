import { existsSync } from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { detectGrammar, getSupportedExtensions, resolveGrammarWasmPath } from "../src/language.ts";
import type { GrammarId } from "../src/types.ts";

const LANGUAGE_CASES = [
  { file: "file.js", grammar: "javascript" },
  { file: "file.jsx", grammar: "javascript" },
  { file: "file.mjs", grammar: "javascript" },
  { file: "file.cjs", grammar: "javascript" },
  { file: "file.ts", grammar: "typescript" },
  { file: "file.mts", grammar: "typescript" },
  { file: "file.cts", grammar: "typescript" },
  { file: "file.tsx", grammar: "tsx" },
  { file: "file.py", grammar: "python" },
  { file: "file.pyi", grammar: "python" },
  { file: "file.rs", grammar: "rust" },
  { file: "file.go", grammar: "go" },
  { file: "file.c", grammar: "c" },
  { file: "file.h", grammar: "c" },
  { file: "file.cpp", grammar: "cpp" },
  { file: "file.hpp", grammar: "cpp" },
  { file: "file.cc", grammar: "cpp" },
  { file: "file.cxx", grammar: "cpp" },
  { file: "file.hxx", grammar: "cpp" },
  { file: "file.c++", grammar: "cpp" },
  { file: "file.h++", grammar: "cpp" },
  { file: "file.java", grammar: "java" },
  { file: "file.kt", grammar: "kotlin" },
  { file: "file.kts", grammar: "kotlin" },
  { file: "file.rb", grammar: "ruby" },
  { file: "project.gemspec", grammar: "ruby" },
  { file: "file.sh", grammar: "bash" },
  { file: "file.bash", grammar: "bash" },
  { file: "file.zsh", grammar: "bash" },
  { file: "file.ksh", grammar: "bash" },
  { file: "file.html", grammar: "html" },
  { file: "file.htm", grammar: "html" },
  { file: "file.xhtml", grammar: "html" },
  { file: "file.r", grammar: "r" },
  { file: "file.sql", grammar: "sql" },
] satisfies ReadonlyArray<{ file: string; grammar: GrammarId }>;

const GRAMMAR_RESOURCES = [
  { grammar: "javascript", file: "tree-sitter-javascript.wasm" },
  { grammar: "typescript", file: "tree-sitter-typescript.wasm" },
  { grammar: "tsx", file: "tree-sitter-tsx.wasm" },
  { grammar: "python", file: "tree-sitter-python.wasm" },
  { grammar: "rust", file: "tree-sitter-rust.wasm" },
  { grammar: "go", file: "tree-sitter-go.wasm" },
  { grammar: "c", file: "tree-sitter-c.wasm" },
  { grammar: "cpp", file: "tree-sitter-cpp.wasm" },
  { grammar: "java", file: "tree-sitter-java.wasm" },
  { grammar: "kotlin", file: "tree-sitter-kotlin.wasm" },
  { grammar: "ruby", file: "tree-sitter-ruby.wasm" },
  { grammar: "bash", file: "tree-sitter-bash.wasm" },
  { grammar: "html", file: "tree-sitter-html.wasm" },
  { grammar: "r", file: "tree-sitter-r.wasm" },
  { grammar: "sql", file: "tree-sitter-sql.wasm" },
] satisfies ReadonlyArray<{ grammar: GrammarId; file: string }>;

describe("language registry", () => {
  it.each(LANGUAGE_CASES)("maps $file to $grammar", ({ file, grammar }) => {
    expect(detectGrammar(file)).toBe(grammar);
  });

  it.each(["go.mod", "Makefile", "file.txt"])("%s is not a parser source file", (file) => {
    expect(detectGrammar(file)).toBeUndefined();
  });

  it("matches extensions without regard to case", () => {
    expect(detectGrammar("file.TS")).toBe("typescript");
  });

  it("returns every registered extension", () => {
    expect(getSupportedExtensions()).toEqual(LANGUAGE_CASES.map(({ file }) => path.extname(file)));
  });
});

describe("grammar resources", () => {
  it.each(GRAMMAR_RESOURCES)("resolves the $grammar WASM resource", ({ grammar, file }) => {
    const wasmPath = resolveGrammarWasmPath(grammar);
    expect(wasmPath).toContain(path.join("resources", "grammars", grammar));
    expect(wasmPath.endsWith(file)).toBe(true);
    expect(existsSync(wasmPath)).toBe(true);
  });
});
