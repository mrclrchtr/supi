import { describe, expect, it } from "vitest";
import { ActiveQuestionnaireLock, QuestionnaireFlow } from "../flow.ts";
import type { NormalizedQuestion } from "../types.ts";

const choice = (id: string, header = id): NormalizedQuestion => ({
  id,
  header,
  type: "choice",
  prompt: `${id}?`,
  options: [
    { value: "a", label: "A" },
    { value: "b", label: "B" },
  ],
  allowOther: true,
  allowDiscuss: true,
  recommendedIndexes: [0],
});

const multichoice = (id: string, header = id): NormalizedQuestion => ({
  id,
  header,
  type: "multichoice",
  prompt: `${id}?`,
  options: [
    { value: "a", label: "A" },
    { value: "b", label: "B" },
    { value: "c", label: "C" },
  ],
  allowOther: false,
  allowDiscuss: true,
  recommendedIndexes: [0, 2],
});

describe("QuestionnaireFlow", () => {
  it("submits immediately for a single non-review question", () => {
    const flow = new QuestionnaireFlow([choice("only")]);
    flow.setAnswer({ questionId: "only", source: "option", value: "a", optionIndex: 0 });
    flow.advance();
    expect(flow.isTerminal()).toBe(true);
    expect(flow.outcome().terminalState).toBe("submitted");
  });

  it("enters review for a single multichoice question before submission", () => {
    const flow = new QuestionnaireFlow([multichoice("features")]);
    flow.setAnswer({
      questionId: "features",
      source: "options",
      values: ["a", "c"],
      optionIndexes: [0, 2],
      selections: [
        { value: "a", optionIndex: 0, note: "best" },
        { value: "c", optionIndex: 2 },
      ],
    });
    flow.advance();
    expect(flow.currentMode).toBe("reviewing");
    expect(flow.submit()).toBe(true);
    expect(flow.outcome()).toMatchObject({
      terminalState: "submitted",
      answers: [
        {
          questionId: "features",
          source: "options",
          selections: [
            { value: "a", optionIndex: 0, note: "best" },
            { value: "c", optionIndex: 2 },
          ],
        },
      ],
    });
  });

  it("supports back-navigation and revision across review", () => {
    const flow = new QuestionnaireFlow([choice("one"), choice("two")]);
    flow.setAnswer({ questionId: "one", source: "option", value: "a", optionIndex: 0 });
    flow.advance();
    flow.setAnswer({ questionId: "two", source: "yesno", value: "no", optionIndex: 1 });
    flow.advance();
    expect(flow.currentMode).toBe("reviewing");
    expect(flow.goBack()).toBe(true);
    expect(flow.currentIndex).toBe(1);
    expect(flow.goBack()).toBe(true);
    expect(flow.currentIndex).toBe(0);
    flow.setAnswer({ questionId: "one", source: "other", value: "custom" });
    flow.advance();
    flow.advance();
    flow.submit();
    expect(flow.outcome().answers.find((answer) => answer.questionId === "one")).toMatchObject({
      source: "other",
      value: "custom",
    });
  });

  it("stores discuss answers without forcing cancellation semantics", () => {
    const flow = new QuestionnaireFlow([choice("only")]);
    flow.setAnswer({ questionId: "only", source: "discuss", value: "need more context" });
    flow.advance();
    expect(flow.outcome()).toMatchObject({
      terminalState: "submitted",
      answers: [{ questionId: "only", source: "discuss", value: "need more context" }],
    });
  });

  it("trims note strings when storing answers", () => {
    const flow = new QuestionnaireFlow([choice("only"), multichoice("features")]);
    flow.setAnswer({
      questionId: "only",
      source: "option",
      value: "a",
      optionIndex: 0,
      note: "  rationale  ",
    });
    flow.setAnswer({
      questionId: "features",
      source: "options",
      values: ["a"],
      optionIndexes: [0],
      selections: [{ value: "a", optionIndex: 0, note: "  best first  " }],
    });
    expect(flow.getAnswer("only")).toMatchObject({ note: "rationale" });
    expect(flow.getAnswer("features")).toMatchObject({
      selections: [{ value: "a", optionIndex: 0, note: "best first" }],
    });
  });

  it("blocks submit until every question is answered", () => {
    const flow = new QuestionnaireFlow([choice("one"), choice("two")]);
    flow.setAnswer({ questionId: "one", source: "option", value: "a", optionIndex: 0 });
    expect(flow.submit()).toBe(false);
  });

  it("cancel and abort lock the flow with explicit terminal states", () => {
    const cancelled = new QuestionnaireFlow([choice("only")]);
    cancelled.cancel();
    expect(cancelled.outcome().terminalState).toBe("cancelled");
    expect(cancelled.goBack()).toBe(false);

    const aborted = new QuestionnaireFlow([choice("only")]);
    aborted.abort();
    expect(aborted.outcome().terminalState).toBe("aborted");
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
