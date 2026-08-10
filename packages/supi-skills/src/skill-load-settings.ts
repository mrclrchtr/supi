import { homedir } from "node:os";
import { basename, isAbsolute, join, posix, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  CONFIG_DIR_NAME,
  type PackageSource,
  type ResolvedResource,
  type SettingsManager,
} from "@earendil-works/pi-coding-agent";
import type { SettingsScope } from "@mrclrchtr/supi-core/settings";

export type SkillLoadOverride = "load" | "unload" | "inherit";

type PackageConfig = Exclude<PackageSource, string>;

interface SkillLoadContext {
  settingsManager: SettingsManager;
  scope: SettingsScope;
  cwd: string;
  agentDir: string;
}

const FILTER_PREFIXES = new Set(["!", "+", "-"]);
const PACKAGE_FILTER_KEYS = ["extensions", "skills", "prompts", "themes"] as const;

function normalizeExactTarget(target: string): string {
  const normalized = target.replaceAll("\\", "/");
  return normalized.startsWith("./") ? normalized.slice(2) : normalized;
}

function stripFilterPrefix(entry: string): string {
  const target = FILTER_PREFIXES.has(entry[0] ?? "") ? entry.slice(1) : entry;
  return normalizeExactTarget(target);
}

function exactTargets(paths: string[]): Set<string> {
  const targets = new Set(paths.map(normalizeExactTarget));
  for (const path of paths) {
    if (basename(path) === "SKILL.md") targets.add(posix.dirname(normalizeExactTarget(path)));
  }
  return targets;
}

function isExactOverride(entry: string): boolean {
  return entry.startsWith("+") || entry.startsWith("-");
}

function removeExactOverrides(entries: string[], targets: ReadonlySet<string>): string[] {
  return entries.filter(
    (entry) => !(isExactOverride(entry) && targets.has(stripFilterPrefix(entry))),
  );
}

function sourceScope(resource: ResolvedResource): SettingsScope {
  return resource.metadata.scope === "project" ? "project" : "global";
}

function scopeBaseDir(scope: SettingsScope, cwd: string, agentDir: string): string {
  return scope === "project" ? join(cwd, CONFIG_DIR_NAME) : agentDir;
}

function resourcePattern(
  resource: ResolvedResource,
  scope: SettingsScope,
  cwd: string,
  agentDir: string,
): string {
  if (scope !== sourceScope(resource)) return resource.path;
  const baseDir = resource.metadata.baseDir ?? scopeBaseDir(sourceScope(resource), cwd, agentDir);
  return relative(baseDir, resource.path);
}

function topLevelTargets(
  resource: ResolvedResource,
  scope: SettingsScope,
  cwd: string,
  agentDir: string,
): Set<string> {
  const paths = [
    resourcePattern(resource, scope, cwd, agentDir),
    resource.path,
    relative(scopeBaseDir(scope, cwd, agentDir), resource.path),
  ];
  if (resource.metadata.baseDir) paths.push(relative(resource.metadata.baseDir, resource.path));
  return exactTargets(paths);
}

/**
 * Replace only SuPi-managed exact overrides for one top-level resource.
 * Broad patterns stay unchanged; inherited resources also receive a plain
 * support path because PI applies project filters only to project resources.
 */
function updateTopLevelEntries(
  entries: string[],
  resource: ResolvedResource,
  state: SkillLoadOverride,
  context: SkillLoadContext,
): string[] {
  const { scope, cwd, agentDir } = context;
  const pattern = resourcePattern(resource, scope, cwd, agentDir);
  const targets = topLevelTargets(resource, scope, cwd, agentDir);
  const inherited = scope === "project" && sourceScope(resource) === "global";
  const hadOverride = entries.some(
    (entry) => isExactOverride(entry) && targets.has(stripFilterPrefix(entry)),
  );
  const updated = removeExactOverrides(entries, targets);

  if (state === "inherit") {
    return inherited && hadOverride
      ? updated.filter((entry) => normalizeExactTarget(entry) !== normalizeExactTarget(pattern))
      : updated;
  }
  if (inherited && !updated.includes(pattern)) updated.push(pattern);
  updated.push(`${state === "load" ? "+" : "-"}${pattern}`);
  return updated;
}

function isLocalPackageSource(source: string): boolean {
  const value = source.trim();
  return !["npm:", "git:", "github:", "http:", "https:", "ssh:"].some((prefix) =>
    value.startsWith(prefix),
  );
}

function resolvePackageSource(source: string, baseDir: string): string {
  const value = source.trim();
  if (value.startsWith("file:")) return fileURLToPath(value);
  if (value === "~") return homedir();
  if (value.startsWith("~/") || value.startsWith("~\\")) {
    return resolve(homedir(), value.slice(2));
  }
  return isAbsolute(value) ? resolve(value) : resolve(baseDir, value);
}

/** Match package identity with the scope-relative local-path rules used by PI. */
function packageSourcesMatch(options: {
  left: string;
  leftScope: SettingsScope;
  right: string;
  rightScope: SettingsScope;
  cwd: string;
  agentDir: string;
}): boolean {
  const { left, leftScope, right, rightScope, cwd, agentDir } = options;
  const leftIsLocal = isLocalPackageSource(left);
  const rightIsLocal = isLocalPackageSource(right);
  if (!leftIsLocal || !rightIsLocal) return !leftIsLocal && !rightIsLocal && left === right;
  return (
    resolvePackageSource(left, scopeBaseDir(leftScope, cwd, agentDir)) ===
    resolvePackageSource(right, scopeBaseDir(rightScope, cwd, agentDir))
  );
}

function packagePattern(resource: ResolvedResource): string {
  return relative(resource.metadata.baseDir ?? resource.path, resource.path);
}

function packageTargets(resource: ResolvedResource): Set<string> {
  return exactTargets([packagePattern(resource), resource.path]);
}

function createProjectPackageOverride(
  resource: ResolvedResource,
  cwd: string,
  agentDir: string,
): PackageConfig {
  const source = resource.metadata.source;
  if (!isLocalPackageSource(source)) return { source, autoload: false };
  const absolute = resolvePackageSource(source, scopeBaseDir(sourceScope(resource), cwd, agentDir));
  return {
    source: relative(scopeBaseDir("project", cwd, agentDir), absolute) || ".",
    autoload: false,
  };
}

function findPackageIndex(
  packages: PackageSource[],
  resource: ResolvedResource,
  context: SkillLoadContext,
): number {
  return packages.findIndex((entry) =>
    packageSourcesMatch({
      left: resource.metadata.source,
      leftScope: sourceScope(resource),
      right: typeof entry === "string" ? entry : entry.source,
      rightScope: context.scope,
      cwd: context.cwd,
      agentDir: context.agentDir,
    }),
  );
}

function cleanPackageEntry(packages: PackageSource[], index: number, scope: SettingsScope): void {
  const entry = packages[index];
  if (!entry || typeof entry === "string") return;
  const hasFilters = PACKAGE_FILTER_KEYS.some((key) => entry[key] !== undefined);
  if (hasFilters) return;
  if (scope === "project" && entry.autoload === false) packages.splice(index, 1);
  else if (entry.autoload !== false) packages[index] = entry.source;
}

/**
 * Apply one exact package-skill delta while preserving broad filters and
 * explicit deny-all semantics. Project autoload:false entries remain deltas.
 */
function updatePackageEntries(
  packages: PackageSource[],
  resource: ResolvedResource,
  state: SkillLoadOverride,
  context: SkillLoadContext,
): void {
  let index = findPackageIndex(packages, resource, context);
  if (index === -1) {
    if (state === "inherit") return;
    packages.push(createProjectPackageOverride(resource, context.cwd, context.agentDir));
    index = packages.length - 1;
  }

  const current = packages[index];
  if (!current) return;
  const config: PackageConfig = typeof current === "string" ? { source: current } : { ...current };
  packages[index] = config;
  const pattern = packagePattern(resource);
  const targets = packageTargets(resource);
  const explicitDenyAll =
    config.autoload !== false && config.skills !== undefined && config.skills.length === 0;
  const entries = removeExactOverrides([...(config.skills ?? [])], targets);
  if (state !== "inherit") {
    if (explicitDenyAll) entries.push("!**");
    entries.push(`${state === "load" ? "+" : "-"}${pattern}`);
  }
  config.skills = entries.length > 0 ? entries : explicitDenyAll ? [] : undefined;
  cleanPackageEntry(packages, index, context.scope);
}

/** Update only exact PI skill filters and preserve broad user patterns. */
export function updateSkillLoadOverrides(
  input: SkillLoadContext & { resources: ResolvedResource[]; state: SkillLoadOverride },
): void {
  const { settingsManager, resources, scope, state } = input;
  const relevant = resources.filter(
    (resource) => scope === "project" || sourceScope(resource) === "global",
  );
  const settings =
    scope === "project"
      ? settingsManager.getProjectSettings()
      : settingsManager.getGlobalSettings();

  const topLevelResources = relevant.filter((item) => item.metadata.origin === "top-level");
  if (topLevelResources.length > 0) {
    let skillPaths = [...(settings.skills ?? [])];
    for (const resource of topLevelResources) {
      skillPaths = updateTopLevelEntries(skillPaths, resource, state, input);
    }
    if (scope === "project") settingsManager.setProjectSkillPaths(skillPaths);
    else settingsManager.setSkillPaths(skillPaths);
  }

  const packageResources = relevant.filter((item) => item.metadata.origin === "package");
  if (packageResources.length > 0) {
    const packages = [...(settings.packages ?? [])];
    for (const resource of packageResources) {
      updatePackageEntries(packages, resource, state, input);
    }
    if (scope === "project") settingsManager.setProjectPackages(packages);
    else settingsManager.setPackages(packages);
  }
}

/** Return true when the selected scope has an exact load override for any source. */
export function hasExactSkillLoadOverride(
  input: SkillLoadContext & { resources: ResolvedResource[] },
): boolean {
  const { settingsManager, resources, scope, cwd, agentDir } = input;
  const settings =
    scope === "project"
      ? settingsManager.getProjectSettings()
      : settingsManager.getGlobalSettings();
  const skillEntries = settings.skills ?? [];

  for (const resource of resources.filter((item) => item.metadata.origin === "top-level")) {
    const targets = topLevelTargets(resource, scope, cwd, agentDir);
    if (
      skillEntries.some((entry) => isExactOverride(entry) && targets.has(stripFilterPrefix(entry)))
    ) {
      return true;
    }
  }

  const packages = settings.packages ?? [];
  for (const resource of resources.filter((item) => item.metadata.origin === "package")) {
    const index = findPackageIndex(packages, resource, input);
    const entry = index >= 0 ? packages[index] : undefined;
    if (!entry || typeof entry === "string") continue;
    const targets = packageTargets(resource);
    if (
      (entry.skills ?? []).some(
        (filter) => isExactOverride(filter) && targets.has(stripFilterPrefix(filter)),
      )
    ) {
      return true;
    }
  }
  return false;
}
