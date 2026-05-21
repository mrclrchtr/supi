import { Type } from "typebox";

export const reviewFindingSchema = Type.Object({
  title: Type.String(),
  body: Type.String(),
  confidence_score: Type.Number(),
  priority: Type.Number(),
  code_location: Type.Object({
    absolute_file_path: Type.String(),
    line_range: Type.Object({
      start: Type.Number(),
      end: Type.Number(),
    }),
  }),
});

export const reviewOutputSchema = Type.Object({
  findings: Type.Array(reviewFindingSchema),
  overall_correctness: Type.String(),
  overall_explanation: Type.String(),
  overall_confidence_score: Type.Number(),
});

export const reviewBriefSchema = Type.Object({
  summary: Type.String(),
  intendedOutcome: Type.String(),
  constraints: Type.Array(Type.String()),
  focusAreas: Type.Array(Type.String()),
  riskyFiles: Type.Array(Type.String()),
  unresolvedQuestions: Type.Array(Type.String()),
});
