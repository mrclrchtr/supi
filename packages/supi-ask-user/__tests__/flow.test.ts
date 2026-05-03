import { describe, expect, it } from "vitest";
import { ActiveQuestionnaireLock, QuestionnaireFlow } from "../src/flow.ts";
import type { NormalizedQuestion } from "../src/types.ts";

const choice = (id: string, header = id): NormalizedQuestion => ({
  id,
  header,
  type: "choice",
  prompt: `${id}?`,
  required: true,
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
  required: true,
  options: [
    { value: "a", label: "A" },
    { value: "b", label: "B" },
    { value: "c", label: "C" },
  ],
  allowOther: false,
  allowDiscuss: true,
  recommendedIndexes: [0, 2],
});

const optional = (id: string, header = id): NormalizedQuestion => ({
  id,
  header,
  type: "choice",
  prompt: `${id}?`,
  required: false,
  options: [
    { value: "a", label: "A" },
    { value: "b", label: "B" },
  ],
  allowOther: false,
  allowDiscuss: false,
  recommendedIndexes: [],
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

describe("QuestionnaireFlow optional questions", () => {
  it("allows advancing past optional unanswered questions", () => {
    const flow = new QuestionnaireFlow([optional("one"), choice("two")]);
    expect(flow.advance()).toBe(true);
    expect(flow.currentIndex).toBe(1);
    flow.setAnswer({ questionId: "two", source: "option", value: "a", optionIndex: 0 });
    flow.advance();
    expect(flow.currentMode).toBe("reviewing");
    flow.submit();
    expect(flow.isTerminal()).toBe(true);
    expect(flow.outcome().terminalState).toBe("submitted");
  });

  it("skip sets terminal state to skipped and includes prior answers", () => {
    const flow = new QuestionnaireFlow([optional("one"), choice("two")]);
    flow.setAnswer({ questionId: "one", source: "option", value: "a", optionIndex: 0 });
    flow.skip();
    expect(flow.outcome().terminalState).toBe("skipped");
    expect(flow.outcome().skipped).toBe(true);
    expect(flow.outcome().answers).toEqual([
      { questionId: "one", source: "option", value: "a", optionIndex: 0 },
    ]);
  });

  it("blocks submit when required questions are unanswered even if optional are skipped", () => {
    const flow = new QuestionnaireFlow([optional("one"), choice("two")]);
    flow.advance();
    expect(flow.allRequiredAnswered()).toBe(false);
    expect(flow.submit()).toBe(false);
  });

  it("showSkip is true when allowSkip is set", () => {
    const flow = new QuestionnaireFlow([choice("one")], true);
    expect(flow.showSkip).toBe(true);
  });

  it("showSkip is true when optional questions exist", () => {
    const flow = new QuestionnaireFlow([optional("one"), choice("two")]);
    expect(flow.showSkip).toBe(true);
  });

  it("showSkip is false when all questions are required and allowSkip is false", () => {
    const flow = new QuestionnaireFlow([choice("one"), choice("two")]);
    expect(flow.showSkip).toBe(false);
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
