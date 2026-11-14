/** Explicit workspace-membership resolution. Directory adjacency is never used. */

import * as path from "node:path";
import type { WorkspaceConfig } from "./metadata-types.ts";
import { issue } from "./metadata-utils.ts";
import { normalizeRelativePath } from "./paths.ts";
import type { MetadataIssue, ProjectDeclaration, ProjectMembership } from "./types.ts";

interface CompiledPattern {
  readonly value: string;
  readonly negative: boolean;
  readonly glob: string;
}

interface CompiledConfig {
  readonly config: WorkspaceConfig;
  readonly patterns: readonly CompiledPattern[];
  readonly excludes: readonly CompiledPattern[];
}

/** Attach explicit memberships to projects without inferring from directory layout. */
export function applyMemberships(
  projects: readonly ProjectDeclaration[],
  configs: readonly WorkspaceConfig[],
  issues: MetadataIssue[],
): ProjectDeclaration[] {
  const compiled = configs.map((config) => compileConfig(config, issues));
  const exactMatches = new Map<string, Set<string>>();
  const result = projects.map((project) => ({
    ...project,
    memberships: membershipsForProject(project, compiled, exactMatches),
  }));
  reportUnmatchedExactPaths(compiled, exactMatches, issues);
  return result;
}

function compileConfig(config: WorkspaceConfig, issues: MetadataIssue[]): CompiledConfig {
  return {
    config,
    patterns: compilePatterns(config, config.patterns, issues),
    excludes: compilePatterns(config, config.excludes, issues),
  };
}

function compilePatterns(
  config: WorkspaceConfig,
  values: readonly string[],
  issues: MetadataIssue[],
): CompiledPattern[] {
  const patterns: CompiledPattern[] = [];
  for (const value of values) {
    const compiled = compilePattern(config, value, issues);
    if (compiled) patterns.push(compiled);
  }
  return patterns;
}

function compilePattern(
  config: WorkspaceConfig,
  value: string,
  issues: MetadataIssue[],
): CompiledPattern | null {
  if (config.kind === "maven-modules") return compileMavenModule(config, value, issues);
  const negative = config.kind === "node-workspace" && value.startsWith("!");
  const normalized = normalizeRelativePath(negative ? value.slice(1) : value);
  if (
    normalized === null ||
    value.length === 0 ||
    (config.kind !== "go-work" &&
      (value.includes("\\") || /[?*+@!]\(/.test(value) || value.startsWith("!!")))
  ) {
    issues.push(
      issue(
        config.manifestPath,
        config.field,
        "unsupported",
        `Unsupported workspace path pattern: \`${value}\`.`,
      ),
    );
    return null;
  }
  try {
    path.matchesGlob("pattern-check", normalized);
  } catch (error) {
    issues.push(
      issue(
        config.manifestPath,
        config.field,
        "unsupported",
        `Unsupported workspace path pattern \`${value}\`: ${String(error)}`,
      ),
    );
    return null;
  }
  return { value, negative, glob: normalized };
}

/**
 * Resolve one Maven module path to an exact root-relative project directory.
 *
 * Maven module values are literal paths relative to the aggregator directory,
 * optionally naming the module's `pom.xml`. Globs are not Maven syntax.
 */
function compileMavenModule(
  config: WorkspaceConfig,
  value: string,
  issues: MetadataIssue[],
): CompiledPattern | null {
  const disclose = (kind: MetadataIssue["kind"], reason: string) => {
    issues.push(issue(config.manifestPath, config.field, kind, reason));
    return null;
  };
  if (value.includes("${")) {
    return disclose("dynamic", `Module path \`${value}\` uses property interpolation.`);
  }
  const slashed = value.replaceAll("\\", "/");
  if (slashed.startsWith("/") || /^[A-Za-z]:/.test(slashed)) {
    return disclose("unsupported", `Absolute module path \`${value}\` is not read.`);
  }
  let directory = path.posix
    .normalize(path.posix.join(config.directory, slashed))
    .replace(/\/+$/, "");
  const basename = path.posix.basename(directory);
  if (basename === "pom.xml") directory = path.posix.dirname(directory);
  else if (basename.endsWith(".xml")) {
    return disclose("unsupported", `Module path \`${value}\` names a non-pom.xml file.`);
  }
  if (directory === config.directory || (directory === "" && config.directory === ".")) {
    return disclose("unsupported", `Module path \`${value}\` refers to the aggregator itself.`);
  }
  if (directory === ".." || directory.startsWith("../")) {
    return disclose("unresolved", `Module path \`${value}\` points outside the observation root.`);
  }
  return { value, negative: false, glob: directory === "" ? "." : directory };
}

function membershipsForProject(
  project: ProjectDeclaration,
  configs: readonly CompiledConfig[],
  exactMatches: Map<string, Set<string>>,
): ProjectMembership[] {
  const memberships: ProjectMembership[] = [];
  for (const compiled of configs) {
    if (!supportsKind(compiled.config.kind, project.kind)) continue;
    const membership = membershipFor(compiled, project, exactMatches);
    if (membership) memberships.push(membership);
  }
  return dedupeMemberships(memberships);
}

function membershipFor(
  compiled: CompiledConfig,
  project: ProjectDeclaration,
  exactMatches: Map<string, Set<string>>,
): ProjectMembership | null {
  if (compiled.config.kind === "maven-modules") {
    return matchExactPath(compiled, project, exactMatches);
  }
  const relative = relativeDirectory(compiled.config.directory, project.directory);
  if (relative === null) return null;
  if (compiled.config.kind === "go-work") return matchGoUse(compiled, project, exactMatches);
  if (isExcluded(compiled, relative)) return null;
  const matched = lastMatchingPattern(compiled.patterns, relative);
  if (!matched) return null;
  return {
    kind: compiled.config.kind,
    manifestPath: compiled.config.manifestPath,
    field: compiled.config.field,
    value: matched.value,
  };
}

function supportsKind(
  workspaceKind: WorkspaceConfig["kind"],
  projectKind: ProjectDeclaration["kind"],
): boolean {
  if (workspaceKind === "node-workspace") return projectKind === "node-package";
  if (workspaceKind === "cargo-workspace") return projectKind === "rust-package";
  if (workspaceKind === "maven-modules") return projectKind === "maven-project";
  return projectKind === "go-module";
}

function relativeDirectory(base: string, directory: string): string | null {
  const relative = path.posix.relative(base, directory);
  if (relative === "") return ".";
  if (relative === ".." || relative.startsWith("../")) return null;
  return relative;
}

function isExcluded(config: CompiledConfig, relative: string): boolean {
  return config.excludes.some((pattern) => patternMatches(pattern, relative));
}

function lastMatchingPattern(
  patterns: readonly CompiledPattern[],
  relative: string,
): CompiledPattern | null {
  let matched: CompiledPattern | null = null;
  for (const pattern of patterns) {
    if (!patternMatches(pattern, relative)) continue;
    if (pattern.negative) return null;
    matched = pattern;
  }
  return matched?.negative ? null : matched;
}

function patternMatches(pattern: CompiledPattern, relative: string): boolean {
  try {
    return path.matchesGlob(relative, pattern.glob);
  } catch {
    return false;
  }
}

/** Match a pre-resolved exact project directory, marking every spelling that resolves to it. */
function matchExactPath(
  config: CompiledConfig,
  project: ProjectDeclaration,
  matches: Map<string, Set<string>>,
): ProjectMembership | null {
  const matched = config.patterns.filter((pattern) => pattern.glob === project.directory);
  for (const pattern of matched) markExactMatch(config.config.manifestPath, pattern.value, matches);
  const first = matched[0];
  if (!first) return null;
  return {
    kind: config.config.kind,
    manifestPath: config.config.manifestPath,
    field: config.config.field,
    value: first.value,
  };
}

function matchGoUse(
  config: CompiledConfig,
  project: ProjectDeclaration,
  exactMatches: Map<string, Set<string>>,
): ProjectMembership | null {
  for (const pattern of config.patterns) {
    const usePath = normalizeRelativePath(path.posix.join(config.config.directory, pattern.glob));
    if (usePath !== project.directory) continue;
    markExactMatch(config.config.manifestPath, pattern.value, exactMatches);
    return {
      kind: "go-work",
      manifestPath: config.config.manifestPath,
      field: config.config.field,
      value: pattern.value,
    };
  }
  return null;
}

function markExactMatch(
  manifestPath: string,
  value: string,
  matches: Map<string, Set<string>>,
): void {
  const values = matches.get(manifestPath) ?? new Set<string>();
  values.add(value);
  matches.set(manifestPath, values);
}

function reportUnmatchedExactPaths(
  configs: readonly CompiledConfig[],
  matches: ReadonlyMap<string, Set<string>>,
  issues: MetadataIssue[],
): void {
  for (const compiled of configs) {
    const kind = compiled.config.kind;
    if (kind !== "go-work" && kind !== "maven-modules") continue;
    const matched = matches.get(compiled.config.manifestPath) ?? new Set<string>();
    for (const pattern of compiled.patterns) {
      if (matched.has(pattern.value)) continue;
      issues.push(
        issue(
          compiled.config.manifestPath,
          compiled.config.field,
          "unresolved",
          kind === "go-work"
            ? `go.work use path \`${pattern.value}\` has no observed go.mod project.`
            : `Maven module path \`${pattern.value}\` has no observed pom.xml project.`,
        ),
      );
    }
  }
}

function dedupeMemberships(values: readonly ProjectMembership[]): ProjectMembership[] {
  const seen = new Set<string>();
  const result: ProjectMembership[] = [];
  for (const value of values) {
    const key = `${value.kind}\0${value.manifestPath}\0${value.field}\0${value.value}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(value);
  }
  return result;
}
