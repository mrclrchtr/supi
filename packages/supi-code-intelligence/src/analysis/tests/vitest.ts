/**
 * Vitest workspace detection helpers.
 *
 * Extracted from orchestrate.ts to keep impact orchestration focused.
 */

import { existsSync, readFileSync } from "node:fs";
import * as path from "node:path";

export const VITEST_RUNNABLE_EXTENSIONS = new Set([
  ".js",
  ".jsx",
  ".ts",
  ".tsx",
  ".mjs",
  ".cjs",
  ".mts",
  ".cts",
]);

const VITEST_CONFIG_FILES = [
  "vitest.config.ts",
  "vitest.config.mts",
  "vitest.config.cts",
  "vitest.config.js",
  "vitest.config.mjs",
  "vitest.config.cjs",
  "vitest.workspace.ts",
  "vitest.workspace.mts",
  "vitest.workspace.cts",
  "vitest.workspace.js",
  "vitest.workspace.mjs",
  "vitest.workspace.cjs",
];

export function detectVitestWorkspace(cwd: string): boolean {
  let current = path.resolve(cwd);

  for (;;) {
    if (packageJsonUsesVitest(current) || hasVitestConfig(current)) {
      return true;
    }
    if (existsSync(path.join(current, ".git"))) {
      return false;
    }

    const parent = path.dirname(current);
    if (parent === current) {
      return false;
    }
    current = parent;
  }
}

function packageJsonUsesVitest(dir: string): boolean {
  const packageJsonPath = path.join(dir, "package.json");
  if (!existsSync(packageJsonPath)) {
    return false;
  }

  try {
    const parsed = JSON.parse(readFileSync(packageJsonPath, "utf-8")) as {
      scripts?: Record<string, string>;
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
      peerDependencies?: Record<string, string>;
      optionalDependencies?: Record<string, string>;
    };

    if (Object.values(parsed.scripts ?? {}).some((script) => script.includes("vitest"))) {
      return true;
    }

    return [
      parsed.dependencies,
      parsed.devDependencies,
      parsed.peerDependencies,
      parsed.optionalDependencies,
    ].some((deps) => Boolean(deps?.vitest));
  } catch {
    return false;
  }
}

function hasVitestConfig(dir: string): boolean {
  return VITEST_CONFIG_FILES.some((file) => existsSync(path.join(dir, file)));
}
