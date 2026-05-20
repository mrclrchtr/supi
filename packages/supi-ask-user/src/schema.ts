// External, model-facing parameter schema for the redesigned ask_user tool.

import { type Static, Type } from "typebox";

const OptionSchema = Type.Object({
  value: Type.String({ description: "Stable identifier returned when this option is selected" }),
  label: Type.String({ description: "Display label shown to the user" }),
  description: Type.Optional(
    Type.String({
      description: "Optional clarification shown under the label in richer UIs",
    }),
  ),
  preview: Type.Optional(
    Type.String({
      description: "Optional preview content shown for the currently focused option",
    }),
  ),
});

const ChoiceQuestionSchema = Type.Object({
  type: Type.Literal("choice"),
  id: Type.String({ description: "Unique question id within this form" }),
  header: Type.String({ description: "Short label describing the decision" }),
  prompt: Type.String({ description: "Full question text shown to the user" }),
  options: Type.Array(OptionSchema, {
    description: "Allowed answers (2-12 distinct options)",
  }),
  required: Type.Optional(
    Type.Boolean({
      default: true,
      description: "Whether this question must be answered for a full submit",
    }),
  ),
  multi: Type.Optional(
    Type.Boolean({
      default: false,
      description: "Allow selecting multiple options instead of one",
    }),
  ),
  allowOther: Type.Optional(
    Type.Boolean({
      description:
        "Allow a custom freeform answer instead of the listed options. Only valid for single-select choice questions.",
    }),
  ),
  recommendation: Type.Optional(
    Type.Union([Type.String(), Type.Array(Type.String())], {
      description:
        "Recommended option value or values. Use a string for single-select and an array for multi-select.",
    }),
  ),
  initial: Type.Optional(
    Type.Union([Type.String(), Type.Array(Type.String())], {
      description:
        "Initial selected option value or values. Use a string for single-select and an array for multi-select.",
    }),
  ),
});

const TextQuestionSchema = Type.Object({
  type: Type.Literal("text"),
  id: Type.String({ description: "Unique question id within this form" }),
  header: Type.String({ description: "Short label describing the prompt" }),
  prompt: Type.String({ description: "Full question text shown to the user" }),
  required: Type.Optional(
    Type.Boolean({
      default: true,
      description: "Whether this question must be answered for a full submit",
    }),
  ),
  initial: Type.Optional(Type.String({ description: "Initial value shown in the editor" })),
  placeholder: Type.Optional(
    Type.String({ description: "Placeholder shown before the user types" }),
  ),
});

const QuestionSchema = Type.Union([ChoiceQuestionSchema, TextQuestionSchema]);

export const AskUserParamsSchema = Type.Object({
  title: Type.Optional(
    Type.String({ description: "Optional short title explaining the overall decision" }),
  ),
  intro: Type.Optional(
    Type.String({
      description: "Optional introductory context explaining why the agent is asking",
    }),
  ),
  questions: Type.Array(QuestionSchema, {
    description: "Between 1 and 4 focused questions that belong to the same decision",
  }),
  allowPartialSubmit: Type.Optional(
    Type.Boolean({
      description:
        "Allow the user to submit a partial form when some required questions remain unanswered",
    }),
  ),
  allowDiscuss: Type.Optional(
    Type.Boolean({
      description:
        "Allow the user to switch back into discussion instead of committing to a final answer",
    }),
  ),
});

export type AskUserParams = Static<typeof AskUserParamsSchema>;
export type ExternalQuestion = Static<typeof QuestionSchema>;
export type ExternalChoiceQuestion = Static<typeof ChoiceQuestionSchema>;
export type ExternalTextQuestion = Static<typeof TextQuestionSchema>;
