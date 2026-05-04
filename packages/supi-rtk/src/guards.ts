import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const BIOME_CONFIG_FILES = ["biome.json", "biome.jsonc"];
const PACKAGE_MANAGER_BIN_RE = /^(?:pnpm|npm|yarn|bun)\s+(?:exec|dlx|x)\s+(?:--\s+)?biome(?:\s|$)/;
const PACKAGE_MANAGER_SCRIPT_RE = /^(?:pnpm|npm|yarn|bun)\s+(?:run\s+)?biome(?:\s|$)/;
const PACKAGE_LINT_RE = /^(?:pnpm|npm|yarn|bun)\s+(?:run\s+)?lint(?:\s|$)/;
const DIRECT_BIOME_RE =
  /^(?:biome|\.\/node_modules\/\.bin\/biome|node_modules\/\.bin\/biome)(?:\s|$)/;

/**
 * Return whether SuPi should bypass RTK's rewrite registry for commands with
 * known lossy rewrites. RTK 0.37.x collapses several Biome invocations into
 * `rtk lint ...`, which can drop the `biome` subcommand and produce misleading
 * lint-wrapper warnings. Passing these forms through preserves correctness while
 * upstream rewrite routing is fixed.
 *
 * TODO: Remove this workaround after rtk-ai/rtk#665 and rtk-ai/rtk#1489 are
 * closed and the `pnpm exec biome ...` routing gap is fixed upstream.
 */
export function shouldBypassRtkRewrite(command: string, cwd: string): boolean {
  const normalized = command.trimStart();
  if (hasRtkDisabledPrefix(normalized)) return true;
  if (DIRECT_BIOME_RE.test(normalized)) return true;
  if (PACKAGE_MANAGER_BIN_RE.test(normalized)) return true;
  if (PACKAGE_MANAGER_SCRIPT_RE.test(normalized)) return true;
  return PACKAGE_LINT_RE.test(normalized) && projectUsesBiome(cwd);
}

function hasRtkDisabledPrefix(command: string): boolean {
  if (command.startsWith("RTK_DISABLED=1 ")) return true;
  return command.startsWith("env RTK_DISABLED=1 ");
}

function projectUsesBiome(cwd: string): boolean {
  if (BIOME_CONFIG_FILES.some((file) => existsSync(join(cwd, file)))) {
    return true;
  }

  try {
    const packageJson = JSON.parse(readFileSync(join(cwd, "package.json"), "utf-8")) as {
      scripts?: Record<string, unknown>;
    };
    return Object.values(packageJson.scripts ?? {}).some(
      (script) => typeof script === "string" && /(^|\s)biome(\s|$)/.test(script),
    );
  } catch {
    return false;
  }
}
