// Shared formatting helpers used by the overlay UI and result rendering.
// Keeps summary/review formatting in one place so the overlay, transcript
// renderer, and tool-content summary cannot accidentally diverge.

import type { Answer, NormalizedQuestion } from "./types.ts";

export const OTHER_LABEL = "Other answer";
export const DISCUSS_LABEL = "Discuss instead";
export const SUBMIT_SELECTIONS_LABEL = "Submit selections";
export const NOTE_MARKER = "✎";

export function decorateOption(label: string, recommended: boolean): string {
  if (!recommended) return label;
  if (label.trimEnd().toLowerCase().endsWith("(recommended)")) return label;
  return `${label} (recommended)`;
}

// formatSummaryBody and formatReviewLines must be kept in sync —
// when adding a new answer source, update both functions.
export function formatSummaryBody(question: NormalizedQuestion, answer: Answer): string {
  switch (answer.source) {
    case "choice":
      return answer.selections
        .map((selection) => {
          const label = question.options[selection.optionIndex]?.label ?? selection.value;
          return withNote(label, selection.note);
        })
        .join("; ");
    case "other":
      return `Other — ${answer.value}`;
    case "discuss":
      return answer.value ? `Discuss — ${answer.value}` : "Discuss";
    case "text":
      return answer.value;
  }
}

export function formatReviewBody(question: NormalizedQuestion, answer: Answer): string {
  return formatReviewLines(question, answer).join("; ");
}

export function formatReviewLines(question: NormalizedQuestion, answer: Answer): string[] {
  switch (answer.source) {
    case "choice":
      if (answer.selections.length === 0) return ["(no selections)"];
      return answer.selections.map((selection) => {
        const label = question.options[selection.optionIndex]?.label ?? selection.value;
        return withNote(label, selection.note);
      });
    case "other":
      return [`Other: ${answer.value}`];
    case "discuss":
      return [answer.value ? `Discuss: ${answer.value}` : "Discuss"];
    case "text":
      return [answer.value];
  }
}

export function formatReviewLine(question: NormalizedQuestion, answer: Answer | undefined): string {
  if (!answer) return "(no answer)";
  return formatReviewBody(question, answer);
}

function withNote(body: string, note: string | undefined): string {
  return note ? `${body} — ${note}` : body;
}
