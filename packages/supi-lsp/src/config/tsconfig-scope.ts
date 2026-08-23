// tsconfig-aware file scope detection.
//
// Determines whether a file is within the compilation scope of its nearest
// tsconfig.json or jsconfig.json using the TypeScript compiler's own config
// parsing APIs. Used by the diagnostic filter to suppress LSP errors on files
// that TypeScript itself would not include in the project.

import * as path from "node:path";
import ts from "typescript";
import { collectExtendedProjectConfigs } from "./tsconfig-extends.ts";
import { normalizeTsconfigPath as normalizePath } from "./tsconfig-path.ts";

export { isProjectConfigFileName } from "./tsconfig-extends.ts";

interface ParsedProjectConfig {
  configPath: string;
  configDir: string;
  fileNames: Set<string>;
  explicitFiles: Set<string> | null;
  includeFilePattern: RegExp | null;
  excludePattern: RegExp | null;
  supportedExtensions: Set<string>;
  usesDefaultInclude: boolean;
}

/** Whether a file is inside the compilation scope of its nearest project config. */
export type FileScopeStatus = "included" | "excluded" | "no-config" | "out-of-tree";

/**
 * The mechanism that produced a file scope decision.
 *
 * `extension` covers unsupported file extensions (checked before any pattern).
 */
export type ScopeDecisionBasis =
  | "fileNames"
  | "explicit"
  | "include-pattern"
  | "default-include"
  | "exclude-pattern"
  | "extension";

/** An explainable tsconfig scope decision for one file. */
export interface FileScopeDecision {
  status: FileScopeStatus;
  /** Decision mechanism; null when no decision applies (no-config, out-of-tree). */
  basis: ScopeDecisionBasis | null;
  /** Absolute path of the config that decided the file, when one exists. */
  configPath: string | null;
  caseSensitiveFileNames: boolean;
}

const nearestConfigCache = new Map<string, string | null>();
const parsedConfigCache = new Map<string, ParsedProjectConfig | null>();
/** Normalized local project-config dependencies for each cached config. */
const projectConfigDependencyCache = new Map<string, Set<string>>();

const tsInternal = ts as typeof ts & {
  getFileMatcherPatterns?: (
    configDir: string,
    excludes: readonly string[] | undefined,
    includes: readonly string[] | undefined,
    useCaseSensitiveFileNames: boolean,
    currentDirectory: string,
  ) => {
    includeFilePattern?: string;
    excludePattern?: string;
  };
  getSupportedExtensions?: (
    options: ts.CompilerOptions,
    extraFileExtensions?: unknown,
  ) => ReadonlyArray<ReadonlyArray<string>>;
};

/**
 * Check whether a file is excluded by its nearest tsconfig.json or jsconfig.json.
 *
 * @param filePath - Project-relative file path (e.g., "packages/foo/__tests__/x.test.ts")
 * @param cwd - Absolute project root directory
 * @returns `true` if the file is excluded from compilation scope
 */
export function isFileExcludedByTsconfig(filePath: string, cwd: string): boolean {
  // Legacy filter semantics: only a resolved "excluded" decision filters a
  // file. Out-of-tree and no-config files stay unfiltered; the decision API
  // still reports those statuses honestly for consumers that want them.
  return getFileScopeDecision(filePath, cwd).status === "excluded";
}

/**
 * Compute the explainable tsconfig scope decision for one file.
 *
 * The decision carries the mechanism that produced it (the scope decision
 * basis) so consumers can report why a file is inside or outside the nearest
 * project config without re-deriving the scope logic.
 */
export function getFileScopeDecision(filePath: string, cwd: string): FileScopeDecision {
  const caseSensitiveFileNames = ts.sys.useCaseSensitiveFileNames;
  const absolutePath = path.resolve(cwd, filePath);
  if (isOutOfTree(cwd, absolutePath)) {
    return {
      status: "out-of-tree",
      basis: null,
      configPath: null,
      caseSensitiveFileNames,
    };
  }

  const configPath = findNearestProjectConfig(path.dirname(absolutePath), cwd);
  if (!configPath) {
    return {
      status: "no-config",
      basis: null,
      configPath: null,
      caseSensitiveFileNames,
    };
  }

  const parsed = parseProjectConfig(configPath);
  if (!parsed) {
    return {
      status: "no-config",
      basis: null,
      configPath,
      caseSensitiveFileNames,
    };
  }

  const decision = decideFileScope(parsed, absolutePath);
  return {
    status: decision.included ? "included" : "excluded",
    basis: decision.basis,
    configPath: parsed.configPath,
    caseSensitiveFileNames,
  };
}

function isOutOfTree(cwd: string, absolutePath: string): boolean {
  const relative = path.relative(path.resolve(cwd), absolutePath);
  return relative.startsWith(`..${path.sep}`) || relative === "..";
}

/**
 * Find the nearest tsconfig.json or jsconfig.json walking upward from `startDir`,
 * stopping at `rootDir`.
 */
function findNearestProjectConfig(startDir: string, rootDir: string): string | null {
  let dir = path.resolve(startDir);
  const resolvedRoot = path.resolve(rootDir);

  while (true) {
    const cacheKey = `${normalizePath(dir)}::${normalizePath(resolvedRoot)}`;
    const cached = nearestConfigCache.get(cacheKey);
    if (cached !== undefined) return cached;

    const configPath = getLocalProjectConfig(dir);
    if (configPath) {
      const resolvedConfigPath = path.resolve(configPath);
      nearestConfigCache.set(cacheKey, resolvedConfigPath);
      return resolvedConfigPath;
    }

    if (path.relative(resolvedRoot, dir).startsWith("..") || dir === resolvedRoot) {
      nearestConfigCache.set(cacheKey, null);
      return null;
    }

    const parent = path.dirname(dir);
    if (parent === dir) {
      nearestConfigCache.set(cacheKey, null);
      return null;
    }
    dir = parent;
  }
}

function getLocalProjectConfig(directory: string): string | null {
  const tsconfigPath = path.join(directory, "tsconfig.json");
  if (ts.sys.fileExists(tsconfigPath)) return tsconfigPath;

  const jsconfigPath = path.join(directory, "jsconfig.json");
  if (ts.sys.fileExists(jsconfigPath)) return jsconfigPath;

  return null;
}

function parseProjectConfig(configPath: string): ParsedProjectConfig | null {
  const normalizedConfigPath = normalizePath(configPath);
  const cached = parsedConfigCache.get(normalizedConfigPath);
  if (cached !== undefined) return cached;

  projectConfigDependencyCache.set(normalizedConfigPath, collectExtendedProjectConfigs(configPath));
  const parsed = ts.getParsedCommandLineOfConfigFile(configPath, {}, createParseConfigHost());
  if (!parsed) {
    parsedConfigCache.set(normalizedConfigPath, null);
    return null;
  }

  const configDir = path.dirname(path.resolve(configPath));
  const explicitFiles = extractExplicitFiles(parsed.raw.files, configDir);
  const usesDefaultInclude = explicitFiles === null && !Array.isArray(parsed.raw.include);
  const { includeFilePattern, excludePattern } = createFileMatchers(
    configDir,
    parsed.raw.include,
    parsed.raw.exclude,
    {
      useDefaultInclude: usesDefaultInclude,
      useCaseSensitiveFileNames: ts.sys.useCaseSensitiveFileNames,
    },
  );
  const supportedExtensions = new Set(getSupportedExtensions(parsed.options));
  if (parsed.options.resolveJsonModule) supportedExtensions.add(".json");

  const result = {
    configPath: path.resolve(configPath),
    configDir,
    fileNames: new Set(parsed.fileNames.map(normalizePath)),
    explicitFiles,
    includeFilePattern,
    excludePattern,
    supportedExtensions,
    usesDefaultInclude,
  } satisfies ParsedProjectConfig;
  parsedConfigCache.set(normalizedConfigPath, result);
  return result;
}

function extractExplicitFiles(rawFiles: unknown, configDir: string): Set<string> | null {
  if (!Array.isArray(rawFiles)) return null;
  return new Set(
    rawFiles
      .filter((entry): entry is string => typeof entry === "string")
      .map((entry) => normalizePath(path.resolve(configDir, entry))),
  );
}

interface FileMatcherOptions {
  useDefaultInclude: boolean;
  useCaseSensitiveFileNames: boolean;
}

function createFileMatchers(
  configDir: string,
  rawInclude: unknown,
  rawExclude: unknown,
  options: FileMatcherOptions,
): {
  includeFilePattern: RegExp | null;
  excludePattern: RegExp | null;
} {
  const { useDefaultInclude, useCaseSensitiveFileNames } = options;
  const includeSpecs = Array.isArray(rawInclude)
    ? rawInclude.filter((entry): entry is string => typeof entry === "string")
    : undefined;
  const excludeSpecs = Array.isArray(rawExclude)
    ? rawExclude.filter((entry): entry is string => typeof entry === "string")
    : undefined;
  const matcherPatterns = getFileMatcherPatterns(
    configDir,
    excludeSpecs,
    useDefaultInclude ? ["**/*"] : includeSpecs,
  );
  // normalizePath() lowercases paths when the filesystem is case-insensitive,
  // so the include/exclude regexes must match case-insensitively too. Otherwise
  // files created after the parse (absent from fileNames, tested against the
  // include pattern) are wrongly declared excluded.
  const regexFlags = useCaseSensitiveFileNames ? undefined : "i";

  return {
    includeFilePattern: matcherPatterns.includeFilePattern
      ? new RegExp(matcherPatterns.includeFilePattern, regexFlags)
      : null,
    excludePattern: matcherPatterns.excludePattern
      ? new RegExp(matcherPatterns.excludePattern, regexFlags)
      : null,
  };
}

function decideFileScope(
  parsed: ParsedProjectConfig,
  absolutePath: string,
): { included: boolean; basis: ScopeDecisionBasis } {
  const normalizedPath = normalizePath(absolutePath);
  if (parsed.fileNames.has(normalizedPath)) return { included: true, basis: "fileNames" };

  const extension = path.extname(absolutePath).toLowerCase();
  if (!parsed.supportedExtensions.has(extension)) return { included: false, basis: "extension" };

  if (parsed.explicitFiles) {
    return { included: parsed.explicitFiles.has(normalizedPath), basis: "explicit" };
  }
  // Include patterns are rooted at the config directory; a file outside it can
  // only be in scope through the parse-time file set or an explicit files list.
  if (!isWithinOrEqual(parsed.configDir, absolutePath)) {
    return { included: false, basis: "include-pattern" };
  }
  if (parsed.excludePattern?.test(normalizedPath))
    return { included: false, basis: "exclude-pattern" };
  if (parsed.usesDefaultInclude) return { included: true, basis: "default-include" };
  if (!parsed.includeFilePattern) return { included: false, basis: "include-pattern" };
  return { included: parsed.includeFilePattern.test(normalizedPath), basis: "include-pattern" };
}

function getSupportedExtensions(options: ts.CompilerOptions): string[] {
  return tsInternal.getSupportedExtensions
    ? [...tsInternal.getSupportedExtensions(options, undefined).flat()]
    : [".ts", ".tsx", ".d.ts", ".cts", ".d.cts", ".mts", ".d.mts"];
}

function getFileMatcherPatterns(
  configDir: string,
  excludeSpecs: readonly string[] | undefined,
  includeSpecs: readonly string[] | undefined,
): { includeFilePattern?: string; excludePattern?: string } {
  return tsInternal.getFileMatcherPatterns
    ? tsInternal.getFileMatcherPatterns(
        configDir,
        excludeSpecs,
        includeSpecs,
        ts.sys.useCaseSensitiveFileNames,
        path.parse(configDir).root,
      )
    : {};
}

function createParseConfigHost(): ts.ParseConfigFileHost {
  return {
    ...ts.sys,
    onUnRecoverableConfigFileDiagnostic: () => {
      // Treat invalid configs as unsupported rather than surfacing a secondary
      // filter failure to the agent.
    },
  };
}

function isWithinOrEqual(root: string, target: string): boolean {
  const relative = path.relative(root, target);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== "..");
}

/**
 * Clear cached nearest-config lookups and parsed project config state.
 * Useful for testing and after workspace file changes.
 */
export function clearTsconfigCache(): void {
  nearestConfigCache.clear();
  parsedConfigCache.clear();
  projectConfigDependencyCache.clear();
}

/**
 * Invalidate cached state for one config file that changed, was created, or
 * was deleted.
 *
 * Removes the changed config and every cached root config that depends on it,
 * so the next decision re-reads current config data. The wholesale
 * {@link clearTsconfigCache} stays for lifecycle events; change signals use
 * this targeted invalidation instead.
 */
export function invalidateTsconfigCacheForConfig(configPath: string): void {
  const normalizedConfigPath = normalizePath(configPath);
  const invalidated = new Set([normalizedConfigPath]);

  for (const [cachedConfigPath, dependencies] of projectConfigDependencyCache) {
    if (dependencies.has(normalizedConfigPath)) invalidated.add(cachedConfigPath);
  }

  for (const cachedConfigPath of invalidated) {
    parsedConfigCache.delete(cachedConfigPath);
    projectConfigDependencyCache.delete(cachedConfigPath);
  }

  for (const [key, value] of nearestConfigCache) {
    if (value !== null && invalidated.has(normalizePath(value))) nearestConfigCache.delete(key);
  }
}

/**
 * Invalidate nearest-config lookups that found nothing under `dir`.
 *
 * Used when a config is created: directories below the new config that
 * previously resolved to no config may now resolve to it.
 */
export function invalidateTsconfigCacheForConfigDir(dir: string): void {
  const normalizedDir = normalizePath(dir);
  for (const [key, value] of nearestConfigCache) {
    if (value !== null) continue;
    const keyDir = key.split("::", 1)[0];
    if (keyDir === normalizedDir || keyDir.startsWith(`${normalizedDir}/`)) {
      nearestConfigCache.delete(key);
    }
  }
}
