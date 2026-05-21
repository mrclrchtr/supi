// tsconfig-aware file scope detection.
//
// Determines whether a file is within the compilation scope of its nearest
// tsconfig.json or jsconfig.json using the TypeScript compiler's own config
// parsing APIs. Used by the diagnostic filter to suppress LSP errors on files
// that TypeScript itself would not include in the project.

import * as path from "node:path";
import ts from "typescript";

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

const nearestConfigCache = new Map<string, string | null>();
const parsedConfigCache = new Map<string, ParsedProjectConfig | null>();

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
  const absolutePath = path.resolve(cwd, filePath);
  const configPath = findNearestProjectConfig(path.dirname(absolutePath), cwd);
  if (!configPath) return false;

  const parsed = parseProjectConfig(configPath);
  if (!parsed) return false;

  return !isFileInProjectScope(parsed, absolutePath);
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
    usesDefaultInclude,
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

function createFileMatchers(
  configDir: string,
  rawInclude: unknown,
  rawExclude: unknown,
  useDefaultInclude: boolean,
): {
  includeFilePattern: RegExp | null;
  excludePattern: RegExp | null;
} {
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

  return {
    includeFilePattern: matcherPatterns.includeFilePattern
      ? new RegExp(matcherPatterns.includeFilePattern)
      : null,
    excludePattern: matcherPatterns.excludePattern
      ? new RegExp(matcherPatterns.excludePattern)
      : null,
  };
}

function isFileInProjectScope(parsed: ParsedProjectConfig, absolutePath: string): boolean {
  const normalizedPath = normalizePath(absolutePath);
  if (parsed.fileNames.has(normalizedPath)) return true;

  const extension = path.extname(absolutePath).toLowerCase();
  if (!parsed.supportedExtensions.has(extension)) return false;

  if (parsed.explicitFiles) return parsed.explicitFiles.has(normalizedPath);
  if (!isWithinOrEqual(parsed.configDir, absolutePath)) return false;
  if (parsed.excludePattern?.test(normalizedPath)) return false;
  if (parsed.usesDefaultInclude) return true;
  return parsed.includeFilePattern ? parsed.includeFilePattern.test(normalizedPath) : false;
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

function normalizePath(target: string): string {
  const resolved = path.resolve(target).replaceAll("\\", "/");
  return ts.sys.useCaseSensitiveFileNames ? resolved : resolved.toLowerCase();
}

/**
 * Clear cached nearest-config lookups and parsed project config state.
 * Useful for testing and after workspace file changes.
 */
export function clearTsconfigCache(): void {
  nearestConfigCache.clear();
  parsedConfigCache.clear();
}
