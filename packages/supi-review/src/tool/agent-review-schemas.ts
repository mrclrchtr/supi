import { StringEnum } from "@earendil-works/pi-ai";
import { type Static, Type } from "typebox";
import { reviewBriefSchema } from "./schemas.ts";

const reviewTargetSchema = Type.Object(
  {
    kind: StringEnum(["working-tree", "branch", "commit"] as const, {
      description: 'Review target kind. Defaults to "working-tree" when target is omitted.',
    }),
    base: Type.Optional(
      Type.String({ description: 'Required local base branch when kind is "branch".' }),
    ),
    sha: Type.Optional(Type.String({ description: 'Required commit SHA when kind is "commit".' })),
  },
  { additionalProperties: false },
);

const briefFieldSchema = StringEnum(
  [
    "summary",
    "intendedOutcome",
    "constraints",
    "focusAreas",
    "riskyFiles",
    "unresolvedQuestions",
    // biome-ignore lint/security/noSecrets: public brief field name, not a secret
    "reviewInstructionBlockIds",
  ] as const,
  { description: "Generated brief field being evaluated." },
);

const critiqueFindingSchema = Type.Object(
  {
    kind: StringEnum(["omission", "unsupported-inference", "misprioritized", "unclear"] as const, {
      description: "Class of brief defect.",
    }),
    field: briefFieldSchema,
    explanation: Type.String({
      minLength: 1,
      maxLength: 2_000,
      description: "What is wrong with this part of the generated brief.",
    }),
    evidence: Type.String({
      minLength: 1,
      maxLength: 2_000,
      description: "Session or snapshot evidence supporting the criticism.",
    }),
    proposedChange: Type.String({
      minLength: 1,
      maxLength: 2_000,
      description: "Concrete change that would improve the brief.",
    }),
  },
  { additionalProperties: false },
);

const briefCritiqueSchema = Type.Object(
  {
    verdict: StringEnum(["accept", "revise"] as const, {
      description: 'Use "revise" when the generated brief should be changed before review.',
    }),
    summary: Type.String({
      minLength: 1,
      maxLength: 2_000,
      description: "Concise assessment of the generated brief.",
    }),
    findings: Type.Array(critiqueFindingSchema, {
      maxItems: 20,
      description: "Evidence-backed defects; use an empty array when accepting without criticism.",
    }),
  },
  { additionalProperties: false },
);

const reviewerAssignmentSchema = Type.Object(
  {
    id: Type.String({
      minLength: 1,
      maxLength: 64,
      description: 'Stable short label such as "standards" or "spec".',
    }),
    focus: Type.String({
      minLength: 1,
      maxLength: 2_000,
      description: "Independent review focus delegated to this reviewer child session.",
    }),
  },
  { additionalProperties: false },
);

/** Agent-facing schema for preparing a session-aware review plan. */
export const prepareAgentReviewSchema = Type.Object(
  {
    target: Type.Optional(reviewTargetSchema),
    note: Type.Optional(
      Type.String({
        maxLength: 4_000,
        description: "Optional intent or constraint to emphasize during brief synthesis.",
      }),
    ),
  },
  { additionalProperties: false },
);

/** Agent-facing schema for critiquing a prepared brief and running focused reviewers. */
export const runAgentReviewSchema = Type.Object(
  {
    planId: Type.String({
      minLength: 1,
      description: "Session-scoped plan id returned by supi_review_prepare.",
    }),
    critique: briefCritiqueSchema,
    revisedBrief: Type.Optional(reviewBriefSchema),
    reviewers: Type.Array(reviewerAssignmentSchema, {
      minItems: 1,
      maxItems: 4,
      description: "One to four independent reviewer assignments run concurrently.",
    }),
  },
  { additionalProperties: false },
);

/** Validated input accepted by `supi_review_prepare`. */
export type PrepareAgentReviewInput = Static<typeof prepareAgentReviewSchema>;
/** Validated input accepted by `supi_review_run`. */
export type RunAgentReviewInput = Static<typeof runAgentReviewSchema>;
