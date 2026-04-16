// Shared formatting helpers used by both UI paths and result rendering.
// Keeps summary/review formatting in one place so the rich overlay, dialog
// fallback, transcript renderer, and tool-content summary cannot accidentally
// diverge.

import type { Answer, NormalizedQuestion } from "./types.ts";

export const OTHER_LABEL = "Other (type your own)";

export function decorateOption(label: string, recommended: boolean): string {
  return recommended ? `${label} (recommended)` : label;
}

// Format used in the model-facing tool content and the in-line transcript:
// uses the human label for structured selections and an em-dash separator for
// Other.
export function formatSummaryBody(question: NormalizedQuestion, answer: Answer): string {
  switch (answer.source) {
    case "option": {
      if (answer.optionIndex === undefined) return answer.value;
      const label = question.options[answer.optionIndex]?.label ?? answer.value;
      return label;
    }
    case "other":
      return `Other — ${answer.value}`;
    case "yesno":
      return answer.value === "yes" ? "Yes" : "No";
    case "text":
      return answer.value;
  }
}

// Format used in the user-facing review screen (rich overlay + fallback
// summary): just the label, with a colon-separated `Other:` prefix.
export function formatReviewBody(question: NormalizedQuestion, answer: Answer): string {
  if (answer.source === "yesno") return answer.value === "yes" ? "Yes" : "No";
  if (answer.source === "other") return `Other: ${answer.value}`;
  if (answer.source === "option" && answer.optionIndex !== undefined) {
    return question.options[answer.optionIndex]?.label ?? answer.value;
  }
  return answer.value;
}

// Review-line wrapper shared by both review surfaces: handles the
// unanswered-question placeholder and appends an em-dash comment when
// present. Call sites prepend whatever header/styling they need.
export function formatReviewLine(question: NormalizedQuestion, answer: Answer | undefined): string {
  if (!answer) return "(no answer)";
  const body = formatReviewBody(question, answer);
  return answer.comment ? `${body} — ${answer.comment}` : body;
}
