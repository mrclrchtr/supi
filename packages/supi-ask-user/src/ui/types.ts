import type {
  ExtensionUIContext,
  KeybindingsManager,
  Theme,
} from "@earendil-works/pi-coding-agent";
import type { Component, TUI } from "@earendil-works/pi-tui";
import type { AskUserController } from "../session/controller.ts";
import type {
  AskUserInteractionResult,
  AskUserOutcome,
  NormalizedQuestionnaire,
} from "../types.ts";

// `EditorFactory` isn't re-exported from the package root; derive it from the
// interface method that is exported.
export type EditorFactory = NonNullable<ReturnType<ExtensionUIContext["getEditorComponent"]>>;

export interface AskUserUiContext {
  notify?(message: string, type?: "info" | "warning" | "error"): void;
  getEditorComponent?(): EditorFactory | undefined;
  custom?<T>(
    factory: (
      tui: TUI,
      theme: Theme,
      keybindings: KeybindingsManager,
      done: (result: T) => void,
    ) => Component & { dispose?(): void },
  ): Promise<T>;
}

export interface RunQuestionnaireOptions {
  ui: AskUserUiContext;
  signal?: AbortSignal;
  /** Callback to toggle tool output expansion (Ctrl+O passthrough). */
  onToggleToolsExpanded?: () => void;
}

export interface RenderContext {
  questionnaire: NormalizedQuestionnaire;
  options: RunQuestionnaireOptions;
}

export interface FormArgs {
  tui: TUI;
  theme: Theme;
  controller: AskUserController;
  done: (result: AskUserOutcome | AskUserInteractionResult) => void;
  signal?: AbortSignal;
  keybindings: KeybindingsManager;
  onToggleToolsExpanded?: () => void;
  editorFactory?: EditorFactory;
  notify?: AskUserUiContext["notify"];
}
