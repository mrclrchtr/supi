// Language detection and grammar resolution for Tree-sitter.

import { createRequire } from "node:module";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import type { GrammarId, SupportedExtension } from "./types.ts";

const require = createRequire(import.meta.url);
const sourceDir = path.dirname(fileURLToPath(import.meta.url));

/** Mapping from file extension to grammar identifier. */
const EXTENSION_GRAMMAR: Record<string, GrammarId> = {
  ".js": "javascript",
  ".jsx": "javascript",
  ".mjs": "javascript",
  ".cjs": "javascript",
  ".ts": "typescript",
  ".mts": "typescript",
  ".cts": "typescript",
  ".tsx": "tsx",
  ".py": "python",
  ".pyi": "python",
  ".rs": "rust",
  ".go": "go",
  ".mod": "go",
  ".c": "c",
  ".h": "c",
  ".cpp": "cpp",
  ".hpp": "cpp",
  ".cc": "cpp",
  ".cxx": "cpp",
  ".hxx": "cpp",
  ".c++": "cpp",
  ".h++": "cpp",
  ".java": "java",
  ".kt": "kotlin",
  ".kts": "kotlin",
  ".rb": "ruby",
  ".sh": "bash",
  ".bash": "bash",
  ".zsh": "bash",
  ".html": "html",
  ".htm": "html",
  ".xhtml": "html",
  ".r": "r",
  ".sql": "sql",
};

const SUPPORTED_EXTENSIONS = new Set<string>(Object.keys(EXTENSION_GRAMMAR));

/** Check if a file extension is supported. */
export function isSupportedFile(filePath: string): boolean {
  return detectGrammar(filePath) !== undefined;
}

/** Get the file extension if it's supported, otherwise undefined. */
export function getSupportedExtension(filePath: string): SupportedExtension | undefined {
  const ext = path.extname(filePath).toLowerCase();
  return SUPPORTED_EXTENSIONS.has(ext) ? (ext as SupportedExtension) : undefined;
}

/** Detect the grammar for a file. Returns undefined if unsupported. */
export function detectGrammar(filePath: string): GrammarId | undefined {
  const ext = path.extname(filePath).toLowerCase();
  return EXTENSION_GRAMMAR[ext];
}

const JS_TS_GRAMMARS: ReadonlySet<GrammarId> = new Set(["javascript", "typescript", "tsx"]);

/** Returns true if the grammar is one the JS/TS extractors understand. */
export function isJsTsGrammar(grammarId: GrammarId): boolean {
  return JS_TS_GRAMMARS.has(grammarId);
}

/** Grammar WASM file names within their respective npm packages. */
const GRAMMAR_WASM: Record<GrammarId, string> = {
  javascript: "tree-sitter-javascript.wasm",
  typescript: "tree-sitter-typescript.wasm",
  tsx: "tree-sitter-tsx.wasm",
  python: "tree-sitter-python.wasm",
  rust: "tree-sitter-rust.wasm",
  go: "tree-sitter-go.wasm",
  c: "tree-sitter-c.wasm",
  cpp: "tree-sitter-cpp.wasm",
  java: "tree-sitter-java.wasm",
  kotlin: "tree-sitter-kotlin.wasm",
  ruby: "tree-sitter-ruby.wasm",
  bash: "tree-sitter-bash.wasm",
  html: "tree-sitter-html.wasm",
  r: "tree-sitter-r.wasm",
  sql: "tree-sitter-sql.wasm",
};

type VendoredGrammarId = "kotlin" | "sql";

/** Vendored grammar WASM files generated from trusted upstream packages. */
const VENDORED_GRAMMAR_WASM: Record<VendoredGrammarId, string> = {
  kotlin: path.resolve(sourceDir, "../resources/grammars/kotlin/tree-sitter-kotlin.wasm"),
  sql: path.resolve(sourceDir, "../resources/grammars/sql/tree-sitter-sql.wasm"),
};

/** Grammar npm package names. */
const GRAMMAR_PACKAGE: Record<Exclude<GrammarId, VendoredGrammarId>, string> = {
  javascript: "tree-sitter-javascript",
  typescript: "tree-sitter-typescript",
  tsx: "tree-sitter-typescript",
  python: "tree-sitter-python",
  rust: "tree-sitter-rust",
  go: "tree-sitter-go",
  c: "tree-sitter-c",
  cpp: "tree-sitter-cpp",
  java: "tree-sitter-java",
  ruby: "tree-sitter-ruby",
  bash: "tree-sitter-bash",
  html: "tree-sitter-html",
  r: "@davisvaughan/tree-sitter-r",
};

/**
 * Resolve the WASM grammar file path for a given grammar ID.
 * Vendored grammars return their bundled resource path. Other grammars use
 * `require.resolve(<grammar>/package.json)` to locate the installed package
 * directory, then append the WASM filename.
 */
export function resolveGrammarWasmPath(grammarId: GrammarId): string {
  if (isVendoredGrammar(grammarId)) return VENDORED_GRAMMAR_WASM[grammarId];

  const packageName = GRAMMAR_PACKAGE[grammarId];
  const wasmFile = GRAMMAR_WASM[grammarId];

  // Resolve the grammar package directory via its package.json
  const packageJsonPath = require.resolve(`${packageName}/package.json`);
  const packageDir = path.dirname(packageJsonPath);

  return path.join(packageDir, wasmFile);
}

function isVendoredGrammar(grammarId: GrammarId): grammarId is VendoredGrammarId {
  return grammarId === "kotlin" || grammarId === "sql";
}
