// biome-ignore lint/nursery/noExcessiveLinesPerFile: many tightly-coupled git helpers; splitting would create cross-ref overhead
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { promisify } from "node:util";
import type { DiffStats, ReviewSnapshot, ReviewTargetSpec } from "./types.ts";

const execFileAsync = promisify(execFile);
const GIT_TIMEOUT_MS = 30_000;

function scrubGitEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const next = { ...env };
  for (const key of Object.keys(next)) {
    if (key.startsWith("GIT_")) {
      delete next[key];
    }
  }
  return next;
}

function gitExecOptions(repoPath: string) {
  return {
    cwd: repoPath,
    env: scrubGitEnv(process.env),
    timeout: GIT_TIMEOUT_MS,
  };
}

/** Parse simple git diff statistics from diff/show text. */
export function parseDiffStats(text: string): DiffStats {
  let files = 0;
  let additions = 0;
  let deletions = 0;
  let inDiff = false;

  for (const line of text.split("\n")) {
    if (line.startsWith("diff --git ")) {
      files++;
      inDiff = true;
      continue;
    }

    if (!inDiff) continue;

    if (line.startsWith("+") && !line.startsWith("+++")) {
      additions++;
    } else if (line.startsWith("-") && !line.startsWith("---")) {
      deletions++;
    }
  }

  return { files, additions, deletions };
}

export async function getMergeBase(repoPath: string, branch: string): Promise<string | undefined> {
  try {
    const { stdout } = await execFileAsync(
      "git",
      ["merge-base", "HEAD", branch],
      gitExecOptions(repoPath),
    );
    return stdout.trim() || undefined;
  } catch {
    return undefined;
  }
}

export async function getDiff(repoPath: string, baseSha: string): Promise<string> {
  const { stdout } = await execFileAsync("git", ["diff", baseSha], gitExecOptions(repoPath));
  return stdout;
}

export async function getUncommittedDiff(repoPath: string): Promise<string> {
  const [staged, unstaged, untracked] = await Promise.all([
    execFileAsync("git", ["diff", "--cached"], gitExecOptions(repoPath)).then(
      (r) => r.stdout,
      () => "",
    ),
    execFileAsync("git", ["diff"], gitExecOptions(repoPath)).then(
      (r) => r.stdout,
      () => "",
    ),
    execFileAsync(
      "git",
      ["ls-files", "--others", "--exclude-standard"],
      gitExecOptions(repoPath),
    ).then(
      (r) => r.stdout,
      () => "",
    ),
  ]);

  let result = "";
  if (staged.trim()) {
    result += `=== Staged ===\n${staged}\n`;
  }
  if (unstaged.trim()) {
    result += `=== Unstaged ===\n${unstaged}\n`;
  }
  if (untracked.trim()) {
    const files = untracked
      .trim()
      .split("\n")
      .map((f) => f.trim())
      .filter((f) => f.length > 0);
    if (files.length > 0) {
      result += `=== Untracked files ===\n${files.join("\n")}\n`;
    }
  }
  return result.trimEnd();
}

export interface CommitEntry {
  sha: string;
  subject: string;
}

export async function getRecentCommits(repoPath: string, limit = 20): Promise<CommitEntry[]> {
  const { stdout } = await execFileAsync(
    "git",
    ["log", `--max-count=${limit}`, "--pretty=format:%H %s"],
    gitExecOptions(repoPath),
  );
  return stdout
    .split("\n")
    .map((line) => {
      const idx = line.indexOf(" ");
      if (idx <= 0) return undefined;
      return { sha: line.slice(0, idx), subject: line.slice(idx + 1) };
    })
    .filter((entry): entry is CommitEntry => entry !== undefined);
}

export async function getCommitShow(repoPath: string, sha: string): Promise<string> {
  const { stdout } = await execFileAsync("git", ["show", sha], gitExecOptions(repoPath));
  return stdout;
}

export async function getDiffFileNames(repoPath: string, baseSha: string): Promise<string[]> {
  const { stdout } = await execFileAsync(
    "git",
    ["diff", "--name-only", baseSha],
    gitExecOptions(repoPath),
  );
  return stdout
    .trim()
    .split("\n")
    .map((f) => f.trim())
    .filter((f) => f.length > 0);
}

export async function getUncommittedFileNames(repoPath: string): Promise<string[]> {
  const [unstaged, staged, untracked] = await Promise.all([
    execFileAsync("git", ["diff", "--name-only"], gitExecOptions(repoPath)).then(
      (r) => r.stdout,
      () => "",
    ),
    execFileAsync("git", ["diff", "--cached", "--name-only"], gitExecOptions(repoPath)).then(
      (r) => r.stdout,
      () => "",
    ),
    execFileAsync(
      "git",
      ["ls-files", "--others", "--exclude-standard"],
      gitExecOptions(repoPath),
    ).then(
      (r) => r.stdout,
      () => "",
    ),
  ]);

  const set = new Set([
    ...unstaged
      .trim()
      .split("\n")
      .map((f) => f.trim())
      .filter((f) => f.length > 0),
    ...staged
      .trim()
      .split("\n")
      .map((f) => f.trim())
      .filter((f) => f.length > 0),
    ...untracked
      .trim()
      .split("\n")
      .map((f) => f.trim())
      .filter((f) => f.length > 0),
  ]);
  return Array.from(set).sort();
}

export async function getCommitFileNames(repoPath: string, sha: string): Promise<string[]> {
  const { stdout } = await execFileAsync(
    "git",
    ["diff-tree", "--no-commit-id", "--name-only", "-r", sha],
    gitExecOptions(repoPath),
  );
  return stdout
    .trim()
    .split("\n")
    .map((f) => f.trim())
    .filter((f) => f.length > 0);
}

export async function getLocalBranches(repoPath: string): Promise<string[]> {
  const [{ stdout: local }, { stdout: current }] = await Promise.all([
    execFileAsync("git", ["branch", "--format=%(refname:short)"], gitExecOptions(repoPath)),
    execFileAsync("git", ["branch", "--show-current"], gitExecOptions(repoPath)),
  ]);

  const names = local
    .trim()
    .split("\n")
    .map((b) => b.trim())
    .filter((b) => b.length > 0);

  const currentBranch = current.trim();
  const set = new Set(names);
  const sorted: string[] = [];

  for (const candidate of ["main", "master", currentBranch]) {
    if (candidate && set.has(candidate)) {
      sorted.push(candidate);
      set.delete(candidate);
    }
  }

  const remaining = Array.from(set).sort((a, b) => a.localeCompare(b));
  sorted.push(...remaining);
  return sorted;
}

/** Resolve the current working tree into a concrete review snapshot. */
export async function resolveWorkingTreeSnapshot(
  repoPath: string,
): Promise<ReviewSnapshot | undefined> {
  const [diffText, changedFiles] = await Promise.all([
    getUncommittedDiff(repoPath),
    getUncommittedFileNames(repoPath),
  ]);
  if (!diffText.trim() && changedFiles.length === 0) return undefined;
  return {
    target: { kind: "working-tree" },
    title: "Working tree changes",
    changedFiles,
    diffText,
    stats: parseDiffStats(diffText),
  };
}

/** Resolve a branch-vs-base diff into a concrete review snapshot. */
export async function resolveBranchSnapshot(
  repoPath: string,
  base: string,
): Promise<ReviewSnapshot | undefined> {
  const baseSha = await getMergeBase(repoPath, base);
  if (!baseSha) return undefined;
  const [diffText, changedFiles] = await Promise.all([
    getDiff(repoPath, baseSha),
    getDiffFileNames(repoPath, baseSha),
  ]);
  if (!diffText.trim() && changedFiles.length === 0) return undefined;
  return {
    target: { kind: "branch", base },
    title: `Changes vs ${base}`,
    changedFiles,
    diffText,
    stats: parseDiffStats(diffText),
  };
}

/** Resolve one commit into a concrete review snapshot. */
export async function resolveCommitSnapshot(
  repoPath: string,
  sha: string,
): Promise<ReviewSnapshot | undefined> {
  const [diffText, changedFiles] = await Promise.all([
    getCommitShow(repoPath, sha),
    getCommitFileNames(repoPath, sha),
  ]);
  if (!diffText.trim() && changedFiles.length === 0) return undefined;
  return {
    target: { kind: "commit", sha },
    title: `Commit ${sha.slice(0, 7)}`,
    changedFiles,
    diffText,
    stats: parseDiffStats(diffText),
  };
}

/** Get the per-file diff for a single changed file in the snapshot. */
export async function getSnapshotFileDiff(
  repoPath: string,
  snapshot: ReviewSnapshot,
  file: string,
): Promise<string> {
  const { target } = snapshot;
  switch (target.kind) {
    case "working-tree": {
      const { stdout } = await execFileAsync(
        "git",
        ["diff", "HEAD", "--", file],
        gitExecOptions(repoPath),
      );
      return stdout;
    }
    case "branch": {
      const baseSha = await getMergeBase(repoPath, target.base);
      if (!baseSha) return "";
      const { stdout } = await execFileAsync(
        "git",
        ["diff", baseSha, "HEAD", "--", file],
        gitExecOptions(repoPath),
      );
      return stdout;
    }
    case "commit": {
      const { stdout } = await execFileAsync(
        "git",
        ["show", target.sha, "--", file],
        gitExecOptions(repoPath),
      );
      return stdout;
    }
  }
}

/** Run `git show <ref>:<file>` and return the blob content. */
async function showGitBlob(repoPath: string, ref: string, file: string): Promise<string> {
  const { stdout } = await execFileAsync(
    "git",
    ["show", `${ref}:${file}`],
    gitExecOptions(repoPath),
  );
  return stdout;
}

async function resolveWorkingTreeContent(
  repoPath: string,
  file: string,
  side: "before" | "after",
): Promise<string | undefined> {
  if (side === "before") {
    try {
      return await showGitBlob(repoPath, "HEAD", file);
    } catch {
      return undefined;
    }
  }
  try {
    return await readFile(join(repoPath, file), "utf-8");
  } catch {
    return undefined;
  }
}

async function resolveBranchContent(
  repoPath: string,
  target: ReviewTargetSpec & { kind: "branch" },
  file: string,
  side: "before" | "after",
): Promise<string | undefined> {
  const baseSha = await getMergeBase(repoPath, target.base);
  if (!baseSha) return undefined;
  const ref = side === "before" ? baseSha : "HEAD";
  try {
    return await showGitBlob(repoPath, ref, file);
  } catch (err) {
    if (side === "before") return undefined;
    throw err;
  }
}

async function resolveCommitContent(
  repoPath: string,
  target: ReviewTargetSpec & { kind: "commit" },
  file: string,
  side: "before" | "after",
): Promise<string | undefined> {
  const ref = side === "before" ? `${target.sha}^` : target.sha;
  try {
    return await showGitBlob(repoPath, ref, file);
  } catch (err) {
    if (side === "before") return undefined;
    throw err;
  }
}

/** Get before or after content for a single changed file in the snapshot. Returns undefined when legitimately unavailable; propagates unexpected errors. */
export async function getSnapshotFileContent(
  repoPath: string,
  snapshot: ReviewSnapshot,
  file: string,
  side: "before" | "after",
): Promise<string | undefined> {
  const { target } = snapshot;
  switch (target.kind) {
    case "working-tree":
      return resolveWorkingTreeContent(repoPath, file, side);
    case "branch":
      return resolveBranchContent(repoPath, target, file, side);
    case "commit":
      return resolveCommitContent(repoPath, target, file, side);
  }
}

/** Convenience label for one changed file, used in synthesized prompts/UI. */
export function formatChangedFileLabel(file: string): string {
  return basename(file) === file ? file : `${basename(file)} (${file})`;
}
