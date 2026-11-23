import { execFileSync } from "node:child_process";

/** Run one Git command in `cwd` and return its trimmed stdout. */
export function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

/** Linked worktrees besides the main checkout: Review Workspaces that still exist in Git. */
export function reviewWorktrees(cwd: string): string[] {
  return git(cwd, "worktree", "list", "--porcelain")
    .split("\n")
    .filter((line) => line.startsWith("worktree "))
    .slice(1);
}
