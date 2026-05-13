// Internal data model used by both UI paths and result formatting.
// The external (model-facing) schema lives in `schema.ts`; everything beyond
// parsing passes through normalization into the shapes defined here.

export type QuestionType = "choice" | "text";

export type TerminalState = "submitted" | "cancelled" | "aborted" | "skipped";

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
  type: QuestionType;
  required: boolean;
}

interface StructuredQuestionBase extends BaseQuestion {
  options: NormalizedOption[];
  allowOther: boolean;
  allowDiscuss: boolean;
  recommendedIndexes: number[];
  defaultIndexes: number[];
  multi: boolean;
}

export interface NormalizedChoiceQuestion extends StructuredQuestionBase {
  type: "choice";
}

export interface NormalizedTextQuestion extends BaseQuestion {
  type: "text";
  options: [];
  default?: string;
}

export type NormalizedStructuredQuestion = NormalizedChoiceQuestion;

export type NormalizedQuestion = NormalizedChoiceQuestion | NormalizedTextQuestion;

export interface NormalizedQuestionnaire {
  questions: NormalizedQuestion[];
  allowSkip: boolean;
}

export interface Selection {
  value: string;
  optionIndex: number;
  note?: string;
}

export interface ChoiceAnswer {
  questionId: string;
  source: "choice";
  selections: Selection[];
}

export interface OtherAnswer {
  questionId: string;
  source: "other";
  value: string;
}

export interface DiscussAnswer {
  questionId: string;
  source: "discuss";
  value?: string;
}

export interface TextAnswer {
  questionId: string;
  source: "text";
  value: string;
}

export type Answer = ChoiceAnswer | OtherAnswer | DiscussAnswer | TextAnswer;

export interface QuestionnaireOutcome {
  terminalState: TerminalState;
  answers: Answer[];
  skipped?: true;
}

export interface AskUserDetails {
  questions: NormalizedQuestion[];
  answers: Answer[];
  answersById: Record<string, Answer | undefined>;
  terminalState: TerminalState;
}

export const QUESTION_LIMITS = {
  minQuestions: 1,
  maxQuestions: 4,
  maxHeaderLength: 60,
  maxPromptLength: 4000,
  minChoiceOptions: 2,
  maxChoiceOptions: 12,
} as const;

export function isStructuredQuestion(
  question: NormalizedQuestion,
): question is NormalizedStructuredQuestion {
  return question.type !== "text";
}

export function needsReview(questions: NormalizedQuestion[]): boolean {
  return questions.length > 1 || questions.some((q) => q.type !== "text" && q.multi);
}

export function primaryRecommendationIndex(question: NormalizedQuestion): number | undefined {
  return isStructuredQuestion(question) ? question.recommendedIndexes[0] : undefined;
}
