// Shared internal and public data model for the redesigned ask_user tool.
// The external tool-call schema lives in schema.ts; everything past validation
// works with the normalized shapes defined here.

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
}

export interface NormalizedChoiceQuestion extends BaseQuestion {
  type: "choice";
  options: NormalizedOption[];
  multi: boolean;
  recommendedIndexes: number[];
}

export interface NormalizedTextQuestion extends BaseQuestion {
  type: "text";
  recommendation?: string;
  placeholder?: string;
}

export type NormalizedQuestion = NormalizedChoiceQuestion | NormalizedTextQuestion;

export interface NormalizedQuestionnaire {
  title?: string;
  intro?: string;
  questions: NormalizedQuestion[];
}

// ── User-facing outcome types ──────────────────────────────────────

export type AskUserOutcomeKind = "submitted" | "needs_discussion";

export interface ChoiceQuestionResponse {
  questionId: string;
  questionComment?: string;
  answer: {
    kind: "choice";
    answered: boolean;
    options: Array<{
      value: string;
      label: string;
      selected: boolean;
      comment?: string;
    }>;
  };
}

export interface TextQuestionResponse {
  questionId: string;
  questionComment?: string;
  answer: {
    kind: "text";
    answered: boolean;
    value?: string;
  };
}

export type AskUserResponse = ChoiceQuestionResponse | TextQuestionResponse;

export interface AskUserOutcome {
  outcome: AskUserOutcomeKind;
  comment?: string;
  responses: AskUserResponse[];
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

// ── Internal interaction result: UI cancel/abort are NOT persisted ──

export type AskUserInteractionResult = AskUserInteractionCancel | AskUserInteractionAbort;

export interface AskUserInteractionCancel {
  kind: "cancel";
}

export interface AskUserInteractionAbort {
  kind: "abort";
}

// ── Limits ─────────────────────────────────────────────────────────

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

// ── Guards ─────────────────────────────────────────────────────────

export function isChoiceQuestion(
  question: NormalizedQuestion,
): question is NormalizedChoiceQuestion {
  return question.type === "choice";
}

export function isTextQuestion(question: NormalizedQuestion): question is NormalizedTextQuestion {
  return question.type === "text";
}

export function isErrorDetails(details: unknown): details is AskUserErrorDetails {
  return (
    typeof details === "object" && details !== null && "kind" in details && details.kind === "error"
  );
}
