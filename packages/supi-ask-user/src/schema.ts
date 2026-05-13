// External (model-facing) parameter schema for the `ask_user` tool.
// Two question types: choice (structured pick-one-or-many with options)
// and text (freeform input). Yes/no and multichoice have been unified
// into choice — yes/no is just choice with two options, multi-select
// is choice with `multi: true`.

import { type Static, Type } from "typebox";

const StructuredOptionSchema = Type.Object({
  value: Type.String({ description: "Stable identifier returned in the answer" }),
  label: Type.String({ description: "Display label shown to the user" }),
  description: Type.Optional(
    Type.String({
      description:
        "Optional clarification shown under the label (wraps naturally, a short paragraph is fine)",
    }),
  ),
  preview: Type.Optional(
    Type.String({
      description:
        "Optional rich preview content shown in the TUI (markdown, code, or ASCII mockups)",
    }),
  ),
});

const ChoiceQuestionSchema = Type.Object({
  type: Type.Literal("choice"),
  id: Type.String({ description: "Unique question id within this questionnaire" }),
  header: Type.String({ description: "Short label (chip) describing the decision" }),
  prompt: Type.String({ description: "Full question text shown to the user" }),
  options: Type.Array(StructuredOptionSchema, {
    description: "Allowed answers (2-12). Use distinct, mutually exclusive options.",
  }),
  required: Type.Optional(
    Type.Boolean({
      default: true,
      description: "Whether this question must be answered before submission (default true)",
    }),
  ),
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
  multi: Type.Optional(
    Type.Boolean({
      default: false,
      description:
        "Allow selecting multiple options (multi-select). Default false (single-select).",
    }),
  ),
  recommendation: Type.Optional(
    Type.Union([Type.String(), Type.Array(Type.String())], {
      description:
        "Recommended option value(s). String for single-select, array for multi-select. Each must match an option value.",
    }),
  ),
  default: Type.Optional(
    Type.Union([Type.String(), Type.Array(Type.String())], {
      description:
        "Pre-selected option value(s). String for single-select, array for multi-select. Each must match an option value.",
    }),
  ),
});

const TextQuestionSchema = Type.Object({
  type: Type.Literal("text"),
  id: Type.String({ description: "Unique question id within this questionnaire" }),
  header: Type.String({ description: "Short label (chip) describing the prompt" }),
  prompt: Type.String({ description: "Full question text shown to the user" }),
  required: Type.Optional(
    Type.Boolean({
      default: true,
      description: "Whether this question must be answered before submission (default true)",
    }),
  ),
  default: Type.Optional(
    Type.String({ description: "Pre-filled default value shown in the text input" }),
  ),
});

const QuestionSchema = Type.Union([ChoiceQuestionSchema, TextQuestionSchema]);

export const AskUserParamsSchema = Type.Object({
  questions: Type.Array(QuestionSchema, {
    description: "Between 1 and 4 focused decision questions",
  }),
  allowSkip: Type.Optional(
    Type.Boolean({
      description:
        "Expose a Skip action so the user can submit a partial result without answering all questions",
    }),
  ),
});

export type AskUserParams = Static<typeof AskUserParamsSchema>;
export type ExternalQuestion = Static<typeof QuestionSchema>;
export type ExternalChoiceQuestion = Static<typeof ChoiceQuestionSchema>;
export type ExternalTextQuestion = Static<typeof TextQuestionSchema>;
