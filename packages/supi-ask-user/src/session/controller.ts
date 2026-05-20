import type {
  Answer,
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
}

function normalizeAnswer(answer: Answer): Answer {
  switch (answer.kind) {
    case "choice":
      return {
        kind: "choice",
        selections: answer.selections.map((selection) => ({
          value: selection.value.trim(),
          label: selection.label.trim(),
        })),
      };
    case "custom":
      return { kind: "custom", value: answer.value.trim() };
    case "text":
      return { kind: "text", value: answer.value.trim() };
  }
}

function trimOptional(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}
