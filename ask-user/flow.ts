// Shared questionnaire flow state used by both UI paths and the
// single-active-questionnaire concurrency guard. The flow owns terminal-state
// transitions (`submitted`, `cancelled`, `aborted`) so overlay and fallback
// cannot drift apart on cancellation/abort semantics.

import type { Answer, NormalizedQuestion, QuestionnaireOutcome, TerminalState } from "./types.ts";

export type FlowMode = "answering" | "reviewing" | "terminal";

export class QuestionnaireFlow {
  private readonly answers = new Map<string, Answer>();
  private index = 0;
  private mode: FlowMode = "answering";
  private terminalState: TerminalState | null = null;

  constructor(public readonly questions: NormalizedQuestion[]) {
    if (questions.length === 0) {
      throw new Error("QuestionnaireFlow requires at least one question.");
    }
  }

  get currentIndex(): number {
    return this.index;
  }

  get currentMode(): FlowMode {
    return this.mode;
  }

  get isMultiQuestion(): boolean {
    return this.questions.length > 1;
  }

  get currentQuestion(): NormalizedQuestion | undefined {
    return this.questions[this.index];
  }

  hasAnswer(questionId: string): boolean {
    return this.answers.has(questionId);
  }

  getAnswer(questionId: string): Answer | undefined {
    return this.answers.get(questionId);
  }

  allAnswered(): boolean {
    return this.questions.every((q) => this.answers.has(q.id));
  }

  setAnswer(answer: Answer): void {
    // Centralized safety net: every stored answer has a trimmed value; a
    // whitespace-only comment is dropped entirely. Keeps both UI paths and any
    // future caller from smuggling untrimmed strings into the outcome.
    const stored: Answer = {
      questionId: answer.questionId,
      source: answer.source,
      value: answer.value.trim(),
    };
    if (answer.optionIndex !== undefined) stored.optionIndex = answer.optionIndex;
    const comment = answer.comment?.trim();
    if (comment && comment.length > 0) stored.comment = comment;
    this.answers.set(stored.questionId, stored);
  }

  advance(): boolean {
    if (this.mode !== "answering") return false;
    const current = this.currentQuestion;
    // Hard invariant: advance only after the current question has an answer.
    // Catches UI bugs that would otherwise produce an empty submission.
    if (current && !this.answers.has(current.id)) return false;
    if (!this.isMultiQuestion) {
      this.markSubmitted();
      return true;
    }
    if (this.index < this.questions.length - 1) {
      this.index += 1;
      return true;
    }
    this.mode = "reviewing";
    return true;
  }

  goBack(): boolean {
    if (this.mode === "terminal") return false;
    if (this.mode === "reviewing") {
      this.mode = "answering";
      this.index = this.questions.length - 1;
      return true;
    }
    if (this.index > 0) {
      this.index -= 1;
      return true;
    }
    return false;
  }

  enterReview(): boolean {
    if (this.mode === "terminal") return false;
    if (!this.isMultiQuestion) return false;
    if (!this.allAnswered()) return false;
    this.mode = "reviewing";
    return true;
  }

  submit(): boolean {
    if (this.mode === "terminal") return false;
    if (!this.allAnswered()) return false;
    this.markSubmitted();
    return true;
  }

  cancel(): void {
    if (this.mode === "terminal") return;
    this.mode = "terminal";
    this.terminalState = "cancelled";
  }

  abort(): void {
    if (this.mode === "terminal") return;
    this.mode = "terminal";
    this.terminalState = "aborted";
  }

  isTerminal(): boolean {
    return this.mode === "terminal";
  }

  outcome(): QuestionnaireOutcome {
    const state = this.terminalState ?? "cancelled";
    return {
      terminalState: state,
      answers: state === "submitted" ? this.collectAnswers() : [...this.answers.values()],
    };
  }

  private markSubmitted(): void {
    this.mode = "terminal";
    this.terminalState = "submitted";
  }

  private collectAnswers(): Answer[] {
    // When submitted, every question must have a stored answer. We never
    // fabricate empty answers — submit()/advance() refuse without them.
    return this.questions.flatMap((q) => {
      const a = this.answers.get(q.id);
      return a ? [a] : [];
    });
  }
}

// Session-scoped lock: only one in-flight `ask_user` interaction at a time.
// Stored at module scope per extension instance (the extension factory runs
// once per session in pi).
export class ActiveQuestionnaireLock {
  private active = false;

  acquire(): boolean {
    if (this.active) return false;
    this.active = true;
    return true;
  }

  release(): void {
    this.active = false;
  }

  isActive(): boolean {
    return this.active;
  }
}
