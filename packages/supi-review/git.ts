import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const GIT_TIMEOUT_MS = 30_000;

export async function getMergeBase(repoPath: string, branch: string): Promise<string | undefined> {
  try {
    const { stdout } = await execFileAsync("git", ["merge-base", "HEAD", branch], {
      cwd: repoPath,
      timeout: GIT_TIMEOUT_MS,
    });
    return stdout.trim() || undefined;
  } catch {
    return undefined;
  }
}

export async function getDiff(repoPath: string, baseSha: string): Promise<string> {
  const { stdout } = await execFileAsync("git", ["diff", baseSha], {
    cwd: repoPath,
    timeout: GIT_TIMEOUT_MS,
  });
  return stdout;
}

export async function getUncommittedDiff(repoPath: string): Promise<string> {
  const [staged, unstaged, untracked] = await Promise.all([
    execFileAsync("git", ["diff", "--cached"], { cwd: repoPath, timeout: GIT_TIMEOUT_MS }).then(
      (r) => r.stdout,
      () => "",
    ),
    execFileAsync("git", ["diff"], { cwd: repoPath, timeout: GIT_TIMEOUT_MS }).then(
      (r) => r.stdout,
      () => "",
    ),
    execFileAsync("git", ["ls-files", "--others", "--exclude-standard"], {
      cwd: repoPath,
      timeout: GIT_TIMEOUT_MS,
    }).then(
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
    { cwd: repoPath, timeout: GIT_TIMEOUT_MS },
  );
  return stdout
    .split("\n")
    .map((line) => {
      const idx = line.indexOf(" ");
      if (idx <= 0) return undefined;
      return { sha: line.slice(0, idx), subject: line.slice(idx + 1) };
    })
    .filter((e): e is CommitEntry => e !== undefined);
}

export async function getCommitShow(repoPath: string, sha: string): Promise<string> {
  const { stdout } = await execFileAsync("git", ["show", sha], {
    cwd: repoPath,
    timeout: GIT_TIMEOUT_MS,
  });
  return stdout;
}

export async function getLocalBranches(repoPath: string): Promise<string[]> {
  const [{ stdout: local }, { stdout: current }] = await Promise.all([
    execFileAsync("git", ["branch", "--format=%(refname:short)"], {
      cwd: repoPath,
      timeout: GIT_TIMEOUT_MS,
    }),
    execFileAsync("git", ["branch", "--show-current"], {
      cwd: repoPath,
      timeout: GIT_TIMEOUT_MS,
    }),
  ]);

  const names = local
    .trim()
    .split("\n")
    .map((b) => b.trim())
    .filter((b) => b.length > 0);

  const currentBranch = current.trim();
  const set = new Set(names);
  const sorted: string[] = [];

  // Put default candidates first
  for (const candidate of ["main", "master", currentBranch]) {
    if (candidate && set.has(candidate)) {
      sorted.push(candidate);
      set.delete(candidate);
    }
  }

  // Then remaining alphabetically
  const remaining = Array.from(set).sort((a, b) => a.localeCompare(b));
  sorted.push(...remaining);
  return sorted;
}
