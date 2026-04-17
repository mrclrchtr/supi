// Shared questionnaire flow state used by both UI paths and the
// single-active-questionnaire concurrency guard. The flow owns terminal-state
// transitions (`submitted`, `cancelled`, `aborted`) so overlay and fallback
// cannot drift apart on cancellation/abort semantics.

import type { Answer, NormalizedQuestion, QuestionnaireOutcome, TerminalState } from "./types.ts";
import { needsReview } from "./types.ts";

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
    this.answers.set(answer.questionId, normalizeAnswer(answer));
  }

  advance(): boolean {
    if (this.mode !== "answering") return false;
    const current = this.currentQuestion;
    if (current && !this.answers.has(current.id)) return false;
    if (this.index < this.questions.length - 1) {
      this.index += 1;
      return true;
    }
    if (needsReview(this.questions)) {
      this.mode = "reviewing";
      return true;
    }
    this.markSubmitted();
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
    if (!needsReview(this.questions)) return false;
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
    return this.questions.flatMap((q) => {
      const answer = this.answers.get(q.id);
      return answer ? [answer] : [];
    });
  }
}

function normalizeAnswer(answer: Answer): Answer {
  switch (answer.source) {
    case "option":
      return {
        questionId: answer.questionId,
        source: "option",
        value: answer.value.trim(),
        optionIndex: answer.optionIndex,
        note: trimOptional(answer.note),
      };
    case "options":
      return {
        questionId: answer.questionId,
        source: "options",
        values: answer.values.map((value) => value.trim()),
        optionIndexes: [...answer.optionIndexes],
        selections: answer.selections.map((selection) => ({
          value: selection.value.trim(),
          optionIndex: selection.optionIndex,
          note: trimOptional(selection.note),
        })),
      };
    case "other":
      return {
        questionId: answer.questionId,
        source: "other",
        value: answer.value.trim(),
      };
    case "discuss": {
      const value = trimOptional(answer.value);
      return value
        ? { questionId: answer.questionId, source: "discuss", value }
        : { questionId: answer.questionId, source: "discuss" };
    }
    case "text":
      return {
        questionId: answer.questionId,
        source: "text",
        value: answer.value.trim(),
      };
    case "yesno":
      return {
        questionId: answer.questionId,
        source: "yesno",
        value: answer.value,
        optionIndex: answer.optionIndex,
        note: trimOptional(answer.note),
      };
  }
}

function trimOptional(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : undefined;
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
