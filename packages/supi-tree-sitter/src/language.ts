// Language detection and grammar resolution for Tree-sitter.
//
// All grammar WASM files are vendored in resources/grammars/<id>/ and
// shipped with the package. No runtime require.resolve() to third-party
// npm packages is needed.

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import type { GrammarId, SupportedExtension } from "./types.ts";

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

/** Grammar WASM file names within the vendored resources directory. */
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

const resourcesDir = path.resolve(sourceDir, "../resources/grammars");

/**
 * Resolve the WASM grammar file path for a given grammar ID.
 * All grammars use vendored WASM files under `resources/grammars/<id>/`.
 */
export function resolveGrammarWasmPath(grammarId: GrammarId): string {
  const wasmFile = GRAMMAR_WASM[grammarId];
  const vendoredPath = path.join(resourcesDir, grammarId, wasmFile);

  // Verify the vendored file exists at init time — fail fast if missing
  if (!fs.existsSync(vendoredPath)) {
    throw new Error(
      `Vendored WASM grammar not found for "${grammarId}": expected at ${vendoredPath}. ` +
        "Run `node scripts/vendor-wasm.mjs` or reinstall the package.",
    );
  }

  return vendoredPath;
}
