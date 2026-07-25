import { StringEnum } from "@earendil-works/pi-ai";
import { Type } from "typebox";

const reviewItemCategorySchema = StringEnum([
  "correctness",
  "security",
  "performance",
  "api",
  "test-gap",
  "docs",
  "cleanup",
  "maintainer",
] as const);

const reviewItemImpactSchema = StringEnum(["low", "medium", "high"] as const);

const reviewItemEffortSchema = StringEnum(["low", "medium", "high"] as const);

const reviewItemRecommendedActionSchema = StringEnum([
  "must-fix",
  "should-fix",
  "consider",
] as const);

const reviewInstructionBlockIdSchema = StringEnum([
  "public-surface",
  "cross-layer",
  "schema-widening",
  "cleanup",
] as const);

export const reviewItemSchema = Type.Object({
  title: Type.String(),
  body: Type.String(),
  category: reviewItemCategorySchema,
  impact: reviewItemImpactSchema,
  effort: reviewItemEffortSchema,
  recommended_action: reviewItemRecommendedActionSchema,
  confidence_score: Type.Number({ minimum: 0, maximum: 1 }),
  suggested_fix: Type.String(),
  verification_hint: Type.String(),
  code_location: Type.Optional(
    Type.Object({
      absolute_file_path: Type.String(),
      line_range: Type.Object({
        start: Type.Number(),
        end: Type.Number(),
      }),
    }),
  ),
});

export const reviewOutputSchema = Type.Object({
  items: Type.Array(reviewItemSchema),
  overall_explanation: Type.String(),
  overall_confidence_score: Type.Number({ minimum: 0, maximum: 1 }),
});

const briefRequiredTextSchema = Type.String({ minLength: 1, maxLength: 4_000 });
const briefListItemSchema = Type.String({ minLength: 1, maxLength: 2_000 });

export const reviewBriefSchema = Type.Object({
  summary: briefRequiredTextSchema,
  intendedOutcome: briefRequiredTextSchema,
  constraints: Type.Array(briefListItemSchema, { maxItems: 50 }),
  focusAreas: Type.Array(briefListItemSchema, { maxItems: 50 }),
  riskyFiles: Type.Array(briefListItemSchema, { maxItems: 200 }),
  unresolvedQuestions: Type.Array(briefListItemSchema, { maxItems: 50 }),
  reviewInstructionBlockIds: Type.Array(reviewInstructionBlockIdSchema, { maxItems: 4 }),
});
