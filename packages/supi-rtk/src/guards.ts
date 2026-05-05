import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

// rtk-ai/rtk#665, rtk-ai/rtk#1489 — upstream biome → rtk lint routing gap
const BIOME_RE = /biome(?:\s|$)/;
// rtk-ai/rtk#1367, rtk-ai/rtk#1604 — rg → grep rewrite is lossy (grep has no -g, -U, --glob, etc.)
const RG_RE = /^rg(?:\s|$)/;
const PACKAGE_LINT_RE = /^(?:pnpm|npm|yarn|bun)\s+(?:run\s+)?lint(?:\s|$)/;
const BIOME_CONFIG_FILES = ["biome.json", "biome.jsonc"];

/**
 * Normalize a command string by stripping leading shell wrappers that
 * would interfere with `^`-anchored guard regexes:
 * - `cd /path && command`
 * - `rtk command`  (from a previous RTK rewrite pass)
 */
function stripShellWrappers(command: string): string {
  let s = command.trimStart();
  // Strip leading `cd /some/path && ` or `cd /some/path;`
  while (/^cd\s+\S+(?:\s*[;&]\s*|\s+&&\s+)/.test(s)) {
    s = s.replace(/^cd\s+\S+(?:\s*[;&]\s*|\s+&&\s+)/, "");
  }
  // Strip leading `rtk ` prefix from a prior rewrite attempt
  s = s.replace(/^rtk\s+/, "");
  return s.trimStart();
}

/**
 * Return whether SuPi should bypass RTK's rewrite registry for commands with
 * known lossy rewrites. RTK 0.37.x collapses several Biome invocations into
 * `rtk lint ...`, which can drop the `biome` subcommand and produce misleading
 * lint-wrapper warnings. Passing these forms through preserves correctness while
 * upstream rewrite routing is fixed.
 *
 * TODO: Remove this workaround after rtk-ai/rtk#665 and rtk-ai/rtk#1489 are
 * closed and the `pnpm exec biome ...` routing gap is fixed upstream.
 *
 * `rg` (ripgrep) commands are also guarded: RTK rewrites `rg` to `rtk grep` or
 * native `grep`, but doesn't translate ripgrep-specific flags (`-g`, `-U`,
 * `--glob`, `--type`, etc.), producing broken commands like `grep -g '*.ts'`.
 * See rtk-ai/rtk#1367 and rtk-ai/rtk#1604.
 *
 * TODO: Remove this workaround after RTK properly handles rg-native flags.
 */
export function shouldBypassRtkRewrite(command: string, cwd: string): boolean {
  const normalized = stripShellWrappers(command);
  if (hasRtkDisabledPrefix(normalized)) return true;
  if (BIOME_RE.test(normalized)) return true;
  if (RG_RE.test(normalized)) return true;
  if (PACKAGE_LINT_RE.test(normalized) && projectUsesBiome(cwd)) return true;
  return false;
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
