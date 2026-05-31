/**
 * Markdown renderer for refactor results.
 */

import type { ApplyResult } from "../../analysis/refactor/apply-workspace-edit.ts";
import type { RefactorPlan } from "../../analysis/refactor/plan-store.ts";
import { toDisplayPath } from "../../search-helpers.ts";

export interface RefactorRenderInput {
  result: ApplyResult;
  operation: string;
  targetDescription: string;
}

/**
 * Render a refactor result as human-readable markdown.
 */
export function renderRefactorResult(input: RefactorRenderInput): string {
  const { result, operation, targetDescription } = input;

  if (result.kind === "error") {
    return `**Refactor failed:** ${result.reason}`;
  }

  return [
    `**Refactor applied:** ${operation} on ${targetDescription}`,
    `- Files changed: ${result.filesChanged}`,
    `- Total edits: ${result.totalEdits}`,
  ].join("\n");
}

/**
 * Render a refactor plan preview.
 */
export function renderRefactorPlanResult(plan: RefactorPlan, cwd: string): string {
  const lines: string[] = [];
  const changedFiles = collectChangedFiles(plan);
  const fileCount = changedFiles.length;

  lines.push(`# Refactor Plan: ${plan.operation}`);
  lines.push("");
  lines.push(`**Plan ID:** \`${plan.id}\``);
  lines.push(`**Operation:** \`${plan.operation}\``);
  lines.push(
    `**Target:** \`${toDisplayPath(cwd, plan.targetFile)}\`:${plan.targetLine}:${plan.targetCharacter}`,
  );
  if (plan.newName) {
    lines.push(`**New name:** \`${plan.newName}\``);
  }
  if (plan.destination) {
    lines.push(`**Destination:** \`${plan.destination}\``);
  }
  lines.push(`**Files to change:** ${fileCount} file${fileCount !== 1 ? "s" : ""}`);
  lines.push(`**Total edits:** ${plan.edits.edits.length}`);
  lines.push("");

  lines.push("## Files");
  for (const [file, count] of changedFiles) {
    lines.push(`- \`${toDisplayPath(cwd, file)}\` — ${count} edit${count !== 1 ? "s" : ""}`);
  }
  lines.push("");
  lines.push("## Preview");
  lines.push("");
  for (const edit of plan.edits.edits.slice(0, 5)) {
    const range = edit.range;
    lines.push(
      `- \`${toDisplayPath(cwd, edit.file)}\` L${range.start.line + 1}:${range.start.character} → L${range.end.line + 1}:${range.end.character}`,
    );
    lines.push("  ```");
    lines.push(`  ${edit.newText.slice(0, 80).split("\n").join("\n  ")}`);
    lines.push("  ```");
  }
  if (plan.edits.edits.length > 5) {
    lines.push(`_+${plan.edits.edits.length - 5} more edits_`);
  }
  lines.push("");
  lines.push("**This is a preview. No files were changed.**");
  lines.push(`Use code_apply with planId: "${plan.id}" to apply this refactor.`);
  return lines.join("\n");
}

/**
 * Render a refactor apply result.
 */
export function renderRefactorApplyResult(applyResult: ApplyResult, plan: RefactorPlan): string {
  if (applyResult.kind === "error") {
    return `**Refactor apply failed:** ${applyResult.reason}`;
  }
  const lines = [
    `**Refactor applied successfully.** Plan: \`${plan.id}\``,
    `- Operation: \`${plan.operation}\``,
    `- Files changed: ${applyResult.filesChanged}`,
    `- Total edits: ${applyResult.totalEdits}`,
  ];
  if (plan.newName) {
    lines.push(`- New name: \`${plan.newName}\``);
  }
  if (plan.destination) {
    lines.push(`- Destination: \`${plan.destination}\``);
  }
  lines.push("", "Verify the changes before continuing with other work.");
  return lines.join("\n");
}

function collectChangedFiles(plan: RefactorPlan): Array<[file: string, count: number]> {
  const counts = new Map<string, number>();
  for (const edit of plan.edits.edits) {
    counts.set(edit.file, (counts.get(edit.file) ?? 0) + 1);
  }
  return [...counts.entries()];
}
