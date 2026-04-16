// Internal data model used by both UI paths and result formatting.
// The external (model-facing) schema lives in `schema.ts`; everything beyond
// the parser passes through normalization into the shapes defined here.

export type QuestionType = "choice" | "text" | "yesno";

export type AnswerSource = "option" | "other" | "text" | "yesno";

export type TerminalState = "submitted" | "cancelled" | "aborted";

export interface NormalizedOption {
  value: string;
  label: string;
  description?: string;
}

export interface NormalizedQuestion {
  id: string;
  header: string;
  type: QuestionType;
  prompt: string;
  options: NormalizedOption[];
  allowOther: boolean;
  recommendedIndex?: number;
}

export interface NormalizedQuestionnaire {
  questions: NormalizedQuestion[];
}

export interface Answer {
  questionId: string;
  source: AnswerSource;
  value: string;
  optionIndex?: number;
  comment?: string;
}

export interface QuestionnaireOutcome {
  terminalState: TerminalState;
  answers: Answer[];
}

export interface AskUserDetails {
  questions: NormalizedQuestion[];
  answers: Answer[];
  // Per-question answers keyed by stable question id, as required by the
  // `ask-user` capability spec. Mirrors `answers` so consumers can do either
  // ordered iteration or keyed lookup without rebuilding a map.
  answersById: Record<string, Answer>;
  terminalState: TerminalState;
}

export const QUESTION_LIMITS = {
  minQuestions: 1,
  maxQuestions: 4,
  maxHeaderLength: 40,
  maxPromptLength: 240,
  minChoiceOptions: 2,
  maxChoiceOptions: 8,
} as const;
