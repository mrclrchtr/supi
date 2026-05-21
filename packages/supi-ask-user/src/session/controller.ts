import type {
  Answer,
  AnswerSelection,
  AskUserOutcome,
  AskUserStatus,
  NormalizedChoiceQuestion,
  NormalizedQuestion,
  NormalizedQuestionnaire,
} from "../types.ts";

export class AskUserController {
  private readonly answers = new Map<string, Answer>();
  private index = 0;
  private status: AskUserStatus | null = null;
  private discussMessage: string | undefined;

  constructor(public readonly questionnaire: NormalizedQuestionnaire) {
    if (questionnaire.questions.length === 0) {
      throw new Error("AskUserController requires at least one question.");
    }
  }

  get questions(): NormalizedQuestion[] {
    return this.questionnaire.questions;
  }

  get currentIndex(): number {
    return this.index;
  }

  get currentQuestion(): NormalizedQuestion {
    const question = this.questionnaire.questions[this.index];
    if (!question) {
      throw new Error(`No question at index ${this.index}.`);
    }
    return question;
  }

  get isTerminal(): boolean {
    return this.status !== null;
  }

  get answerCount(): number {
    return this.answers.size;
  }

  hasAnswer(questionId: string): boolean {
    return this.answers.has(questionId);
  }

  getAnswer(questionId: string): Answer | undefined {
    return this.answers.get(questionId);
  }

  getSelectedIndexes(question: NormalizedChoiceQuestion): number[] {
    const answer = this.answers.get(question.id);
    if (answer?.kind !== "choice") return [...question.initialIndexes];
    return answer.selections
      .map((selection) => question.options.findIndex((option) => option.value === selection.value))
      .filter((index) => index >= 0);
  }

  getChoiceOptionNote(questionId: string, optionValue: string): string | undefined {
    const answer = this.answers.get(questionId);
    if (answer?.kind !== "choice") return undefined;
    return answer.selections.find((selection) => selection.value === optionValue)?.note;
  }

  selectChoiceOption(question: NormalizedChoiceQuestion, optionIndex: number): void {
    if (this.isTerminal) return;
    const option = question.options[optionIndex];
    if (!option) return;
    const existingNote = this.getChoiceOptionNote(question.id, option.value);
    this.commitChoiceSelections(question, [
      buildSelection(option.value, option.label, existingNote),
    ]);
  }

  toggleChoiceOption(question: NormalizedChoiceQuestion, optionIndex: number): void {
    if (this.isTerminal) return;
    const option = question.options[optionIndex];
    if (!option) return;
    if (!question.multi) {
      this.selectChoiceOption(question, optionIndex);
      return;
    }

    const selections = this.getStoredChoiceSelections(question.id);
    const filtered = selections.filter((selection) => selection.value !== option.value);
    if (filtered.length !== selections.length) {
      this.commitChoiceSelections(question, filtered);
      return;
    }

    this.commitChoiceSelections(question, [
      ...selections,
      buildSelection(option.value, option.label),
    ]);
  }

  setChoiceOptionNote(
    question: NormalizedChoiceQuestion,
    optionIndex: number,
    note: string | undefined,
  ): void {
    if (this.isTerminal) return;
    const option = question.options[optionIndex];
    if (!option) return;

    const trimmedNote = trimOptional(note);
    const selections = this.getStoredChoiceSelections(question.id);
    const existing = selections.find((selection) => selection.value === option.value);

    if (existing) {
      this.commitChoiceSelections(
        question,
        selections.map((selection) => {
          if (selection.value !== option.value) return selection;
          return buildSelection(selection.value, selection.label, trimmedNote);
        }),
      );
      return;
    }

    if (!trimmedNote) return;

    const nextSelection = buildSelection(option.value, option.label, trimmedNote);
    this.commitChoiceSelections(
      question,
      question.multi ? [...selections, nextSelection] : [nextSelection],
    );
  }

  setAnswer(questionId: string, answer: Answer): void {
    if (this.isTerminal) return;
    this.answers.set(questionId, normalizeAnswer(answer));
  }

  clearAnswer(questionId: string): void {
    if (this.isTerminal) return;
    this.answers.delete(questionId);
  }

  goNext(): boolean {
    if (this.isTerminal) return false;
    if (this.index >= this.questionnaire.questions.length - 1) return false;
    this.index += 1;
    return true;
  }

  goBack(): boolean {
    if (this.isTerminal) return false;
    if (this.index === 0) return false;
    this.index -= 1;
    return true;
  }

  canSubmit(): boolean {
    return this.missingQuestionIds().length === 0;
  }

  canPartialSubmit(): boolean {
    return (
      this.questionnaire.allowPartialSubmit &&
      this.answerCount > 0 &&
      this.missingQuestionIds().length > 0
    );
  }

  finishSubmitted(): boolean {
    if (!this.canSubmit() || this.isTerminal) return false;
    this.status = "submitted";
    return true;
  }

  finishPartial(): boolean {
    if (!this.canPartialSubmit() || this.isTerminal) return false;
    this.status = "partial";
    return true;
  }

  finishDiscuss(message?: string): boolean {
    if (!this.questionnaire.allowDiscuss || this.isTerminal) return false;
    this.status = "discuss";
    this.discussMessage = trimOptional(message);
    return true;
  }

  cancel(): void {
    if (this.isTerminal) return;
    this.status = "cancelled";
  }

  abort(): void {
    if (this.isTerminal) return;
    this.status = "aborted";
  }

  outcome(): AskUserOutcome {
    return {
      status: this.status ?? "cancelled",
      answersById: Object.fromEntries(this.answers),
      missingQuestionIds: this.missingQuestionIds(),
      ...(this.discussMessage ? { discussMessage: this.discussMessage } : {}),
    };
  }

  missingQuestionIds(): string[] {
    return this.questionnaire.questions
      .filter((question) => question.required && !this.answers.has(question.id))
      .map((question) => question.id);
  }

  private getStoredChoiceSelections(questionId: string): AnswerSelection[] {
    const answer = this.answers.get(questionId);
    if (answer?.kind !== "choice") return [];
    return answer.selections.map((selection) => ({ ...selection }));
  }

  private commitChoiceSelections(
    question: NormalizedChoiceQuestion,
    selections: AnswerSelection[],
  ): void {
    const ordered = orderSelections(question, normalizeChoiceSelections(selections));
    const nextSelections = question.multi ? ordered : ordered.slice(0, 1);
    if (nextSelections.length === 0) {
      this.answers.delete(question.id);
      return;
    }

    this.answers.set(question.id, {
      kind: "choice",
      selections: nextSelections,
    });
  }
}

function normalizeAnswer(answer: Answer): Answer {
  switch (answer.kind) {
    case "choice":
      return {
        kind: "choice",
        selections: normalizeChoiceSelections(answer.selections),
      };
    case "custom":
      return { kind: "custom", value: answer.value.trim() };
    case "text":
      return { kind: "text", value: answer.value.trim() };
  }
}

function normalizeChoiceSelections(selections: AnswerSelection[]): AnswerSelection[] {
  return selections.map((selection) =>
    buildSelection(selection.value, selection.label, selection.note),
  );
}

function orderSelections(
  question: NormalizedChoiceQuestion,
  selections: AnswerSelection[],
): AnswerSelection[] {
  const byValue = new Map(selections.map((selection) => [selection.value, selection]));
  return question.options.flatMap((option) => {
    const selection = byValue.get(option.value);
    return selection ? [selection] : [];
  });
}

function buildSelection(value: string, label: string, note?: string): AnswerSelection {
  const trimmedNote = trimOptional(note);
  return {
    value: value.trim(),
    label: label.trim(),
    ...(trimmedNote ? { note: trimmedNote } : {}),
  };
}

function trimOptional(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}
