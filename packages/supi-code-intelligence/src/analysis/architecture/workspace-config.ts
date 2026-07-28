/** Supported workspace-configuration parsing and pattern validation. */

import * as fs from "node:fs";
import * as path from "node:path";
import { parseDocument } from "yaml";
import { errorMessage, isRecord, type PackageJsonRead, readPackageJson } from "./manifest.ts";
import type { WorkspaceTopologySource } from "./model.ts";

export const PNPM_WORKSPACE = "pnpm-workspace.yaml";

/** Parsed supported workspace membership declaration. */
export type WorkspaceDeclaration =
  | {
      readonly kind: "workspace";
      readonly source: WorkspaceTopologySource;
      readonly patterns: string[];
    }
  | { readonly kind: "single-package" }
  | { readonly kind: "unavailable"; readonly reason: string };

type PatternValidation =
  | { readonly kind: "complete"; readonly patterns: string[] }
  | { readonly kind: "unavailable"; readonly reason: string };

type ParsedPattern =
  | {
      readonly kind: "complete";
      readonly pattern: { readonly value: string; readonly negative: boolean };
    }
  | { readonly kind: "unavailable"; readonly reason: string };

/** Prefer an enclosing workspace declaration, then the nearest package manifest. */
export function findArchitectureRoot(cwd: string): string {
  const directories = ancestors(path.resolve(cwd));
  const pnpmRoot = directories.find((directory) =>
    fs.existsSync(path.join(directory, PNPM_WORKSPACE)),
  );
  if (pnpmRoot) return pnpmRoot;

  const packageWorkspaceRoot = directories.find((directory) => {
    const manifest = readPackageJson(directory);
    return manifest.kind === "complete" && Object.hasOwn(manifest.value, "workspaces");
  });
  if (packageWorkspaceRoot) return packageWorkspaceRoot;

  return (
    directories.find((directory) => fs.existsSync(path.join(directory, "package.json"))) ?? cwd
  );
}

/** Read only the supported package.json/pnpm workspace membership declarations. */
export function readWorkspaceDeclaration(
  root: string,
  rootRead: PackageJsonRead,
): WorkspaceDeclaration {
  const pnpmPath = path.join(root, PNPM_WORKSPACE);
  if (fs.existsSync(pnpmPath)) return readPnpmWorkspaceDeclaration(pnpmPath);

  if (rootRead.kind !== "complete") {
    return {
      kind: "unavailable",
      reason:
        "No supported workspace configuration is available because the root package manifest could not be read.",
    };
  }

  if (!Object.hasOwn(rootRead.value, "workspaces")) return { kind: "single-package" };
  const workspaces = rootRead.value.workspaces;
  const patterns = Array.isArray(workspaces)
    ? workspaces
    : isRecord(workspaces) && Array.isArray(workspaces.packages)
      ? workspaces.packages
      : null;
  if (!patterns) {
    return {
      kind: "unavailable",
      reason:
        "package.json#workspaces must be a string array or an object with a string packages array.",
    };
  }

  const validated = validateWorkspacePatterns(patterns);
  if (validated.kind === "unavailable") return validated;
  if (validated.patterns.length === 0) return { kind: "single-package" };
  return {
    kind: "workspace",
    source: {
      path: "package.json",
      field: Array.isArray(workspaces) ? "workspaces" : "workspaces.packages",
    },
    patterns: validated.patterns,
  };
}

function readPnpmWorkspaceDeclaration(workspacePath: string): WorkspaceDeclaration {
  let raw: string;
  try {
    raw = fs.readFileSync(workspacePath, "utf-8");
  } catch (error) {
    return {
      kind: "unavailable",
      reason: `Could not read ${PNPM_WORKSPACE}: ${errorMessage(error)}`,
    };
  }

  let value: unknown;
  try {
    const document = parseDocument(raw);
    if (document.errors.length > 0) {
      return {
        kind: "unavailable",
        reason: `Could not parse ${PNPM_WORKSPACE}: ${document.errors[0]?.message ?? "invalid YAML"}`,
      };
    }
    value = document.toJS();
  } catch (error) {
    return {
      kind: "unavailable",
      reason: `Could not parse ${PNPM_WORKSPACE}: ${errorMessage(error)}`,
    };
  }

  if (!isRecord(value)) {
    return { kind: "unavailable", reason: `${PNPM_WORKSPACE} must contain a YAML mapping.` };
  }
  if (!Object.hasOwn(value, "packages")) return { kind: "single-package" };
  if (!Array.isArray(value.packages)) {
    return { kind: "unavailable", reason: `${PNPM_WORKSPACE}#packages must be a string array.` };
  }

  const validated = validateWorkspacePatterns(value.packages);
  if (validated.kind === "unavailable") return validated;
  if (validated.patterns.length === 0) return { kind: "single-package" };
  return {
    kind: "workspace",
    source: { path: PNPM_WORKSPACE, field: "packages" },
    patterns: validated.patterns,
  };
}

function validateWorkspacePatterns(values: unknown[]): PatternValidation {
  const parsed = values.map(parseWorkspacePattern);
  const invalid = parsed.find(
    (entry): entry is Extract<PatternValidation, { kind: "unavailable" }> =>
      entry.kind === "unavailable",
  );
  if (invalid) return invalid;

  const patterns = parsed
    .filter(
      (entry): entry is Extract<ParsedPattern, { kind: "complete" }> => entry.kind === "complete",
    )
    .map((entry) => entry.pattern);
  if (patterns.length > 0 && patterns.every((pattern) => pattern.negative)) {
    return {
      kind: "unavailable",
      reason:
        "Workspace configuration contains only exclusion patterns and cannot establish package membership.",
    };
  }
  if (reincludesAfterExclusion(patterns)) {
    return {
      kind: "unavailable",
      reason:
        "Workspace patterns that re-include a path after an exclusion are unsupported; module discovery is unavailable rather than approximated.",
    };
  }
  return { kind: "complete", patterns: patterns.map(({ value }) => value) };
}

function parseWorkspacePattern(value: unknown): ParsedPattern {
  if (typeof value !== "string" || value.trim() !== value || value.length === 0) {
    return {
      kind: "unavailable",
      reason: "Workspace patterns must be non-empty strings without surrounding whitespace.",
    };
  }

  const negative = value.startsWith("!");
  const normalized = normalizeWorkspacePattern(negative ? value.slice(1) : value);
  if (!normalized) {
    return {
      kind: "unavailable",
      reason: `Unsupported workspace pattern: \`${value}\`. Supported patterns use literal path segments, \`*\`, \`**\`, and an optional leading \`!\`.`,
    };
  }
  return {
    kind: "complete",
    pattern: { value: `${negative ? "!" : ""}${normalized}`, negative },
  };
}

function reincludesAfterExclusion(patterns: readonly { readonly negative: boolean }[]): boolean {
  let sawExclusion = false;
  for (const pattern of patterns) {
    if (!pattern.negative && sawExclusion) return true;
    if (pattern.negative) sawExclusion = true;
  }
  return false;
}

/** Normalize only path spelling; matching itself remains owned by Node's native glob. */
function normalizeWorkspacePattern(pattern: string): string | null {
  const withoutDotPrefix = pattern.replace(/^\.\//, "").replace(/\/$/, "");
  if (!withoutDotPrefix || path.isAbsolute(withoutDotPrefix) || withoutDotPrefix.includes("\\")) {
    return null;
  }
  if (withoutDotPrefix.split("/").some((segment) => segment === ".." || segment.length === 0)) {
    return null;
  }
  if (
    ["?", "[", "]", "{", "}", "(", ")", "!"].some((token) => withoutDotPrefix.includes(token)) ||
    withoutDotPrefix.includes("***")
  ) {
    return null;
  }
  return withoutDotPrefix;
}

function ancestors(start: string): string[] {
  const directories: string[] = [];
  let current = start;
  while (true) {
    directories.push(current);
    const parent = path.dirname(current);
    if (parent === current) return directories;
    current = parent;
  }
}
