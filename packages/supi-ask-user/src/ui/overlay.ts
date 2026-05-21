import type { Theme } from "@earendil-works/pi-coding-agent";
import {
  type Component,
  Editor,
  type EditorTheme,
  type Focusable,
  Key,
  matchesKey,
  type TUI,
} from "@earendil-works/pi-tui";
import { AskUserController } from "../session/controller.ts";
import type {
  AskUserOutcome,
  NormalizedChoiceQuestion,
  NormalizedQuestionnaire,
} from "../types.ts";
import {
  defaultSelectedIndex,
  isEditorMode,
  type OverlayAction,
  type OverlayRow,
  renderOverlay,
  rowsForCurrentQuestion,
} from "./overlay-view.ts";
import type { RunQuestionnaireOptions } from "./types.ts";

interface OverlayArgs {
  tui: TUI;
  theme: Theme;
  controller: AskUserController;
  done: (result: AskUserOutcome) => void;
  signal?: AbortSignal;
}

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
    (tui, theme, _kb, done) =>
      new AskUserOverlay({ tui, theme, controller, done, signal: opts.signal }),
  ) as Promise<AskUserOutcome>;
}

class AskUserOverlay implements Component, Focusable {
  focused = false;

  private readonly editor: Editor;
  private mode: "choice" | "text" | "text-input" | "custom-input" | "discuss-input" = "choice";
  private selectedIndex = 0;
  private closed = false;
  private cachedWidth: number | undefined;
  private cachedLines: string[] | undefined;
  private readonly onAbort: () => void;

  constructor(private readonly args: OverlayArgs) {
    this.editor = new Editor(args.tui, makeEditorTheme(args.theme));
    this.editor.onSubmit = (value) => this.handleEditorSubmit(value);
    this.syncCurrentQuestion();
    this.onAbort = () => {
      this.args.controller.abort();
      this.finish();
    };
    args.signal?.addEventListener("abort", this.onAbort);
  }

  render(width: number): string[] {
    this.editor.focused = this.focused;
    if (this.cachedWidth === width && this.cachedLines) return this.cachedLines;
    this.cachedWidth = width;
    this.cachedLines = renderOverlay({
      width,
      theme: this.args.theme,
      controller: this.args.controller,
      mode: this.mode,
      selectedIndex: this.selectedIndex,
      editor: this.editor,
    });
    return this.cachedLines;
  }

  handleInput(data: string): void {
    if (this.closed || this.args.controller.isTerminal) return;
    if (isEditorMode(this.mode)) {
      this.handleEditorKey(data);
      return;
    }
    this.handleSelectionKey(data);
  }

  invalidate(): void {
    this.cachedLines = undefined;
  }

  dispose(): void {
    this.closed = true;
    this.args.signal?.removeEventListener("abort", this.onAbort);
  }

  private handleSelectionKey(data: string): void {
    const controller = this.args.controller;
    const rows = rowsForCurrentQuestion(controller);
    const question = controller.currentQuestion;

    if (matchesKey(data, Key.escape)) {
      controller.cancel();
      this.finish();
      return;
    }
    if (matchesKey(data, Key.left)) {
      if (controller.goBack()) {
        this.syncCurrentQuestion();
        this.refresh();
      }
      return;
    }
    if (matchesKey(data, Key.up)) {
      if (question.type === "text" && this.mode === "text" && this.selectedIndex === 0) {
        this.mode = "text-input";
        this.refresh();
        return;
      }
      this.selectedIndex = Math.max(0, this.selectedIndex - 1);
      this.refresh();
      return;
    }
    if (matchesKey(data, Key.down)) {
      this.selectedIndex = Math.min(rows.length - 1, this.selectedIndex + 1);
      this.refresh();
      return;
    }

    const selectedRow = rows[this.selectedIndex];
    if (
      question.type === "choice" &&
      matchesKey(data, Key.space) &&
      selectedRow?.kind === "option"
    ) {
      this.selectChoice(question, selectedRow.optionIndex, false);
      return;
    }
    if (matchesKey(data, Key.enter)) {
      this.handleRowEnter(selectedRow);
    }
  }

  private handleEditorKey(data: string): void {
    const rows = rowsForCurrentQuestion(this.args.controller);
    if (matchesKey(data, Key.escape)) {
      this.args.controller.cancel();
      this.finish();
      return;
    }
    if (
      this.args.controller.currentQuestion.type === "text" &&
      matchesKey(data, Key.down) &&
      rows.length > 0
    ) {
      this.mode = "text";
      this.selectedIndex = 0;
      this.refresh();
      return;
    }
    this.editor.handleInput(data);
    this.refresh();
  }

  private handleEditorSubmit(value: string): void {
    const trimmed = value.trim();
    const question = this.args.controller.currentQuestion;

    if (this.mode === "discuss-input") {
      this.args.controller.finishDiscuss(trimmed || undefined);
      this.finish();
      return;
    }

    if (this.mode === "custom-input") {
      if (!trimmed) {
        this.syncCurrentQuestion();
        this.refresh();
        return;
      }
      this.args.controller.setAnswer(question.id, { kind: "custom", value: trimmed });
      this.advanceAfterQuestion();
      return;
    }

    if (!trimmed) {
      if (question.required) return;
      this.args.controller.clearAnswer(question.id);
      this.advanceAfterQuestion();
      return;
    }

    this.args.controller.setAnswer(question.id, { kind: "text", value: trimmed });
    this.advanceAfterQuestion();
  }

  private handleRowEnter(row: OverlayRow | undefined): void {
    if (!row) return;
    if (row.kind === "option") {
      const question = this.args.controller.currentQuestion;
      if (question.type !== "choice") return;
      this.selectChoice(question, row.optionIndex, true);
      return;
    }
    this.handleAction(row.action);
  }

  private selectChoice(
    question: NormalizedChoiceQuestion,
    optionIndex: number,
    submit: boolean,
  ): void {
    if (question.multi) {
      this.toggleMultiSelection(question, optionIndex);
      if (submit && this.args.controller.hasAnswer(question.id)) this.advanceAfterQuestion();
      return;
    }

    const option = resolveOption(question, optionIndex);
    this.args.controller.setAnswer(question.id, {
      kind: "choice",
      selections: [{ value: option.value, label: option.label }],
    });
    if (submit) this.advanceAfterQuestion();
    else this.refresh();
  }

  private handleAction(action: OverlayAction): void {
    switch (action) {
      case "other":
        this.openCustomEditor();
        return;
      case "skip":
        this.args.controller.clearAnswer(this.args.controller.currentQuestion.id);
        this.advanceAfterQuestion();
        return;
      case "discuss":
        this.openDiscussEditor();
        return;
      case "partial":
        this.args.controller.finishPartial();
        this.finish();
        return;
    }
  }

  private toggleMultiSelection(question: NormalizedChoiceQuestion, optionIndex: number): void {
    const existing = new Set(this.args.controller.getSelectedIndexes(question));
    if (existing.has(optionIndex)) existing.delete(optionIndex);
    else existing.add(optionIndex);

    const selections = [...existing]
      .sort((left, right) => left - right)
      .map((index) => {
        const option = resolveOption(question, index);
        return { value: option.value, label: option.label };
      });

    if (selections.length > 0) {
      this.args.controller.setAnswer(question.id, { kind: "choice", selections });
    } else {
      this.args.controller.clearAnswer(question.id);
    }
    this.refresh();
  }

  private openCustomEditor(): void {
    const question = this.args.controller.currentQuestion;
    if (question.type !== "choice") return;
    this.mode = "custom-input";
    const current = this.args.controller.getAnswer(question.id);
    this.editor.setText(current?.kind === "custom" ? current.value : "");
    this.refresh();
  }

  private openDiscussEditor(): void {
    this.mode = "discuss-input";
    this.editor.setText("");
    this.refresh();
  }

  private advanceAfterQuestion(): void {
    if (!this.args.controller.goNext()) {
      this.args.controller.finishSubmitted();
      this.finish();
      return;
    }
    this.syncCurrentQuestion();
    this.refresh();
  }

  private syncCurrentQuestion(): void {
    const question = this.args.controller.currentQuestion;
    if (question.type === "text") {
      this.mode = "text-input";
      const current = this.args.controller.getAnswer(question.id);
      this.editor.setText(current?.kind === "text" ? current.value : (question.initial ?? ""));
      this.selectedIndex = 0;
      return;
    }

    this.mode = "choice";
    this.selectedIndex = defaultSelectedIndex(this.args.controller);
    this.editor.setText("");
  }

  private refresh(): void {
    this.cachedLines = undefined;
    this.args.tui.requestRender();
  }

  private finish(): void {
    if (this.closed) return;
    this.closed = true;
    this.args.signal?.removeEventListener("abort", this.onAbort);
    this.args.done(this.args.controller.outcome());
  }
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

function resolveOption(question: NormalizedChoiceQuestion, optionIndex: number) {
  const option = question.options[optionIndex];
  if (!option) {
    throw new Error(`Invalid option index for question "${question.id}".`);
  }
  return option;
}
