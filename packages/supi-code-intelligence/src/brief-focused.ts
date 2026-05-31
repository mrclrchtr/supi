// Focused brief generation — directory and file briefs.
// biome-ignore-all lint/style/noExcessiveLinesPerFile: focused brief formatting and recursive directory summarization are kept together to share local helpers

import * as fs from "node:fs";
import * as path from "node:path";
import type { ConfidenceMode } from "@mrclrchtr/supi-code-runtime/api";
import { getSessionLspService } from "@mrclrchtr/supi-lsp/api";
import { formatGitContext, gatherGitContext } from "./git-context.ts";
import type { ArchitectureModel } from "./model.ts";
import { findModuleForPath, getDependencies, getDependents } from "./model.ts";
import { renderFileBrief, renderModuleDiagnostics } from "./presentation/markdown/brief.ts";
import {
  appendPrioritySignalsSection,
  summarizePrioritySignalsForFiles,
} from "./prioritization-signals.ts";
import type { BriefDetails } from "./types.ts";
import { gatherBriefEnrichment } from "./use-case/brief-enrich.ts";
import type { BriefOpts } from "./use-case/brief-models.ts";

/**
 * Generate a focused brief for a specific path (directory or file).
 *
 * When opts.provider is available, file briefs include structural
 * context (outline, imports, exports) and inline diagnostics.
 * Module briefs include aggregated diagnostics across source files.
 */
export async function generateFocusedBrief(
  model: ArchitectureModel,
  focusPath: string,
  opts?: BriefOpts,
): Promise<{ content: string; details: BriefDetails }> {
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
    return await generateDirectoryBrief(model, resolvedPath, focusPath, opts);
  }

  return await generateFileBriefWithEnrichment(model, resolvedPath, focusPath, opts);
}

async function generateDirectoryBrief(
  model: ArchitectureModel,
  resolvedPath: string,
  originalPath: string,
  opts?: BriefOpts,
): Promise<{ content: string; details: BriefDetails }> {
  const mod = findModuleForPath(model, resolvedPath);
  const lines: string[] = [];
  const confidence: ConfidenceMode = "structural";
  const startHere: Array<{ target: string; reason: string }> = [];
  const publicSurfaces: string[] = [];
  const nextQueries: string[] = [];

  if (mod && mod.root === resolvedPath) {
    formatModuleBrief({
      mod,
      model,
      lines,
      startHere,
      publicSurfaces,
      nextQueries,
      resolvedPath,
      maxResults: opts?.maxResults ?? 10,
    });

    // Add aggregated diagnostics for module source files
    await enrichModuleWithDiagnostics(lines, resolvedPath, opts);
  } else {
    formatNonModuleDir({
      model,
      mod,
      resolvedPath,
      originalPath,
      lines,
      publicSurfaces,
      nextQueries,
      maxResults: opts?.maxResults ?? 10,
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
  maxResults: number;
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
  addSourceFilesSection(resolvedPath, lines, ctx.maxResults);
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
    nextQueries.push("`code_impact` before modifying exports from this module");
  }

  if (mod.entrypoints.length > 0) {
    const ep = mod.entrypoints[0];
    nextQueries.push(
      `\`code_brief\` with \`file: "${mod.relativePath}/${ep.replace(/^\.\//, "")}"\` for entrypoint details`,
    );
  }
}

function addSourceFilesSection(
  resolvedPath: string,
  lines: string[],
  maxResults: number = 10,
): void {
  const files = listSourceFiles(resolvedPath);
  if (files.length > 0) {
    const shown = files.slice(0, maxResults);
    lines.push("");
    lines.push("## Source Files");
    for (const f of shown) {
      lines.push(`- \`${f}\``);
    }
    if (files.length > maxResults) {
      lines.push(`- _+${files.length - maxResults} more files_`);
    }
  }

  // Add extension breakdown and landmark files for module root directories
  const inventory = collectDirectoryInventory(resolvedPath);
  if (inventory.totalFiles > 0) {
    addInventoryToLines(lines, inventory);
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
  maxResults: number;
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: nested-directory brief formatting is clearer as one staged formatter than as many tiny helpers
function formatNonModuleDir(ctx: NonModuleDirContext): void {
  const { model, mod, resolvedPath, originalPath, lines, publicSurfaces, nextQueries, maxResults } =
    ctx;
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
    for (const f of summary.directFiles.slice(0, maxResults)) {
      lines.push(`- \`${f}\``);
    }
    if (summary.directFiles.length > maxResults) {
      lines.push(`- _+${summary.directFiles.length - maxResults} more files_`);
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
      `\`code_find\` with \`query: "..."\` and \`scope: "${relPath || originalPath}"\` to inspect a specific nested symbol`,
    );
  }

  // Add extension breakdown and landmark files
  const inventory = collectDirectoryInventory(resolvedPath);
  if (inventory.totalFiles > 0) {
    addInventoryToLines(lines, inventory);
  }

  if (summary.totalSourceFiles === 0) {
    lines.push("No recognized source files in this directory.");
  }
}

async function generateFileBriefWithEnrichment(
  model: ArchitectureModel,
  resolvedPath: string,
  originalPath: string,
  opts?: BriefOpts,
): Promise<{ content: string; details: BriefDetails }> {
  const mod = findModuleForPath(model, resolvedPath);
  const publicSurfaces: string[] = [];
  const nextQueries: string[] = [];

  const fileName = path.basename(resolvedPath);
  const relPath = path.relative(model.root, resolvedPath);

  let lineCount = 0;
  try {
    const fileContent = fs.readFileSync(resolvedPath, "utf-8");
    lineCount = fileContent.split("\n").length;
  } catch {
    // Leave 0
  }

  const isEntrypoint =
    mod?.entrypoints.some((ep) => path.resolve(mod.root, ep) === resolvedPath) ?? false;

  const enrichment = await gatherBriefEnrichment(
    opts?.provider ?? null,
    opts?.cwd ?? model.root,
    relPath,
    opts?.maxResults,
  );

  const renderedContent = renderFileBrief({
    relPath: relPath || fileName,
    lineCount,
    isEntrypoint,
    moduleName: mod ? mod.name.replace(/^@[^/]+\//, "") : null,
    moduleRelativePath: mod ? mod.relativePath : null,
    enrichment,
    maxResults: opts?.maxResults,
  });

  const prioritySignals = summarizePrioritySignalsForFiles(model.root, [resolvedPath]);
  const extraLines: string[] = [];
  if (prioritySignals) {
    appendPrioritySignalsSection(extraLines, prioritySignals);
  }

  const gitCtx = gatherGitContext(model.root);
  if (gitCtx) {
    extraLines.push(formatGitContext(gitCtx));
  }

  const extraStr = extraLines.filter((l) => l.trim()).join("\n");
  const combinedContent = extraStr ? `${renderedContent.trim()}\n\n${extraStr}\n` : renderedContent;

  if (isEntrypoint) {
    const shortName = mod?.name.replace(/^@[^/]+\//, "") ?? "";
    publicSurfaces.push(`${shortName} entrypoint`);
  }

  // Populate nextQueries to match the rendered "Next" section
  nextQueries.push(
    `\`code_graph\`, \`file: "${relPath}"\`, and a line/character for reference sites`,
  );
  if (mod) {
    nextQueries.push(
      `\`code_brief\` with \`path: "${mod.relativePath}"\` for the containing module overview`,
    );
  }

  return {
    content: combinedContent,
    details: {
      confidence: "structural",
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

// ── Module diagnostics helpers ────────────────────────────────────────

/**
 * Enrich a module brief with aggregated diagnostics for all source files.
 * Extracted into a helper to keep generateDirectoryBrief complexity manageable.
 */
async function enrichModuleWithDiagnostics(
  lines: string[],
  dirPath: string,
  opts?: BriefOpts,
): Promise<void> {
  const sourceFiles = listSourceFiles(dirPath);
  if (sourceFiles.length === 0 || !opts?.cwd) return;

  const enrichmentDiags = await gatherModuleDiagnostics(
    sourceFiles,
    dirPath,
    opts.cwd,
    opts.maxResults,
  );
  if (enrichmentDiags) {
    lines.push(enrichmentDiags);
  }
}

async function gatherModuleDiagnostics(
  sourceFiles: string[],
  dirPath: string,
  cwd: string,
  maxResults?: number,
): Promise<string | null> {
  try {
    const lspState = getSessionLspService(cwd);
    if (lspState.kind !== "ready") return null;

    const fileDiags: Array<{ file: string; errors: number; warnings: number }> = [];
    for (const basename of sourceFiles) {
      const fullPath = path.join(dirPath, basename);
      const relPath = path.relative(cwd, fullPath);
      try {
        const diags = await lspState.service.fileDiagnostics(relPath, 2);
        if (!diags || diags.length === 0) continue;
        const errors = diags.filter((d) => (d.severity ?? 1) === 1).length;
        const warnings = diags.filter((d) => (d.severity ?? 1) === 2).length;
        if (errors > 0 || warnings > 0) {
          fileDiags.push({ file: basename, errors, warnings });
        }
      } catch {
        // Skip file
      }
    }

    if (fileDiags.length === 0) return null;
    return renderModuleDiagnostics(fileDiags, maxResults) ?? null;
  } catch {
    return null;
  }
}
// ── Helpers ───────────────────────────────────────────────────────────

// ── Flat directory inventory helpers (extension breakdown, landmarks) ──

interface DirectoryInventory {
  totalFiles: number;
  byExtension: Map<string, number>;
  landmarkFiles: string[];
}

/**
 * Walk a directory tree counting ALL files by extension and detecting landmarks.
 * Skips hidden directories and known build/cache dirs.
 */
/** Process a single directory entry during inventory collection. */
function processInventoryEntry(
  entry: fs.Dirent,
  currentPath: string,
  walkFn: (p: string) => void,
  state: {
    totalFiles: number;
    byExtension: Map<string, number>;
    landmarkFiles: string[];
  },
): void {
  if (entry.name.startsWith(".") && entry.isDirectory()) return;
  if (SKIP_DIRS.has(entry.name)) return;
  if (entry.isDirectory()) {
    walkFn(path.join(currentPath, entry.name));
    return;
  }
  state.totalFiles++;
  const ext = path.extname(entry.name).toLowerCase();
  state.byExtension.set(ext, (state.byExtension.get(ext) ?? 0) + 1);
  if (LANDMARK_FILES.has(entry.name)) {
    state.landmarkFiles.push(entry.name);
  }
}

function collectDirectoryInventory(dir: string): DirectoryInventory {
  const byExtension = new Map<string, number>();
  const landmarkFiles: string[] = [];
  const state = { totalFiles: 0, byExtension, landmarkFiles };

  function walk(currentPath: string) {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(currentPath, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      processInventoryEntry(entry, currentPath, walk, state);
    }
  }

  walk(dir);
  landmarkFiles.sort((a, b) => a.localeCompare(b));
  return { totalFiles: state.totalFiles, byExtension, landmarkFiles };
}

/** Append inventory (extension breakdown + landmarks) to a lines array. */
function addInventoryToLines(lines: string[], inventory: DirectoryInventory): void {
  if (inventory.totalFiles === 0) return;

  lines.push(`**Files:** ${inventory.totalFiles} total`);

  const sortedExts = [...inventory.byExtension.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
  for (const [ext, count] of sortedExts) {
    const label = EXTENSION_LABELS.get(ext) ?? (ext || "(no extension)");
    lines.push(`- ${label}: ${count}`);
  }
  if (inventory.byExtension.size > 10) {
    lines.push(`- _+${inventory.byExtension.size - 10} more extensions_`);
  }

  if (inventory.landmarkFiles.length > 0) {
    const unique = [...new Set(inventory.landmarkFiles)].sort((a, b) => a.localeCompare(b));
    lines.push("");
    lines.push("**Landmark files:**");
    for (const f of unique) {
      lines.push(`- \`${f}\``);
    }
  }
}

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

/** Human-readable labels for common file extensions. */
const EXTENSION_LABELS: Map<string, string> = new Map([
  [".ts", "TypeScript"],
  [".tsx", "TSX"],
  [".js", "JavaScript"],
  [".jsx", "JSX"],
  [".mts", "TypeScript"],
  [".cts", "TypeScript"],
  [".mjs", "JavaScript"],
  [".cjs", "JavaScript"],
  [".py", "Python"],
  [".pyi", "Python"],
  [".rs", "Rust"],
  [".go", "Go"],
  [".mod", "Go"],
  [".java", "Java"],
  [".kt", "Kotlin"],
  [".kts", "Kotlin"],
  [".rb", "Ruby"],
  [".php", "PHP"],
  [".swift", "Swift"],
  [".cpp", "C++"],
  [".hpp", "C++"],
  [".cc", "C++"],
  [".cxx", "C++"],
  [".hxx", "C++ Header"],
  [".c++", "C++"],
  [".h++", "C++ Header"],
  [".c", "C"],
  [".h", "C Header"],
  [".css", "CSS"],
  [".scss", "SCSS"],
  [".less", "Less"],
  [".html", "HTML"],
  [".htm", "HTML"],
  [".xhtml", "HTML"],
  [".json", "JSON"],
  [".yaml", "YAML"],
  [".yml", "YAML"],
  [".toml", "TOML"],
  [".md", "Markdown"],
  [".sh", "Shell"],
  [".bash", "Shell"],
  [".zsh", "Shell"],
  [".r", "R"],
  [".sql", "SQL"],
  [".cs", "C#"],
]);

/** Landmark files — well-known project configuration files. */
const LANDMARK_FILES = new Set([
  "package.json",
  "tsconfig.json",
  "jsconfig.json",
  "vite.config.ts",
  "vitest.config.ts",
  "jest.config.ts",
  "playwright.config.ts",
  "biome.json",
  "eslint.config.js",
  ".eslintrc.js",
  "deno.json",
  "deno.jsonc",
  "Cargo.toml",
  "go.mod",
  "pyproject.toml",
  "setup.py",
  "requirements.txt",
  "Makefile",
  "justfile",
  "Taskfile.yml",
  "Dockerfile",
  "docker-compose.yml",
  ".env.example",
  ".env.local.example",
]);

/** Skip these directories during flat inventory walks. */
const SKIP_DIRS = new Set(["node_modules", "dist", "build", ".git"]);

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
