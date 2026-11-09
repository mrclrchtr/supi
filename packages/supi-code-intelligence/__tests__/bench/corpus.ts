import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

/** Repository root of the live checkout that provides git history and dependencies. */
export const REPO_ROOT = resolve(import.meta.dirname, "../../../..");

/**
 * Extract the frozen benchmark corpus: SuPi's `packages/` tree at a pinned
 * commit, without binaries or the benchmark itself (its scenario strings
 * would otherwise pollute grep results).
 */
export function extractCorpus(commit: string): { dir: string; dispose(): void } {
  const dir = mkdtempSync(join(tmpdir(), "code-bench-corpus-"));
  const archive = execFileSync(
    "git",
    [
      "archive",
      commit,
      "--",
      "packages",
      "tsconfig.json",
      "package.json",
      ":(exclude)**/*.wasm",
      ":(exclude)**/*.jar",
      ":(exclude)**/*.png",
      ":(exclude)packages/supi-code-intelligence/__tests__/bench",
    ],
    { cwd: REPO_ROOT, maxBuffer: 256 * 1024 * 1024 },
  );
  execFileSync("tar", ["-x", "-C", dir], { input: archive });
  return { dir, dispose: () => rmSync(dir, { recursive: true, force: true }) };
}

/**
 * Link dependencies into a corpus workspace. Workspace packages resolve to
 * their corpus copies so cross-package locations stay inside the workspace;
 * third-party packages resolve to the live checkout's `node_modules`.
 * `typescript` is left out: the workspace helper links the selected compiler.
 */
export function linkCorpusDependencies(cwd: string): void {
  const liveModules = join(REPO_ROOT, "node_modules");
  const modules = join(cwd, "node_modules");
  mkdirSync(join(modules, "@mrclrchtr"), { recursive: true });
  for (const entry of readdirSync(liveModules)) {
    if (entry.startsWith(".") || entry === "@mrclrchtr" || entry === "typescript") continue;
    symlinkSync(join(liveModules, entry), join(modules, entry));
  }
  for (const pkg of readdirSync(join(cwd, "packages"))) {
    symlinkSync(join(cwd, "packages", pkg), join(modules, "@mrclrchtr", pkg));
  }
}
