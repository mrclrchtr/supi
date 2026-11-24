import { execFileSync, spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll } from "vitest";

/** Run Git and return its trimmed standard output. */
export function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8", stdio: "pipe" }).trim();
}

/** A PID that belonged to a process that has already exited. */
export function deadPid(): number {
  const child = spawnSync(process.execPath, ["-e", "process.exit(0)"]);
  if (!child.pid) throw new Error("Could not spawn a short-lived process.");
  return child.pid;
}

function canonical(path: string): string {
  try {
    return realpathSync(path);
  } catch {
    return path;
  }
}

/** Lock reasons by canonical worktree path from `git worktree list`. */
export function lockReasons(cwd: string): Map<string, string> {
  const reasons = new Map<string, string>();
  let path: string | undefined;
  for (const line of git(cwd, "worktree", "list", "--porcelain").split("\n")) {
    if (line.startsWith("worktree ")) path = canonical(line.slice("worktree ".length));
    if (line.startsWith("locked ") && path) reasons.set(path, line.slice("locked ".length));
  }
  return reasons;
}

/**
 * Return a function that copies a one-commit repository (`tracked.txt` = `base\n`) into an
 * existing directory. The template is built once per test file, on first use, and removed after
 * the file's tests. Call it at module level.
 */
export function repositoryTemplate(): (cwd: string) => void {
  let template: string | undefined;
  afterAll(() => {
    if (template) rmSync(template, { recursive: true, force: true });
  });
  return (cwd) => {
    if (!template) {
      template = mkdtempSync(join(tmpdir(), "supi-git-template-"));
      git(template, "init", "-q");
      git(template, "config", "user.email", "test@example.com");
      git(template, "config", "user.name", "Test");
      git(template, "config", "commit.gpgsign", "false");
      git(template, "config", "core.hooksPath", "/dev/null");
      writeFileSync(join(template, "tracked.txt"), "base\n");
      git(template, "add", ".");
      git(template, "commit", "-q", "-m", "base");
    }
    cpSync(template, cwd, { recursive: true });
  };
}
