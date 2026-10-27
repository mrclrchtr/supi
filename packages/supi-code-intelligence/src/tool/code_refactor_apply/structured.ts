import { type Static, Type } from "typebox";
import { toDisplayPath } from "../../analysis/search/paths.ts";
import type { RefactorApplyWorkflowOutcome } from "../../session/refactor-types.ts";

/** Native application outcome, separate from recovery's absolute changed-file paths. */
export const RefactorApplyOutputSchema = Type.Union([
  Type.Object(
    {
      kind: Type.Literal("applied"),
      planId: Type.String(),
      files: Type.Array(
        Type.Object(
          { file: Type.String(), editCount: Type.Integer({ minimum: 0 }) },
          { additionalProperties: false },
        ),
      ),
      fileCount: Type.Integer({ minimum: 0 }),
      editCount: Type.Integer({ minimum: 0 }),
    },
    { additionalProperties: false },
  ),
  Type.Object(
    { kind: Type.Literal("invalid-input"), message: Type.String(), nextAction: Type.String() },
    { additionalProperties: false },
  ),
]);

/** Project applied file counts without exposing the stored plan. */
export function structuredRefactorApply(
  outcome: Exclude<RefactorApplyWorkflowOutcome, { kind: "unavailable" }>,
  cwd: string,
): Static<typeof RefactorApplyOutputSchema> {
  if (outcome.kind === "invalid-input")
    return {
      kind: outcome.kind,
      message: outcome.message,
      nextAction: "Generate a fresh plan with code_refactor_plan",
    };
  const counts = new Map<string, number>();
  for (const edit of outcome.plan.edits.edits)
    counts.set(edit.file, (counts.get(edit.file) ?? 0) + 1);
  return {
    kind: "applied",
    planId: outcome.plan.id,
    files: [...counts].map(([file, editCount]) => ({ file: toDisplayPath(cwd, file), editCount })),
    fileCount: outcome.result.filesChanged,
    editCount: outcome.result.totalEdits,
  };
}
