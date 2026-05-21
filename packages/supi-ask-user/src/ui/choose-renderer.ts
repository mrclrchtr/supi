import type { AskUserOutcome, NormalizedQuestionnaire } from "../types.ts";
import { runOverlayQuestionnaire } from "./overlay.ts";
import type { RunQuestionnaireOptions } from "./types.ts";

export async function runQuestionnaire(
  questionnaire: NormalizedQuestionnaire,
  opts: RunQuestionnaireOptions,
): Promise<AskUserOutcome | "unsupported"> {
  if (typeof opts.ui.custom !== "function") return "unsupported";
  return runOverlayQuestionnaire(questionnaire, opts);
}
