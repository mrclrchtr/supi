import type { AgentToolResult } from "@earendil-works/pi-coding-agent";
import type {
  Answer,
  AskUserDetails,
  AskUserErrorDetails,
  AskUserOutcome,
  AskUserToolDetails,
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
    status: outcome.status,
    answersById: outcome.answersById,
    missingQuestionIds: outcome.missingQuestionIds,
    ...(outcome.discussMessage ? { discussMessage: outcome.discussMessage } : {}),
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

export function formatAnswerSummary(_question: NormalizedQuestion, answer: Answer): string {
  switch (answer.kind) {
    case "choice":
      return answer.selections.map(formatChoiceSelectionSummary).join("; ");
    case "custom":
      return `Other — ${answer.value}`;
    case "text":
      return answer.value;
  }
}

function formatChoiceSelectionSummary(selection: { label: string; note?: string }): string {
  return selection.note ? `${selection.label} (note: ${selection.note})` : selection.label;
}

function summarizeOutcome(questions: NormalizedQuestion[], outcome: AskUserOutcome): string {
  if (outcome.status === "cancelled") return "User cancelled the form.";
  if (outcome.status === "aborted") return "The form was aborted before completion.";

  const lines = formatAnsweredLines(questions, outcome.answersById);
  const missing = formatMissingHeaders(questions, outcome.missingQuestionIds);

  if (outcome.status === "submitted") {
    return lines.length > 0 ? lines.join("\n") : "User submitted the form.";
  }

  if (outcome.status === "partial") {
    return [
      "User submitted a partial form.",
      ...lines,
      ...(missing ? [`Missing required answers: ${missing}`] : []),
    ].join("\n");
  }

  return [
    "User wants to discuss before deciding.",
    ...(outcome.discussMessage ? [`Discussion request: ${outcome.discussMessage}`] : []),
    ...lines,
    ...(missing ? [`Still missing: ${missing}`] : []),
  ].join("\n");
}

function formatAnsweredLines(
  questions: NormalizedQuestion[],
  answersById: Record<string, Answer>,
): string[] {
  return questions.flatMap((question) => {
    const answer = answersById[question.id];
    return answer ? [`${question.header}: ${formatAnswerSummary(question, answer)}`] : [];
  });
}

export function formatMissingHeaders(
  questions: NormalizedQuestion[],
  missingQuestionIds: string[],
): string | undefined {
  const headers = questions
    .filter((question) => missingQuestionIds.includes(question.id))
    .map((question) => question.header);
  return headers.length > 0 ? headers.join(", ") : undefined;
}
