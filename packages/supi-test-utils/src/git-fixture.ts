// Git fixtures for process-spawning tests. Depends only on Node and Vitest.
import { execFileSync, spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll } from "vitest";

/** Run Git and return its trimmed standard output. */
export function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8", stdio: "pipe" }).trim();
}

/** A PID that belonged to a process that has already exited, for stale worktree-lock owners. */
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
 * Build a fixture repository once per test file and copy it for each test.
 *
 * Building a repository takes about ten Git processes; copying one takes a few milliseconds. Every
 * copy has the same commit hashes. Call this at module level. `build` returns facts about the
 * repository, such as commit hashes, that the returned function hands back with each copy. The
 * template is removed after the file's tests.
 *
 * @returns A function that copies the template into an existing empty directory.
 */
export function useRepositoryTemplate<T>(build: (cwd: string) => T): (cwd: string) => T {
  let template: { readonly cwd: string; readonly facts: T } | undefined;

  afterAll(() => {
    if (template) rmSync(template.cwd, { recursive: true, force: true });
    template = undefined;
  });

  return (cwd) => {
    if (!template) {
      const templateCwd = mkdtempSync(join(tmpdir(), "supi-git-template-"));
      template = { cwd: templateCwd, facts: build(templateCwd) };
    }
    cpSync(template.cwd, cwd, { recursive: true });
    return template.facts;
  };
}

/**
 * Return a function that copies a one-commit repository (`tracked.txt` = `base\n`) into an
 * existing directory. Built once per test file on first use; call it at module level.
 */
export function repositoryTemplate(): (cwd: string) => void {
  const copy = useRepositoryTemplate((template) => {
    git(template, "init", "-q");
    git(template, "config", "user.email", "test@example.com");
    git(template, "config", "user.name", "Test");
    git(template, "config", "commit.gpgsign", "false");
    git(template, "config", "core.hooksPath", "/dev/null");
    writeFileSync(join(template, "tracked.txt"), "base\n");
    git(template, "add", ".");
    git(template, "commit", "-q", "-m", "base");
  });
  return (cwd) => {
    copy(cwd);
  };
}
