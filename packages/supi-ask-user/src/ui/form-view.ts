import type { AskUserController } from "../session/controller.ts";
import type { NormalizedChoiceQuestion } from "../types.ts";

export type FocusTarget = "choices" | "editor" | "review";
export type FormMode =
  | "choice"
  | "text"
  | "review"
  | "question-comment"
  | "form-comment"
  | "option-comment";

/** Return the only valid focus target for a form mode. */
export function focusForMode(mode: FormMode): FocusTarget {
  if (mode === "choice") return "choices";
  return mode === "review" ? "review" : "editor";
}

export function defaultChoiceRowIndex(
  controller: AskUserController,
  question: NormalizedChoiceQuestion,
): number {
  for (let i = 0; i < question.options.length; i += 1) {
    if (controller.isOptionSelected(question.id, question.options[i].value)) {
      return i;
    }
  }
  return 0;
}
