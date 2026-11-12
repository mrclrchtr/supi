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
const OnePosition = Type.Object(
  { line: Type.Integer({ minimum: 1 }), character: Type.Integer({ minimum: 1 }) },
  { additionalProperties: false },
);
const Action = Type.Object(
  { kind: Type.String(), title: Type.String() },
  { additionalProperties: false, description: "Server-reported code action kind and title." },
);
const Candidate = Type.Object(
  {
    description: Type.String(),
    kind: Type.Optional(Type.String()),
    title: Type.Optional(
      Type.String({ description: "Pass back as the operation `title` to select this action." }),
    ),
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

/** Guidance for choosing among matching code actions. */
export const AMBIGUOUS_NEXT_ACTION =
  "Several matching actions produce different edits; repeat the call with one candidate's exact `title`";

/** Native plan data, including all edits rather than the bounded text preview. */
export const RefactorPlanOutputSchema = Type.Union([
  Type.Object(
    {
      kind: Type.Literal("completed"),
      planId: Type.String(),
      operation: Type.Enum([...PUBLIC_REFACTOR_OPERATION_NAMES], { type: "string" }),
      file: Type.String({ description: "File the operation was requested for." }),
      target: Type.Optional(
        Type.Object(
          { line: Type.Integer(), character: Type.Integer() },
          {
            additionalProperties: false,
            description: "rename_symbol target; one-based line and UTF-16 character.",
          },
        ),
      ),
      range: Type.Optional(
        Type.Object(
          { start: OnePosition, end: OnePosition },
          {
            additionalProperties: false,
            description: "code_action range; one-based positions, end exclusive.",
          },
        ),
      ),
      newName: Type.Optional(Type.String()),
      action: Type.Optional(Action),
      edits: Type.Array(Edit),
      fileCount: Type.Integer({ minimum: 0 }),
      editCount: Type.Integer({ minimum: 0 }),
      provenance: Type.Enum(["semantic", "structural"], { type: "string" }),
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
      nextAction: "Fix the operation input and retry",
    };
  if (outcome.kind === "ambiguous")
    return {
      kind: outcome.kind,
      candidates: outcome.candidates.map((candidate) => ({
        description: candidate.description,
        ...(candidate.kind === undefined ? {} : { kind: candidate.kind }),
        ...(candidate.title === undefined ? {} : { title: candidate.title }),
        ...(candidate.file === undefined ? {} : { file: toDisplayPath(cwd, candidate.file) }),
        ...(candidate.line === undefined ? {} : { line: candidate.line }),
        ...(candidate.character === undefined ? {} : { character: candidate.character }),
      })),
      nextAction: AMBIGUOUS_NEXT_ACTION,
    };
  const plan = outcome.plan;
  const operation = PUBLIC_REFACTOR_OPERATION_NAMES.find((name) => name === plan.operation);
  if (operation === undefined) throw new Error(`Unsupported refactor operation: ${plan.operation}`);
  return {
    kind: "completed",
    planId: plan.id,
    operation,
    file: toDisplayPath(cwd, plan.file),
    ...(plan.target === undefined ? {} : { target: { ...plan.target } }),
    ...(plan.range === undefined
      ? {}
      : {
          range: {
            start: { ...plan.range.start },
            end: { ...plan.range.end },
          },
        }),
    ...(plan.newName === undefined ? {} : { newName: plan.newName }),
    ...(plan.action === undefined ? {} : { action: { ...plan.action } }),
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
