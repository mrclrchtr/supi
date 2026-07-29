import { StringEnum } from "@earendil-works/pi-ai";
import { Type } from "typebox";
import { REVIEW_LIMITS } from "../review-limits.ts";

/** TypeBox schema for one caller-defined review task (provider-visible). */
export const reviewTaskSchema = Type.Object(
  {
    id: Type.String({
      minLength: 1,
      maxLength: REVIEW_LIMITS.taskIdCharacters,
      pattern: "\\S",
      description: "Unique task id used to match its result, such as standards or spec.",
    }),
    instructions: Type.String({
      minLength: 1,
      maxLength: REVIEW_LIMITS.taskInstructionCharacters,
      pattern: "\\S",
      description:
        "Self-contained review objective and criteria. Tasks run independently and cannot see each other's progress.",
    }),
    findingScope: Type.Optional(
      StringEnum(["change-only", "boy-scout"] as const, {
        default: "change-only",
        description:
          "change-only reports issues attributable to the target. boy-scout may also report directly related pre-existing issues, which stay advisory unless the target worsens or newly exposes them.",
      }),
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
        description: "Context copied to every reviewer; omit task-specific instructions.",
      }),
    ),
    tasks: Type.Array(reviewTaskSchema, {
      minItems: 1,
      maxItems: 4,
      description:
        "One to four independent tasks, in caller order. Task ids must be unique; tasks run concurrently.",
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
      description: "True only when the change should not be accepted until this is corrected.",
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
            description: "Target-relative path only; do not use absolute paths or .. segments.",
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
  },
  { additionalProperties: false },
);

/** Planner Draft uses the same shape as review input (shared context + tasks). */
export const plannerDraftSchema = reviewInputSchema;
