// biome-ignore lint/style/noExcessiveLinesPerFile: complex keyboard orchestration
import {
  type Component,
  Editor,
  type EditorComponent,
  type EditorTheme,
  type Focusable,
  isFocusable,
  Key,
  matchesKey,
} from "@earendil-works/pi-tui";
import type { NormalizedChoiceQuestion } from "../types.ts";
import { renderFormFrame } from "./form-render.ts";
import { defaultChoiceRowIndex, type FormMode, focusForMode } from "./form-view.ts";
import { calculateFormHeightLimit } from "./form-viewport.ts";
import type { FormArgs } from "./types.ts";

type QuestionnaireMode = "choice" | "text" | "review";

type CommentEdit =
  | { kind: "form"; context: string }
  | {
      kind: "question";
      questionId: string;
      context: string;
      returnChoiceFocusIndex: number;
    }
  | {
      kind: "option";
      questionId: string;
      optionValue: string;
      context: string;
      returnChoiceFocusIndex: number;
    };

export class AskUserForm implements Component, Focusable {
  focused: boolean = false;
  /** The base screen remains active while a temporary comment editor overlays it. */
  private baseMode: QuestionnaireMode = "choice";
  private readonly editor: EditorComponent;
  private readonly editorHandlesEscape: boolean;
  private settingEditorText: boolean = false;
  private choiceFocusIndex = 0;
  private readonly choiceFocusByQuestionId = new Map<string, number>();
  private reviewFocusIndex = 0;
  private closed: boolean = false;
  private cachedWidth: number | undefined;
  private cachedTerminalRows: number | undefined;
  private cachedEditorFocused: boolean | undefined;
  private cachedLines: string[] | undefined;
  private scrollOffset = 0;
  private viewportPageSize = 1;
  private viewportMaxScrollOffset = 0;
  private viewportOverflow = false;
  private revealFocusedContent = true;
  private commentEdit: CommentEdit | undefined;
  private returnToReviewAfterEdit: boolean = false;
  private pendingEsc: boolean = false;
  private readonly onAbort: () => void;

  constructor(private readonly args: FormArgs) {
    const { editor, handlesEscape } = createFormEditor(args, {
      onChange: () => {
        if (this.settingEditorText) return;
        this.syncTextAnswerFromEditor();
        this.refresh();
      },
      onSubmit: (value) => this.handleEditorSubmit(value),
      onEscape: () => this.handleEditorEscape(),
    });
    this.editor = editor;
    this.editorHandlesEscape = handlesEscape;
    this.syncCurrentQuestion();
    this.onAbort = () => {
      this.args.controller.abort();
      this.finish();
    };
    args.signal?.addEventListener("abort", this.onAbort);
  }

  render(width: number): string[] {
    const mode = this.currentMode();
    const focus = focusForMode(mode);
    const editorFocused = this.focused && focus === "editor";
    const terminalRows = this.args.tui.terminal.rows;
    const dimensionsChanged =
      this.cachedWidth !== undefined &&
      (this.cachedWidth !== width || this.cachedTerminalRows !== terminalRows);
    if (isFocusable(this.editor)) this.editor.focused = editorFocused;

    if (
      this.cachedWidth === width &&
      this.cachedTerminalRows === terminalRows &&
      this.cachedEditorFocused === editorFocused &&
      this.cachedLines
    ) {
      return this.cachedLines;
    }

    this.cachedWidth = width;
    this.cachedTerminalRows = terminalRows;
    this.cachedEditorFocused = editorFocused;
    const frame = renderFormFrame({
      width,
      maxHeight: calculateFormHeightLimit(terminalRows),
      scrollOffset: this.scrollOffset,
      revealFocus: this.revealFocusedContent || dimensionsChanged,
      theme: this.args.theme,
      controller: this.args.controller,
      mode,
      focus,
      editor: this.editor,
      choiceFocusIndex: this.choiceFocusIndex,
      reviewFocusIndex: this.reviewFocusIndex,
      detailsText: this.currentDetailsText(),
      editorLabel: this.currentEditorLabel(),
      editorContext: this.commentEdit?.context,
    });
    this.scrollOffset = frame.viewport.scrollOffset;
    this.viewportPageSize = frame.viewport.pageSize;
    this.viewportMaxScrollOffset = frame.viewport.maxScrollOffset;
    this.viewportOverflow = frame.viewport.overflow;
    this.revealFocusedContent = false;
    this.cachedLines = frame.lines;
    return this.cachedLines;
  }

  handleInput(data: string): void {
    if (this.closed || this.args.controller.isTerminal) return;

    if (this.args.keybindings.matches(data, "app.tools.expand")) {
      this.args.onToggleToolsExpanded?.();
      return;
    }

    if (this.handleEscapeKey(data)) return;
    if (this.handleViewportKey(data)) return;
    if (this.handleNavigationKey(data)) return;

    if (this.isCommentEditorMode()) {
      this.handleCommentEditorKey(data);
      return;
    }

    if (this.baseMode === "review") {
      this.handleReviewInput(data);
      return;
    }

    const question = this.args.controller.currentQuestion;
    if (question.type === "text") {
      this.handleTextKey(data);
      return;
    }

    this.handleChoiceKey(data);
  }

  private handleEscapeKey(data: string): boolean {
    if (!matchesKey(data, Key.escape)) return false;

    if (this.editorHandlesEscape && (this.baseMode === "text" || this.isCommentEditorMode())) {
      this.editor.handleInput(data);
      if (!this.closed) this.refreshWithFocusReveal();
      return true;
    }

    if (this.isCommentEditorMode()) {
      this.returnFromCommentEditor();
      this.refresh();
      return true;
    }

    if (this.baseMode === "text") {
      this.pendingEsc = true;
      setTimeout(() => {
        if (this.pendingEsc) {
          this.pendingEsc = false;
          this.args.controller.cancel();
          this.finish();
        }
      }, 80);
      return true;
    }

    this.args.controller.cancel();
    this.finish();
    return true;
  }

  private handleEditorEscape(): void {
    if (this.isCommentEditorMode()) {
      this.returnFromCommentEditor();
      this.refresh();
      return;
    }
    if (this.baseMode === "text") {
      this.args.controller.cancel();
      this.finish();
    }
  }

  private handleViewportKey(data: string): boolean {
    if (!this.viewportOverflow) return false;
    const editorFocused = focusForMode(this.currentMode()) === "editor";
    const pageUp = editorFocused ? Key.alt("pageUp") : Key.pageUp;
    const pageDown = editorFocused ? Key.alt("pageDown") : Key.pageDown;
    const direction = matchesKey(data, pageUp) ? -1 : matchesKey(data, pageDown) ? 1 : 0;
    if (direction === 0) return false;

    const pageDelta = Math.max(1, this.viewportPageSize - 1);
    this.scrollViewportByLines(direction * pageDelta);
    return true;
  }

  private handleNavigationKey(data: string): boolean {
    if (this.isCommentEditorMode()) return false;

    const direction = this.navigationDirectionFor(data);
    if (!direction) return false;

    if (direction === "forward" && this.baseMode !== "review") {
      this.navigateForward();
    } else if (direction === "backward") {
      if (this.baseMode === "review") {
        this.saveCurrentChoiceFocus();
        this.goToLastQuestion();
        this.syncCurrentQuestion();
        this.refresh();
      } else {
        this.navigateBackward();
      }
    }
    return true;
  }

  private navigationDirectionFor(data: string): "forward" | "backward" | undefined {
    if (matchesKey(data, Key.tab)) return "forward";
    if (matchesKey(data, Key.shift("tab"))) return "backward";
    if (this.baseMode === "text") return undefined;
    if (matchesKey(data, Key.left)) return "backward";
    if (matchesKey(data, Key.right)) return "forward";
    return undefined;
  }

  private navigateForward(): void {
    this.syncTextAnswerFromEditor();
    this.goNext();
  }

  private navigateBackward(): void {
    this.syncTextAnswerFromEditor();
    this.saveCurrentChoiceFocus();
    this.returnToReviewAfterEdit = false;
    this.args.controller.goBack();
    this.syncCurrentQuestion();
    this.refresh();
  }

  private isCommentEditorMode(): boolean {
    return this.commentEdit !== undefined;
  }

  invalidate(): void {
    this.cachedLines = undefined;
    this.editor.invalidate();
  }

  dispose(): void {
    this.closed = true;
    this.args.signal?.removeEventListener("abort", this.onAbort);
  }

  // ── Review screen ───────────────────────────────────────────────

  private handleReviewInput(data: string): void {
    const questionCount = this.args.controller.questionnaire.questions.length;
    const submitIndex = questionCount;

    if (matchesKey(data, Key.enter)) {
      if (this.reviewFocusIndex === submitIndex) {
        this.finish();
      } else {
        this.goToQuestion(this.reviewFocusIndex, { returnToReviewAfterEdit: true });
      }
      return;
    }

    if (matchesKey(data, Key.up)) {
      if (this.reviewFocusIndex === 0) {
        this.scrollViewportByLines(-1);
        return;
      }
      this.reviewFocusIndex -= 1;
      this.refreshWithFocusReveal();
      return;
    }

    if (matchesKey(data, Key.down)) {
      if (this.reviewFocusIndex === submitIndex) {
        this.scrollViewportByLines(1);
        return;
      }
      this.reviewFocusIndex += 1;
      this.refreshWithFocusReveal();
      return;
    }

    if (data === "c") {
      this.openFormCommentEditor();
    }
  }

  // ── Choice screen ───────────────────────────────────────────────

  private handleChoiceKey(data: string): void {
    const question = this.args.controller.currentQuestion;
    if (question.type !== "choice") return;
    if (this.handleChoiceNavigation(data, question.options.length)) return;

    if (matchesKey(data, Key.space)) {
      if (question.multi) {
        this.args.controller.toggleChoiceOption(question, this.choiceFocusIndex);
      } else {
        this.args.controller.selectChoiceOption(question, this.choiceFocusIndex);
      }
      this.refreshWithFocusReveal();
      return;
    }

    if (matchesKey(data, Key.enter)) {
      if (!question.multi && !this.args.controller.isQuestionMarkedUnanswered(question.id)) {
        this.args.controller.selectChoiceOption(question, this.choiceFocusIndex);
      }
      this.goNext();
      return;
    }

    if (data === "u") {
      this.args.controller.markCurrentQuestionUnanswered();
      this.refreshWithFocusReveal();
      return;
    }

    if (data === "c") {
      this.openQuestionCommentEditor(question.id);
      return;
    }

    if (data === "n") {
      this.openOptionCommentEditor(question, this.choiceFocusIndex);
    }
  }

  private handleChoiceNavigation(data: string, optionCount: number): boolean {
    if (matchesKey(data, Key.up)) {
      if (this.choiceFocusIndex === 0) this.scrollViewportByLines(-1);
      else {
        this.choiceFocusIndex -= 1;
        this.refreshWithFocusReveal();
      }
      return true;
    }

    if (matchesKey(data, Key.down)) {
      if (this.choiceFocusIndex === optionCount - 1) this.scrollViewportByLines(1);
      else {
        this.choiceFocusIndex += 1;
        this.refreshWithFocusReveal();
      }
      return true;
    }

    return false;
  }

  // ── Text screen ─────────────────────────────────────────────────

  private handleTextKey(data: string): void {
    if (this.pendingEsc) {
      this.pendingEsc = false;
      if (data === "u") {
        this.args.controller.markCurrentQuestionUnanswered();
        this.setEditorText("");
        this.refreshWithFocusReveal();
        return;
      }
      if (data === "c") {
        this.syncTextAnswerFromEditor();
        this.openQuestionCommentEditor(this.args.controller.currentQuestion.id);
        return;
      }
    }

    if (matchesKey(data, Key.alt("c"))) {
      this.syncTextAnswerFromEditor();
      this.openQuestionCommentEditor(this.args.controller.currentQuestion.id);
      return;
    }

    if (matchesKey(data, Key.alt("u"))) {
      this.args.controller.markCurrentQuestionUnanswered();
      this.setEditorText("");
      this.refreshWithFocusReveal();
      return;
    }

    if (isFocusable(this.editor)) this.requestFocusReveal();
    this.editor.handleInput(data);
    this.refresh();
  }

  // ── Comment editors ─────────────────────────────────────────────

  private handleCommentEditorKey(data: string): void {
    if (isFocusable(this.editor)) this.requestFocusReveal();
    this.editor.handleInput(data);
    this.refresh();
  }

  private handleEditorSubmit(value: string): void {
    const edit = this.commentEdit;
    if (!edit) {
      if (this.baseMode === "text") {
        this.args.controller.setTextAnswer(this.args.controller.currentQuestion.id, value);
        this.goNext();
      }
      return;
    }

    switch (edit.kind) {
      case "form":
        this.args.controller.setComment(value);
        break;
      case "question":
        this.args.controller.setQuestionComment(edit.questionId, value);
        break;
      case "option": {
        const question = this.args.controller.questionnaire.questions.find(
          (candidate) => candidate.id === edit.questionId,
        );
        if (question?.type === "choice") {
          const optionIndex = question.options.findIndex(
            (option) => option.value === edit.optionValue,
          );
          if (optionIndex >= 0) {
            this.args.controller.setChoiceOptionComment(question, optionIndex, value);
          }
        }
        break;
      }
    }

    this.returnFromCommentEditor();
    this.refresh();
  }

  private openFormCommentEditor(): void {
    this.commentEdit = {
      kind: "form",
      context: this.args.controller.questionnaire.title ?? "Form",
    };
    this.setEditorText(this.args.controller.comment ?? "");
    this.resetViewport();
    this.refresh();
  }

  private openQuestionCommentEditor(questionId: string): void {
    this.commentEdit = {
      kind: "question",
      questionId,
      context: this.args.controller.currentQuestion.header,
      returnChoiceFocusIndex: this.choiceFocusIndex,
    };
    this.setEditorText(this.args.controller.getQuestionComment(questionId) ?? "");
    this.resetViewport();
    this.refresh();
  }

  private openOptionCommentEditor(question: NormalizedChoiceQuestion, optionIndex: number): void {
    const option = question.options[optionIndex];
    if (!option) return;
    this.commentEdit = {
      kind: "option",
      questionId: question.id,
      optionValue: option.value,
      context: option.label,
      returnChoiceFocusIndex: optionIndex,
    };
    this.setEditorText(this.args.controller.getOptionComment(question.id, option.value) ?? "");
    this.resetViewport();
    this.refresh();
  }

  private returnFromCommentEditor(): void {
    const edit = this.commentEdit;
    if (!edit) return;
    this.commentEdit = undefined;

    switch (edit.kind) {
      case "form":
        this.baseMode = "review";
        this.setEditorText("");
        this.resetViewport();
        return;
      case "question":
        this.syncCurrentQuestion();
        this.restoreChoiceFocus(edit.questionId, undefined, edit.returnChoiceFocusIndex);
        return;
      case "option":
        this.syncCurrentQuestion();
        this.restoreChoiceFocus(edit.questionId, edit.optionValue, edit.returnChoiceFocusIndex);
    }
  }

  // ── Navigation helpers ──────────────────────────────────────────

  private goNext(): void {
    this.saveCurrentChoiceFocus();
    if (this.returnToReviewAfterEdit) {
      this.returnToReviewAfterEdit = false;
      this.baseMode = "review";
      this.reviewFocusIndex = this.args.controller.questionnaire.questions.length;
      this.setEditorText("");
      this.resetViewport();
      this.refresh();
      return;
    }
    if (
      this.args.controller.currentIndex >=
      this.args.controller.questionnaire.questions.length - 1
    ) {
      this.baseMode = "review";
      // Focus the Submit row by default so Enter submits immediately.
      this.reviewFocusIndex = this.args.controller.questionnaire.questions.length;
      this.resetViewport();
      this.refresh();
      return;
    }
    this.args.controller.goNext();
    this.syncCurrentQuestion();
    this.refresh();
  }

  private goToLastQuestion(): void {
    const lastIndex = this.args.controller.questionnaire.questions.length - 1;
    this.args.controller.goTo(lastIndex);
  }

  private goToQuestion(index: number, opts: { returnToReviewAfterEdit?: boolean } = {}): void {
    if (index < 0 || index >= this.args.controller.questionnaire.questions.length) return;
    this.saveCurrentChoiceFocus();
    this.returnToReviewAfterEdit = opts.returnToReviewAfterEdit ?? false;
    this.args.controller.goTo(index);
    this.syncCurrentQuestion();
    this.refresh();
  }

  private syncCurrentQuestion(): void {
    const question = this.args.controller.currentQuestion;

    if (question.type === "text") {
      this.baseMode = "text";
      this.setEditorText(this.args.controller.getTextAnswer(question.id));
      this.resetViewport();
      return;
    }

    this.baseMode = "choice";
    this.setEditorText("");
    this.choiceFocusIndex =
      this.choiceFocusByQuestionId.get(question.id) ??
      defaultChoiceRowIndex(this.args.controller, question);
    this.resetViewport();
  }

  private saveCurrentChoiceFocus(): void {
    const question = this.args.controller.currentQuestion;
    if (question.type === "choice") {
      this.choiceFocusByQuestionId.set(question.id, this.choiceFocusIndex);
    }
  }

  private syncTextAnswerFromEditor(): void {
    if (this.currentMode() !== "text") return;
    const question = this.args.controller.currentQuestion;
    if (question.type !== "text") return;
    this.args.controller.setTextAnswer(
      question.id,
      this.editor.getExpandedText?.() ?? this.editor.getText(),
    );
  }

  private restoreChoiceFocus(
    questionId: string | undefined,
    optionValue: string | undefined,
    fallbackIndex: number | undefined,
  ): void {
    const question = this.args.controller.currentQuestion;
    if (question.type !== "choice" || question.id !== questionId) return;

    const optionIndex =
      optionValue === undefined
        ? fallbackIndex
        : question.options.findIndex((option) => option.value === optionValue);
    if (optionIndex === undefined || optionIndex < 0) return;

    this.choiceFocusIndex = Math.min(optionIndex, question.options.length - 1);
  }

  private setEditorText(value: string): void {
    this.settingEditorText = true;
    try {
      this.editor.setText(value);
    } finally {
      this.settingEditorText = false;
    }
  }

  private scrollViewportByLines(lines: number): void {
    if (!this.viewportOverflow) return;
    const nextOffset = Math.max(
      0,
      Math.min(this.viewportMaxScrollOffset, this.scrollOffset + lines),
    );
    if (nextOffset === this.scrollOffset) return;
    this.scrollOffset = nextOffset;
    this.revealFocusedContent = false;
    this.refresh();
  }

  private resetViewport(): void {
    this.scrollOffset = 0;
    this.revealFocusedContent = true;
  }

  private requestFocusReveal(): void {
    this.revealFocusedContent = true;
  }

  private refreshWithFocusReveal(): void {
    this.requestFocusReveal();
    this.refresh();
  }

  private finish(): void {
    if (this.closed) return;
    this.closed = true;
    this.args.signal?.removeEventListener("abort", this.onAbort);
    const interactionResult = this.args.controller.getInteractionResult();
    this.args.done(interactionResult ?? this.args.controller.outcome());
  }

  private refresh(): void {
    this.cachedLines = undefined;
    this.args.tui.requestRender();
  }

  private currentMode(): FormMode {
    if (!this.commentEdit) return this.baseMode;
    return `${this.commentEdit.kind}-comment`;
  }

  private currentDetailsText(): string | undefined {
    if (this.currentMode() !== "choice") return undefined;
    const question = this.args.controller.currentQuestion;
    if (question.type !== "choice") return undefined;
    return question.options[this.choiceFocusIndex]?.details;
  }

  private currentEditorLabel(): string | undefined {
    switch (this.commentEdit?.kind) {
      case "question":
        return "Question comment";
      case "option":
        return "Option comment";
      case "form":
        return "Form comment";
      default:
        return undefined;
    }
  }
}

interface FormEditorCallbacks {
  onChange: (value: string) => void;
  onSubmit: (value: string) => void;
  onEscape: () => void;
}

function createFormEditor(
  args: FormArgs,
  callbacks: FormEditorCallbacks,
): { editor: EditorComponent; handlesEscape: boolean } {
  const editorTheme = makeEditorTheme(args);
  const createDefault = () => {
    const editor = new Editor(args.tui, editorTheme);
    configureFormEditor(editor, callbacks, false);
    return { editor, handlesEscape: false };
  };
  if (!args.editorFactory) return createDefault();

  try {
    const editor: unknown = args.editorFactory(args.tui, editorTheme, args.keybindings);
    if (!isEditorComponent(editor)) {
      throw new Error("factory returned an invalid EditorComponent");
    }
    const handlesEscape = "onEscape" in editor;
    configureFormEditor(editor, callbacks, handlesEscape);
    return { editor, handlesEscape };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    args.notify?.(
      `Custom editor unavailable in ask_user; using the default editor: ${reason}`,
      "warning",
    );
    return createDefault();
  }
}

function configureFormEditor(
  editor: EditorComponent,
  callbacks: FormEditorCallbacks,
  handlesEscape: boolean,
): void {
  editor.onChange = callbacks.onChange;
  editor.onSubmit = callbacks.onSubmit;
  if (handlesEscape) {
    (editor as EditorComponent & { onEscape: () => void }).onEscape = callbacks.onEscape;
  }
}

function isEditorComponent(value: unknown): value is EditorComponent {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return ["render", "invalidate", "getText", "setText", "handleInput"].every(
    (method) => typeof candidate[method] === "function",
  );
}

function makeEditorTheme(args: FormArgs): EditorTheme {
  return {
    borderColor: (text) => args.theme.fg("accent", text),
    selectList: {
      selectedPrefix: (text) => args.theme.fg("accent", text),
      selectedText: (text) => args.theme.fg("accent", text),
      description: (text) => args.theme.fg("muted", text),
      scrollInfo: (text) => args.theme.fg("dim", text),
      noMatch: (text) => args.theme.fg("warning", text),
    },
  };
}
