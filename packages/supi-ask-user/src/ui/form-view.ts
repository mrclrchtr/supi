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
