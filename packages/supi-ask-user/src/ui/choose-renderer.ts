import type { AskUserOutcome, NormalizedQuestionnaire } from "../types.ts";
import { runDialogQuestionnaire } from "./dialog.ts";
import { runOverlayQuestionnaire } from "./overlay.ts";
import type { RunQuestionnaireOptions } from "./types.ts";

export async function runQuestionnaire(
  questionnaire: NormalizedQuestionnaire,
  opts: RunQuestionnaireOptions,
): Promise<AskUserOutcome | "unsupported"> {
  if (typeof opts.ui.custom === "function") {
    return runOverlayQuestionnaire(questionnaire, opts);
  }
  if (
    typeof opts.ui.select === "function" &&
    typeof opts.ui.input === "function" &&
    typeof opts.ui.editor === "function"
  ) {
    return runDialogQuestionnaire(questionnaire, opts);
  }
  return "unsupported";
}
