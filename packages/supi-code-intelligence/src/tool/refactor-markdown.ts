import { renderEvidenceListDisclosure } from "../analysis/evidence.ts";
import { toDisplayPath } from "../analysis/search/paths.ts";
import { assembledNextQueries } from "./result/assembly.ts";
import type { RefactorApplyResultAssembly, RefactorPlanResultAssembly } from "./result/refactor.ts";
import { buildRefactorPreview, type RefactorPreviewEntry } from "./result/refactor-preview.ts";

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
  lines.push(`**${plan.target ? "Target" : "File"}:** ${formatPlanScope(plan, cwd)}`);
  if (plan.newName) {
    lines.push(`**New name:** \`${plan.newName}\``);
  }
  if (plan.action) {
    lines.push(`**Action:** ${plan.action.title} (\`${plan.action.kind}\`)`);
    const source = actionSource(plan.action.provenance);
    if (source) lines.push(`**Source:** ${source}`);
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
  for (const entry of buildRefactorPreview(edits.items)) {
    lines.push(...renderPreviewEntry(entry, cwd));
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
  if (plan.action) {
    lines.push(`- Action: ${plan.action.title} (\`${plan.action.kind}\`)`);
  }
  const followUps = assembledNextQueries(assembly.assembled);
  if (followUps.length > 0) lines.push("", ...followUps);
  return lines.join("\n");
}

/** Render the operation scope: a rename target point, a code-action range, or a whole file. */
function formatPlanScope(
  plan: RefactorPlanResultAssembly["assembled"]["data"]["plan"],
  cwd: string,
): string {
  const file = `\`${toDisplayPath(cwd, plan.file)}\``;
  if (plan.target) return `${file}:${plan.target.line}:${plan.target.character}`;
  if (plan.range) {
    const { start, end } = plan.range;
    return `${file} L${start.line}:${start.character} → L${end.line}:${end.character}`;
  }
  return `${file} (whole file)`;
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

/** Describe how a code-action plan obtained its edits. */
function actionSource(provenance: "edit" | "captured-command" | undefined): string | null {
  if (provenance === "edit") return "code action edit";
  if (provenance === "captured-command") {
    return "edit captured from the server command; it was refused, not applied";
  }
  return null;
}

/** Render one server edit as its replacement text, or a combined line as before/after. */
function renderPreviewEntry(entry: RefactorPreviewEntry, cwd: string): string[] {
  if (entry.kind === "line") {
    const at = `L${entry.line + 1}`;
    return [
      `- \`${toDisplayPath(cwd, entry.file)}\` ${at}:${entry.startCharacter + 1} → ${at}:${entry.endCharacter + 1} (${entry.editCount} edits)`,
      "  ```",
      `  - ${entry.before}`,
      `  + ${entry.after}`,
      "  ```",
    ];
  }
  const { edit } = entry;
  const range = edit.range;
  return [
    `- \`${toDisplayPath(cwd, edit.file)}\` L${range.start.line + 1}:${range.start.character + 1} → L${range.end.line + 1}:${range.end.character + 1}`,
    "  ```",
    `  ${edit.newText.split("\n").join("\n  ")}`,
    "  ```",
  ];
}
