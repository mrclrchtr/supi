import { AskUserController } from "../session/controller.ts";
import type {
  AskUserInteractionResult,
  AskUserOutcome,
  NormalizedQuestionnaire,
} from "../types.ts";
import { AskUserForm } from "./form-component.ts";
import type { RunQuestionnaireOptions } from "./types.ts";

export async function runFormQuestionnaire(
  questionnaire: NormalizedQuestionnaire,
  opts: RunQuestionnaireOptions,
): Promise<AskUserOutcome | AskUserInteractionResult | undefined> {
  const controller = new AskUserController(questionnaire);
  if (opts.signal?.aborted) {
    return controller.abort();
  }

  return opts.ui.custom?.<AskUserOutcome | AskUserInteractionResult>(
    (tui, theme, kb, done) =>
      new AskUserForm({
        tui,
        theme,
        controller,
        done,
        signal: opts.signal,
        keybindings: kb,
        onToggleToolsExpanded: opts.onToggleToolsExpanded,
      }),
  );
}
