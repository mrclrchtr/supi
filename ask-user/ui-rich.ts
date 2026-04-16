// Rich overlay questionnaire UI built on `ctx.ui.custom()`. Renders a tab bar
// for multi-question flows, supports recommendations, optional Other input,
// optional follow-up comments, and a final review screen. Returns a
// QuestionnaireOutcome whose terminal state is owned by the shared flow.

import type { Theme } from "@mariozechner/pi-coding-agent";
import {
  type Component,
  Editor,
  type EditorTheme,
  Key,
  matchesKey,
  type TUI,
} from "@mariozechner/pi-tui";
import { QuestionnaireFlow } from "./flow.ts";
import type { Answer, NormalizedQuestion, QuestionnaireOutcome } from "./types.ts";
import {
  displayOptionCount,
  isEditorMode,
  type OverlayRenderState,
  renderOverlay,
  type SubMode,
} from "./ui-rich-render.ts";

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
  questions: NormalizedQuestion[],
  opts: RunRichOptions,
): Promise<QuestionnaireOutcome | "unsupported"> {
  const flow = new QuestionnaireFlow(questions);
  // Short-circuit before opening the overlay if we were already aborted.
  // Otherwise signal.addEventListener("abort", …) would never fire and the
  // overlay would stay open until the user dismissed it manually.
  if (opts.signal?.aborted) {
    flow.abort();
    return flow.outcome();
  }
  // Open as a modal overlay. Without `{ overlay: true }`, pi replaces the
  // editor with the questionnaire and the user loses the surrounding
  // transcript while the questionnaire is open.
  const promise = opts.ui.custom<QuestionnaireOutcome>(
    (tui, theme, _kb, done) => buildOverlay({ tui, theme, flow, signal: opts.signal, done }),
    { overlay: true },
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

interface OverlayState extends OverlayRenderState {
  pendingAnswer: Answer | null;
  cachedLines: string[] | undefined;
  // Track the width the cached lines were rendered for. pi's TUI does not
  // call invalidate() on terminal resize, so we self-invalidate when the
  // width changes between render() calls.
  cachedWidth: number | undefined;
}

interface OverlayDeps {
  flow: QuestionnaireFlow;
  state: OverlayState;
  editor: Editor;
  refresh: () => void;
  finish: (o: QuestionnaireOutcome) => void;
}

function buildOverlay(args: BuildOverlayArgs): Component {
  const { tui, theme, flow, signal, done } = args;
  const state: OverlayState = {
    optionIndex: flow.currentQuestion?.recommendedIndex ?? 0,
    subMode: initialSubMode(flow.currentQuestion),
    pendingAnswer: null,
    cachedLines: undefined,
    cachedWidth: undefined,
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

  const deps: OverlayDeps = { flow, state, editor, refresh, finish };
  editor.onSubmit = (value) => onEditorSubmit(value, deps);

  return {
    render: (w) => {
      // pi's TUI does not call invalidate() on terminal resize, so a width
      // change has to invalidate the cache here or we'd return stale lines
      // truncated for the previous width.
      if (state.cachedWidth !== w) {
        state.cachedLines = undefined;
        state.cachedWidth = w;
      }
      if (!state.cachedLines) state.cachedLines = renderOverlay(w, theme, flow, state, editor);
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
    borderColor: (s) => theme.fg("accent", s),
    selectList: {
      selectedPrefix: (t) => theme.fg("accent", t),
      selectedText: (t) => theme.fg("accent", t),
      description: (t) => theme.fg("muted", t),
      scrollInfo: (t) => theme.fg("dim", t),
      noMatch: (t) => theme.fg("warning", t),
    },
  };
}

function initialSubMode(q: NormalizedQuestion | undefined): SubMode {
  if (!q) return "select";
  return q.type === "text" ? "text-input" : "select";
}

function onEditorSubmit(value: string, deps: OverlayDeps): void {
  const q = deps.flow.currentQuestion;
  if (!q) return;
  const trimmed = value.trim();
  const { state, editor, refresh } = deps;
  if (state.subMode === "text-input") {
    if (trimmed.length === 0) return;
    deps.flow.setAnswer({ questionId: q.id, source: "text", value: trimmed });
    moveAfterAnswer(deps);
    return;
  }
  if (state.subMode === "other-input") {
    if (trimmed.length === 0) {
      state.subMode = "select";
      editor.setText("");
      refresh();
      return;
    }
    state.pendingAnswer = { questionId: q.id, source: "other", value: trimmed };
    finalizePendingAnswer(deps);
    return;
  }
  if (state.subMode === "comment-input" && state.pendingAnswer) {
    state.pendingAnswer.comment = trimmed.length > 0 ? trimmed : undefined;
    deps.flow.setAnswer(state.pendingAnswer);
    state.pendingAnswer = null;
    moveAfterAnswer(deps);
  }
}

function handleOverlayInput(data: string, deps: OverlayDeps): void {
  const { state, flow } = deps;
  if (isEditorMode(state.subMode)) {
    if (matchesKey(data, Key.escape)) {
      handleEditorEscape(deps);
      return;
    }
    deps.editor.handleInput(data);
    deps.refresh();
    return;
  }
  if (matchesKey(data, Key.escape)) {
    flow.cancel();
    deps.finish(flow.outcome());
    return;
  }
  if (flow.currentMode === "reviewing") {
    handleReviewInput(data, deps);
    return;
  }
  if (state.subMode === "comment-prompt") {
    handleCommentPromptInput(data, deps);
    return;
  }
  handleSelectInput(data, deps);
}

function handleEditorEscape(deps: OverlayDeps): void {
  const { state, editor, flow, refresh } = deps;
  // Text questions have no non-editor state to fall back into, so Esc has to
  // match the select-mode behaviour and cancel the whole questionnaire.
  if (state.subMode === "text-input") {
    flow.cancel();
    deps.finish(flow.outcome());
    return;
  }
  if (state.subMode === "comment-input" && state.pendingAnswer) {
    state.subMode = "comment-prompt";
  } else if (state.subMode === "other-input") {
    state.subMode = "select";
  }
  editor.setText("");
  refresh();
}

function handleSelectInput(data: string, deps: OverlayDeps): void {
  const { flow, state, refresh } = deps;
  const q = flow.currentQuestion;
  if (!q) return;
  const optionCount = displayOptionCount(q);
  if (matchesKey(data, Key.up)) {
    state.optionIndex = Math.max(0, state.optionIndex - 1);
    refresh();
    return;
  }
  if (matchesKey(data, Key.down)) {
    state.optionIndex = Math.min(optionCount - 1, state.optionIndex + 1);
    refresh();
    return;
  }
  if (matchesKey(data, Key.shift("tab")) || matchesKey(data, Key.left)) {
    if (flow.goBack()) {
      resetSubModeForCurrent(deps);
      refresh();
    }
    return;
  }
  if (matchesKey(data, Key.tab) || matchesKey(data, Key.right)) {
    if (flow.allAnswered() && flow.enterReview()) refresh();
    return;
  }
  if (matchesKey(data, Key.enter)) handleSelectEnter(q, deps);
}

function handleSelectEnter(q: NormalizedQuestion, deps: OverlayDeps): void {
  const { state, editor, refresh } = deps;
  const total = displayOptionCount(q);
  const isOther = q.allowOther && state.optionIndex === total - 1;
  if (isOther) {
    state.subMode = "other-input";
    editor.setText("");
    refresh();
    return;
  }
  const idx = state.optionIndex;
  const option = q.options[idx];
  state.pendingAnswer = {
    questionId: q.id,
    source: q.type === "yesno" ? "yesno" : "option",
    value: option.value,
    optionIndex: idx,
  };
  finalizePendingAnswer(deps);
}

function handleCommentPromptInput(data: string, deps: OverlayDeps): void {
  const { state, flow, editor, refresh } = deps;
  if (matchesKey(data, "y")) {
    state.subMode = "comment-input";
    editor.setText("");
    refresh();
    return;
  }
  if (matchesKey(data, "n") || matchesKey(data, Key.enter)) {
    if (state.pendingAnswer) flow.setAnswer(state.pendingAnswer);
    state.pendingAnswer = null;
    moveAfterAnswer(deps);
  }
}

function handleReviewInput(data: string, deps: OverlayDeps): void {
  const { flow, refresh } = deps;
  if (matchesKey(data, Key.enter)) {
    if (flow.submit()) deps.finish(flow.outcome());
    return;
  }
  if (matchesKey(data, Key.shift("tab")) || matchesKey(data, Key.left) || matchesKey(data, "b")) {
    if (flow.goBack()) {
      resetSubModeForCurrent(deps);
      refresh();
    }
  }
}

function finalizePendingAnswer(deps: OverlayDeps): void {
  const { flow, state, refresh } = deps;
  const q = flow.currentQuestion;
  if (!q || !state.pendingAnswer) return;
  if (q.allowComment) {
    state.subMode = "comment-prompt";
    refresh();
    return;
  }
  flow.setAnswer(state.pendingAnswer);
  state.pendingAnswer = null;
  moveAfterAnswer(deps);
}

function moveAfterAnswer(deps: OverlayDeps): void {
  const { flow } = deps;
  flow.advance();
  if (flow.isTerminal()) {
    deps.finish(flow.outcome());
    return;
  }
  resetSubModeForCurrent(deps);
  deps.refresh();
}

function resetSubModeForCurrent(deps: OverlayDeps): void {
  const { flow, state, editor } = deps;
  const q = flow.currentQuestion;
  state.subMode = initialSubMode(q);
  state.optionIndex = q?.recommendedIndex ?? 0;
  state.pendingAnswer = null;
  editor.setText("");
}
