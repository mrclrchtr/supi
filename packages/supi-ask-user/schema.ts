// External (model-facing) parameter schema for the `ask_user` tool.
// Rich-TUI-first redesign: explicit question kinds, explicit escape hatches,
// and first-class option previews for structured comparisons.

import { type Static, Type } from "typebox";

const StructuredOptionSchema = Type.Object({
  value: Type.String({ description: "Stable identifier returned in the answer" }),
  label: Type.String({ description: "Display label shown to the user" }),
  description: Type.Optional(
    Type.String({ description: "Optional one-line clarification shown under the label" }),
  ),
  preview: Type.Optional(
    Type.String({
      description:
        "Optional rich preview content shown in the TUI (markdown, code, or ASCII mockups)",
    }),
  ),
});

const StructuredQuestionBaseSchema = {
  id: Type.String({ description: "Unique question id within this questionnaire" }),
  header: Type.String({ description: "Short label (chip) describing the decision" }),
  prompt: Type.String({ description: "Full question text shown to the user" }),
  options: Type.Array(StructuredOptionSchema, {
    description: "Allowed answers (2-8). Use distinct, mutually exclusive options.",
  }),
  allowOther: Type.Optional(
    Type.Boolean({
      description: "Allow an explicit custom answer path instead of forcing one of the options",
    }),
  ),
  allowDiscuss: Type.Optional(
    Type.Boolean({
      description:
        "Allow the user to choose discussion instead of committing to a decision right now",
    }),
  ),
} as const;

const ChoiceQuestionSchema = Type.Object({
  type: Type.Literal("choice"),
  ...StructuredQuestionBaseSchema,
  recommendation: Type.Optional(
    Type.String({ description: "Recommended option `value` (must match one of `options`)" }),
  ),
});

const MultiChoiceQuestionSchema = Type.Object({
  type: Type.Literal("multichoice"),
  ...StructuredQuestionBaseSchema,
  recommendation: Type.Optional(
    Type.Array(Type.String(), {
      description:
        "Recommended option `value`s for multi-select questions (each must match one of `options`)",
    }),
  ),
});

const TextQuestionSchema = Type.Object({
  type: Type.Literal("text"),
  id: Type.String({ description: "Unique question id within this questionnaire" }),
  header: Type.String({ description: "Short label (chip) describing the prompt" }),
  prompt: Type.String({ description: "Full question text shown to the user" }),
});

const YesNoQuestionSchema = Type.Object({
  type: Type.Literal("yesno"),
  id: Type.String({ description: "Unique question id within this questionnaire" }),
  header: Type.String({ description: "Short label (chip) describing the decision" }),
  prompt: Type.String({ description: "Full yes/no question shown to the user" }),
  allowOther: Type.Optional(
    Type.Boolean({ description: "Allow an explicit custom answer path besides yes/no" }),
  ),
  allowDiscuss: Type.Optional(
    Type.Boolean({ description: "Allow discussion instead of choosing yes or no" }),
  ),
  recommendation: Type.Optional(
    Type.Union([Type.Literal("yes"), Type.Literal("no")], {
      description: "Recommended answer (`yes` or `no`)",
    }),
  ),
});

const QuestionSchema = Type.Union([
  ChoiceQuestionSchema,
  MultiChoiceQuestionSchema,
  TextQuestionSchema,
  YesNoQuestionSchema,
]);

export const AskUserParamsSchema = Type.Object({
  questions: Type.Array(QuestionSchema, {
    description: "Between 1 and 4 focused decision questions",
  }),
});

export type AskUserParams = Static<typeof AskUserParamsSchema>;
export type ExternalQuestion = Static<typeof QuestionSchema>;
export type ExternalChoiceQuestion = Static<typeof ChoiceQuestionSchema>;
export type ExternalMultiChoiceQuestion = Static<typeof MultiChoiceQuestionSchema>;
export type ExternalTextQuestion = Static<typeof TextQuestionSchema>;
export type ExternalYesNoQuestion = Static<typeof YesNoQuestionSchema>;
