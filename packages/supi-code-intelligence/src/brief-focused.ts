// Focused brief generation — directory and file briefs.
// biome-ignore-all lint/nursery/noExcessiveLinesPerFile: focused brief formatting and recursive directory summarization are kept together to share local helpers

import * as fs from "node:fs";
import * as path from "node:path";
import type { ArchitectureModel } from "./architecture.ts";
import { findModuleForPath, getDependencies, getDependents } from "./architecture.ts";
import { formatGitContext, gatherGitContext } from "./git-context.ts";
import {
  appendPrioritySignalsSection,
  summarizePrioritySignalsForFiles,
} from "./prioritization-signals.ts";
import type { BriefDetails, ConfidenceMode } from "./types.ts";

/**
 * Generate a focused brief for a specific path (directory or file).
 */
export function generateFocusedBrief(
  model: ArchitectureModel,
  focusPath: string,
): { content: string; details: BriefDetails } {
  const resolvedPath = path.resolve(focusPath);

  if (!fs.existsSync(resolvedPath)) {
    return {
      content: `**Error:** Path not found: \`${focusPath}\``,
      details: {
        confidence: "unavailable",
        focusTarget: focusPath,
        startHere: [],
        publicSurfaces: [],
        dependencySummary: null,
        omittedCount: 0,
        nextQueries: [],
      },
    };
  }

  const stat = fs.statSync(resolvedPath);

  if (stat.isDirectory()) {
    return generateDirectoryBrief(model, resolvedPath, focusPath);
  }

  return generateFileBrief(model, resolvedPath, focusPath);
}

function generateDirectoryBrief(
  model: ArchitectureModel,
  resolvedPath: string,
  originalPath: string,
): { content: string; details: BriefDetails } {
  const mod = findModuleForPath(model, resolvedPath);
  const lines: string[] = [];
  const confidence: ConfidenceMode = "structural";
  const startHere: Array<{ target: string; reason: string }> = [];
  const publicSurfaces: string[] = [];
  const nextQueries: string[] = [];

  if (mod && mod.root === resolvedPath) {
    formatModuleBrief({ mod, model, lines, startHere, publicSurfaces, nextQueries, resolvedPath });
  } else {
    formatNonModuleDir({
      model,
      mod,
      resolvedPath,
      originalPath,
      lines,
      publicSurfaces,
      nextQueries,
    });
  }

  if (nextQueries.length > 0) {
    lines.push("");
    lines.push("## Next");
    for (const q of nextQueries.slice(0, 2)) {
      lines.push(`- ${q}`);
    }
  }

  const prioritySignals = summarizePrioritySignalsForFiles(
    model.root,
    summarizeDirectoryRecursively(resolvedPath).allFiles,
  );
  appendPrioritySignalsSection(lines, prioritySignals);

  const gitCtx = gatherGitContext(model.root);
  if (gitCtx) {
    lines.push(formatGitContext(gitCtx));
  }

  lines.push("");

  return {
    content: lines.join("\n"),
    details: {
      confidence,
      focusTarget: originalPath,
      startHere: startHere.slice(0, 3),
      publicSurfaces: publicSurfaces.slice(0, 5),
      dependencySummary: mod ? { moduleCount: 1, edgeCount: mod.internalDeps.length } : null,
      omittedCount: 0,
      nextQueries,
      prioritySignals,
    },
  };
}

interface ModuleBriefContext {
  mod: NonNullable<ReturnType<typeof findModuleForPath>>;
  model: ArchitectureModel;
  lines: string[];
  startHere: Array<{ target: string; reason: string }>;
  publicSurfaces: string[];
  nextQueries: string[];
  resolvedPath: string;
}

function formatModuleBrief(ctx: ModuleBriefContext): void {
  const { mod, model, lines, startHere, publicSurfaces, nextQueries, resolvedPath } = ctx;
  const shortName = mod.name.replace(/^@[^/]+\//, "");
  lines.push(`# Module: ${shortName}`);
  if (mod.description) {
    lines.push("");
    lines.push(mod.description);
  }
  lines.push("");
  lines.push(`- Path: \`${mod.relativePath}\``);

  if (mod.entrypoints.length > 0) {
    lines.push(`- Entrypoints: ${mod.entrypoints.map((e) => `\`${e}\``).join(", ")}`);
    for (const ep of mod.entrypoints) {
      publicSurfaces.push(`${shortName}: ${ep}`);
      startHere.push({ target: ep, reason: "module entrypoint" });
    }
  }

  addDependenciesSection(model, mod, lines);
  addDependentsSection(model, mod, lines, nextQueries);
  addSourceFilesSection(resolvedPath, lines);
}

function addDependenciesSection(
  model: ArchitectureModel,
  mod: NonNullable<ReturnType<typeof findModuleForPath>>,
  lines: string[],
): void {
  const deps = getDependencies(model, mod.name);
  if (deps.length > 0) {
    lines.push("");
    lines.push("## Dependencies (internal)");
    for (const dep of deps) {
      const depShort = dep.name.replace(/^@[^/]+\//, "");
      lines.push(`- ${depShort} (\`${dep.relativePath}\`)`);
    }
  }

  if (mod.externalDeps.length > 0) {
    const shown = mod.externalDeps.slice(0, 8);
    lines.push("");
    lines.push("## Dependencies (external)");
    for (const dep of shown) {
      lines.push(`- ${dep}`);
    }
    if (mod.externalDeps.length > 8) {
      lines.push(`- _+${mod.externalDeps.length - 8} more_`);
    }
  }
}

function addDependentsSection(
  model: ArchitectureModel,
  mod: NonNullable<ReturnType<typeof findModuleForPath>>,
  lines: string[],
  nextQueries: string[],
): void {
  const dependents = getDependents(model, mod.name);
  if (dependents.length > 0) {
    lines.push("");
    lines.push("## Dependents");
    for (const dep of dependents) {
      const depShort = dep.name.replace(/^@[^/]+\//, "");
      lines.push(`- ${depShort} (\`${dep.relativePath}\`)`);
    }
    nextQueries.push("`code_intel affected` before modifying exports from this module");
  }

  if (mod.entrypoints.length > 0) {
    const ep = mod.entrypoints[0];
    nextQueries.push(
      `\`code_intel brief\` with \`file: "${mod.relativePath}/${ep.replace(/^\.\//, "")}"\` for entrypoint details`,
    );
  }
}

function addSourceFilesSection(resolvedPath: string, lines: string[]): void {
  const files = listSourceFiles(resolvedPath);
  if (files.length > 0) {
    const shown = files.slice(0, 10);
    lines.push("");
    lines.push("## Source Files");
    for (const f of shown) {
      lines.push(`- \`${f}\``);
    }
    if (files.length > 10) {
      lines.push(`- _+${files.length - 10} more files_`);
    }
  }
}

interface NonModuleDirContext {
  model: ArchitectureModel;
  mod: ReturnType<typeof findModuleForPath>;
  resolvedPath: string;
  originalPath: string;
  lines: string[];
  publicSurfaces: string[];
  nextQueries: string[];
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: nested-directory brief formatting is clearer as one staged formatter than as many tiny helpers
function formatNonModuleDir(ctx: NonModuleDirContext): void {
  const { model, mod, resolvedPath, originalPath, lines, publicSurfaces, nextQueries } = ctx;
  const relPath = path.relative(model.root, resolvedPath);
  lines.push(`# Directory: ${relPath || originalPath}`);
  lines.push("");

  if (mod) {
    const shortName = mod.name.replace(/^@[^/]+\//, "");
    lines.push(`_Inside module: ${shortName} (\`${mod.relativePath}\`)_`);
    lines.push("");
  }

  const summary = summarizeDirectoryRecursively(resolvedPath);
  if (summary.directFiles.length > 0) {
    lines.push("## Source Files");
    for (const f of summary.directFiles.slice(0, 10)) {
      lines.push(`- \`${f}\``);
    }
    if (summary.directFiles.length > 10) {
      lines.push(`- _+${summary.directFiles.length - 10} more files_`);
    }
    lines.push("");
  }

  if (summary.totalSourceFiles > 0) {
    lines.push("## Descendant Source Files");
    lines.push(`- Total: ${summary.totalSourceFiles}`);
    for (const subdir of summary.subdirs.slice(0, 8)) {
      lines.push(
        `- \`${subdir.name}/\` — ${subdir.fileCount} file${subdir.fileCount !== 1 ? "s" : ""}`,
      );
    }
    if (summary.subdirs.length > 8) {
      lines.push(`- _+${summary.subdirs.length - 8} more subdirectories_`);
    }
    lines.push("");
  }

  if (summary.publicSurfaces.length > 0) {
    lines.push("## Public Surfaces");
    for (const surface of summary.publicSurfaces.slice(0, 8)) {
      lines.push(`- ${surface}`);
      publicSurfaces.push(surface);
    }
    if (summary.publicSurfaces.length > 8) {
      lines.push(`- _+${summary.publicSurfaces.length - 8} more exports_`);
    }
    lines.push("");
  }

  if (summary.totalSourceFiles > 0) {
    lines.push("## Import / Export Summary");
    lines.push(`- Imports: ${summary.importCount}`);
    lines.push(`- Exports: ${summary.exportCount}`);
    lines.push("");
    nextQueries.push(
      `\`code_intel pattern\` with \`path: "${relPath || originalPath}"\` to inspect a specific nested symbol`,
    );
  }

  if (summary.totalSourceFiles === 0) {
    lines.push("No recognized source files in this directory.");
  }
}

function generateFileBrief(
  model: ArchitectureModel,
  resolvedPath: string,
  originalPath: string,
): { content: string; details: BriefDetails } {
  const mod = findModuleForPath(model, resolvedPath);
  const lines: string[] = [];
  const confidence: ConfidenceMode = "structural";
  const publicSurfaces: string[] = [];
  const nextQueries: string[] = [];

  const fileName = path.basename(resolvedPath);
  const relPath = path.relative(model.root, resolvedPath);

  lines.push(`# File: ${relPath || fileName}`);
  lines.push("");

  if (mod) {
    const shortName = mod.name.replace(/^@[^/]+\//, "");
    lines.push(`_Module: ${shortName} (\`${mod.relativePath}\`)_`);
    lines.push("");

    const isEntrypoint = mod.entrypoints.some((ep) => {
      const epResolved = path.resolve(mod.root, ep);
      return epResolved === resolvedPath;
    });
    if (isEntrypoint) {
      lines.push("**This file is a module entrypoint.**");
      lines.push("");
      publicSurfaces.push(`${shortName} entrypoint`);
    }
  }

  try {
    const content = fs.readFileSync(resolvedPath, "utf-8");
    const lineCount = content.split("\n").length;
    lines.push(`- Lines: ${lineCount}`);
    lines.push(`- Extension: \`${path.extname(resolvedPath)}\``);
  } catch {
    lines.push("_Could not read file contents._");
  }

  const prioritySignals = summarizePrioritySignalsForFiles(model.root, [resolvedPath]);
  if (prioritySignals) {
    lines.push("");
    appendPrioritySignalsSection(lines, prioritySignals);
  }

  nextQueries.push(
    `\`code_intel callers\` with \`file: "${relPath}"\` and a line/character for call-site analysis`,
  );
  if (mod) {
    nextQueries.push(
      `\`code_intel brief\` with \`path: "${mod.relativePath}"\` for the containing module overview`,
    );
  }

  if (nextQueries.length > 0) {
    lines.push("");
    lines.push("## Next");
    for (const q of nextQueries.slice(0, 2)) {
      lines.push(`- ${q}`);
    }
  }

  const gitCtx = gatherGitContext(model.root);
  if (gitCtx) {
    lines.push(formatGitContext(gitCtx));
  }

  lines.push("");

  return {
    content: lines.join("\n"),
    details: {
      confidence,
      focusTarget: originalPath,
      startHere: [],
      publicSurfaces,
      dependencySummary: null,
      omittedCount: 0,
      nextQueries,
      prioritySignals,
    },
  };
}

// ── Helpers ───────────────────────────────────────────────────────────

const SOURCE_EXTENSIONS = new Set([
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

interface RecursiveDirectorySummary {
  directFiles: string[];
  allFiles: string[];
  totalSourceFiles: number;
  subdirs: Array<{ name: string; fileCount: number }>;
  publicSurfaces: string[];
  importCount: number;
  exportCount: number;
}

function listSourceFiles(dir: string): string[] {
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

function summarizeDirectoryRecursively(dir: string): RecursiveDirectorySummary {
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
