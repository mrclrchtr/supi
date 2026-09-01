import { type Dirent, lstatSync, readdirSync, readFileSync, realpathSync, statSync } from "node:fs";
import * as path from "node:path";
import ignore from "ignore";
import { loadLspSettings } from "./config/lsp-settings.ts";

/** Directory names that automatic LSP work never enters or selects. */
export const AUTOMATIC_LSP_EXCLUDED_DIRECTORIES: readonly string[] = Object.freeze([
  ".git",
  ".cache",
  ".pi",
  ".pnpm",
  "node_modules",
  "dist",
  "build",
  "out",
  "coverage",
  ".next",
  ".nuxt",
  ".turbo",
  "__pycache__",
]);

const BUILT_IN_EXCLUSIONS = new Set(AUTOMATIC_LSP_EXCLUDED_DIRECTORIES);

/** Automatic path rules for one Workspace LSP runtime. The rules do not change. */
export interface AutomaticLspPathPolicy {
  /** Canonical absolute workspace root used for all matching. */
  readonly workspaceRoot: string;
  /**
   * True when automatic LSP work can use the path.
   * The policy reads the path kind when the caller does not supply it.
   */
  isEligible(candidate: string, kind?: "file" | "directory"): boolean;
}

/** Create the automatic path rules for one Workspace LSP runtime. */
export function createAutomaticLspPathPolicy(
  workspaceRoot: string,
  excludePatterns: readonly string[],
): AutomaticLspPathPolicy {
  const canonicalRoot = canonicalPath(workspaceRoot);
  const configuredExclusions = createIgnoreMatcher([...excludePatterns]);
  const repositoryRules = compileRepositoryRules(canonicalRoot, configuredExclusions);
  return Object.freeze({
    workspaceRoot: canonicalRoot,
    isEligible(candidate: string, kind?: "file" | "directory"): boolean {
      const relativePath = normalizeCandidate(canonicalRoot, workspaceRoot, candidate);
      if (relativePath === null) return false;
      const candidateKind = kind ?? readCandidateKind(canonicalRoot, relativePath);
      if (!isAutomaticCandidateAllowed(workspaceRoot, relativePath, candidateKind)) return false;
      return isEligibleRelativePath(
        relativePath,
        candidateKind === "directory",
        configuredExclusions,
        repositoryRules,
      );
    },
  });
}

/**
 * Create path rules for an automatic LSP helper used outside a runtime.
 * Runtime-owned operations should pass the rules created at startup instead.
 */
export function createDefaultAutomaticLspPathPolicy(workspaceRoot: string): AutomaticLspPathPolicy {
  return createAutomaticLspPathPolicy(workspaceRoot, loadLspSettings(workspaceRoot).exclude);
}

/**
 * Walk paths allowed by the policy without visiting symbolic-link directories.
 *
 * The visitor receives only entries that the automatic LSP policy allows.
 * Return `true` from the visitor to stop the walk after that directory.
 */
export function walkAutomaticLspTree(
  policy: AutomaticLspPathPolicy,
  directory: string,
  depth: number,
  onDirectory: (directory: string, entries: readonly Dirent[]) => boolean | undefined,
): void {
  if (!policy.isEligible(directory, "directory")) return;
  walkDirectoryTree({
    directory,
    depth,
    includeEntry: (candidate, entry) =>
      policy.isEligible(candidate, entry.isDirectory() ? "directory" : "file"),
    onDirectory,
  });
}

interface DirectoryWalkOptions {
  directory: string;
  depth: number;
  includeEntry: (candidate: string, entry: Dirent) => boolean;
  onDirectory: (directory: string, entries: readonly Dirent[]) => boolean | undefined;
  beforeFilter?: (directory: string) => void;
}

function walkDirectoryTree(options: DirectoryWalkOptions): boolean {
  const { directory, depth, includeEntry, onDirectory, beforeFilter } = options;
  beforeFilter?.(directory);
  let entries: Dirent[];
  try {
    entries = [...readdirSync(directory, { withFileTypes: true })].sort((a, b) =>
      a.name.localeCompare(b.name),
    );
  } catch {
    return false;
  }

  const eligibleEntries = entries.filter((entry) =>
    includeEntry(path.join(directory, entry.name), entry),
  );
  if (onDirectory(directory, eligibleEntries) === true) return true;
  if (depth <= 0) return false;

  for (const entry of eligibleEntries) {
    if (!entry.isDirectory()) continue;
    if (
      walkDirectoryTree({
        ...options,
        directory: path.join(directory, entry.name),
        depth: depth - 1,
      })
    ) {
      return true;
    }
  }
  return false;
}

type IgnoreMatcher = ReturnType<typeof ignore>;

function createIgnoreMatcher(patterns: string | readonly string[]): IgnoreMatcher {
  return ignore({ ignorecase: false }).add(patterns);
}

interface RepositoryIgnoreRules {
  readonly base: string;
  readonly matcher: IgnoreMatcher;
}

function compileRepositoryRules(
  workspaceRoot: string,
  configuredExclusions: IgnoreMatcher,
): readonly RepositoryIgnoreRules[] {
  const rules: RepositoryIgnoreRules[] = [];

  walkDirectoryTree({
    directory: workspaceRoot,
    depth: Number.MAX_SAFE_INTEGER,
    includeEntry: (candidate, entry) => {
      if (entry.isSymbolicLink() || !entry.isDirectory()) return false;
      const relativePath = path.relative(workspaceRoot, candidate).split(path.sep).join("/");
      return isEligibleRelativePath(relativePath, true, configuredExclusions, rules);
    },
    onDirectory: () => undefined,
    beforeFilter: (directory) => {
      const relativeDirectory = path.relative(workspaceRoot, directory).split(path.sep).join("/");
      const nestedRules = readRepositoryIgnore(directory, relativeDirectory);
      if (nestedRules) rules.push(nestedRules);
    },
  });

  return Object.freeze([...rules]);
}

function readRepositoryIgnore(
  directory: string,
  relativeDirectory: string,
): RepositoryIgnoreRules | null {
  try {
    const matcher = createIgnoreMatcher(readFileSync(path.join(directory, ".gitignore"), "utf-8"));
    return Object.freeze({ base: relativeDirectory, matcher });
  } catch {
    return null;
  }
}

function isEligibleRelativePath(
  relativePath: string,
  directory: boolean,
  configuredExclusions: IgnoreMatcher,
  repositoryRules: readonly RepositoryIgnoreRules[],
): boolean {
  const segments = relativePath.split("/");
  if (
    segments.some(
      (segment, index) =>
        BUILT_IN_EXCLUSIONS.has(segment) && (directory || index < segments.length - 1),
    )
  ) {
    return false;
  }
  if (relativePath === "") return true;

  const matchPath = directory ? `${relativePath}/` : relativePath;
  if (configuredExclusions.ignores(matchPath)) return false;
  return !isRepositoryIgnored(relativePath, directory, repositoryRules);
}

function isRepositoryIgnored(
  relativePath: string,
  directory: boolean,
  repositoryRules: readonly RepositoryIgnoreRules[],
): boolean {
  let ignored = false;
  for (const rules of repositoryRules) {
    const localPath = relativeToRuleBase(rules.base, relativePath);
    if (localPath === null || localPath === "") continue;
    const result = rules.matcher.test(directory ? `${localPath}/` : localPath);
    if (result.ignored) ignored = true;
    else if (result.unignored) ignored = false;
  }
  return ignored;
}

function relativeToRuleBase(base: string, relativePath: string): string | null {
  if (base === "") return relativePath;
  if (relativePath === base) return "";
  return relativePath.startsWith(`${base}/`) ? relativePath.slice(base.length + 1) : null;
}

function readCandidateKind(canonicalRoot: string, relativePath: string): "file" | "directory" {
  try {
    return statSync(path.resolve(canonicalRoot, relativePath)).isDirectory() ? "directory" : "file";
  } catch {
    return "file";
  }
}

function isAutomaticCandidateAllowed(
  suppliedRoot: string,
  relativePath: string,
  kind: "file" | "directory",
): boolean {
  if (relativePath === "") return true;
  let current = path.resolve(suppliedRoot);
  const segments = relativePath.split("/");

  for (const [index, segment] of segments.entries()) {
    current = path.join(current, segment);
    let link: ReturnType<typeof lstatSync>;
    try {
      link = lstatSync(current);
    } catch {
      return true;
    }
    if (!link.isSymbolicLink()) continue;
    if (index < segments.length - 1) return false;

    try {
      const target = statSync(current);
      return kind === "file" && target.isFile();
    } catch {
      return false;
    }
  }

  return true;
}

function canonicalPath(candidate: string): string {
  try {
    return realpathSync(candidate);
  } catch {
    return path.resolve(candidate);
  }
}

function normalizeCandidate(
  canonicalRoot: string,
  suppliedRoot: string,
  candidate: string,
): string | null {
  const absoluteCandidate = path.isAbsolute(candidate)
    ? mapSuppliedRootToCanonical(canonicalRoot, suppliedRoot, candidate)
    : path.resolve(canonicalRoot, candidate);
  const relativePath = path.relative(canonicalRoot, absoluteCandidate);
  if (relativePath === "") return "";
  if (relativePath === ".." || relativePath.startsWith(`..${path.sep}`)) return null;
  return relativePath.split(path.sep).join("/");
}

function mapSuppliedRootToCanonical(
  canonicalRoot: string,
  suppliedRoot: string,
  candidate: string,
): string {
  const resolvedSuppliedRoot = path.resolve(suppliedRoot);
  const relativePath = path.relative(resolvedSuppliedRoot, path.resolve(candidate));
  if (relativePath === "" || (relativePath !== ".." && !relativePath.startsWith(`..${path.sep}`))) {
    return path.resolve(canonicalRoot, relativePath);
  }
  return path.resolve(candidate);
}
