// Focused brief generation — directory and file briefs.

import * as fs from "node:fs";
import * as path from "node:path";
import type { ArchitectureModel } from "./architecture.ts";
import { findModuleForPath, getDependencies, getDependents } from "./architecture.ts";
import { formatGitContext, gatherGitContext } from "./git-context.ts";
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
    formatNonModuleDir({ model, mod, resolvedPath, originalPath, lines });
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
      startHere: startHere.slice(0, 3),
      publicSurfaces: publicSurfaces.slice(0, 5),
      dependencySummary: mod ? { moduleCount: 1, edgeCount: mod.internalDeps.length } : null,
      omittedCount: 0,
      nextQueries,
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
}

function formatNonModuleDir(ctx: NonModuleDirContext): void {
  const { model, mod, resolvedPath, originalPath, lines } = ctx;
  const relPath = path.relative(model.root, resolvedPath);
  lines.push(`# Directory: ${relPath || originalPath}`);
  lines.push("");

  if (mod) {
    const shortName = mod.name.replace(/^@[^/]+\//, "");
    lines.push(`_Inside module: ${shortName} (\`${mod.relativePath}\`)_`);
    lines.push("");
  }

  const files = listSourceFiles(resolvedPath);
  if (files.length > 0) {
    const shown = files.slice(0, 10);
    lines.push("## Source Files");
    for (const f of shown) {
      lines.push(`- \`${f}\``);
    }
    if (files.length > 10) {
      lines.push(`- _+${files.length - 10} more files_`);
    }
  } else {
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
