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
}

export function buildResult(
  questions: NormalizedQuestion[],
  outcome: QuestionnaireOutcome,
): HybridResult {
  const summary = summarize(questions, outcome);
  return {
    content: [{ type: "text", text: summary }],
    details: {
      questions,
      answers: outcome.answers,
      answersById: indexById(outcome.answers),
      terminalState: outcome.terminalState,
    },
  };
}

function indexById(answers: Answer[]): Record<string, Answer> {
  const out: Record<string, Answer> = {};
  for (const a of answers) out[a.questionId] = a;
  return out;
}

// Sentinel inserted into details for tool-level errors (validation, no-UI,
// concurrency). Lets renderResult distinguish them from real user
// cancellations without changing the public terminalState contract.
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
  if (outcome.terminalState !== "submitted") {
    return summarizeTerminal(outcome.terminalState);
  }
  const byId = new Map(outcome.answers.map((a) => [a.questionId, a]));
  const lines = questions.map((q) => formatAnswerLine(q, byId.get(q.id)));
  return lines.join("\n");
}

function summarizeTerminal(state: TerminalState): string {
  if (state === "cancelled") return "User cancelled the questionnaire.";
  return "Questionnaire was aborted before the user submitted answers.";
}

function formatAnswerLine(question: NormalizedQuestion, answer: Answer | undefined): string {
  if (!answer) {
    return `${question.header}: (no answer)`;
  }
  const body = formatSummaryBody(question, answer);
  if (answer.comment) {
    return `${question.header}: ${body} — ${answer.comment}`;
  }
  return `${question.header}: ${body}`;
}
