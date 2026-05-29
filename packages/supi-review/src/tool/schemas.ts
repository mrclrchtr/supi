import { Type } from "typebox";

const reviewItemCategorySchema = Type.Union([
  Type.Literal("correctness"),
  Type.Literal("security"),
  Type.Literal("performance"),
  Type.Literal("api"),
  Type.Literal("test-gap"),
  Type.Literal("docs"),
  Type.Literal("cleanup"),
  Type.Literal("maintainer"),
]);

const reviewItemImpactSchema = Type.Union([
  Type.Literal("low"),
  Type.Literal("medium"),
  Type.Literal("high"),
]);

const reviewItemEffortSchema = Type.Union([
  Type.Literal("low"),
  Type.Literal("medium"),
  Type.Literal("high"),
]);

const reviewItemRecommendedActionSchema = Type.Union([
  Type.Literal("must-fix"),
  Type.Literal("should-fix"),
  Type.Literal("consider"),
]);

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

export const reviewBriefSchema = Type.Object({
  summary: Type.String(),
  intendedOutcome: Type.String(),
  constraints: Type.Array(Type.String()),
  focusAreas: Type.Array(Type.String()),
  riskyFiles: Type.Array(Type.String()),
  unresolvedQuestions: Type.Array(Type.String()),
});
