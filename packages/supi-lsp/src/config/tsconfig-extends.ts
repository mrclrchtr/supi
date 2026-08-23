import * as path from "node:path";
import ts from "typescript";

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

function resolveLocalExtendedConfigPath(configPath: string, extendsValue: string): string | null {
  if (!path.isAbsolute(extendsValue) && !/^\.{1,2}(?:[\\/]|$)/.test(extendsValue)) {
    return null;
  }

  const resolved = path.resolve(path.dirname(configPath), extendsValue);
  const candidate =
    path.extname(resolved).toLowerCase() === ".json" ? resolved : `${resolved}.json`;
  return isProjectConfigFileName(path.basename(candidate)) ? candidate : null;
}

function normalizePath(target: string): string {
  const resolved = path.resolve(target).replaceAll("\\", "/");
  return ts.sys.useCaseSensitiveFileNames ? resolved : resolved.toLowerCase();
}

/** Whether a file name is a tsconfig.json, jsconfig.json, or tsconfig.*.json name. */
export function isProjectConfigFileName(name: string): boolean {
  return (
    name === "tsconfig.json" ||
    name === "jsconfig.json" ||
    (name.startsWith("tsconfig.") && name.endsWith(".json"))
  );
}
