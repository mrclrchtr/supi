import type { Theme } from "@earendil-works/pi-coding-agent";
import type { Component, TUI } from "@earendil-works/pi-tui";
import type { AskUserController } from "../session/controller.ts";
import type { AskUserOutcome, NormalizedQuestionnaire } from "../types.ts";

export interface AskUserUiContext {
  notify?(message: string, type?: "info" | "warning" | "error"): void;
  custom?<T>(
    factory: (
      tui: TUI,
      theme: Theme,
      // biome-ignore lint/suspicious/noExplicitAny: keybindings are passed through by pi but unused here
      keybindings: any,
      done: (result: T) => void,
    ) => Component & { dispose?(): void },
  ): Promise<T>;
}

export interface RunQuestionnaireOptions {
  ui: AskUserUiContext;
  signal?: AbortSignal;
}

export interface RenderContext {
  questionnaire: NormalizedQuestionnaire;
  options: RunQuestionnaireOptions;
}

export interface OverlayArgs {
  tui: TUI;
  theme: Theme;
  controller: AskUserController;
  done: (result: AskUserOutcome) => void;
  signal?: AbortSignal;
}
