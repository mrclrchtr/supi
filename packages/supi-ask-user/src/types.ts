// Internal data model used by both UI paths and result formatting.
// The external (model-facing) schema lives in `schema.ts`; everything beyond
// parsing passes through normalization into the shapes defined here.

export type QuestionType = "choice" | "multichoice" | "text" | "yesno";

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
}

export interface NormalizedChoiceQuestion extends StructuredQuestionBase {
  type: "choice";
}

export interface NormalizedMultiChoiceQuestion extends StructuredQuestionBase {
  type: "multichoice";
}

export interface NormalizedYesNoQuestion extends StructuredQuestionBase {
  type: "yesno";
}

export interface NormalizedTextQuestion extends BaseQuestion {
  type: "text";
  options: [];
  default?: string;
}

export type NormalizedStructuredQuestion =
  | NormalizedChoiceQuestion
  | NormalizedMultiChoiceQuestion
  | NormalizedYesNoQuestion;

export type NormalizedQuestion =
  | NormalizedChoiceQuestion
  | NormalizedMultiChoiceQuestion
  | NormalizedTextQuestion
  | NormalizedYesNoQuestion;

export interface NormalizedQuestionnaire {
  questions: NormalizedQuestion[];
  allowSkip: boolean;
}

export interface OptionAnswer {
  questionId: string;
  source: "option";
  value: string;
  optionIndex: number;
  note?: string;
}

export interface MultiSelection {
  value: string;
  optionIndex: number;
  note?: string;
}

export interface OptionsAnswer {
  questionId: string;
  source: "options";
  values: string[];
  optionIndexes: number[];
  selections: MultiSelection[];
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

export interface YesNoAnswer {
  questionId: string;
  source: "yesno";
  value: "yes" | "no";
  optionIndex: 0 | 1;
  note?: string;
}

export type Answer =
  | OptionAnswer
  | OptionsAnswer
  | OtherAnswer
  | DiscussAnswer
  | TextAnswer
  | YesNoAnswer;

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
  return questions.length > 1 || questions.some((q) => q.type === "multichoice");
}

export function primaryRecommendationIndex(question: NormalizedQuestion): number | undefined {
  return isStructuredQuestion(question) ? question.recommendedIndexes[0] : undefined;
}
