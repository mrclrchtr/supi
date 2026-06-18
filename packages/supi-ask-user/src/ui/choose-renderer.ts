import type {
  AskUserInteractionResult,
  AskUserOutcome,
  NormalizedQuestionnaire,
} from "../types.ts";
import { runFormQuestionnaire } from "./form.ts";
import type { RunQuestionnaireOptions } from "./types.ts";

export async function runQuestionnaire(
  questionnaire: NormalizedQuestionnaire,
  opts: RunQuestionnaireOptions,
): Promise<AskUserOutcome | AskUserInteractionResult | "unsupported"> {
  if (typeof opts.ui.custom !== "function") return "unsupported";

  const result = await runFormQuestionnaire(questionnaire, opts);
  return isQuestionnaireResult(result) ? result : "unsupported";
}

function isQuestionnaireResult(
  result: AskUserOutcome | AskUserInteractionResult | undefined,
): result is AskUserOutcome | AskUserInteractionResult {
  if (!result || typeof result !== "object") return false;
  if ("outcome" in result) {
    return result.outcome === "submitted" || result.outcome === "needs_discussion";
  }
  return "kind" in result && (result.kind === "cancel" || result.kind === "abort");
}
