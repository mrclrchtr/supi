import type { ReviewTarget } from "./types.ts";

export interface BuildPromptOptions {
  truncated?: boolean;
  truncatedBytes?: number;
}

export function buildReviewPrompt(
  target: ReviewTarget,
  diff: string,
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

  parts.push("");
  parts.push(
    "Please review the changes above and call the submit_review tool with the required structure.",
  );

  return parts.join("\n");
}

function buildPreamble(target: ReviewTarget): string {
  switch (target.type) {
    case "base-branch": {
      const lines = [
        `# Review: changes on current branch vs ${target.branch}`,
        `**Target:** base branch \`${target.branch}\``,
        `**Files changed:** ${countFilesInDiff(target.diff)}`,
      ];
      return lines.join("\n");
    }
    case "uncommitted": {
      const lines = [
        "# Review: uncommitted changes",
        "**Target:** working tree (staged + unstaged + untracked)",
        `**Files changed:** ${countFilesInDiff(target.diff)}`,
      ];
      return lines.join("\n");
    }
    case "commit": {
      const lines = [`# Review: commit ${target.sha}`, `**Target:** commit \`${target.sha}\``];
      return lines.join("\n");
    }
    case "custom": {
      return "# Review: custom instructions\n**Target:** user-provided review task";
    }
  }
}

function countFilesInDiff(diff: string): number {
  if (!diff) return 0;
  const matches = diff.match(/^diff --git /gm);
  return matches ? matches.length : 0;
}
