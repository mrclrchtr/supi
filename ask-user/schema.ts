// External (model-facing) parameter schema for the `ask_user` tool.
// Kept intentionally narrow: a discriminated union over `choice`, `text`,
// `yesno` keeps the surface small, deterministic, and easy for the LLM to fill.

import { type Static, Type } from "@sinclair/typebox";

const ChoiceOptionSchema = Type.Object({
  value: Type.String({ description: "Stable identifier returned in the answer" }),
  label: Type.String({ description: "Display label shown to the user" }),
  description: Type.Optional(
    Type.String({ description: "Optional one-line clarification shown under the label" }),
  ),
});

const ChoiceQuestionSchema = Type.Object({
  type: Type.Literal("choice"),
  id: Type.String({ description: "Unique question id within this questionnaire" }),
  header: Type.String({ description: "Short label (chip) describing the decision" }),
  prompt: Type.String({ description: "Full question text shown to the user" }),
  options: Type.Array(ChoiceOptionSchema, {
    description: "Allowed answers (2-8). Use distinct, mutually exclusive options.",
  }),
  allowOther: Type.Optional(
    Type.Boolean({ description: "Allow a freeform 'Other' answer (default false)" }),
  ),
  recommendation: Type.Optional(
    Type.String({ description: "Recommended option `value` (must match one of `options`)" }),
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
    Type.Boolean({
      description: "Allow a freeform 'Other' answer (e.g. 'depends'/'unknown'); default false",
    }),
  ),
  recommendation: Type.Optional(
    Type.Union([Type.Literal("yes"), Type.Literal("no")], {
      description: "Recommended answer (`yes` or `no`)",
    }),
  ),
});

const QuestionSchema = Type.Union([ChoiceQuestionSchema, TextQuestionSchema, YesNoQuestionSchema]);

export const AskUserParamsSchema = Type.Object({
  questions: Type.Array(QuestionSchema, {
    description: "Between 1 and 4 focused decision questions",
  }),
});

export type AskUserParams = Static<typeof AskUserParamsSchema>;
export type ExternalQuestion = Static<typeof QuestionSchema>;
export type ExternalChoiceQuestion = Static<typeof ChoiceQuestionSchema>;
export type ExternalTextQuestion = Static<typeof TextQuestionSchema>;
export type ExternalYesNoQuestion = Static<typeof YesNoQuestionSchema>;
