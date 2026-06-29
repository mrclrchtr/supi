/**
 * Directory and module brief generation.
 *
 * Formats briefs for module directories (with dependency info, entrypoints,
 * and aggregated diagnostics) and non-module directories (with recursive summaries
 * and import/export counts).
 *
 * Extracted from brief-focused.ts.
 */

import * as path from "node:path";
import type { SessionLspServiceState } from "@mrclrchtr/supi-lsp/api";
import { renderModuleDiagnostics } from "../../ui/markdown/brief.ts";
import type { ArchitectureModel } from "../architecture/model.ts";
import { findModuleForPath, getDependencies, getDependents } from "../architecture/model.ts";
import { addInventoryToLines, collectDirectoryInventory } from "./inventory.ts";
import type { BriefOpts } from "./models.ts";
import { listSourceFiles, summarizeDirectoryRecursively } from "./summarize.ts";

/** Generate a directory-level brief (handles both module and non-module directories). */
export async function generateDirectoryBrief(
  model: ArchitectureModel,
  resolvedPath: string,
  originalPath: string,
  opts?: BriefOpts,
): Promise<{
  lines: string[];
  publicSurfaces: string[];
  nextQueries: string[];
  startHere: Array<{ target: string; reason: string }>;
}> {
  const mod = findModuleForPath(model, resolvedPath);
  const lines: string[] = [];
  const publicSurfaces: string[] = [];
  const nextQueries: string[] = [];

  if (mod && mod.root === resolvedPath) {
    const startHere: Array<{ target: string; reason: string }> = [];
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

    return { lines, publicSurfaces, nextQueries, startHere };
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

    return { lines, publicSurfaces, nextQueries, startHere: [] };
  }
}

// ── Module brief ──────────────────────────────────────────────────────

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
      `\`code_orientation\` with \`focus: "${mod.relativePath}/${ep.replace(/^\.\//, "")}"\` for entrypoint details`,
    );
  }
}

function addSourceFilesSection(resolvedPath: string, lines: string[], maxResults = 10): void {
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

  const inventory = collectDirectoryInventory(resolvedPath);
  if (inventory.totalFiles > 0) {
    addInventoryToLines(lines, inventory);
  }
}

// ── Non-module directory brief ────────────────────────────────────────

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

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: nested-directory brief formatting is clearer as one staged formatter
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

  const inventory = collectDirectoryInventory(resolvedPath);
  if (inventory.totalFiles > 0) {
    addInventoryToLines(lines, inventory);
  }

  if (summary.totalSourceFiles === 0) {
    lines.push("No recognized source files in this directory.");
  }
}

// ── Module diagnostics ────────────────────────────────────────────────

/**
 * Enrich a module brief with aggregated diagnostics for all source files.
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
    opts.lspService ??
      ({ kind: "unavailable" as const, reason: "No LSP service" } as SessionLspServiceState),
    opts.maxResults,
  );
  if (enrichmentDiags) {
    lines.push(enrichmentDiags);
  }
}

// biome-ignore lint/complexity/useMaxParams: lspService is a DI seam, not a logic parameter
async function gatherModuleDiagnostics(
  sourceFiles: string[],
  dirPath: string,
  cwd: string,
  lspService: SessionLspServiceState,
  maxResults?: number,
): Promise<string | null> {
  try {
    if (lspService.kind !== "ready") return null;

    const fileDiags: Array<{ file: string; errors: number; warnings: number }> = [];
    for (const basename of sourceFiles) {
      const fullPath = path.join(dirPath, basename);
      const relPath = path.relative(cwd, fullPath);
      try {
        const diags = await lspService.service.fileDiagnostics(relPath, 2);
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
