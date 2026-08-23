import * as path from "node:path";
import ts from "typescript";
import { normalizeTsconfigPath as normalizePath } from "./tsconfig-path.ts";

/**
 * Collect recognized local project configs declared by `extends`, including
 * transitive dependencies and paths that do not exist yet.
 */
export function collectExtendedProjectConfigs(configPath: string): Set<string> {
  const dependencies = new Set<string>();
  const visited = new Set<string>();

  const visit = (currentConfigPath: string): void => {
    const normalizedConfigPath = normalizePath(currentConfigPath);
    if (visited.has(normalizedConfigPath)) return;
    visited.add(normalizedConfigPath);

    const config = ts.readConfigFile(currentConfigPath, ts.sys.readFile).config;
    if (!config || typeof config !== "object") return;

    const extendsValues =
      typeof config.extends === "string"
        ? [config.extends]
        : Array.isArray(config.extends)
          ? config.extends.filter((value: unknown): value is string => typeof value === "string")
          : [];

    for (const extendsValue of extendsValues) {
      const extendedConfigPath = resolveLocalExtendedConfigPath(currentConfigPath, extendsValue);
      if (!extendedConfigPath) continue;

      const normalizedExtendedConfigPath = normalizePath(extendedConfigPath);
      dependencies.add(normalizedExtendedConfigPath);
      visit(extendedConfigPath);
    }
  };

  visit(configPath);
  return dependencies;
}

/**
 * Resolve a local project-config extends entry.
 *
 * Package names are not local paths and are deliberately ignored. TypeScript
 * uses the `.json` suffix for extensionless local config references. Only
 * recognized project-config names are tracked; arbitrary local JSON files may
 * still be parsed by TypeScript but are outside this invalidation contract.
 */
function resolveLocalExtendedConfigPath(configPath: string, extendsValue: string): string | null {
  if (!path.isAbsolute(extendsValue) && !/^\.{1,2}(?:[\\/]|$)/.test(extendsValue)) {
    return null;
  }

  const resolved = path.resolve(path.dirname(configPath), extendsValue);
  const candidate =
    path.extname(resolved).toLowerCase() === ".json" ? resolved : `${resolved}.json`;
  return isProjectConfigFileName(path.basename(candidate)) ? candidate : null;
}

/** Whether a file name is a tsconfig.json, jsconfig.json, or tsconfig.*.json name. */
export function isProjectConfigFileName(name: string): boolean {
  return (
    name === "tsconfig.json" ||
    name === "jsconfig.json" ||
    (name.startsWith("tsconfig.") && name.endsWith(".json"))
  );
}
