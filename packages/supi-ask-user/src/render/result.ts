import type { AgentToolResult } from "@earendil-works/pi-coding-agent";
import type {
  AskUserDetails,
  AskUserErrorDetails,
  AskUserOutcome,
  AskUserResponse,
  AskUserToolDetails,
  ChoiceQuestionResponse,
  NormalizedQuestion,
  NormalizedQuestionnaire,
} from "../types.ts";

export type AskUserToolResult = AgentToolResult<AskUserToolDetails>;

export function buildResult(
  questionnaire: NormalizedQuestionnaire,
  outcome: AskUserOutcome,
): AskUserToolResult {
  const details: AskUserDetails = {
    ...(questionnaire.title ? { title: questionnaire.title } : {}),
    ...(questionnaire.intro ? { intro: questionnaire.intro } : {}),
    questions: questionnaire.questions,
    outcome: outcome.outcome,
    comment: outcome.comment,
    responses: outcome.responses,
  };

  return {
    content: [{ type: "text", text: summarizeOutcome(questionnaire.questions, outcome) }],
    details,
  };
}

export function buildErrorResult(message: string): AskUserToolResult {
  const details: AskUserErrorDetails = { kind: "error", message };
  return {
    content: [{ type: "text", text: message }],
    details,
  };
}

function summarizeOutcome(questions: NormalizedQuestion[], outcome: AskUserOutcome): string {
  const responseLines = outcome.responses.flatMap((response) =>
    formatResponseSummaryLines(questions, response),
  );

  const headerLines =
    outcome.outcome === "submitted"
      ? []
      : [
          "User needs discussion before a complete decision.",
          ...formatUnansweredSummary(questions, outcome.responses),
        ];

  const commentLines = outcome.comment ? [`Form comment: ${outcome.comment}`] : [];
  const lines = [...headerLines, ...commentLines, ...responseLines];

  if (lines.length > 0) return lines.join("\n");
  return outcome.outcome === "submitted"
    ? "User submitted the form."
    : "User needs discussion before a complete decision.";
}

function formatUnansweredSummary(
  questions: NormalizedQuestion[],
  responses: AskUserResponse[],
): string[] {
  const unanswered = responses
    .filter((response) => !response.answer.answered)
    .map((response) => questionHeader(questions, response.questionId));

  return unanswered.length > 0 ? [`Unanswered: ${unanswered.join(", ")}`] : [];
}

function formatResponseSummaryLines(
  questions: NormalizedQuestion[],
  response: AskUserResponse,
): string[] {
  const header = questionHeader(questions, response.questionId);
  const answerLine = formatAnswerSummaryLine(header, response);
  const lines = answerLine ? [answerLine] : [];

  if (response.questionComment) {
    lines.push(`${header} question comment: ${response.questionComment}`);
  }

  if (response.answer.kind === "choice") {
    lines.push(...formatUnselectedOptionCommentLines(header, response as ChoiceQuestionResponse));
  }

  return lines;
}

function formatAnswerSummaryLine(header: string, response: AskUserResponse): string | undefined {
  if (!response.answer.answered) return undefined;

  if (response.answer.kind === "choice") {
    const selected = response.answer.options
      .filter((option) => option.selected)
      .map((option) =>
        option.comment ? `${option.label} (comment: ${option.comment})` : option.label,
      );
    return selected.length > 0 ? `${header}: ${selected.join("; ")}` : undefined;
  }

  if (response.answer.kind === "text" && response.answer.value) {
    return `${header}: ${response.answer.value}`;
  }

  return undefined;
}

function formatUnselectedOptionCommentLines(
  header: string,
  response: ChoiceQuestionResponse,
): string[] {
  return response.answer.options.flatMap((option) => {
    if (option.selected || !option.comment) return [];
    return [`${header} option comment (${option.label}): ${option.comment}`];
  });
}

function questionHeader(questions: NormalizedQuestion[], questionId: string): string {
  return questions.find((question) => question.id === questionId)?.header ?? questionId;
}
