// Rich questionnaire UI built on `ctx.ui.custom()`. Supports explicit choice,
// multichoice, notes, other, discuss, preview, and review flows. Returns a
// QuestionnaireOutcome whose terminal state is owned by the shared flow.

import type { Theme } from "@mariozechner/pi-coding-agent";
import { type Component, Editor, type EditorTheme, type TUI } from "@mariozechner/pi-tui";
import { QuestionnaireFlow } from "./flow.ts";
import type { NormalizedQuestionnaire, QuestionnaireOutcome } from "./types.ts";
import { handleOverlayInput, onEditorSubmit } from "./ui-rich-handlers.ts";
import { renderOverlay } from "./ui-rich-render.ts";
import { initialSubMode, type OverlayState, selectedRowIndex } from "./ui-rich-state.ts";

export interface RichCustomOptions {
  overlay?: boolean;
}

export interface RichUiHost {
  custom<T>(
    factory: (
      tui: TUI,
      theme: Theme,
      // biome-ignore lint/suspicious/noExplicitAny: keybindings parameter type isn't needed here
      keybindings: any,
      done: (result: T) => void,
    ) => Component & { dispose?(): void },
    options?: RichCustomOptions,
  ): Promise<T> | undefined;
}

export interface RunRichOptions {
  ui: RichUiHost;
  signal?: AbortSignal;
}

export async function runRichQuestionnaire(
  questionnaire: NormalizedQuestionnaire,
  opts: RunRichOptions,
): Promise<QuestionnaireOutcome | "unsupported"> {
  const flow = new QuestionnaireFlow(questionnaire.questions, questionnaire.allowSkip);
  // Short-circuit before opening the overlay if we were already aborted.
  // Otherwise signal.addEventListener("abort", …) would never fire and the
  // overlay would stay open until the user dismissed it manually.
  if (opts.signal?.aborted) {
    flow.abort();
    return flow.outcome();
  }
  const promise = opts.ui.custom<QuestionnaireOutcome>((tui, theme, _kb, done) =>
    buildOverlay({ tui, theme, flow, signal: opts.signal, done }),
  );
  if (!promise) return "unsupported";
  return promise;
}

interface BuildOverlayArgs {
  tui: TUI;
  theme: Theme;
  flow: QuestionnaireFlow;
  signal: AbortSignal | undefined;
  done: (result: QuestionnaireOutcome) => void;
}

function buildOverlay(args: BuildOverlayArgs): Component {
  const { tui, theme, flow, signal, done } = args;
  const state: OverlayState = {
    selectedIndex: selectedRowIndex(flow, flow.currentQuestion),
    subMode: initialSubMode(flow.currentQuestion),
    stagedSelections: new Map(),
    stagedSingleNotes: new Map(),
    stagedMultiNotes: new Map(),
    noteTarget: undefined,
    cachedLines: undefined,
    cachedWidth: undefined,
    maxHeight: 0,
  };
  const editor = new Editor(tui, makeEditorTheme(theme));
  const refresh = () => {
    state.cachedLines = undefined;
    tui.requestRender();
  };
  const finish = (outcome: QuestionnaireOutcome) => done(outcome);

  signal?.addEventListener("abort", () => {
    flow.abort();
    done(flow.outcome());
  });

  const deps = { flow, state, editor, refresh, finish };
  editor.onSubmit = (value) => onEditorSubmit(value, deps);

  return {
    render: (width) => {
      // pi's TUI does not call invalidate() on terminal resize, so a width
      // change has to invalidate the cache here or we'd return stale lines
      // truncated for the previous width.
      if (state.cachedWidth !== width) {
        state.cachedLines = undefined;
        state.cachedWidth = width;
        state.maxHeight = 0;
      }
      if (!state.cachedLines) {
        state.cachedLines = renderOverlay(width, theme, flow, state, editor);
        // Stabilize height — prevent shrinkage that triggers pi-tui's
        // viewport tracking bug with differential rendering.
        if (state.cachedLines.length > state.maxHeight) {
          state.maxHeight = state.cachedLines.length;
        }
        while (state.cachedLines.length < state.maxHeight) {
          state.cachedLines.push("");
        }
      }
      return state.cachedLines;
    },
    invalidate: () => {
      state.cachedLines = undefined;
    },
    handleInput: (data: string) => handleOverlayInput(data, deps),
  };
}

function makeEditorTheme(theme: Theme): EditorTheme {
  return {
    borderColor: (text) => theme.fg("accent", text),
    selectList: {
      selectedPrefix: (text) => theme.fg("accent", text),
      selectedText: (text) => theme.fg("accent", text),
      description: (text) => theme.fg("muted", text),
      scrollInfo: (text) => theme.fg("dim", text),
      noMatch: (text) => theme.fg("warning", text),
    },
  };
}
