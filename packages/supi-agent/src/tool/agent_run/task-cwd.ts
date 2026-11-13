import { spawnSync } from "node:child_process";
import { realpathSync, statSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";

/**
 * Resolve the working directory for one Delegation Task.
 *
 * Without a requested directory the child shares the parent cwd. A requested directory must be an
 * absolute, existing directory inside a worktree of the parent's Git repository (same Git common
 * directory), so delegation can target a sibling worktree but not an unrelated project. Project
 * trust is inherited from the parent session; it is not re-evaluated for the target.
 */
export function resolveTaskCwd(
  parentCwd: string,
  requested: string | undefined,
): { cwd: string } | { error: string } {
  if (requested === undefined) return { cwd: parentCwd };
  if (!isAbsolute(requested)) return { error: `Task cwd "${requested}" must be an absolute path.` };
  let target: string;
  try {
    target = realpathSync(requested);
    if (!statSync(target).isDirectory()) throw new Error("not a directory");
  } catch {
    return { error: `Task cwd "${requested}" is not an existing directory.` };
  }
  if (target === realpathOrResolve(parentCwd)) return { cwd: target };
  const parentRepository = gitCommonDirectory(parentCwd);
  if (!parentRepository) {
    return { error: "Task cwd requires the parent session to run inside a Git repository." };
  }
  if (gitCommonDirectory(target) !== parentRepository) {
    return {
      error: `Task cwd "${requested}" is not a worktree of the parent session's Git repository.`,
    };
  }
  return { cwd: target };
}

function gitCommonDirectory(cwd: string): string | undefined {
  const result = spawnSync(
    "git",
    ["-C", cwd, "rev-parse", "--path-format=absolute", "--git-common-dir"],
    { encoding: "utf8", timeout: 5_000, stdio: ["ignore", "pipe", "ignore"] },
  );
  const output = result.status === 0 ? result.stdout.trim() : "";
  return output ? realpathOrResolve(output) : undefined;
}

function realpathOrResolve(path: string): string {
  try {
    return realpathSync(path);
  } catch {
    return resolve(path);
  }
}
