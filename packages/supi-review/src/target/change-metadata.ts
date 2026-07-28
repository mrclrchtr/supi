import { createHash } from "node:crypto";
import type { DiffStats, ReviewChange } from "../types.ts";

interface ParsedPathChange {
  status: string;
  path: string;
  previousPath?: string;
}

interface ParsedNumstat {
  path: string;
  previousPath?: string;
  additions: number | null;
  deletions: number | null;
}

function parseNameStatus(text: string): ParsedPathChange[] {
  const tokens = text.split("\0");
  const changes: ParsedPathChange[] = [];
  for (let index = 0; index < tokens.length; ) {
    const status = tokens[index++];
    if (!status) continue;
    if (status.startsWith("R") || status.startsWith("C")) {
      const previousPath = tokens[index++];
      const path = tokens[index++];
      if (previousPath && path) changes.push({ status, previousPath, path });
      continue;
    }
    const path = tokens[index++];
    if (path) changes.push({ status, path });
  }
  return changes;
}

function parseNumstatCount(value: string): number | null {
  if (value === "-") return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

function parseNumstat(text: string): ParsedNumstat[] {
  const tokens = text.split("\0");
  const stats: ParsedNumstat[] = [];
  for (let index = 0; index < tokens.length; ) {
    const entry = tokens[index++];
    if (!entry) continue;
    const firstTab = entry.indexOf("\t");
    const secondTab = entry.indexOf("\t", firstTab + 1);
    if (firstTab < 0 || secondTab < 0) continue;
    const additions = parseNumstatCount(entry.slice(0, firstTab));
    const deletions = parseNumstatCount(entry.slice(firstTab + 1, secondTab));
    const inlinePath = entry.slice(secondTab + 1);
    if (inlinePath) {
      stats.push({ path: inlinePath, additions, deletions });
      continue;
    }
    const previousPath = tokens[index++];
    const path = tokens[index++];
    if (previousPath && path) stats.push({ previousPath, path, additions, deletions });
  }
  return stats;
}

/** Reconcile Git name-status and numstat records into one deterministic inventory. */
export function buildReviewChanges(nameStatus: string, numstat: string): ReviewChange[] {
  const statsByPath = new Map(parseNumstat(numstat).map((entry) => [entry.path, entry]));
  return parseNameStatus(nameStatus)
    .map((entry) => {
      const stats = statsByPath.get(entry.path);
      return {
        ...entry,
        additions: stats?.additions ?? null,
        deletions: stats?.deletions ?? null,
      } satisfies ReviewChange;
    })
    .sort((left, right) => left.path.localeCompare(right.path));
}

/** Count patch additions and deletions without interpreting binary payloads. */
export function parseDiffStats(text: string, fileCount?: number): DiffStats {
  let additions = 0;
  let deletions = 0;
  let files = 0;
  for (const line of text.split("\n")) {
    if (line.startsWith("diff --git ")) files++;
    else if (line.startsWith("+") && !line.startsWith("+++")) additions++;
    else if (line.startsWith("-") && !line.startsWith("---")) deletions++;
  }
  return { files: fileCount ?? files, additions, deletions };
}

/** Derive metadata for one non-ignored untracked path from its exact patch. */
export function untrackedPatchChange(path: string, patch: string): ReviewChange {
  if (patch.includes("GIT binary patch") || patch.includes("Binary files")) {
    return { status: "A", path, additions: null, deletions: null };
  }
  const stats = parseDiffStats(patch);
  return { status: "A", path, additions: stats.additions, deletions: stats.deletions };
}

/** Incrementally hash and count canonical patch parts without retaining their aggregate text. */
export function createDiffAccumulator(): {
  append(diff: string): void;
  finish(fileCount: number): { diffHash: string; stats: DiffStats };
} {
  const hash = createHash("sha256");
  let additions = 0;
  let deletions = 0;
  return {
    append(diff) {
      if (!diff) return;
      hash.update(diff, "utf8");
      if (!diff.endsWith("\n")) hash.update("\n", "utf8");
      const stats = parseDiffStats(diff);
      additions += stats.additions;
      deletions += stats.deletions;
    },
    finish(fileCount) {
      return {
        diffHash: hash.digest("hex"),
        stats: { files: fileCount, additions, deletions },
      };
    },
  };
}
