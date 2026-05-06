import type { ReviewTarget } from "./types.ts";

export interface DiffStats {
  files: number;
  additions: number;
  deletions: number;
}

export interface BuildPromptOptions {
  truncated?: boolean;
  truncatedBytes?: number;
}

export function buildReviewPrompt(
  target: ReviewTarget,
  diff: string = "",
  options: BuildPromptOptions = {},
): string {
  const parts: string[] = [];

  // Preamble with target metadata
  parts.push(buildPreamble(target));
  parts.push("");

  if (options.truncated && options.truncatedBytes && options.truncatedBytes > 0) {
    parts.push(
      `> Note: the diff was truncated (${options.truncatedBytes} bytes omitted from the middle).`,
    );
    parts.push("");
  }

  // Diff or custom instructions
  parts.push("## Changes to review");
  parts.push("");

  if (target.type === "custom") {
    parts.push(target.instructions);
  } else {
    parts.push("```diff");
    parts.push(diff);
    parts.push("```");
  }

  return parts.join("\n");
}

export function parseDiffStats(text: string): DiffStats {
  let files = 0;
  let additions = 0;
  let deletions = 0;
  let inDiff = false;

  for (const line of text.split("\n")) {
    if (line.startsWith("diff --git ")) {
      files++;
      inDiff = true;
    } else if (inDiff) {
      if (line.startsWith("+") && !line.startsWith("+++")) {
        additions++;
      } else if (line.startsWith("-") && !line.startsWith("---")) {
        deletions++;
      }
    }
  }

  return { files, additions, deletions };
}

function buildPreamble(target: ReviewTarget): string {
  const changedFilesLine =
    target.changedFiles && target.changedFiles.length > 0
      ? `**Changed files:** ${target.changedFiles.join(", ")}`
      : undefined;

  switch (target.type) {
    case "base-branch": {
      const stats = parseDiffStats(target.diff);
      const lines = [
        `# Review: changes on current branch vs ${target.branch}`,
        `**Target:** base branch \`${target.branch}\``,
        `**Files changed:** ${stats.files}`,
        `**Changes:** +${stats.additions} / -${stats.deletions} lines`,
      ];
      if (changedFilesLine) lines.push(changedFilesLine);
      return lines.join("\n");
    }
    case "uncommitted": {
      const stats = parseDiffStats(target.diff);
      const lines = [
        "# Review: uncommitted changes",
        "**Target:** working tree (staged + unstaged + untracked)",
        `**Files changed:** ${stats.files}`,
        `**Changes:** +${stats.additions} / -${stats.deletions} lines`,
      ];
      if (changedFilesLine) lines.push(changedFilesLine);
      return lines.join("\n");
    }
    case "commit": {
      const stats = parseDiffStats(target.show);
      const lines = [
        `# Review: commit ${target.sha}`,
        `**Target:** commit \`${target.sha}\``,
        `**Files changed:** ${stats.files}`,
        `**Changes:** +${stats.additions} / -${stats.deletions} lines`,
      ];
      if (changedFilesLine) lines.push(changedFilesLine);
      return lines.join("\n");
    }
    case "custom": {
      const lines = [
        "# Review: custom instructions",
        "**Target:** user-provided review task",
      ];
      if (changedFilesLine) lines.push(changedFilesLine);
      lines.push("No diff provided — follow the instructions below.");
      return lines.join("\n");
    }
  }
}
