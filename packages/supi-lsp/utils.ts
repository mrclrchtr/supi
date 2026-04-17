// URI and language utilities for LSP.

import * as fs from "node:fs";
import * as path from "node:path";

// ── URI Handling ──────────────────────────────────────────────────────

/** Convert a file path to a file:// URI. */
export function fileToUri(filePath: string): string {
  const resolved = path.resolve(filePath);
  if (process.platform === "win32") {
    return `file:///${resolved.replace(/\\/g, "/")}`;
  }
  return `file://${resolved}`;
}

/** Convert a file:// URI to a file path. */
export function uriToFile(uri: string): string {
  if (!uri.startsWith("file://")) return uri;
  let filePath = decodeURIComponent(uri.slice(7));
  if (
    process.platform === "win32" &&
    filePath.startsWith("/") &&
    /^[A-Za-z]:/.test(filePath.slice(1))
  ) {
    filePath = filePath.slice(1);
  }
  return filePath;
}

// ── Language ID Detection ─────────────────────────────────────────────

const EXT_TO_LANGUAGE: Record<string, string> = {
  ts: "typescript",
  tsx: "typescriptreact",
  js: "javascript",
  jsx: "javascriptreact",
  mts: "typescript",
  cts: "typescript",
  mjs: "javascript",
  cjs: "javascript",
  py: "python",
  pyi: "python",
  rs: "rust",
  go: "go",
  mod: "go",
  c: "c",
  h: "c",
  cpp: "cpp",
  hpp: "cpp",
  cc: "cpp",
  cxx: "cpp",
  hxx: "cpp",
  "c++": "cpp",
  "h++": "cpp",
  json: "json",
  yaml: "yaml",
  yml: "yaml",
  md: "markdown",
  html: "html",
  css: "css",
  scss: "scss",
  sh: "shellscript",
  bash: "shellscript",
  toml: "toml",
  xml: "xml",
  sql: "sql",
  rb: "ruby",
  java: "java",
  kt: "kotlin",
  swift: "swift",
  lua: "lua",
  zig: "zig",
};

/** Detect the LSP languageId from a file path. */
export function detectLanguageId(filePath: string): string {
  const ext = path.extname(filePath).slice(1).toLowerCase();
  return EXT_TO_LANGUAGE[ext] ?? ext;
}

/** Get the file extension (without dot) from a file path. */
export function getFileExtension(filePath: string): string {
  return path.extname(filePath).slice(1).toLowerCase();
}

// ── Root Marker Detection ─────────────────────────────────────────────

/**
 * Search upward from `startDir` for any of the `markers` files/dirs.
 * Returns the directory containing the first found marker, or `fallback`.
 */
export function findProjectRoot(startDir: string, markers: string[], fallback: string): string {
  let dir = path.resolve(startDir);
  const root = path.parse(dir).root;

  while (dir !== root) {
    for (const marker of markers) {
      if (fs.existsSync(path.join(dir, marker))) {
        return dir;
      }
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  return fallback;
}

// ── PATH Validation ───────────────────────────────────────────────────

/**
 * Check if a command exists on PATH.
 * Uses synchronous check to avoid complexity.
 */
export function commandExists(command: string): boolean {
  // If it's an absolute path, check directly
  if (path.isAbsolute(command)) {
    return fs.existsSync(command);
  }

  const pathDirs = (process.env.PATH ?? "").split(path.delimiter);
  const extensions =
    process.platform === "win32" ? (process.env.PATHEXT ?? ".EXE;.CMD;.BAT;.COM").split(";") : [""];

  for (const dir of pathDirs) {
    for (const ext of extensions) {
      const fullPath = path.join(dir, command + ext);
      try {
        fs.accessSync(fullPath, fs.constants.X_OK);
        return true;
      } catch {
        // Not found here, continue
      }
    }
  }
  return false;
}
