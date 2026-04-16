import { describe, expect, it } from "vitest";
import { ActiveQuestionnaireLock, QuestionnaireFlow } from "../flow.ts";
import type { NormalizedQuestion } from "../types.ts";

const q = (id: string, header = id): NormalizedQuestion => ({
  id,
  header,
  type: "choice",
  prompt: `${id}?`,
  options: [
    { value: "a", label: "A" },
    { value: "b", label: "B" },
  ],
  allowOther: false,
  allowComment: false,
});

describe("QuestionnaireFlow", () => {
  it("transitions to submitted immediately on single-question advance", () => {
    const flow = new QuestionnaireFlow([q("only")]);
    flow.setAnswer({ questionId: "only", source: "option", value: "a", optionIndex: 0 });
    flow.advance();
    expect(flow.isTerminal()).toBe(true);
    expect(flow.outcome().terminalState).toBe("submitted");
  });

  it("walks through multi-question flow and enters review at the end", () => {
    const flow = new QuestionnaireFlow([q("one"), q("two")]);
    flow.setAnswer({ questionId: "one", source: "option", value: "a", optionIndex: 0 });
    flow.advance();
    expect(flow.currentMode).toBe("answering");
    expect(flow.currentIndex).toBe(1);
    flow.setAnswer({ questionId: "two", source: "option", value: "b", optionIndex: 1 });
    flow.advance();
    expect(flow.currentMode).toBe("reviewing");
    expect(flow.submit()).toBe(true);
    expect(flow.outcome().terminalState).toBe("submitted");
    expect(flow.outcome().answers).toHaveLength(2);
  });

  it("supports back-navigation to revise an earlier answer", () => {
    const flow = new QuestionnaireFlow([q("one"), q("two")]);
    flow.setAnswer({ questionId: "one", source: "option", value: "a", optionIndex: 0 });
    flow.advance();
    flow.setAnswer({ questionId: "two", source: "option", value: "a", optionIndex: 0 });
    flow.advance();
    // In review; back goes to last question
    expect(flow.goBack()).toBe(true);
    expect(flow.currentMode).toBe("answering");
    expect(flow.currentIndex).toBe(1);
    // Back again to first question
    expect(flow.goBack()).toBe(true);
    expect(flow.currentIndex).toBe(0);
    flow.setAnswer({ questionId: "one", source: "option", value: "b", optionIndex: 1 });
    flow.advance();
    flow.advance();
    flow.submit();
    const answers = flow.outcome().answers;
    expect(answers.find((a) => a.questionId === "one")?.value).toBe("b");
  });

  it("blocks submit until every question is answered", () => {
    const flow = new QuestionnaireFlow([q("one"), q("two")]);
    flow.setAnswer({ questionId: "one", source: "option", value: "a", optionIndex: 0 });
    expect(flow.submit()).toBe(false);
  });

  it("refuses to advance past a question that has not been answered", () => {
    const flow = new QuestionnaireFlow([q("one"), q("two")]);
    expect(flow.advance()).toBe(false);
    expect(flow.currentIndex).toBe(0);
    expect(flow.currentMode).toBe("answering");
  });

  it("does not fabricate empty answers when collecting outcome", () => {
    // Force an internal terminal state without populating answers — should
    // never happen in practice, but guards the invariant.
    const flow = new QuestionnaireFlow([q("only")]);
    flow.cancel();
    expect(flow.outcome().answers).toEqual([]);
  });

  it("cancel and abort lock the flow with explicit terminal states", () => {
    const flow = new QuestionnaireFlow([q("only")]);
    flow.cancel();
    expect(flow.outcome().terminalState).toBe("cancelled");
    expect(flow.goBack()).toBe(false);
    const aborted = new QuestionnaireFlow([q("only")]);
    aborted.abort();
    expect(aborted.outcome().terminalState).toBe("aborted");
  });

  it("trims value and comment when storing an answer", () => {
    const flow = new QuestionnaireFlow([q("only")]);
    flow.setAnswer({
      questionId: "only",
      source: "text",
      value: "  hello world  ",
      comment: "  rationale  ",
    });
    const stored = flow.getAnswer("only");
    expect(stored?.value).toBe("hello world");
    expect(stored?.comment).toBe("rationale");
  });

  it("drops whitespace-only comments entirely rather than storing an empty string", () => {
    const flow = new QuestionnaireFlow([q("only")]);
    flow.setAnswer({ questionId: "only", source: "text", value: "x", comment: "   " });
    expect(flow.getAnswer("only")?.comment).toBeUndefined();
  });

  it("preserves optionIndex but never stores an undefined one", () => {
    const flow = new QuestionnaireFlow([q("only")]);
    flow.setAnswer({ questionId: "only", source: "option", value: "a", optionIndex: 0 });
    expect(flow.getAnswer("only")).toEqual({
      questionId: "only",
      source: "option",
      value: "a",
      optionIndex: 0,
    });
  });
});

describe("ActiveQuestionnaireLock", () => {
  it("acquires only once until released", () => {
    const lock = new ActiveQuestionnaireLock();
    expect(lock.acquire()).toBe(true);
    expect(lock.acquire()).toBe(false);
    lock.release();
    expect(lock.acquire()).toBe(true);
  });
});
