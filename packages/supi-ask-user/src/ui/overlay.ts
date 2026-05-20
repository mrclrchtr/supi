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
  type ChoiceRow,
  defaultSelectedIndex,
  isEditorMode,
  type OverlayMode,
  renderOverlay,
  rowsForQuestion,
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
  private mode: OverlayMode = "choice";
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
    if (this.handleGlobalKey(data)) return;
    this.handleChoiceKey(data);
  }

  invalidate(): void {
    this.cachedLines = undefined;
  }

  dispose(): void {
    this.closed = true;
    this.args.signal?.removeEventListener("abort", this.onAbort);
  }

  private handleGlobalKey(data: string): boolean {
    if (matchesKey(data, Key.escape)) {
      this.args.controller.cancel();
      this.finish();
      return true;
    }
    if (matchesKey(data, Key.left) || matchesKey(data, "b")) {
      if (this.args.controller.goBack()) {
        this.syncCurrentQuestion();
        this.refresh();
      }
      return true;
    }
    if (matchesKey(data, Key.ctrl("g")) && this.args.controller.questionnaire.allowDiscuss) {
      this.openDiscussEditor();
      return true;
    }
    if (matchesKey(data, Key.ctrl("p")) && this.args.controller.canPartialSubmit()) {
      this.args.controller.finishPartial();
      this.finish();
      return true;
    }
    return false;
  }

  private handleChoiceKey(data: string): void {
    const question = this.args.controller.currentQuestion;
    if (question.type === "text") {
      this.mode = "text";
      this.editor.handleInput(data);
      this.refresh();
      return;
    }

    const rows = rowsForQuestion(question);
    if (matchesKey(data, Key.up)) {
      this.selectedIndex = Math.max(0, this.selectedIndex - 1);
      this.refresh();
      return;
    }
    if (matchesKey(data, Key.down)) {
      this.selectedIndex = Math.min(rows.length - 1, this.selectedIndex + 1);
      this.refresh();
      return;
    }
    if (question.multi && matchesKey(data, Key.space)) {
      this.toggleMultiSelection(question, rows[this.selectedIndex]);
      return;
    }
    if (matchesKey(data, Key.enter)) {
      this.handleChoiceEnter(question, rows[this.selectedIndex]);
    }
  }

  private handleEditorKey(data: string): void {
    if (matchesKey(data, Key.escape)) {
      this.handleEditorEscape();
      return;
    }
    if (matchesKey(data, Key.ctrl("g")) && this.args.controller.questionnaire.allowDiscuss) {
      this.openDiscussEditor();
      return;
    }
    if (matchesKey(data, Key.ctrl("p")) && this.args.controller.canPartialSubmit()) {
      this.args.controller.finishPartial();
      this.finish();
      return;
    }
    this.editor.handleInput(data);
    this.refresh();
  }

  private handleEditorEscape(): void {
    if (this.mode !== "text") {
      this.syncCurrentQuestion();
      this.refresh();
      return;
    }
    if (this.args.controller.currentQuestion.required) {
      this.args.controller.cancel();
      this.finish();
      return;
    }
    this.args.controller.clearAnswer(this.args.controller.currentQuestion.id);
    this.advanceAfterQuestion();
  }

  private handleEditorSubmit(value: string): void {
    const trimmed = value.trim();
    const question = this.args.controller.currentQuestion;

    if (this.mode === "discuss") {
      this.args.controller.finishDiscuss(trimmed || undefined);
      this.finish();
      return;
    }
    if (this.mode === "custom") {
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

  private handleChoiceEnter(question: NormalizedChoiceQuestion, row: ChoiceRow | undefined): void {
    if (!row) return;
    if (row.kind === "continue") {
      if (this.args.controller.hasAnswer(question.id) || !question.required) {
        this.advanceAfterQuestion();
      }
      return;
    }
    if (row.kind === "other") {
      this.mode = "custom";
      const current = this.args.controller.getAnswer(question.id);
      this.editor.setText(current?.kind === "custom" ? current.value : "");
      this.refresh();
      return;
    }
    if (question.multi) {
      this.toggleMultiSelection(question, row);
      return;
    }

    const option = resolveOption(question, row.optionIndex);
    this.args.controller.setAnswer(question.id, {
      kind: "choice",
      selections: [{ value: option.value, label: option.label }],
    });
    this.advanceAfterQuestion();
  }

  private toggleMultiSelection(
    question: NormalizedChoiceQuestion,
    row: ChoiceRow | undefined,
  ): void {
    if (!row || row.kind !== "option") return;
    const optionIndex = row.optionIndex;
    if (optionIndex === undefined) return;

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

  private openDiscussEditor(): void {
    this.mode = "discuss";
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
      this.mode = "text";
      const current = this.args.controller.getAnswer(question.id);
      this.editor.setText(current?.kind === "text" ? current.value : (question.initial ?? ""));
      this.selectedIndex = 0;
      return;
    }
    this.mode = "choice";
    this.selectedIndex = defaultSelectedIndex(this.args.controller, question);
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

function resolveOption(question: NormalizedChoiceQuestion, optionIndex: number | undefined) {
  const option = optionIndex !== undefined ? question.options[optionIndex] : undefined;
  if (!option) {
    throw new Error(`Invalid option index for question "${question.id}".`);
  }
  return option;
}
