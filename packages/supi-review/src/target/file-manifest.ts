import type { ReviewChange } from "../types.ts";

/** Bounds for one changed-path manifest rendered in a Reviewer Packet. */
export interface FileManifestOptions {
  maxFiles?: number;
  maxCharacters?: number;
}

function formatLineStats(change: ReviewChange): string {
  if (change.additions === null || change.deletions === null) return "binary";
  return `+${change.additions} -${change.deletions}`;
}

/** Render one deterministic changed-path inventory row. */
export function formatReviewChange(change: ReviewChange): string {
  const path = change.previousPath
    ? `${JSON.stringify(change.previousPath)} -> ${JSON.stringify(change.path)}`
    : JSON.stringify(change.path);
  return `${change.status} ${formatLineStats(change)} ${path}`;
}

/** Summarize the complete captured inventory, without inferring behavioral preservation. */
export function buildChangeSummary(changes: readonly ReviewChange[]): string {
  const groups = [
    ["M", "modified", "modified"],
    ["A", "added", "added"],
    ["D", "deleted", "deleted"],
    ["R", "detected rename", "detected renames"],
    ["C", "detected copy", "detected copies"],
    ["T", "type change", "type changes"],
    ["other", "other", "other"],
  ] as const;
  const counts = new Map<string, number>();
  for (const change of changes) {
    const status = change.status.charAt(0);
    const group = groups.some(([code]) => code === status) ? status : "other";
    counts.set(group, (counts.get(group) ?? 0) + 1);
  }
  const summary = groups.flatMap(([code, singular, plural]) => {
    const count = counts.get(code) ?? 0;
    return count ? [`${count} ${count === 1 ? singular : plural}`] : [];
  });
  return `Change summary: ${summary.join(", ") || "no changes"}.`;
}

/** Render a deterministic bounded change manifest with an explicit omission count. */
export function buildFileManifest(
  changes: ReviewChange[],
  options: FileManifestOptions = {},
): string[] {
  const maxFiles = options.maxFiles ?? 200;
  const maxCharacters = options.maxCharacters ?? 8_000;
  const lines: string[] = [];
  let size = 0;
  for (const change of changes) {
    const line = `- ${formatReviewChange(change)}`;
    if (lines.length >= maxFiles || size + line.length + 1 > maxCharacters - 100) break;
    lines.push(line);
    size += line.length + 1;
  }
  const omitted = changes.length - lines.length;
  if (omitted > 0)
    lines.push(
      `- … ${omitted} additional change(s) omitted; use Git to inspect the complete inventory.`,
    );
  return lines;
}
