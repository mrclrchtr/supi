// Typed overview data builder from directly observed package-manifest facts.

import * as fs from "node:fs";
import * as path from "node:path";
import { detectGrammar } from "@mrclrchtr/supi-tree-sitter/api";
import type {
  ArchitectureModel,
  ManifestField,
  ModuleInfo,
} from "../../analysis/architecture/model.ts";
import type { OverviewData, OverviewModule } from "./types.ts";

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
 * Build structured overview data from the same factual package collector used
 * by on-demand Orientation. No markdown rendering happens here.
 */
export function buildOverviewData(model: ArchitectureModel): OverviewData | null {
  if (model.modules.length === 0) return null;

  const sorted = [...model.modules].sort((left, right) =>
    left.relativePath.localeCompare(right.relativePath),
  );
  const modules = sorted.map((module) => overviewModule(module, model));
  const detectedLanguages = detectModuleLanguages(sorted);

  return {
    projectName: model.name,
    projectDescription: model.description,
    modules,
    detectedLanguages: detectedLanguages.length > 0 ? detectedLanguages : null,
  };
}

function overviewModule(module: ModuleInfo, model: ArchitectureModel): OverviewModule {
  const name = module.name ?? module.relativePath;
  return {
    name,
    shortName: module.name?.replace(/^@[^/]+\//, "") ?? module.relativePath,
    description: module.description,
    declaredDependencies: model.edges
      .filter((edge) => edge.from === module.name)
      .map((edge) => edge.to),
    declaredEntrypoints: declaredEntrypoints(module.fields),
  };
}

/** Preserve field labels rather than selecting one inferred package entrypoint. */
function declaredEntrypoints(fields: readonly ManifestField[]): string[] {
  return fields.flatMap(declaredEntrypointsForField);
}

function declaredEntrypointsForField(field: ManifestField): string[] {
  if (field.field === "pi.extensions") {
    return stringValues(field.value).map((value) => `pi.extensions: ${value}`);
  }
  if (field.field === "main" || field.field === "module") {
    return typeof field.value === "string" ? [`${field.field}: ${field.value}`] : [];
  }
  if (field.field !== "exports") return [];
  if (typeof field.value === "string") return [`exports: ${field.value}`];
  return isRecord(field.value) && typeof field.value["."] === "string"
    ? [`exports["."]: ${field.value["."]}`]
    : [];
}

function stringValues(value: unknown): string[] {
  if (typeof value === "string") return [value];
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Detect languages present in the first two levels of each module directory.
 *
 * Uses Tree-sitter's extension-to-grammar mapping for conservative,
 * documented detection. Returns short language tags sorted alphabetically.
 */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: language detection with file-system scanning naturally has many branches
function detectModuleLanguages(modules: readonly { root: string }[]): string[] {
  const detected = new Set<string>();

  for (const mod of modules) {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(mod.root, { withFileTypes: true });
    } catch {
      continue;
    }

    // Scan top-level files first.
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      scanFileForLanguage(entry.name, detected);
    }

    // Scan one level deeper for nested source directories (e.g. src/).
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith(".") || entry.name === "node_modules")
        continue;
      try {
        const subEntries = fs.readdirSync(path.join(mod.root, entry.name), {
          withFileTypes: true,
        });
        for (const subEntry of subEntries) {
          if (!subEntry.isFile()) continue;
          scanFileForLanguage(subEntry.name, detected);
        }
      } catch {
        // Skip unreadable subdirectories.
      }
    }
  }

  return [...detected].sort();
}

/** Use the structural provider's published grammar mapping for overview language tags. */
function scanFileForLanguage(fileName: string, detected: Set<string>): void {
  const grammar = detectGrammar(fileName);
  const tag = grammar ? GRAMMAR_LANGUAGE_TAGS[grammar] : null;
  if (tag) detected.add(tag);
}
