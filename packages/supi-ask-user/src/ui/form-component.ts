// biome-ignore lint/style/noExcessiveLinesPerFile: complex keyboard orchestration
import {
  type Component,
  Editor,
  type EditorTheme,
  type Focusable,
  Key,
  matchesKey,
} from "@earendil-works/pi-tui";
import type { NormalizedChoiceQuestion } from "../types.ts";
import { renderFormFrame } from "./form-render.ts";
import { defaultChoiceRowIndex, type FocusTarget, type FormMode } from "./form-view.ts";
import type { FormArgs } from "./types.ts";

export class AskUserForm implements Component, Focusable {
  focused: boolean = false;
  private mode: FormMode = "choice";
  private focus: FocusTarget = "choices";
  private readonly editor: Editor;
  private settingEditorText: boolean = false;
  private choiceFocusIndex = 0;
  private readonly choiceFocusByQuestionId = new Map<string, number>();
  private reviewFocusIndex = 0;
  private closed: boolean = false;
  private cachedWidth: number | undefined;
  private cachedEditorFocused: boolean | undefined;
  private cachedLines: string[] | undefined;
  private commentQuestionId: string | undefined;
  private commentOptionValue: string | undefined;
  private returnChoiceFocusIndex: number | undefined;
  private editorContext: string | undefined;
  private returnToReviewAfterEdit: boolean = false;
  private pendingEsc: boolean = false;
  private readonly onAbort: () => void;

  constructor(private readonly args: FormArgs) {
    this.editor = new Editor(args.tui, makeEditorTheme(args));
    this.editor.onChange = () => {
      if (this.settingEditorText) return;
      this.syncTextAnswerFromEditor();
      this.refresh();
    };
    this.editor.onSubmit = (value) => this.handleEditorSubmit(value);
    this.syncCurrentQuestion();
    this.onAbort = () => {
      this.args.controller.abort();
      this.finish();
    };
    args.signal?.addEventListener("abort", this.onAbort);
  }

  render(width: number): string[] {
    const editorFocused = this.focused && this.focus === "editor";
    this.editor.focused = editorFocused;

    if (
      this.cachedWidth === width &&
      this.cachedEditorFocused === editorFocused &&
      this.cachedLines
    ) {
      return this.cachedLines;
    }

    this.cachedWidth = width;
    this.cachedEditorFocused = editorFocused;
    this.cachedLines = renderFormFrame({
      width,
      theme: this.args.theme,
      controller: this.args.controller,
      mode: this.mode,
      focus: this.focus,
      editor: this.editor,
      choiceFocusIndex: this.choiceFocusIndex,
      reviewFocusIndex: this.reviewFocusIndex,
      previewText: this.currentPreviewText(),
      editorLabel: this.currentEditorLabel(),
      editorContext: this.editorContext,
    });
    return this.cachedLines;
  }

  handleInput(data: string): void {
    if (this.closed || this.args.controller.isTerminal) return;

    if (this.args.keybindings.matches(data, "app.tools.expand")) {
      this.args.onToggleToolsExpanded?.();
      return;
    }

    if (this.handleEscapeKey(data)) return;
    if (this.handleNavigationKey(data)) return;

    if (this.mode === "review") {
      this.handleReviewInput(data);
      return;
    }

    if (this.isCommentEditorMode()) {
      this.handleCommentEditorKey(data);
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

    if (this.isCommentEditorMode()) {
      this.returnFromCommentEditor();
      this.refresh();
      return true;
    }

    if (this.mode === "text") {
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

  private handleNavigationKey(data: string): boolean {
    if (this.isCommentEditorMode()) return false;

    const direction = this.navigationDirectionFor(data);
    if (!direction) return false;

    if (direction === "forward" && this.mode !== "review") {
      this.navigateForward();
    } else if (direction === "backward") {
      if (this.mode === "review") {
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
    if (this.mode === "text") return undefined;
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
    return (
      this.mode === "question-comment" ||
      this.mode === "option-comment" ||
      this.mode === "form-comment"
    );
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
      this.reviewFocusIndex = Math.max(0, this.reviewFocusIndex - 1);
      this.refresh();
      return;
    }

    if (matchesKey(data, Key.down)) {
      this.reviewFocusIndex = Math.min(submitIndex, this.reviewFocusIndex + 1);
      this.refresh();
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

    if (matchesKey(data, Key.up)) {
      this.choiceFocusIndex = Math.max(0, this.choiceFocusIndex - 1);
      this.refresh();
      return;
    }

    if (matchesKey(data, Key.down)) {
      this.choiceFocusIndex = Math.min(question.options.length - 1, this.choiceFocusIndex + 1);
      this.refresh();
      return;
    }

    if (matchesKey(data, Key.space)) {
      if (question.multi) {
        this.args.controller.toggleChoiceOption(question, this.choiceFocusIndex);
      } else {
        this.args.controller.selectChoiceOption(question, this.choiceFocusIndex);
      }
      this.refresh();
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
      this.refresh();
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

  // ── Text screen ─────────────────────────────────────────────────

  private handleTextKey(data: string): void {
    if (this.pendingEsc) {
      this.pendingEsc = false;
      if (data === "u") {
        this.args.controller.markCurrentQuestionUnanswered();
        this.setEditorText("");
        this.refresh();
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
      this.refresh();
      return;
    }

    this.editor.handleInput(data);
    this.refresh();
  }

  // ── Comment editors ─────────────────────────────────────────────

  private handleCommentEditorKey(data: string): void {
    this.editor.handleInput(data);
    this.refresh();
  }

  private handleEditorSubmit(value: string): void {
    if (this.mode === "text") {
      this.args.controller.setTextAnswer(this.args.controller.currentQuestion.id, value);
      this.goNext();
      return;
    }

    if (this.mode === "form-comment") {
      this.args.controller.setComment(value);
      this.returnFromCommentEditor();
      this.refresh();
      return;
    }

    if (this.mode === "question-comment" && this.commentQuestionId) {
      this.args.controller.setQuestionComment(this.commentQuestionId, value);
      this.returnFromCommentEditor();
      this.refresh();
      return;
    }

    if (
      this.mode === "option-comment" &&
      this.commentQuestionId &&
      this.commentOptionValue !== undefined
    ) {
      const question = this.args.controller.questionnaire.questions.find(
        (q) => q.id === this.commentQuestionId,
      );
      if (question?.type === "choice") {
        const optIndex = question.options.findIndex((o) => o.value === this.commentOptionValue);
        if (optIndex >= 0) {
          this.args.controller.setChoiceOptionComment(question, optIndex, value);
        }
      }
      this.returnFromCommentEditor();
      this.refresh();
    }
  }

  private openFormCommentEditor(): void {
    this.commentQuestionId = undefined;
    this.commentOptionValue = undefined;
    this.returnChoiceFocusIndex = undefined;
    this.editorContext = this.args.controller.questionnaire.title ?? "Form";
    this.mode = "form-comment";
    this.focus = "editor";
    this.setEditorText(this.args.controller.comment ?? "");
    this.refresh();
  }

  private openQuestionCommentEditor(questionId: string): void {
    this.commentQuestionId = questionId;
    this.commentOptionValue = undefined;
    this.returnChoiceFocusIndex = this.choiceFocusIndex;
    this.editorContext = this.args.controller.currentQuestion.header;
    this.mode = "question-comment";
    this.focus = "editor";
    this.setEditorText(this.args.controller.getQuestionComment(questionId) ?? "");
    this.refresh();
  }

  private openOptionCommentEditor(question: NormalizedChoiceQuestion, optionIndex: number): void {
    const opt = question.options[optionIndex];
    if (!opt) return;
    this.commentQuestionId = question.id;
    this.commentOptionValue = opt.value;
    this.returnChoiceFocusIndex = optionIndex;
    this.editorContext = opt.label;
    this.mode = "option-comment";
    this.focus = "editor";
    this.setEditorText(this.args.controller.getOptionComment(question.id, opt.value) ?? "");
    this.refresh();
  }

  private returnFromCommentEditor(): void {
    const prevMode = this.mode;
    const questionId = this.commentQuestionId;
    const optionValue = this.commentOptionValue;
    const returnChoiceFocusIndex = this.returnChoiceFocusIndex;

    this.commentQuestionId = undefined;
    this.commentOptionValue = undefined;
    this.returnChoiceFocusIndex = undefined;
    this.editorContext = undefined;

    if (prevMode === "form-comment") {
      this.mode = "review";
      this.focus = "review";
      this.setEditorText("");
      return;
    }

    if (prevMode === "question-comment" || prevMode === "option-comment") {
      this.syncCurrentQuestion();
      this.restoreChoiceFocus(questionId, optionValue, returnChoiceFocusIndex);
    }
  }

  // ── Navigation helpers ──────────────────────────────────────────

  private goNext(): void {
    this.saveCurrentChoiceFocus();
    if (this.returnToReviewAfterEdit) {
      this.returnToReviewAfterEdit = false;
      this.mode = "review";
      this.focus = "review";
      this.reviewFocusIndex = this.args.controller.questionnaire.questions.length;
      this.setEditorText("");
      this.refresh();
      return;
    }
    if (
      this.args.controller.currentIndex >=
      this.args.controller.questionnaire.questions.length - 1
    ) {
      this.mode = "review";
      this.focus = "review";
      // Focus the Submit row by default so Enter submits immediately.
      this.reviewFocusIndex = this.args.controller.questionnaire.questions.length;
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
    const q = this.args.controller.currentQuestion;
    this.mode = q.type === "text" ? "text" : "choice";
    this.focus = q.type === "text" ? "editor" : "choices";
    this.syncCurrentQuestion();
    this.refresh();
  }

  private syncCurrentQuestion(): void {
    const question = this.args.controller.currentQuestion;

    if (question.type === "text") {
      this.mode = "text";
      this.focus = "editor";
      this.setEditorText(this.args.controller.getTextAnswer(question.id));
      return;
    }

    this.mode = "choice";
    this.focus = "choices";
    this.setEditorText("");
    this.choiceFocusIndex =
      this.choiceFocusByQuestionId.get(question.id) ??
      defaultChoiceRowIndex(this.args.controller, question);
  }

  private saveCurrentChoiceFocus(): void {
    const question = this.args.controller.currentQuestion;
    if (question.type === "choice") {
      this.choiceFocusByQuestionId.set(question.id, this.choiceFocusIndex);
    }
  }

  private syncTextAnswerFromEditor(): void {
    if (this.mode !== "text") return;
    const question = this.args.controller.currentQuestion;
    if (question.type !== "text") return;
    this.args.controller.setTextAnswer(question.id, this.editor.getExpandedText());
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

  private currentPreviewText(): string | undefined {
    if (this.mode !== "choice") return undefined;
    const question = this.args.controller.currentQuestion;
    if (question.type !== "choice") return undefined;
    return question.options[this.choiceFocusIndex]?.preview;
  }

  private currentEditorLabel(): string | undefined {
    switch (this.mode) {
      case "question-comment":
        return "Question comment";
      case "option-comment":
        return "Option comment";
      case "form-comment":
        return "Form comment";
      default:
        return undefined;
    }
  }
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
