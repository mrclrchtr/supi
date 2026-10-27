import { StringEnum } from "@earendil-works/pi-ai";
import { type Static, Type } from "typebox";
import { toDisplayPath } from "../../analysis/search/paths.ts";
import {
  PUBLIC_REFACTOR_OPERATION_NAMES,
  type RefactorPlanWorkflowOutcome,
} from "../../session/refactor-types.ts";

const Position = Type.Object(
  { line: Type.Integer({ minimum: 0 }), character: Type.Integer({ minimum: 0 }) },
  { additionalProperties: false },
);
const Edit = Type.Object(
  {
    file: Type.String(),
    range: Type.Object(
      { start: Position, end: Position },
      {
        additionalProperties: false,
        description: "Zero-based UTF-16 positions; end is exclusive.",
      },
    ),
    newText: Type.String(),
  },
  { additionalProperties: false },
);
const Candidate = Type.Object(
  {
    description: Type.String(),
    file: Type.Optional(Type.String()),
    line: Type.Optional(Type.Integer()),
    character: Type.Optional(Type.Integer()),
  },
  {
    additionalProperties: false,
    description:
      "Provider-reported candidate location, when available; one-based line and UTF-16 character.",
  },
);

/** Native plan data, including all edits rather than the bounded text preview. */
export const RefactorPlanOutputSchema = Type.Union([
  Type.Object(
    {
      kind: Type.Literal("completed"),
      planId: Type.String(),
      operation: StringEnum([...PUBLIC_REFACTOR_OPERATION_NAMES]),
      target: Type.Object(
        { file: Type.String(), line: Type.Integer(), character: Type.Integer() },
        { additionalProperties: false, description: "One-based line and UTF-16 character." },
      ),
      newName: Type.Optional(Type.String()),
      destination: Type.Optional(Type.String()),
      edits: Type.Array(Edit),
      fileCount: Type.Integer({ minimum: 0 }),
      editCount: Type.Integer({ minimum: 0 }),
      provenance: StringEnum(["semantic", "structural"]),
      nextAction: Type.Object(
        { tool: Type.Literal("code_refactor_apply"), planId: Type.String() },
        { additionalProperties: false },
      ),
    },
    { additionalProperties: false },
  ),
  Type.Object(
    {
      kind: Type.Literal("ambiguous"),
      candidates: Type.Array(Candidate),
      nextAction: Type.String(),
    },
    { additionalProperties: false },
  ),
  Type.Object(
    { kind: Type.Literal("invalid-input"), message: Type.String(), nextAction: Type.String() },
    { additionalProperties: false },
  ),
]);

/** Project public facts without plan authority, fingerprints, or document preconditions. */
export function structuredRefactorPlan(
  outcome: Exclude<RefactorPlanWorkflowOutcome, { kind: "unavailable" }>,
  cwd: string,
): Static<typeof RefactorPlanOutputSchema> {
  if (outcome.kind === "invalid-input")
    return {
      kind: outcome.kind,
      message: outcome.message,
      nextAction: "Fix the target or operation and retry",
    };
  if (outcome.kind === "ambiguous")
    return {
      kind: outcome.kind,
      candidates: outcome.candidates.map((candidate) => ({
        description: candidate.description,
        ...(candidate.file === undefined ? {} : { file: toDisplayPath(cwd, candidate.file) }),
        ...(candidate.line === undefined ? {} : { line: candidate.line }),
        ...(candidate.character === undefined ? {} : { character: candidate.character }),
      })),
      nextAction: "Use a precise target handle or anchor",
    };
  const plan = outcome.plan;
  const operation = PUBLIC_REFACTOR_OPERATION_NAMES.find((name) => name === plan.operation);
  if (operation === undefined) throw new Error(`Unsupported refactor operation: ${plan.operation}`);
  return {
    kind: "completed",
    planId: plan.id,
    operation,
    target: {
      file: toDisplayPath(cwd, plan.targetFile),
      line: plan.targetLine,
      character: plan.targetCharacter,
    },
    ...(plan.newName === undefined ? {} : { newName: plan.newName }),
    ...(plan.destination === undefined ? {} : { destination: plan.destination }),
    edits: plan.edits.edits.map((edit) => ({
      file: toDisplayPath(cwd, edit.file),
      range: {
        start: { line: edit.range.start.line, character: edit.range.start.character },
        end: { line: edit.range.end.line, character: edit.range.end.character },
      },
      newText: edit.newText,
    })),
    fileCount: new Set(plan.edits.edits.map((edit) => edit.file)).size,
    editCount: plan.edits.edits.length,
    provenance: plan.evidenceSource ?? "semantic",
    nextAction: { tool: "code_refactor_apply", planId: plan.id },
  };
}
