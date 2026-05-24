import type {
  ReviewModelSelection,
  ReviewPacket,
  ReviewSnapshot,
  SynthesizedReviewBrief,
} from "../types.ts";

export interface DiffSection {
  file: string;
  text: string;
  additions: number;
  deletions: number;
}

/** Build a compact review packet for the reviewer child session.
 *
 * The packet contains only the session-derived brief, target metadata, and a
 * changed-file overview. No large inline diffs are included. The reviewer uses
 * read_snapshot_diff and read_snapshot_file tools to inspect diffs on demand.
 */
export function buildReviewPacket(
  snapshot: ReviewSnapshot,
  brief: SynthesizedReviewBrief,
  model: ReviewModelSelection,
): ReviewPacket {
  const { preamble, sections } = splitDiffSections(snapshot.diffText);

  const parts: string[] = [
    "# Review Task",
    "",
    "## Session-derived intent",
    `Summary: ${brief.summary}`,
    `Intended outcome: ${brief.intendedOutcome}`,
    "",
    "## Constraints to preserve",
    ...toBullets(brief.constraints, "- No explicit constraints extracted."),
    "",
    "## Focus areas",
    ...toBullets(brief.focusAreas, "- Review overall correctness and consistency."),
    "",
    "## Risky files",
    ...toBullets(brief.riskyFiles, "- No risky files explicitly called out."),
    "",
    "## Open questions",
    ...toBullets(brief.unresolvedQuestions, "- No unresolved questions identified."),
    "",
    "## Snapshot under review",
    `Target: ${snapshot.title}`,
    `Files changed: ${snapshot.changedFiles.length}`,
    `Diff stats: +${snapshot.stats.additions} / -${snapshot.stats.deletions}`,
    `Reviewer model: ${model.canonicalId}`,
    "",
    "## Changed files manifest",
    ...snapshot.changedFiles.map((file) => `- ${file}`),
    "",
    buildFileOverviewTable(snapshot.changedFiles, sections),
  ];

  if (preamble.trim()) {
    parts.push("", "## Snapshot notes", truncate(preamble.trim(), 1_500));
  }

  parts.push(
    "",
    "## On-demand snapshot inspection",
    "Use read_snapshot_diff <file> to see the exact diff for any changed file.",
    "Use read_snapshot_file <file> before|after to inspect file contents on either side of the change.",
    "These tools are scoped to the snapshot's changed-files list — request a file from the manifest above.",
    "",
    "Combine snapshot inspection with read/grep/find/ls for broader codebase context.",
  );

  return { prompt: parts.join("\n") };
}

/** Derive a conservative prompt budget from the selected model's context window. */
export function getPacketCharBudget(model: ReviewModelSelection): number {
  const contextWindow = model.model.contextWindow;
  if (!contextWindow || contextWindow <= 0) {
    return 32_000;
  }

  const tokenBudget = Math.max(512, Math.min(32_000, Math.floor(contextWindow * 0.2)));
  return tokenBudget * 4;
}

function countDiffLines(lines: string[]): { additions: number; deletions: number } {
  let additions = 0;
  let deletions = 0;
  for (const line of lines) {
    // Skip diff header lines (e.g. "--- a/file", "+++ b/file").
    // The trailing space ensures we do not skip content lines whose first
    // characters happen to be "+++" or "---".
    if (line.startsWith("--- ") || line.startsWith("+++ ")) continue;
    if (line.startsWith("+")) additions++;
    else if (line.startsWith("-")) deletions++;
  }
  return { additions, deletions };
}

export function splitDiffSections(text: string): { preamble: string; sections: DiffSection[] } {
  const lines = text.split("\n");
  const preamble: string[] = [];
  const sections: DiffSection[] = [];
  let current: string[] = [];
  let currentFile: string | undefined;

  const flush = () => {
    if (current.length === 0 || !currentFile) {
      current = [];
      currentFile = undefined;
      return;
    }
    const stats = countDiffLines(current);
    sections.push({
      file: currentFile,
      text: current.join("\n").trimEnd(),
      additions: stats.additions,
      deletions: stats.deletions,
    });
    current = [];
    currentFile = undefined;
  };

  for (const line of lines) {
    if (line.startsWith("diff --git ")) {
      flush();
      current = [line];
      currentFile = parseDiffFile(line);
      continue;
    }

    if (/^=== .* ===$/.test(line) && current.length > 0) {
      flush();
      preamble.push(line);
      continue;
    }

    if (current.length > 0) {
      current.push(line);
      if (!currentFile && line.startsWith("+++ b/")) {
        currentFile = line.slice(6).trim();
      }
      continue;
    }

    preamble.push(line);
  }

  flush();
  return { preamble: preamble.join("\n").trim(), sections };
}

function parseDiffFile(line: string): string | undefined {
  const match = /^diff --git a\/(.+?) b\/(.+)$/.exec(line.trim());
  if (!match) return undefined;
  const next = match[2] ?? match[1];
  return next === "/dev/null" ? match[1] : next;
}

/** Categorize a file path for skip-list annotation, or undefined if it should be reviewed. */
export function classifySkipCategory(file: string): string | undefined {
  const lockfiles = new Set([
    "package-lock.json",
    "yarn.lock",
    "pnpm-lock.yaml",
    "Gemfile.lock",
    "Cargo.lock",
    "poetry.lock",
    "composer.lock",
  ]);

  const name = file.split("/").pop() ?? file;
  if (lockfiles.has(name)) return "lockfile";
  if (name.startsWith("CHANGELOG") || name.startsWith("CHANGES") || name === "CHANGE_LOG") {
    return "changelog";
  }

  if (file.includes("__snapshots__/") || name.endsWith(".snap")) {
    return "snapshot";
  }

  if (
    file.includes("dist/") ||
    file.includes("build/") ||
    file.includes(".next/") ||
    file.includes("__generated__/")
  ) {
    return "generated";
  }

  if (file.includes("vendor/") || file.includes("third_party/")) {
    return "vendored";
  }

  if (name.endsWith(".min.js") || name.endsWith(".min.css")) return "generated";

  return undefined;
}

function formatOverviewRow(
  file: string,
  statsMap: Map<string, { additions: number; deletions: number }>,
  binaryFiles: Set<string>,
): string {
  const stats = statsMap.get(file);
  const skipCategory = classifySkipCategory(file);
  const annotations: string[] = [];

  if (!stats) {
    // File in the changed-files manifest but not in the parsed diff sections.
    // This happens for untracked files in working-tree snapshots, which
    // have no diff section to parse. Do not guess 0/0 or mark as trivial.
    if (skipCategory) annotations.push(`skip — ${skipCategory}`);
    const annotation = annotations.length > 0 ? ` (${annotations.join(", ")})` : "";
    return `| ${file} | ? | ?${annotation} |`;
  }

  if (binaryFiles.has(file)) {
    // Binary diffs have no diffable +/- lines. Show unknown stats.
    if (skipCategory) annotations.push(`skip — ${skipCategory}`);
    annotations.push("binary");
    const annotation = annotations.length > 0 ? ` (${annotations.join(", ")})` : "";
    return `| ${file} | ? | ?${annotation} |`;
  }

  const total = stats.additions + stats.deletions;
  if (total < 5) annotations.push("trivial");
  if (skipCategory) annotations.push(`skip — ${skipCategory}`);
  const annotation = annotations.length > 0 ? ` (${annotations.join(", ")})` : "";
  return `| ${file} | ${stats.additions} | ${stats.deletions}${annotation} |`;
}

function buildFileOverviewTable(changedFiles: string[], sections: DiffSection[]): string {
  const statsMap = new Map<string, { additions: number; deletions: number }>();
  const binaryFiles = new Set<string>();
  for (const section of sections) {
    const existing = statsMap.get(section.file);
    statsMap.set(section.file, {
      additions: (existing?.additions ?? 0) + section.additions,
      deletions: (existing?.deletions ?? 0) + section.deletions,
    });
    if (section.text.includes("Binary files ")) {
      binaryFiles.add(section.file);
    }
  }

  const header = "| File | +Add | -Del |";
  const separator = "|---|---|---|";
  const rows = changedFiles.map((file) => formatOverviewRow(file, statsMap, binaryFiles));

  return [`## File overview`, "", header, separator, ...rows].join("\n");
}

function toBullets(items: string[], fallback: string): string[] {
  return items.length > 0 ? items.map((item) => `- ${item}`) : [fallback];
}

function truncate(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars)}\n[... truncated ...]`;
}
