import type { Theme } from "@earendil-works/pi-coding-agent";
import type { Component, TUI } from "@earendil-works/pi-tui";
import type { NormalizedQuestionnaire } from "../types.ts";

export interface AskUserUiContext {
  select?(title: string, options: string[]): Promise<string | undefined>;
  input?(title: string, placeholder?: string): Promise<string | undefined>;
  editor?(title: string, prefill?: string): Promise<string | undefined>;
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
