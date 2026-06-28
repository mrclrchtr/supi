/**
 * Recursive directory summary — source file discovery, import/export counting,
 * and named-export extraction.
 *
 * Extracted from brief-focused.ts to keep the focus-generation modules
 * cohesive and avoid a single 800+ line file.
 */

import * as fs from "node:fs";
import * as path from "node:path";

// ── Types ─────────────────────────────────────────────────────────────

export interface RecursiveDirectorySummary {
  directFiles: string[];
  allFiles: string[];
  totalSourceFiles: number;
  subdirs: Array<{ name: string; fileCount: number }>;
  publicSurfaces: string[];
  importCount: number;
  exportCount: number;
}

// ── Recognized source extensions ──────────────────────────────────────

export const SOURCE_EXTENSIONS = new Set([
  // JS/TS
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mts",
  ".cts",
  ".mjs",
  ".cjs",
  // Python
  ".py",
  ".pyi",
  // Rust
  ".rs",
  // Go
  ".go",
  ".mod",
  // C/C++
  ".c",
  ".h",
  ".cpp",
  ".hpp",
  ".cc",
  ".cxx",
  ".hxx",
  ".c++",
  ".h++",
  // Java / Kotlin
  ".java",
  ".kt",
  ".kts",
  // Ruby
  ".rb",
  // Shell
  ".sh",
  ".bash",
  ".zsh",
  // Web
  ".html",
  ".htm",
  ".xhtml",
  ".css",
  ".scss",
  ".less",
  // Data / Config
  ".json",
  ".yaml",
  ".yml",
  ".toml",
  ".md",
  // Other languages
  ".php",
  ".swift",
  ".cs",
  ".r",
  ".sql",
]);

// ── Public API ────────────────────────────────────────────────────────

/** List source files (by extension) in a flat directory. */
export function listSourceFiles(dir: string): string[] {
  const files: string[] = [];
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      if (entry.name.startsWith(".")) continue;
      if (SOURCE_EXTENSIONS.has(path.extname(entry.name))) {
        files.push(entry.name);
      }
    }
  } catch {
    // Directory not readable
  }
  return files.sort((a, b) => a.localeCompare(b));
}

/** Recursively summarize a directory tree: source files, imports, exports, subdirectories. */
export function summarizeDirectoryRecursively(dir: string): RecursiveDirectorySummary {
  const directFiles = listSourceFiles(dir);
  const summary: RecursiveDirectorySummary = {
    directFiles,
    allFiles: directFiles.map((file) => path.join(dir, file)),
    totalSourceFiles: directFiles.length,
    subdirs: [],
    publicSurfaces: [],
    importCount: 0,
    exportCount: 0,
  };

  accumulateJsTsSignals(summary, dir, directFiles, "");

  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
      const childDir = path.join(dir, entry.name);
      const childSummary = summarizeDirectoryRecursively(childDir);
      if (childSummary.totalSourceFiles === 0) continue;
      summary.totalSourceFiles += childSummary.totalSourceFiles;
      summary.allFiles.push(...childSummary.allFiles);
      summary.subdirs.push({ name: entry.name, fileCount: childSummary.totalSourceFiles });
      summary.publicSurfaces.push(
        ...childSummary.publicSurfaces.map((surface) => `${entry.name}/${surface}`),
      );
      summary.importCount += childSummary.importCount;
      summary.exportCount += childSummary.exportCount;
    }
  } catch {
    // Directory not readable
  }

  summary.subdirs.sort((a, b) => a.name.localeCompare(b.name));
  return summary;
}

// ── Internal helpers ──────────────────────────────────────────────────

function accumulateJsTsSignals(
  summary: RecursiveDirectorySummary,
  dir: string,
  files: string[],
  prefix: string,
): void {
  for (const file of files) {
    if (!isJsTsFile(file)) continue;
    try {
      const relFile = prefix ? `${prefix}/${file}` : file;
      const content = fs.readFileSync(path.join(dir, file), "utf-8");
      summary.importCount += countMatches(content, /^import\s/gm);
      const exports = extractNamedExports(content);
      summary.exportCount += exports.length;
      for (const exportedName of exports) {
        summary.publicSurfaces.push(`\`${exportedName}\` — \`${relFile}\``);
      }
    } catch {
      // File not readable
    }
  }
}

function isJsTsFile(file: string): boolean {
  return [".ts", ".tsx", ".js", ".jsx", ".mts", ".cts", ".mjs", ".cjs"].includes(
    path.extname(file),
  );
}

/**
 * Lightweight exported-name extraction for recursive directory briefs.
 *
 * Best-effort only: handles exported declarations and simple named export lists,
 * but intentionally does not try to cover default exports, export-all forms,
 * re-exported defaults, or every multiline formatting variant.
 */
function extractNamedExports(content: string): string[] {
  const names = new Set<string>();
  const declarationRegex =
    /export\s+(?:async\s+)?(?:function|class|interface|type|const|let|var|enum)\s+([A-Za-z_$][\w$]*)/g;
  const namedExportRegex = /export\s*\{\s*([^}]+)\s*\}/g;

  for (const match of content.matchAll(declarationRegex)) {
    if (match[1]) names.add(match[1]);
  }

  for (const match of content.matchAll(namedExportRegex)) {
    const parts = match[1]?.split(",") ?? [];
    for (const part of parts) {
      const candidate = part
        .trim()
        .split(/\s+as\s+/i)[0]
        ?.trim();
      if (candidate) names.add(candidate);
    }
  }

  return [...names].sort((a, b) => a.localeCompare(b));
}

function countMatches(content: string, regex: RegExp): number {
  return [...content.matchAll(regex)].length;
}
