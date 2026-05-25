/**
 * Markdown renderer for refactor results.
 */
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
