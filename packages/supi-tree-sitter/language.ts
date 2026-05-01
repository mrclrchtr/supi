// Language detection and grammar resolution for Tree-sitter.

import { createRequire } from "node:module";
import * as path from "node:path";
import type { GrammarId, SupportedExtension } from "./types.ts";

const require = createRequire(import.meta.url);

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

/** Grammar WASM file names within their respective npm packages. */
const GRAMMAR_WASM: Record<GrammarId, string> = {
  javascript: "tree-sitter-javascript.wasm",
  typescript: "tree-sitter-typescript.wasm",
  tsx: "tree-sitter-tsx.wasm",
};

/** Grammar npm package names. */
const GRAMMAR_PACKAGE: Record<GrammarId, string> = {
  javascript: "tree-sitter-javascript",
  typescript: "tree-sitter-typescript",
  tsx: "tree-sitter-typescript",
};

/**
 * Resolve the WASM grammar file path for a given grammar ID.
 * Uses `require.resolve(<grammar>/package.json)` to locate the installed
 * package directory, then appends the WASM filename.
 */
export function resolveGrammarWasmPath(grammarId: GrammarId): string {
  const packageName = GRAMMAR_PACKAGE[grammarId];
  const wasmFile = GRAMMAR_WASM[grammarId];

  // Resolve the grammar package directory via its package.json
  const packageJsonPath = require.resolve(`${packageName}/package.json`);
  const packageDir = path.dirname(packageJsonPath);

  return path.join(packageDir, wasmFile);
}
