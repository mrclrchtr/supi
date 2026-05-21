import {
  type Component,
  Editor,
  type Focusable,
  Key,
  matchesKey,
  SelectList,
} from "@earendil-works/pi-tui";

import { AskUserController } from "../session/controller.ts";
import type {
  AskUserOutcome,
  NormalizedChoiceQuestion,
  NormalizedQuestionnaire,
} from "../types.ts";
import { createActionList } from "./overlay-actions.ts";
import {
  clampIndex,
  currentCustomValue,
  currentPreviewText,
  currentTextValue,
  makeEditorTheme,
  makeSelectListTheme,
  renderOverlayFrame,
} from "./overlay-render.ts";
import {
  buildChoiceItems,
  buildChoiceRows,
  type ChoiceRow,
  choiceRowValue,
  defaultChoiceRowIndex,
  type FocusTarget,
  type OverlayAction,
  type OverlayMode,
  previewOptionIndexForRows,
} from "./overlay-view.ts";
import type { OverlayArgs, RunQuestionnaireOptions } from "./types.ts";

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

class AskUserOverlay implements Component, Focusable {
  focused = false;

  private readonly editor: Editor;
  private focus: FocusTarget = "choices";
  private mode: OverlayMode = "choice";
  private closed = false;
  private cachedWidth: number | undefined;
  private cachedLines: string[] | undefined;
  private readonly onAbort: () => void;

  private choiceRows: ChoiceRow[] = [];
  private choiceRowIndex = 0;
  private previewOptionIndex = 0;
  private choiceList: SelectList | undefined;
  private textActions: Array<{ action: OverlayAction; label: string }> = [];
  private actionIndex = 0;
  private actionList: SelectList | undefined;

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
    this.editor.focused = this.focus === "editor";
    if (this.cachedWidth === width && this.cachedLines) return this.cachedLines;
    this.cachedWidth = width;
    this.cachedLines = renderOverlayFrame({
      width,
      theme: this.args.theme,
      controller: this.args.controller,
      mode: this.mode,
      focus: this.focus,
      editor: this.editor,
      choiceRows: this.choiceRows,
      choiceRowIndex: this.choiceRowIndex,
      actionList: this.actionList,
      textActionLabels: this.textActions.map(({ label }) => label),
      previewText: currentPreviewText(
        this.args.controller.currentQuestion,
        this.previewOptionIndex,
      ),
    });
    return this.cachedLines;
  }

  handleInput(data: string): void {
    if (this.closed || this.args.controller.isTerminal) return;

    if (this.args.keybindings.matches(data, "app.tools.expand")) {
      this.args.onToggleToolsExpanded?.();
      return;
    }

    if (matchesKey(data, Key.escape)) {
      this.args.controller.cancel();
      this.finish();
      return;
    }
    if (matchesKey(data, Key.left)) {
      if (this.args.controller.goBack()) {
        this.syncCurrentQuestion();
        this.refresh();
      }
      return;
    }

    switch (this.focus) {
      case "choices":
        this.handleChoiceKey(data);
        return;
      case "actions":
        this.handleActionKey(data);
        return;
      case "editor":
        this.handleEditorKey(data);
        return;
    }
  }

  invalidate(): void {
    this.cachedLines = undefined;
    this.choiceList?.invalidate();
    this.actionList?.invalidate();
    this.editor.invalidate();
  }

  dispose(): void {
    this.closed = true;
    this.args.signal?.removeEventListener("abort", this.onAbort);
  }

  private handleChoiceKey(data: string): void {
    const question = this.args.controller.currentQuestion;
    if (question.type !== "choice" || !this.choiceList) return;

    if (matchesKey(data, Key.space)) {
      const row = this.choiceRows[this.choiceRowIndex];
      if (row?.kind === "option") this.applyChoiceSelection(question, row.optionIndex, false);
      return;
    }

    this.choiceList.handleInput(data);
  }

  private handleActionKey(data: string): void {
    const question = this.args.controller.currentQuestion;
    if (!this.actionList) return;

    if (question.type === "text") {
      if (matchesKey(data, Key.up) && this.actionIndex === 0) {
        this.focus = "editor";
        this.refresh();
        return;
      }
    } else if (matchesKey(data, Key.up) && this.actionIndex === 0) {
      this.focus = "choices";
      this.refresh();
      return;
    }

    this.actionList.handleInput(data);
    this.refresh();
  }

  private handleEditorKey(data: string): void {
    if (this.mode === "text" && matchesKey(data, Key.down) && this.textActions.length > 0) {
      this.focus = "actions";
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
      if (trimmed.length === 0) return;
      this.args.controller.setAnswer(question.id, { kind: "custom", value: trimmed });
      this.advanceAfterQuestion();
      return;
    }
    if (trimmed.length === 0) {
      if (question.required) return;
      this.args.controller.clearAnswer(question.id);
      this.advanceAfterQuestion();
      return;
    }

    this.args.controller.setAnswer(question.id, { kind: "text", value: trimmed });
    this.advanceAfterQuestion();
  }

  private applyChoiceSelection(
    question: NormalizedChoiceQuestion,
    optionIndex: number,
    submit: boolean,
  ): void {
    if (question.multi) {
      this.toggleMultiChoice(question, optionIndex);
      if (submit && this.args.controller.hasAnswer(question.id)) this.advanceAfterQuestion();
      return;
    }

    const option = question.options[optionIndex];
    if (!option) return;
    this.args.controller.setAnswer(question.id, {
      kind: "choice",
      selections: [{ value: option.value, label: option.label }],
    });
    this.choiceRowIndex = optionIndex;
    this.previewOptionIndex = optionIndex;
    if (submit) {
      this.advanceAfterQuestion();
      return;
    }
    this.buildChoiceList(question);
    this.refresh();
  }

  private toggleMultiChoice(question: NormalizedChoiceQuestion, optionIndex: number): void {
    const existing = new Set(this.args.controller.getSelectedIndexes(question));
    if (existing.has(optionIndex)) existing.delete(optionIndex);
    else existing.add(optionIndex);

    const selections = [...existing]
      .sort((left, right) => left - right)
      .flatMap((index) => {
        const option = question.options[index];
        return option ? [{ value: option.value, label: option.label }] : [];
      });

    if (selections.length > 0) {
      this.args.controller.setAnswer(question.id, { kind: "choice", selections });
    } else {
      this.args.controller.clearAnswer(question.id);
    }
    this.choiceRowIndex = optionIndex;
    this.previewOptionIndex = optionIndex;
    this.buildChoiceList(question);
    this.refresh();
  }

  private handleAction(action: OverlayAction): void {
    switch (action) {
      case "other":
        this.mode = "custom-input";
        this.focus = "editor";
        this.editor.setText(currentCustomValue(this.args.controller));
        this.refresh();
        return;
      case "skip":
        this.args.controller.clearAnswer(this.args.controller.currentQuestion.id);
        this.advanceAfterQuestion();
        return;
      case "discuss":
        this.mode = "discuss-input";
        this.focus = "editor";
        this.editor.setText("");
        this.refresh();
        return;
      case "partial":
        this.args.controller.finishPartial();
        this.finish();
        return;
    }
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
      this.focus = "editor";
      this.editor.setText(currentTextValue(this.args.controller, question.initial));
      this.buildTextActions();
      this.choiceRows = [];
      return;
    }

    this.mode = "choice";
    this.focus = "choices";
    this.textActions = [];
    this.actionList = undefined;
    this.editor.setText("");
    this.choiceRows = buildChoiceRows(this.args.controller, question);
    this.choiceRowIndex = clampIndex(
      defaultChoiceRowIndex(this.args.controller, question, this.choiceRows),
      this.choiceRows.length,
    );
    this.previewOptionIndex =
      previewOptionIndexForRows(this.choiceRows, this.choiceRowIndex, this.previewOptionIndex) ?? 0;
    this.buildChoiceList(question);
  }

  private buildChoiceList(question: NormalizedChoiceQuestion): void {
    const items = buildChoiceItems(this.args.controller, question, this.choiceRows);

    const list = new SelectList(
      items,
      Math.min(this.choiceRows.length, 10),
      makeSelectListTheme(this.args.theme),
    );
    list.onSelectionChange = (item) => {
      const nextIndex = this.choiceRows.findIndex((row) => choiceRowValue(row) === item.value);
      if (nextIndex < 0) return;
      this.choiceRowIndex = nextIndex;
      this.previewOptionIndex =
        previewOptionIndexForRows(this.choiceRows, nextIndex, this.previewOptionIndex) ??
        this.previewOptionIndex;
      this.refresh();
    };
    list.onSelect = (item) => {
      const row = this.choiceRows.find((candidate) => choiceRowValue(candidate) === item.value);
      if (!row) return;
      if (row.kind === "option") {
        this.applyChoiceSelection(question, row.optionIndex, true);
        return;
      }
      this.handleAction(row.action);
    };
    list.setSelectedIndex(this.choiceRowIndex);
    this.choiceList = list;
  }

  private buildTextActions(): void {
    const state = createActionList({
      controller: this.args.controller,
      theme: this.args.theme,
      actionIndex: this.actionIndex,
      onIndexChange: (index) => {
        this.actionIndex = index;
        this.refresh();
      },
      onAction: (action) => this.handleAction(action),
    });
    this.textActions = state.entries;
    this.actionList = state.list;
    this.actionIndex = state.index;
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
