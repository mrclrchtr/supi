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

/** Build the final prompt packet for the reviewer child session. */
export function buildReviewPacket(
  snapshot: ReviewSnapshot,
  brief: SynthesizedReviewBrief,
  model: ReviewModelSelection,
): ReviewPacket {
  const charBudget = getPacketCharBudget(model);
  const { preamble, sections } = splitDiffSections(snapshot.diffText);
  const orderedSections = prioritizeSections(sections, brief, snapshot.changedFiles);

  const baseParts: string[] = [
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
  ];

  baseParts.push("", buildFileOverviewTable(snapshot.changedFiles, sections));

  if (preamble.trim()) {
    baseParts.push("", "## Snapshot notes", truncate(preamble.trim(), 1_500));
  }

  let prompt = baseParts.join("\n");
  let remaining = charBudget - prompt.length;
  const includedFiles: string[] = [];
  const diffBlocks: string[] = [];

  for (const section of orderedSections) {
    if (remaining <= 2_000) break;
    const fenced = [`### ${section.file}`, "", "```diff", section.text, "```"].join("\n");

    if (fenced.length <= remaining) {
      diffBlocks.push(fenced);
      includedFiles.push(section.file);
      remaining -= fenced.length + 2;
      continue;
    }

    if (includedFiles.length === 0) {
      const excerptBudget = Math.max(1_000, remaining - 200);
      const excerpt = truncate(section.text, excerptBudget);
      const partialBlock = [`### ${section.file}`, "", "```diff", excerpt, "```"].join("\n");
      diffBlocks.push(partialBlock);
      includedFiles.push(section.file);
      remaining -= partialBlock.length + 2;
    }
    break;
  }

  const omittedFiles = snapshot.changedFiles.filter((file) => !includedFiles.includes(file));

  prompt = [
    prompt,
    "",
    "## Included diffs",
    diffBlocks.length > 0
      ? diffBlocks.join("\n\n")
      : "No inline diff sections fit in the prompt budget. Use the changed-file manifest to inspect the files directly.",
    "",
    "## Omitted files",
    ...toBullets(omittedFiles, "- None"),
    "",
    "Review the included diff carefully. Use read/grep/find/ls to inspect surrounding code before submitting findings.",
  ].join("\n");

  return {
    prompt,
    includedFiles,
    omittedFiles,
    charBudget,
  };
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

function prioritizeSections(
  sections: DiffSection[],
  brief: SynthesizedReviewBrief,
  changedFiles: string[],
): DiffSection[] {
  const riskyTokens = brief.riskyFiles.flatMap(toPathTokens);
  const order = new Map(changedFiles.map((file, index) => [file, index]));

  return [...sections].sort((a, b) => {
    const delta = sectionScore(b, riskyTokens, order) - sectionScore(a, riskyTokens, order);
    if (delta !== 0) return delta;
    return a.file.localeCompare(b.file);
  });
}

function sectionScore(
  section: DiffSection,
  riskyTokens: string[],
  order: Map<string, number>,
): number {
  const lowerFile = section.file.toLowerCase();
  const riskyScore = riskyTokens.reduce(
    (score, token) => score + (lowerFile.includes(token) ? 20 : 0),
    0,
  );
  const orderScore = order.has(section.file) ? Math.max(0, 10 - (order.get(section.file) ?? 0)) : 0;
  return riskyScore + orderScore;
}

function toPathTokens(path: string): string[] {
  return path
    .toLowerCase()
    .split(/[\\/._-]/)
    .map((part) => part.trim())
    .filter((part) => part.length >= 3);
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
