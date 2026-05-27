/**
 * Markdown renderer for refactor results.
 */

import type { RefactorPlan } from "../../analysis/refactor/plan-store.ts";
import type { ApplyResult } from "../../refactor/apply-workspace-edit.ts";

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
export function renderRefactorPlanResult(plan: RefactorPlan): string {
  const lines: string[] = [];
  lines.push(`# Refactor Plan: ${plan.operation} \`${plan.newName}\``);
  lines.push("");
  lines.push(`**Plan ID:** \`${plan.id}\``);
  lines.push(`**Target:** \`${plan.targetFile}\`:${plan.targetLine}:${plan.targetCharacter}`);
  lines.push(
    `**Files to change:** ${plan.edits.edits.length} file${plan.edits.edits.length !== 1 ? "s" : ""}`,
  );
  lines.push(`**Total edits:** ${plan.edits.edits.length}`);
  lines.push("");

  const changedFiles = new Set(plan.edits.edits.map((e) => e.file));
  lines.push("## Files");
  for (const file of changedFiles) {
    const fileEdits = plan.edits.edits.filter((e) => e.file === file);
    lines.push(`- \`${file}\` — ${fileEdits.length} edit${fileEdits.length !== 1 ? "s" : ""}`);
  }
  lines.push("");
  lines.push("## Preview");
  lines.push("");
  for (const edit of plan.edits.edits.slice(0, 5)) {
    const r = edit.range;
    lines.push(
      `- \`${plan.targetFile}\` L${r.start.line + 1}:${r.start.character} → L${r.end.line + 1}:${r.end.character}`,
    );
    lines.push(`  \`\`\``);
    lines.push(`  ${edit.newText.slice(0, 80).split("\n").join("\n  ")}`);
    lines.push(`  \`\`\``);
  }
  if (plan.edits.edits.length > 5) {
    lines.push(`_+${plan.edits.edits.length - 5} more edits_`);
  }
  lines.push("");
  lines.push("**This is a preview. No files were changed.**");
  lines.push(`Use code_refactor_apply with planId: "${plan.id}" to apply this rename.`);
  return lines.join("\n");
}

/**
 * Render a refactor apply result.
 */
export function renderRefactorApplyResult(applyResult: ApplyResult, planId: string): string {
  if (applyResult.kind === "error") {
    return `**Refactor apply failed:** ${applyResult.reason}`;
  }
  return [
    `**Refactor applied successfully.** Plan: \`${planId}\``,
    `- Files changed: ${applyResult.filesChanged}`,
    `- Total edits: ${applyResult.totalEdits}`,
    "",
    "Verify the changes before continuing with other work.",
  ].join("\n");
}
