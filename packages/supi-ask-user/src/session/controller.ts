import type {
  AskUserInteractionResult,
  AskUserOutcome,
  ChoiceQuestionResponse,
  NormalizedChoiceQuestion,
  NormalizedQuestion,
  NormalizedQuestionnaire,
  NormalizedTextQuestion,
  TextQuestionResponse,
} from "../types.ts";

type OptionState = {
  value: string;
  label: string;
  selected: boolean;
  comment?: string;
};

type ChoiceState = {
  kind: "choice";
  options: OptionState[];
  questionComment?: string;
  markedUnanswered?: boolean;
};

type TextState = {
  kind: "text";
  value: string;
  questionComment?: string;
  markedUnanswered?: boolean;
};

type QuestionState = ChoiceState | TextState;

export class AskUserController {
  private readonly states: QuestionState[];
  private index = 0;
  private terminal: boolean = false;
  private terminalResult: AskUserInteractionResult | undefined;
  private formComment: string | undefined;

  constructor(public readonly questionnaire: NormalizedQuestionnaire) {
    if (questionnaire.questions.length === 0) {
      throw new Error("AskUserController requires at least one question.");
    }
    this.states = questionnaire.questions.map((q) => this.initialState(q));
  }

  // ── Navigation ──────────────────────────────────────────────────

  get currentIndex(): number {
    return this.index;
  }

  get currentQuestion(): NormalizedQuestion {
    return this.questionnaire.questions[this.index];
  }

  get isTerminal(): boolean {
    return this.terminal;
  }

  goNext(): boolean {
    if (this.terminal) return false;
    if (this.index >= this.questionnaire.questions.length - 1) return false;
    this.index += 1;
    return true;
  }

  goBack(): boolean {
    if (this.terminal) return false;
    if (this.index === 0) return false;
    this.index -= 1;
    return true;
  }

  goTo(index: number): boolean {
    if (this.terminal) return false;
    if (index < 0 || index >= this.questionnaire.questions.length) return false;
    this.index = index;
    return true;
  }

  // ── Direct state queries ────────────────────────────────────────

  isOptionSelected(questionId: string, optionValue: string): boolean {
    const state = this.stateFor(questionId);
    if (state.kind !== "choice") return false;
    return state.options.find((option) => option.value === optionValue)?.selected ?? false;
  }

  isQuestionMarkedUnanswered(questionId: string): boolean {
    return this.stateFor(questionId).markedUnanswered ?? false;
  }

  // ── Comments ────────────────────────────────────────────────────

  get comment(): string | undefined {
    return this.formComment;
  }

  setComment(text: string): void {
    const trimmed = text.trim();
    this.formComment = trimmed || undefined;
  }

  setQuestionComment(questionId: string, text: string): void {
    const state = this.stateFor(questionId);
    const trimmed = text.trim();
    state.questionComment = trimmed || undefined;
  }

  getQuestionComment(questionId: string): string | undefined {
    return this.stateFor(questionId).questionComment;
  }

  getOptionComment(questionId: string, optionValue: string): string | undefined {
    const state = this.stateFor(questionId);
    if (state.kind !== "choice") return undefined;
    return state.options.find((o) => o.value === optionValue)?.comment;
  }

  setChoiceOptionComment(
    question: NormalizedChoiceQuestion,
    optionIndex: number,
    comment: string | undefined,
  ): void {
    if (this.terminal) return;
    const state = this.stateFor(question.id);
    if (state.kind !== "choice") return;
    const option = state.options[optionIndex];
    if (!option) return;

    const trimmed = comment?.trim();
    option.comment = trimmed || undefined;
  }

  // ── Single-select operations ────────────────────────────────────

  selectChoiceOption(question: NormalizedChoiceQuestion, optionIndex: number): void {
    if (this.terminal) return;
    const state = this.stateFor(question.id);
    if (state.kind !== "choice") return;

    for (const opt of state.options) {
      opt.selected = opt === state.options[optionIndex];
    }
    state.markedUnanswered = false;
  }

  // ── Multi-select operations ─────────────────────────────────────

  toggleChoiceOption(question: NormalizedChoiceQuestion, optionIndex: number): void {
    if (this.terminal) return;
    if (!question.multi) {
      this.selectChoiceOption(question, optionIndex);
      return;
    }
    const state = this.stateFor(question.id);
    if (state.kind !== "choice") return;
    const option = state.options[optionIndex];
    if (!option) return;

    option.selected = !option.selected;
    state.markedUnanswered = false;
    // Preserve comment, only remove it explicitly via setChoiceOptionComment with blank
  }

  // ── Text operations ─────────────────────────────────────────────

  setTextAnswer(questionId: string, value: string): void {
    if (this.terminal) return;
    const state = this.stateFor(questionId);
    if (state.kind !== "text") return;
    state.value = value.trim();
    if (state.value.length > 0) state.markedUnanswered = false;
  }

  getTextAnswer(questionId: string): string {
    const state = this.stateFor(questionId);
    return state.kind === "text" ? state.value : "";
  }

  // ── Unanswered marking ──────────────────────────────────────────

  markCurrentQuestionUnanswered(): void {
    if (this.terminal) return;
    const state = this.states[this.index];
    if (state.kind === "choice") {
      for (const opt of state.options) {
        opt.selected = false;
      }
    } else {
      state.value = "";
    }
    state.markedUnanswered = true;
    // Comments are preserved
  }

  // ── Cancel / Abort (internal interaction results) ───────────────

  cancel(): AskUserInteractionResult {
    if (this.terminal) return { kind: "cancel" };
    this.terminal = true;
    this.terminalResult = { kind: "cancel" };
    return { kind: "cancel" };
  }

  abort(): AskUserInteractionResult {
    if (this.terminal) return { kind: "abort" };
    this.terminal = true;
    this.terminalResult = { kind: "abort" };
    return { kind: "abort" };
  }

  /** Returns the terminal interaction result if the controller was cancelled/aborted, undefined otherwise. */
  getInteractionResult(): AskUserInteractionResult | undefined {
    return this.terminalResult;
  }

  // ── Outcome ─────────────────────────────────────────────────────

  outcome(): AskUserOutcome {
    const responses = this.questionnaire.questions.map((q) => this.buildResponse(q));

    const allAnswered = responses.every((r) => r.answer.answered);

    return {
      outcome: allAnswered ? "submitted" : "needs_discussion",
      ...(this.formComment ? { comment: this.formComment } : {}),
      responses,
    };
  }

  // ── Private helpers ─────────────────────────────────────────────

  private stateFor(questionId: string): QuestionState {
    const idx = this.questionnaire.questions.findIndex((q) => q.id === questionId);
    if (idx < 0) {
      throw new Error(`Unknown question id "${questionId}" in AskUserController.`);
    }
    return this.states[idx];
  }

  private initialState(question: NormalizedQuestion): QuestionState {
    if (question.type === "choice") {
      return {
        kind: "choice",
        options: question.options.map((opt, i) => ({
          value: opt.value,
          label: opt.label,
          selected: question.recommendedIndexes.includes(i),
        })),
      };
    }

    return {
      kind: "text",
      value: question.recommendation ?? "",
    };
  }

  private buildResponse(
    question: NormalizedQuestion,
  ): ChoiceQuestionResponse | TextQuestionResponse {
    const state = this.stateFor(question.id);

    if (question.type === "choice") {
      return this.buildChoiceResponse(question, state as ChoiceState);
    }

    return this.buildTextResponse(question, state as TextState);
  }

  private buildChoiceResponse(
    question: NormalizedChoiceQuestion,
    state: ChoiceState,
  ): ChoiceQuestionResponse {
    // Only include touched options: selected and/or commented
    const touchedOptions = state.options.filter((o) => o.selected || o.comment);

    return {
      questionId: question.id,
      ...(state.questionComment ? { questionComment: state.questionComment } : {}),
      answer: {
        kind: "choice",
        answered: touchedOptions.some((o) => o.selected),
        options: touchedOptions.map((o) => ({
          value: o.value,
          label: o.label,
          selected: o.selected,
          ...(o.comment ? { comment: o.comment } : {}),
        })),
      },
    };
  }

  private buildTextResponse(
    question: NormalizedTextQuestion,
    state: TextState,
  ): TextQuestionResponse {
    const answered = state.value.length > 0;

    return {
      questionId: question.id,
      ...(state.questionComment ? { questionComment: state.questionComment } : {}),
      answer: {
        kind: "text",
        answered,
        ...(answered ? { value: state.value } : {}),
      },
    };
  }
}
