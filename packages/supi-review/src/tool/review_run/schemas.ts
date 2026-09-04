import { StringEnum } from "@earendil-works/pi-ai";
import { Type } from "typebox";
import { REVIEW_LIMITS } from "../../review-limits.ts";

/** TypeBox schema for one caller-defined review task (provider-visible). */
export const reviewTaskSchema = Type.Object(
  {
    id: Type.String({
      minLength: 1,
      maxLength: REVIEW_LIMITS.taskIdCharacters,
      pattern: "\\S",
      description: "Task id for its result, such as standards or spec.",
    }),
    instructions: Type.String({
      minLength: 1,
      maxLength: REVIEW_LIMITS.taskInstructionCharacters,
      pattern: "\\S",
      description: "Self-contained review objective and criteria for one task.",
    }),
    mode: StringEnum(["change", "state"] as const, {
      description:
        "Evidence view: change uses one non-empty before-and-after change; state uses only the frozen after state.",
    }),
    criteriaSources: Type.Optional(
      Type.Array(
        Type.Object(
          {
            reference: Type.String({
              minLength: 1,
              maxLength: REVIEW_LIMITS.criteriaReferenceCharacters,
              pattern: "\\S",
              description: "Issue reference, URL, or repository-relative document path.",
            }),
            summary: Type.String({
              minLength: 1,
              maxLength: REVIEW_LIMITS.criteriaSummaryCharacters,
              pattern: "\\S",
              description: "Source summary; the reviewer retrieves more detail only when needed.",
            }),
          },
          { additionalProperties: false },
        ),
        {
          minItems: 1,
          maxItems: REVIEW_LIMITS.criteriaSourcesPerTask,
          description: "Authoritative sources for this task's Review Criteria.",
        },
      ),
    ),
  },
  { additionalProperties: false },
);

/** TypeBox schema for the complete review input (provider-visible). */
export const reviewInputSchema = Type.Object(
  {
    sharedContext: Type.Optional(
      Type.String({
        maxLength: REVIEW_LIMITS.sharedContextCharacters,
        pattern: "\\S",
        description: "Context for all tasks; exclude task-specific instructions.",
      }),
    ),
    tasks: Type.Array(reviewTaskSchema, {
      minItems: 1,
      maxItems: 4,
      description: "Results keep caller order; task ids must be unique.",
    }),
  },
  {
    additionalProperties: false,
    description: "Complete reviewer context and one to four independent Review Tasks.",
  },
);

/** TypeBox schema for a single structured finding (provider-visible). */
export const reviewFindingSchema = Type.Object(
  {
    title: Type.String({
      minLength: 1,
      maxLength: REVIEW_LIMITS.findingTitleCharacters,
      pattern: "\\S",
      description: "Short, specific assertion of one problem.",
    }),
    description: Type.String({
      minLength: 1,
      maxLength: REVIEW_LIMITS.findingDescriptionCharacters,
      pattern: "\\S",
      description: "Concrete evidence, consequence, and needed correction.",
    }),
    blocksAcceptance: Type.Boolean({
      description:
        "True only when the reviewed target should not be accepted as satisfying the Review Task until this is corrected.",
    }),
    impact: StringEnum(["low", "medium", "high"] as const, {
      description: "Downside if unfixed, not the size of the correction.",
    }),
    effort: StringEnum(["small", "medium", "large"] as const, {
      description: "Estimated correction size, not issue severity.",
    }),
    confidence: Type.Number({
      minimum: 0,
      maximum: 1,
      description: "Evidence confidence from 0 through 1; no confidence threshold is applied.",
    }),
    location: Type.Optional(
      Type.Object(
        {
          path: Type.String({
            minLength: 1,
            maxLength: REVIEW_LIMITS.locationPathCharacters,
            description:
              "Target-relative path only; a leading @ is accepted. Do not use absolute paths or .. segments.",
          }),
          startLine: Type.Integer({ minimum: 1, description: "First 1-based inclusive line." }),
          endLine: Type.Optional(
            Type.Integer({
              minimum: 1,
              description:
                "Last 1-based inclusive line; omit for a single-line finding, otherwise must be at least startLine.",
            }),
          ),
        },
        {
          additionalProperties: false,
          description: "Optional exact source span for this finding.",
        },
      ),
    ),
  },
  { additionalProperties: false },
);

/** TypeBox schema for the submit_review tool parameters (provider-visible). */
export const reviewSubmissionSchema = Type.Object(
  {
    summary: Type.String({
      minLength: 1,
      maxLength: REVIEW_LIMITS.summaryCharacters,
      pattern: "\\S",
      description: "Brief task conclusion, required even when findings is empty.",
    }),
    findings: Type.Array(reviewFindingSchema, {
      maxItems: REVIEW_LIMITS.findingsPerTask,
      description: "Findings in intended order; use [] after a clean review (at most 20 findings).",
    }),
    criteriaCoverage: Type.Object(
      {
        status: StringEnum(["complete", "incomplete"] as const, {
          description:
            "complete when the supplied Review Criteria were sufficient (this includes a clean review); incomplete only when an identified Review Criteria source was actually unavailable.",
        }),
        reason: Type.Optional(
          Type.String({
            minLength: 1,
            maxLength: REVIEW_LIMITS.criteriaCoverageReasonCharacters,
            pattern: "\\S",
            description: "Use only when status is incomplete; omit it when status is complete.",
          }),
        ),
      },
      {
        additionalProperties: false,
        description:
          "Required structured criteria coverage statement; a clean review with sufficient criteria must report complete, and incomplete coverage cannot support a definitive verdict on its own.",
      },
    ),
  },
  { additionalProperties: false },
);

/** Provider-visible Planner Draft task. Criteria sources remain caller-authored. */
const plannerDraftTaskSchema = Type.Object(
  {
    id: reviewTaskSchema.properties.id,
    instructions: reviewTaskSchema.properties.instructions,
    mode: reviewTaskSchema.properties.mode,
  },
  { additionalProperties: false },
);

/** Provider-visible Planner Draft input without caller-only criteria sources. */
export const plannerDraftSchema = Type.Object(
  {
    sharedContext: reviewInputSchema.properties.sharedContext,
    tasks: Type.Array(plannerDraftTaskSchema, {
      minItems: 1,
      maxItems: 4,
      description:
        "One to four independent Planner Draft tasks, in caller order. Tasks run concurrently after the caller edits them.",
    }),
  },
  {
    additionalProperties: false,
    description: "Optional shared context and one to four Planner Draft tasks.",
  },
);
