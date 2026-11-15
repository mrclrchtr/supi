/**
 * Git working-tree summary for the SuPi footer.
 *
 * Pi already provides the branch name; this module adds ahead/behind, file
 * counts, and stashes. Reads run asynchronously, serially, and throttled so
 * bursts of tool calls trigger at most one `git` read per interval.
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { ThemeColor } from "@earendil-works/pi-coding-agent";
import type { FooterGlyphs } from "./footer-icons.ts";

const execFileAsync = promisify(execFile);
const GIT_TIMEOUT_MS = 2000;
const DEFAULT_REFRESH_INTERVAL_MS = 1000;

export interface GitCounts {
  ahead: number;
  behind: number;
  staged: number;
  modified: number;
  untracked: number;
  deleted: number;
  renamed: number;
  conflicted: number;
  stashed: number;
}

export function emptyGitCounts(): GitCounts {
  return {
    ahead: 0,
    behind: 0,
    staged: 0,
    modified: 0,
    untracked: 0,
    deleted: 0,
    renamed: 0,
    conflicted: 0,
    stashed: 0,
  };
}

/** Parse `git status --porcelain=v1 --branch` output. Returns the branch name, if any. */
export function parsePorcelainStatus(stdout: string): { branch: string | null; counts: GitCounts } {
  const counts = emptyGitCounts();
  let branch: string | null = null;

  for (const line of stdout.split("\n")) {
    if (line.startsWith("## ")) {
      branch = parseBranchHeader(line.slice(3), counts);
      continue;
    }
    if (line.length < 3) continue;
    countEntry(line[0] ?? " ", line[1] ?? " ", counts);
  }
  return { branch, counts };
}

function parseBranchHeader(header: string, counts: GitCounts): string | null {
  if (header.startsWith("HEAD (no branch)")) return null;
  const noCommits = header.match(/^No commits yet on (\S+)/);
  if (noCommits) return noCommits[1] ?? null;
  const match = header.match(/^(\S+?)(?:\.\.\.\S+)?(?:\s+\[(.*)\])?$/);
  if (!match) return null;
  const tracking = match[2] ?? "";
  counts.ahead = Number(tracking.match(/\bahead (\d+)/)?.[1] ?? 0);
  counts.behind = Number(tracking.match(/\bbehind (\d+)/)?.[1] ?? 0);
  return match[1] ?? null;
}

function countEntry(x: string, y: string, counts: GitCounts): void {
  if (x === "U" || y === "U" || (x === "A" && y === "A") || (x === "D" && y === "D")) {
    counts.conflicted++;
    return;
  }
  if (x === "?" && y === "?") {
    counts.untracked++;
    return;
  }
  if (x === "R") counts.renamed++;
  else if (x === "D") counts.deleted++;
  else if (x !== " ") counts.staged++;

  if (y === "M") counts.modified++;
  else if (y === "D") counts.deleted++;
}

/**
 * Count stashes created on `branch`.
 *
 * The stash stack is shared by all worktrees of a repository, so an
 * unfiltered count would include other worktrees' entries.
 */
export function countBranchStashes(stashSubjects: string, branch: string | null): number {
  if (!branch) return 0;
  const prefixes = [`WIP on ${branch}:`, `On ${branch}:`];
  return stashSubjects
    .split("\n")
    .filter((subject) => prefixes.some((prefix) => subject.startsWith(prefix))).length;
}

async function git(args: string[], cwd: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync("git", ["--no-optional-locks", ...args], {
      cwd,
      timeout: GIT_TIMEOUT_MS,
      maxBuffer: 4 * 1024 * 1024,
    });
    return stdout;
  } catch {
    return null;
  }
}

/** Read counts for `cwd`; returns null outside a Git repository or on failure. */
export async function readGitCounts(cwd: string): Promise<GitCounts | null> {
  const status = await git(["status", "--porcelain=v1", "--branch"], cwd);
  if (status === null) return null;
  const { branch, counts } = parsePorcelainStatus(status);
  const stashes = await git(["stash", "list", "--format=%gs"], cwd);
  if (stashes !== null) counts.stashed = countBranchStashes(stashes, branch);
  return counts;
}

/** Format non-zero counts, e.g. `⇡2 ⇣1 +3 !2 ?1`. */
export function formatGitCounts(
  counts: GitCounts,
  glyphs: FooterGlyphs,
  style: (color: ThemeColor, text: string) => string = (_color, text) => text,
): string {
  const parts: Array<[number, string, ThemeColor]> = [
    [counts.ahead, glyphs.ahead, "success"],
    [counts.behind, glyphs.behind, "warning"],
    [counts.conflicted, glyphs.conflicted, "error"],
    [counts.staged, glyphs.staged, "success"],
    [counts.modified, glyphs.modified, "warning"],
    [counts.renamed, glyphs.renamed, "warning"],
    [counts.deleted, glyphs.deleted, "error"],
    [counts.untracked, glyphs.untracked, "muted"],
    [counts.stashed, glyphs.stashed, "muted"],
  ];
  return parts
    .filter(([count]) => count > 0)
    .map(([count, glyph, color]) => style(color, `${glyph}${count}`))
    .join(" ");
}

/**
 * Serial, throttled Git reader.
 *
 * The first request reads immediately; requests within the interval collapse
 * into one trailing read. `flush()` runs pending work without waiting.
 * `dispose()` drops pending work and ignores in-flight results.
 */
export class GitCountsRefresher {
  private counts: GitCounts | null = null;
  private pendingCwd: string | undefined;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private inFlight = false;
  private lastStarted = Number.NEGATIVE_INFINITY;
  private generation = 0;

  constructor(
    private readonly onChange: () => void,
    private readonly read: (cwd: string) => Promise<GitCounts | null> = readGitCounts,
    private readonly intervalMs = DEFAULT_REFRESH_INTERVAL_MS,
  ) {}

  get current(): GitCounts | null {
    return this.counts;
  }

  request(cwd: string, immediate = false): void {
    this.pendingCwd = cwd;
    this.schedule(immediate);
  }

  flush(): void {
    if (this.pendingCwd !== undefined) this.schedule(true);
  }

  dispose(): void {
    this.generation++;
    this.clearTimer();
    this.pendingCwd = undefined;
    this.counts = null;
    this.lastStarted = Number.NEGATIVE_INFINITY;
  }

  private schedule(immediate: boolean): void {
    if (this.inFlight || this.pendingCwd === undefined) return;
    const wait = immediate ? 0 : this.lastStarted + this.intervalMs - Date.now();
    if (wait <= 0) {
      this.clearTimer();
      void this.run();
      return;
    }
    this.timer ??= setTimeout(() => {
      this.timer = undefined;
      void this.run();
    }, wait);
    this.timer.unref?.();
  }

  private clearTimer(): void {
    if (this.timer === undefined) return;
    clearTimeout(this.timer);
    this.timer = undefined;
  }

  private async run(): Promise<void> {
    const cwd = this.pendingCwd;
    if (this.inFlight || cwd === undefined) return;
    this.pendingCwd = undefined;
    this.inFlight = true;
    this.lastStarted = Date.now();
    const generation = this.generation;
    try {
      const counts = await this.read(cwd);
      if (generation === this.generation && !sameCounts(this.counts, counts)) {
        this.counts = counts;
        this.onChange();
      }
    } finally {
      this.inFlight = false;
      if (generation === this.generation) this.schedule(false);
    }
  }
}

function sameCounts(a: GitCounts | null, b: GitCounts | null): boolean {
  if (a === null || b === null) return a === b;
  return (Object.keys(a) as Array<keyof GitCounts>).every((key) => a[key] === b[key]);
}
