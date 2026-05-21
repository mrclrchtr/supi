import { AskUserController } from "../session/controller.ts";
import type { AskUserOutcome, NormalizedQuestionnaire } from "../types.ts";
import { AskUserOverlay } from "./overlay-component.ts";
import type { RunQuestionnaireOptions } from "./types.ts";

export async function runOverlayQuestionnaire(
  questionnaire: NormalizedQuestionnaire,
  opts: RunQuestionnaireOptions,
): Promise<AskUserOutcome> {
  const controller = new AskUserController(questionnaire);
  if (opts.signal?.aborted) {
    controller.abort();
    return controller.outcome();
  }

  return opts.ui.custom?.<AskUserOutcome>(
    (tui, theme, kb, done) =>
      new AskUserOverlay({
        tui,
        theme,
        controller,
        done,
        signal: opts.signal,
        keybindings: kb,
        onToggleToolsExpanded: opts.onToggleToolsExpanded,
      }),
  ) as Promise<AskUserOutcome>;
}
