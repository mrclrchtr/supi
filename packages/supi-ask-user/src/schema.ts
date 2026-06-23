// External, model-facing parameter schema for the redesigned ask_user tool.

import { type Static, Type } from "typebox";
import { ASK_USER_LIMITS } from "./types.ts";

const OptionSchema = Type.Object({
  value: Type.String({ description: "Unique returned id" }),
  label: Type.String({ description: "Displayed label" }),
  description: Type.Optional(
    Type.String({
      description: "Optional helper text",
    }),
  ),
  preview: Type.Optional(
    Type.String({
      description: "Optional focused-option preview",
    }),
  ),
});

const ChoiceOptionCount = {
  minItems: ASK_USER_LIMITS.minChoiceOptions,
  maxItems: ASK_USER_LIMITS.maxChoiceOptions,
} as const;
const QuestionCount = {
  minItems: ASK_USER_LIMITS.minQuestions,
  maxItems: ASK_USER_LIMITS.maxQuestions,
} as const;

const ChoiceQuestionSchema = Type.Object({
  type: Type.Literal("choice"),
  id: Type.String({ description: "Unique question id" }),
  header: Type.String({ description: "Short label" }),
  prompt: Type.String({ description: "Question text" }),
  options: Type.Array(OptionSchema, {
    description: "Allowed options with unique values",
    ...ChoiceOptionCount,
  }),
  multi: Type.Optional(
    Type.Boolean({
      default: false,
      description: "Allow multiple selections",
    }),
  ),
  recommendation: Type.Optional(
    Type.Union([Type.String(), Type.Array(Type.String())], {
      description: "Recommended value(s): single string, multi array",
    }),
  ),
});

const TextQuestionSchema = Type.Object({
  type: Type.Literal("text"),
  id: Type.String({ description: "Unique question id" }),
  header: Type.String({ description: "Short label" }),
  prompt: Type.String({ description: "Question text" }),
  recommendation: Type.Optional(Type.String({ description: "Suggested text" })),
  placeholder: Type.Optional(Type.String({ description: "Editor placeholder" })),
});

const QuestionSchema = Type.Union([ChoiceQuestionSchema, TextQuestionSchema]);

export const AskUserParamsSchema = Type.Object({
  title: Type.Optional(Type.String({ description: "Optional title" })),
  intro: Type.Optional(
    Type.String({
      description: "Optional context",
    }),
  ),
  questions: Type.Array(QuestionSchema, {
    description: "1-10 related questions for one decision",
    ...QuestionCount,
  }),
});

export type AskUserParams = Static<typeof AskUserParamsSchema>;
export type ExternalQuestion = Static<typeof QuestionSchema>;
export type ExternalChoiceQuestion = Static<typeof ChoiceQuestionSchema>;
export type ExternalTextQuestion = Static<typeof TextQuestionSchema>;
