// Shared formatting helpers used by both UI paths and result rendering.
// Keeps summary/review formatting in one place so the rich overlay, dialog
// fallback, transcript renderer, and tool-content summary cannot accidentally
// diverge.

import type { Answer, MultiSelection, NormalizedQuestion } from "./types.ts";

export const OTHER_LABEL = "Other answer";
export const DISCUSS_LABEL = "Discuss instead";
export const SUBMIT_SELECTIONS_LABEL = "Submit selections";
export const NOTE_MARKER = "✎";

export function decorateOption(label: string, recommended: boolean): string {
  return recommended ? `${label} (recommended)` : label;
}

export function formatSummaryBody(question: NormalizedQuestion, answer: Answer): string {
  switch (answer.source) {
    case "option": {
      const label = question.options[answer.optionIndex]?.label ?? answer.value;
      return withNote(label, answer.note);
    }
    case "options": {
      const selections = resolveSelections(question, answer);
      return selections.map((selection) => withNote(selection.label, selection.note)).join("; ");
    }
    case "other":
      return `Other — ${answer.value}`;
    case "discuss":
      return answer.value ? `Discuss — ${answer.value}` : "Discuss";
    case "text":
      return answer.value;
    case "yesno":
      return withNote(answer.value === "yes" ? "Yes" : "No", answer.note);
  }
}

export function formatReviewBody(question: NormalizedQuestion, answer: Answer): string {
  return formatReviewLines(question, answer).join("; ");
}

export function formatReviewLines(question: NormalizedQuestion, answer: Answer): string[] {
  switch (answer.source) {
    case "option": {
      const label = question.options[answer.optionIndex]?.label ?? answer.value;
      return [withNote(label, answer.note)];
    }
    case "options": {
      const selections = resolveSelections(question, answer);
      return selections.length > 0
        ? selections.map((selection) => withNote(selection.label, selection.note))
        : ["(no selections)"];
    }
    case "other":
      return [`Other: ${answer.value}`];
    case "discuss":
      return [answer.value ? `Discuss: ${answer.value}` : "Discuss"];
    case "text":
      return [answer.value];
    case "yesno":
      return [withNote(answer.value === "yes" ? "Yes" : "No", answer.note)];
  }
}

export function formatReviewLine(question: NormalizedQuestion, answer: Answer | undefined): string {
  if (!answer) return "(no answer)";
  return formatReviewBody(question, answer);
}

interface ResolvedSelection {
  label: string;
  note?: string;
}

function resolveSelections(
  question: NormalizedQuestion,
  answer: Extract<Answer, { source: "options" }>,
): ResolvedSelection[] {
  const selections = answer.selections.length > 0 ? answer.selections : legacySelections(answer);
  return selections.map((selection) => ({
    label: question.options[selection.optionIndex]?.label ?? selection.value,
    note: selection.note,
  }));
}

function legacySelections(answer: Extract<Answer, { source: "options" }>): MultiSelection[] {
  return answer.optionIndexes.map((optionIndex, index) => ({
    value: answer.values[index] ?? "",
    optionIndex,
  }));
}

function withNote(body: string, note: string | undefined): string {
  return note ? `${body} — ${note}` : body;
}
