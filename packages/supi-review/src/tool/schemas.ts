import { StringEnum } from "@earendil-works/pi-ai";
import { Type } from "typebox";

export const reviewTaskSchema = Type.Object(
  {
    id: Type.String({
      minLength: 1,
      maxLength: 64,
      description: "Stable caller-defined task id, such as standards or spec.",
    }),
    instructions: Type.String({
      minLength: 1,
      description: "Complete freeform methodology and acceptance instructions for this task.",
    }),
  },
  { additionalProperties: false },
);

export const reviewInputSchema = Type.Object(
  {
    sharedContext: Type.Optional(
      Type.String({ description: "Optional context shared unchanged with every task." }),
    ),
    tasks: Type.Array(reviewTaskSchema, {
      minItems: 1,
      maxItems: 4,
      description: "One to four independent tasks executed concurrently in caller order.",
    }),
  },
  { additionalProperties: false },
);

export const reviewFindingSchema = Type.Object(
  {
    title: Type.String({ minLength: 1, description: "Concise finding title." }),
    description: Type.String({
      minLength: 1,
      description: "Concrete evidence-backed explanation of the issue.",
    }),
    blocksAcceptance: Type.Boolean({
      description: "Whether this finding must be corrected before accepting the change.",
    }),
    impact: StringEnum(["low", "medium", "high"] as const, {
      description: "Downside if the issue remains unfixed.",
    }),
    effort: StringEnum(["small", "medium", "large"] as const, {
      description: "Estimated size of the correction.",
    }),
    confidence: Type.Number({
      minimum: 0,
      maximum: 1,
      description: "Confidence from 0 through 1; findings are never threshold-filtered.",
    }),
    location: Type.Optional(
      Type.Object(
        {
          path: Type.String({ minLength: 1, description: "Repository-relative target path." }),
          startLine: Type.Integer({ minimum: 1 }),
          endLine: Type.Integer({ minimum: 1 }),
        },
        { additionalProperties: false },
      ),
    ),
  },
  { additionalProperties: false },
);

export const reviewSubmissionSchema = Type.Object(
  {
    summary: Type.String({ minLength: 1, description: "Task-level review summary." }),
    findings: Type.Array(reviewFindingSchema, {
      description: "Findings in the reviewer's intended order; use an empty array when none exist.",
    }),
  },
  { additionalProperties: false },
);

export const plannerDraftSchema = reviewInputSchema;
