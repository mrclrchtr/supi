// Typed overview data builder from ArchitectureModel.

import * as fs from "node:fs";
import * as path from "node:path";
import { getSupportedExtension } from "@mrclrchtr/supi-tree-sitter/api";
import type { ArchitectureModel } from "../../analysis/architecture/model.ts";
import type { OverviewData, OverviewModule } from "./types.ts";

/** Maximum number of modules shown in the overview. */
const MAX_MODULES = 8;
/** Maximum characters per module description before truncation. */
const MAX_DESCRIPTION_LENGTH = 60;

/** Grammar ID to short language tag for the overview. */
const GRAMMAR_LANGUAGE_TAGS: Record<string, string> = {
  javascript: "js",
  typescript: "ts",
  tsx: "tsx",
  python: "py",
  rust: "rs",
  go: "go",
  c: "c",
  cpp: "cpp",
  java: "java",
  kotlin: "kt",
  ruby: "rb",
  bash: "sh",
  html: "html",
  r: "r",
  sql: "sql",
};

/**
 * Build structured overview data from an architecture model.
 * No markdown rendering — callers pass the result to a presentation renderer.
 */
export function buildOverviewData(model: ArchitectureModel): OverviewData | null {
  if (model.modules.length === 0) return null;

  const dependedOn = new Set(model.edges.map((e) => e.to));

  // Sort by topological order: leaf modules first (most actionable).
  const sorted = topologicalModules(model);

  const modules: OverviewModule[] = sorted.slice(0, MAX_MODULES).map((mod) => ({
    name: mod.name,
    shortName: mod.name.replace(/^@[^/]+\//, ""),
    description: truncateDescription(mod.description),
    isLeaf: !dependedOn.has(mod.name),
    internalDeps: mod.internalDeps,
    entrypoints: mod.entrypoints,
  }));

  const omittedModuleCount = Math.max(0, model.modules.length - MAX_MODULES);

  const detectedLanguages = detectModuleLanguages(sorted.slice(0, MAX_MODULES));

  return {
    projectName: model.name,
    projectDescription: model.description,
    modules,
    omittedModuleCount,
    detectedLanguages: detectedLanguages.length > 0 ? detectedLanguages : null,
  };
}

/**
 * Sort modules by topological (leaf-to-root) priority.
 *
 * Modules with no internal dependents (leafs) come first because they are
 * the most actionable entry points. Within the same tier, sort by name.
 */
function topologicalModules(model: ArchitectureModel): typeof model.modules {
  const dependedOn = new Set(model.edges.map((e) => e.to));
  const leaves = model.modules.filter((m) => !dependedOn.has(m.name));
  const nonLeaves = model.modules.filter((m) => dependedOn.has(m.name));
  const byName = (a: (typeof model.modules)[0], b: (typeof model.modules)[0]) =>
    a.name.localeCompare(b.name);
  return [...leaves.sort(byName), ...nonLeaves.sort(byName)];
}

/** Truncate a description to the maximum length, adding ellipsis if needed. */
function truncateDescription(description: string | null): string | null {
  if (!description) return null;
  if (description.length <= MAX_DESCRIPTION_LENGTH) return description;
  return `${description.slice(0, MAX_DESCRIPTION_LENGTH - 1)}…`;
}

/**
 * Detect languages present in the first level of each module directory.
 *
 * Uses Tree-sitter's extension-to-grammar mapping for conservative,
 * documented detection. Returns short language tags sorted alphabetically.
 */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: language detection with file-system scanning naturally has many branches
function detectModuleLanguages(modules: readonly { root: string }[]): string[] {
  const detected = new Set<string>();
  const scanDepth = 1;

  for (const mod of modules) {
    try {
      const entries = fs.readdirSync(mod.root, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isFile()) continue;
        const supportedExt = getSupportedExtension(entry.name);
        if (!supportedExt) continue;
        // Map extension to grammar, then grammar to language tag.
        // We use getSupportedExtension which returns the extension with dot.
        // The grammar is detected from the extension.
        const grammar = detectGrammarForExtension(supportedExt);
        const tag = grammar ? GRAMMAR_LANGUAGE_TAGS[grammar] : null;
        if (tag) detected.add(tag);
      }
    } catch {
      // Directory may not be readable — skip.
    }

    if (detected.size > 0) {
      // Recurse one level deeper for nested source directories.
      if (scanDepth > 0) {
        try {
          const entries = fs.readdirSync(mod.root, { withFileTypes: true });
          for (const entry of entries) {
            if (!entry.isDirectory() || entry.name.startsWith(".") || entry.name === "node_modules")
              continue;
            try {
              const subEntries = fs.readdirSync(path.join(mod.root, entry.name), {
                withFileTypes: true,
              });
              for (const subEntry of subEntries) {
                if (!subEntry.isFile()) continue;
                const supportedExt = getSupportedExtension(subEntry.name);
                if (!supportedExt) continue;
                const grammar = detectGrammarForExtension(supportedExt);
                const tag = grammar ? GRAMMAR_LANGUAGE_TAGS[grammar] : null;
                if (tag) detected.add(tag);
              }
            } catch {
              // Skip unreadable subdirectories.
            }
          }
        } catch {
          // Skip.
        }
      }
    }
  }

  return [...detected].sort();
}

/** Map a supported extension (with leading dot) to a grammar ID. */
function detectGrammarForExtension(ext: string): string | null {
  const grammarMap: Record<string, string> = {
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
  return grammarMap[ext] ?? null;
}
