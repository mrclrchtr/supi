// Shared internal and public data model for the redesigned ask_user tool.
// The external tool-call schema lives in schema.ts; everything past validation
// works with the normalized shapes defined here.

export type AskUserStatus = "submitted" | "partial" | "discuss" | "cancelled" | "aborted";

export interface NormalizedOption {
  value: string;
  label: string;
  description?: string;
  preview?: string;
}

interface BaseQuestion {
  id: string;
  header: string;
  prompt: string;
  required: boolean;
}

export interface NormalizedChoiceQuestion extends BaseQuestion {
  type: "choice";
  options: NormalizedOption[];
  multi: boolean;
  allowOther: boolean;
  recommendedIndexes: number[];
  initialIndexes: number[];
}

export interface NormalizedTextQuestion extends BaseQuestion {
  type: "text";
  initial?: string;
  placeholder?: string;
}

export type NormalizedQuestion = NormalizedChoiceQuestion | NormalizedTextQuestion;

export interface NormalizedQuestionnaire {
  title?: string;
  intro?: string;
  questions: NormalizedQuestion[];
  allowPartialSubmit: boolean;
  allowDiscuss: boolean;
}

/**
 * One selected choice option returned from `ask_user`.
 *
 * `note` is optional user-entered context attached to this specific option.
 * It is only used on `choice` answers and is absent for `text` / `custom` answers.
 */
export interface AnswerSelection {
  value: string;
  label: string;
  note?: string;
}

export interface ChoiceAnswer {
  kind: "choice";
  selections: AnswerSelection[];
}

export interface CustomAnswer {
  kind: "custom";
  value: string;
}

export interface TextAnswer {
  kind: "text";
  value: string;
}

export type Answer = ChoiceAnswer | CustomAnswer | TextAnswer;

export interface AskUserOutcome {
  status: AskUserStatus;
  answersById: Record<string, Answer>;
  missingQuestionIds: string[];
  discussMessage?: string;
}

export interface AskUserDetails extends AskUserOutcome {
  title?: string;
  intro?: string;
  questions: NormalizedQuestion[];
}

export interface AskUserErrorDetails {
  kind: "error";
  message: string;
}

export type AskUserToolDetails = AskUserDetails | AskUserErrorDetails;

export const ASK_USER_LIMITS = {
  minQuestions: 1,
  maxQuestions: 10,
  minChoiceOptions: 2,
  maxChoiceOptions: 12,
  maxHeaderLength: 60,
  maxPromptLength: 4000,
  maxTitleLength: 120,
  maxIntroLength: 4000,
  maxPlaceholderLength: 200,
} as const;

export function isChoiceQuestion(
  question: NormalizedQuestion,
): question is NormalizedChoiceQuestion {
  return question.type === "choice";
}

export function isTextQuestion(question: NormalizedQuestion): question is NormalizedTextQuestion {
  return question.type === "text";
}

export function isErrorDetails(details: AskUserToolDetails): details is AskUserErrorDetails {
  return "kind" in details && details.kind === "error";
}
