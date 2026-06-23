/**
 * Anchored target resolution — resolves a file + position pair into a
 * typed target outcome using purely filesystem-level validation.
 *
 * This resolver does not require LSP or Tree-sitter. It validates
 * file existence, binary-file guards, and produces the necessary
 * position conversions for downstream semantic operations.
 */

import * as fs from "node:fs";
import * as path from "node:path";

const BINARY_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".bmp",
  ".ico",
  ".woff",
  ".woff2",
  ".ttf",
  ".eot",
  ".zip",
  ".tar",
  ".gz",
  ".bz2",
  ".pdf",
  ".doc",
  ".docx",
  ".exe",
  ".dll",
  ".so",
  ".dylib",
  ".wasm",
  ".node",
]);

function isBinaryFile(filePath: string): boolean {
  return BINARY_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

/**
 * Resolve an anchored target from file + position.
 *
 * @param file - absolute path to the file
 * @param line - 1-based line
 * @param character - 1-based character
 * @returns Typed outcome: resolved or error
 */
export function resolveAnchoredTarget(
  file: string,
  line: number,
  character: number,
): import("./types.ts").TargetOutcome {
  if (!fs.existsSync(file)) {
    return { kind: "error", message: `File not found: \`${file}\`` };
  }

  if (isBinaryFile(file)) {
    return {
      kind: "error",
      message: `File type not supported for semantic analysis: \`${file}\`. Use \`code_find\` with \`mode: "text"\` for explicit text search.`,
    };
  }

  return {
    kind: "resolved",
    target: {
      file,
      position: { line: line - 1, character: character - 1 },
      displayLine: line,
      displayCharacter: character,
      name: null,
      kind: null,
      confidence: "semantic",
      // Anchored coords are user-provided; trust the position as a name
      // anchor. (Determining whether an arbitrary coord lands on an
      // identifier is slice E — tree-sitter nodeAt — not done here.)
      anchorKind: "name",
    },
  };
}
