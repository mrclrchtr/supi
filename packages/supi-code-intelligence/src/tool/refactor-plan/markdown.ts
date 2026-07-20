import { renderEvidenceListDisclosure } from "../../analysis/evidence.ts";
import { toDisplayPath } from "../../analysis/search/paths.ts";
import { assembledNextQueries } from "../result/assembly.ts";
import type {
  RefactorApplyResultAssembly,
  RefactorPlanResultAssembly,
} from "../result/refactor.ts";

/** Render a refactor plan from its canonical assembled evidence. */
export function renderRefactorPlanResult(assembly: RefactorPlanResultAssembly): string {
  const { plan, cwd, edits } = assembly.assembled.data;
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
  lines.push(`**Confidence:** \`${assembly.assembled.confidence}\``);
  lines.push(`**Files to change:** ${fileCount} file${fileCount !== 1 ? "s" : ""}`);
  lines.push(`**Total edits:** ${assembly.assembled.totals.candidateCount}`);
  lines.push(`**Shown edits:** ${edits.metadata.shownCount}`);
  lines.push(`**Omitted edits:** ${assembly.assembled.totals.omittedCount}`);
  lines.push("");

  lines.push("## Files");
  for (const [file, count] of changedFiles) {
    lines.push(`- \`${toDisplayPath(cwd, file)}\` — ${count} edit${count !== 1 ? "s" : ""}`);
  }
  lines.push("");
  lines.push("## Preview");
  lines.push("");
  for (const edit of edits.items) {
    const range = edit.range;
    lines.push(
      `- \`${toDisplayPath(cwd, edit.file)}\` L${range.start.line + 1}:${range.start.character} → L${range.end.line + 1}:${range.end.character}`,
    );
    lines.push("  ```");
    lines.push(`  ${edit.newText.split("\n").join("\n  ")}`);
    lines.push("  ```");
  }
  const disclosure = renderEvidenceListDisclosure(edits);
  if (disclosure) {
    lines.push(disclosure);
  }
  lines.push("");
  lines.push("**This is a preview. No files were changed.**");
  lines.push(...assembledNextQueries(assembly.assembled));
  return lines.join("\n");
}

/** Render a refactor apply outcome from its canonical assembled facts. */
export function renderRefactorApplyResult(assembly: RefactorApplyResultAssembly): string {
  const { plan, result } = assembly.assembled.data;
  if (result.kind === "error") {
    return `**Refactor apply failed:** ${result.reason}`;
  }

  const lines = [
    `**Refactor applied successfully.** Plan: \`${plan.id}\``,
    `- Operation: \`${plan.operation}\``,
    `- Confidence: \`${assembly.assembled.confidence}\``,
    `- Files changed: ${result.filesChanged}`,
    `- Total edits: ${result.totalEdits}`,
  ];
  if (plan.newName) {
    lines.push(`- New name: \`${plan.newName}\``);
  }
  if (plan.destination) {
    lines.push(`- Destination: \`${plan.destination}\``);
  }
  const followUps = assembledNextQueries(assembly.assembled);
  if (followUps.length > 0) lines.push("", ...followUps);
  return lines.join("\n");
}

function collectChangedFiles(
  plan: RefactorPlanResultAssembly["assembled"]["data"]["plan"],
): Array<[file: string, count: number]> {
  const counts = new Map<string, number>();
  for (const edit of plan.edits.edits) {
    counts.set(edit.file, (counts.get(edit.file) ?? 0) + 1);
  }
  return [...counts.entries()];
}
