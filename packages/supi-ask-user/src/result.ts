// Hybrid result formatting: a concise natural-language summary the model can
// continue from, plus structured per-question details for transcript rendering
// and future state reconstruction.

import { formatSummaryBody } from "./format.ts";
import type {
  Answer,
  AskUserDetails,
  NormalizedQuestion,
  QuestionnaireOutcome,
  TerminalState,
} from "./types.ts";

export interface HybridResult {
  content: { type: "text"; text: string }[];
  details: AskUserDetails;
  skip?: true;
}

export function buildResult(
  questions: NormalizedQuestion[],
  outcome: QuestionnaireOutcome,
): HybridResult {
  const result: HybridResult = {
    content: [{ type: "text", text: summarize(questions, outcome) }],
    details: {
      questions,
      answers: outcome.answers,
      answersById: indexById(questions, outcome.answers),
      terminalState: outcome.terminalState,
    },
  };
  if (outcome.skipped) result.skip = true;
  return result;
}

function indexById(
  questions: NormalizedQuestion[],
  answers: Answer[],
): Record<string, Answer | undefined> {
  const out: Record<string, Answer | undefined> = {};
  for (const question of questions) out[question.id] = undefined;
  for (const answer of answers) out[answer.questionId] = answer;
  return out;
}

export const ASK_USER_ERROR_MARKER = "__ask_user_error__";

export function buildErrorResult(message: string): HybridResult {
  return {
    content: [{ type: "text", text: message }],
    details: {
      questions: [],
      answers: [],
      answersById: {},
      terminalState: "cancelled",
      [ASK_USER_ERROR_MARKER]: true,
    } as AskUserDetails & { [ASK_USER_ERROR_MARKER]: boolean },
  };
}

function summarize(questions: NormalizedQuestion[], outcome: QuestionnaireOutcome): string {
  if (outcome.terminalState === "skipped") {
    const byId = new Map(outcome.answers.map((answer) => [answer.questionId, answer]));
    const lines = questions.map((question) =>
      formatAnswerLine(question, byId.get(question.id), true),
    );
    return `User skipped the questionnaire.\n${lines.join("\n")}`;
  }
  if (outcome.terminalState !== "submitted") return summarizeTerminal(outcome.terminalState);
  const byId = new Map(outcome.answers.map((answer) => [answer.questionId, answer]));
  return questions.map((question) => formatAnswerLine(question, byId.get(question.id))).join("\n");
}

function summarizeTerminal(state: TerminalState): string {
  if (state === "cancelled") return "User cancelled the questionnaire.";
  return "Questionnaire was aborted before the user submitted answers.";
}

function formatAnswerLine(
  question: NormalizedQuestion,
  answer: Answer | undefined,
  skipped = false,
): string {
  if (!answer) {
    if (skipped && !question.required) return `${question.header}: (skipped)`;
    return `${question.header}: (no answer)`;
  }
  return `${question.header}: ${formatSummaryBody(question, answer)}`;
}
