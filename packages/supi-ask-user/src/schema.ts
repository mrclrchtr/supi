// External, model-facing parameter schema for the redesigned ask_user tool.

import { type Static, Type } from "typebox";

const OptionSchema = Type.Object({
  value: Type.String({ description: "Returned id" }),
  label: Type.String({ description: "Displayed label" }),
  description: Type.Optional(
    Type.String({
      description: "Optional description",
    }),
  ),
  preview: Type.Optional(
    Type.String({
      description: "Optional preview",
    }),
  ),
});

const ChoiceOptionCount = { minItems: 2, maxItems: 12 } as const;
const QuestionCount = { minItems: 1, maxItems: 10 } as const;

const ChoiceQuestionSchema = Type.Object({
  type: Type.Literal("choice"),
  id: Type.String({ description: "Question id" }),
  header: Type.String({ description: "Short label" }),
  prompt: Type.String({ description: "Question text" }),
  options: Type.Array(OptionSchema, {
    description: "Allowed options (2-12)",
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
      description: "Recommended value(s)",
    }),
  ),
});

const TextQuestionSchema = Type.Object({
  type: Type.Literal("text"),
  id: Type.String({ description: "Question id" }),
  header: Type.String({ description: "Short label" }),
  prompt: Type.String({ description: "Question text" }),
  recommendation: Type.Optional(Type.String({ description: "Suggested prefilled text" })),
  placeholder: Type.Optional(Type.String({ description: "Editor placeholder" })),
});

const QuestionSchema = Type.Union([ChoiceQuestionSchema, TextQuestionSchema]);

export const AskUserParamsSchema = Type.Object({
  title: Type.Optional(Type.String({ description: "Optional title" })),
  intro: Type.Optional(
    Type.String({
      description: "Optional intro for the decision",
    }),
  ),
  questions: Type.Array(QuestionSchema, {
    description: "1-10 focused questions for one decision",
    ...QuestionCount,
  }),
});

export type AskUserParams = Static<typeof AskUserParamsSchema>;
export type ExternalQuestion = Static<typeof QuestionSchema>;
export type ExternalChoiceQuestion = Static<typeof ChoiceQuestionSchema>;
export type ExternalTextQuestion = Static<typeof TextQuestionSchema>;
