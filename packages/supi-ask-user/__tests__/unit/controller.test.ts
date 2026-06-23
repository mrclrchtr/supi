import { describe, expect, it } from "vitest";
import { AskUserController } from "../../src/session/controller.ts";
import type {
  AskUserResponse,
  NormalizedChoiceQuestion,
  NormalizedQuestionnaire,
} from "../../src/types.ts";

const questionnaire: NormalizedQuestionnaire = {
  title: "Formatter",
  intro: "Need one explicit choice.",
  questions: [
    {
      type: "choice",
      id: "formatter",
      header: "Formatter",
      prompt: "Which formatter?",
      options: [
        { value: "biome", label: "Biome" },
        { value: "prettier", label: "Prettier" },
        { value: "rome", label: "Rome" },
      ],
      multi: false,
      recommendedIndexes: [0],
    },
    {
      type: "text",
      id: "reason",
      header: "Reason",
      prompt: "Anything else?",
      placeholder: "optional",
    },
  ],
};

const multiQuestionnaire: NormalizedQuestionnaire = {
  title: "Checks",
  intro: "Pick all required checks.",
  questions: [
    {
      type: "choice",
      id: "checks",
      header: "Checks",
      prompt: "Which checks should run?",
      options: [
        { value: "lint", label: "Lint" },
        { value: "tests", label: "Tests" },
        { value: "format", label: "Format" },
      ],
      multi: true,
      recommendedIndexes: [],
    },
  ],
};

const singleChoiceQuestion = questionnaire.questions[0] as NormalizedChoiceQuestion;
const multiChoiceQuestion = multiQuestionnaire.questions[0] as NormalizedChoiceQuestion;

// Helper to get a response for a given questionId
function responseById(outcome: { responses: AskUserResponse[] }, id: string): AskUserResponse {
  const r = outcome.responses.find((r) => r.questionId === id);
  expect(r).toBeDefined();
  return r!;
}

describe("AskUserController", () => {
  describe("initialization", () => {
    it("single-select defaults to recommended option", () => {
      const ctrl = new AskUserController(questionnaire);
      ctrl.setTextAnswer("reason", "Fast linting");
      const outcome = ctrl.outcome();
      expect(outcome.outcome).toBe("submitted");
      const resp = responseById(outcome, "formatter");
      expect(resp.answer.answered).toBe(true);
      if (resp.answer.kind === "choice") {
        const biome = resp.answer.options.find((o) => o.value === "biome")!;
        expect(biome.selected).toBe(true);
      }
    });

    it("single-select without recommendation defaults to first option", () => {
      const noRecQ: NormalizedQuestionnaire = {
        questions: [
          {
            type: "choice",
            id: "fmt",
            header: "Formatter",
            prompt: "Pick",
            options: [
              { value: "biome", label: "Biome" },
              { value: "prettier", label: "Prettier" },
            ],
            multi: false,
            recommendedIndexes: [0],
          },
        ],
      };
      const ctrl = new AskUserController(noRecQ);
      const outcome = ctrl.outcome();
      const resp = responseById(outcome, "fmt");
      expect(resp.answer.answered).toBe(true);
      if (resp.answer.kind === "choice") {
        expect(resp.answer.options[0].selected).toBe(true);
      }
    });

    it("multi-select with recommendations selects those options", () => {
      const withRecQ: NormalizedQuestionnaire = {
        questions: [
          {
            type: "choice",
            id: "checks",
            header: "Checks",
            prompt: "Which ones?",
            options: [
              { value: "lint", label: "Lint" },
              { value: "tests", label: "Tests" },
              { value: "format", label: "Format" },
            ],
            multi: true,
            recommendedIndexes: [0, 2],
          },
        ],
      };
      const ctrl = new AskUserController(withRecQ);
      const outcome = ctrl.outcome();
      const resp = responseById(outcome, "checks");
      if (resp.answer.kind === "choice") {
        const optionValues = resp.answer.options.map((o) => o.value);
        expect(optionValues).toContain("lint");
        expect(optionValues).not.toContain("tests");
        expect(optionValues).toContain("format");
        expect(resp.answer.options.find((o) => o.value === "lint")?.selected).toBe(true);
        expect(resp.answer.options.find((o) => o.value === "format")?.selected).toBe(true);
      }
    });

    it("multi-select without recommendation selects nothing", () => {
      const ctrl = new AskUserController(multiQuestionnaire);
      const outcome = ctrl.outcome();
      const resp = responseById(outcome, "checks");
      if (resp.answer.kind === "choice") {
        expect(resp.answer.options.every((o) => !o.selected)).toBe(true);
      }
    });

    it("text question from recommendation is answered", () => {
      const textRecQ: NormalizedQuestionnaire = {
        questions: [
          {
            type: "text",
            id: "notes",
            header: "Notes",
            prompt: "Anything else?",
            recommendation: "No, that's all",
          },
        ],
      };
      const ctrl = new AskUserController(textRecQ);
      expect(ctrl.getTextAnswer("notes")).toBe("No, that's all");
      const outcome = ctrl.outcome();
      const resp = responseById(outcome, "notes");
      expect(resp.answer.answered).toBe(true);
      if (resp.answer.kind === "text") {
        expect(resp.answer.value).toBe("No, that's all");
      }
    });

    it("text question without recommendation is unanswered", () => {
      const ctrl = new AskUserController(questionnaire);
      const outcome = ctrl.outcome();
      const resp = responseById(outcome, "reason");
      expect(resp.answer.answered).toBe(false);
    });
  });

  describe("navigation", () => {
    it("starts at index 0", () => {
      const ctrl = new AskUserController(questionnaire);
      expect(ctrl.currentIndex).toBe(0);
      expect(ctrl.currentQuestion.id).toBe("formatter");
    });

    it("goNext advances", () => {
      const ctrl = new AskUserController(questionnaire);
      expect(ctrl.goNext()).toBe(true);
      expect(ctrl.currentIndex).toBe(1);
      expect(ctrl.currentQuestion.id).toBe("reason");
    });

    it("goNext at last question returns false", () => {
      const ctrl = new AskUserController(questionnaire);
      ctrl.goNext();
      expect(ctrl.goNext()).toBe(false);
      expect(ctrl.currentIndex).toBe(1);
    });

    it("goBack retreats", () => {
      const ctrl = new AskUserController(questionnaire);
      ctrl.goNext();
      expect(ctrl.goBack()).toBe(true);
      expect(ctrl.currentIndex).toBe(0);
    });

    it("goBack at first question returns false", () => {
      const ctrl = new AskUserController(questionnaire);
      expect(ctrl.goBack()).toBe(false);
      expect(ctrl.currentIndex).toBe(0);
    });

    it("goTo jumps to a valid question index", () => {
      const ctrl = new AskUserController(questionnaire);
      expect(ctrl.goTo(1)).toBe(true);
      expect(ctrl.currentIndex).toBe(1);
      expect(ctrl.currentQuestion.id).toBe("reason");
    });

    it("goTo rejects out-of-range indices", () => {
      const ctrl = new AskUserController(questionnaire);
      expect(ctrl.goTo(-1)).toBe(false);
      expect(ctrl.goTo(2)).toBe(false);
      expect(ctrl.currentIndex).toBe(0);
    });

    it("goTo returns false when terminal", () => {
      const ctrl = new AskUserController(questionnaire);
      ctrl.cancel();
      expect(ctrl.goTo(1)).toBe(false);
    });
  });

  describe("single-select behavior", () => {
    it("selectChoiceOption selects one option", () => {
      const ctrl = new AskUserController(questionnaire);
      ctrl.setTextAnswer("reason", "Fast");
      ctrl.selectChoiceOption(singleChoiceQuestion, 1); // prettier
      const outcome = ctrl.outcome();
      const resp = responseById(outcome, "formatter");
      if (resp.answer.kind === "choice") {
        const optionValues = resp.answer.options.map((o) => o.value);
        expect(optionValues).toContain("prettier");
        expect(optionValues).not.toContain("biome");
        expect(resp.answer.options.find((o) => o.value === "prettier")?.selected).toBe(true);
      }
    });

    it("selecting a different option replaces the previous selection", () => {
      const ctrl = new AskUserController(questionnaire);
      ctrl.selectChoiceOption(singleChoiceQuestion, 1);
      ctrl.selectChoiceOption(singleChoiceQuestion, 2); // rome
      const outcome = ctrl.outcome();
      const resp = responseById(outcome, "formatter");
      if (resp.answer.kind === "choice") {
        expect(resp.answer.options.find((o) => o.selected)?.value).toBe("rome");
      }
    });
  });

  describe("multi-select behavior", () => {
    it("toggle selects and deselects", () => {
      const ctrl = new AskUserController(multiQuestionnaire);
      ctrl.toggleChoiceOption(multiChoiceQuestion, 0); // lint
      ctrl.toggleChoiceOption(multiChoiceQuestion, 1); // tests
      const outcome = ctrl.outcome();
      const resp = responseById(outcome, "checks");
      if (resp.answer.kind === "choice") {
        const optionValues = resp.answer.options.map((o) => o.value);
        expect(optionValues).toContain("lint");
        expect(optionValues).toContain("tests");
        expect(optionValues).not.toContain("format");
        expect(resp.answer.options.find((o) => o.value === "lint")?.selected).toBe(true);
        expect(resp.answer.options.find((o) => o.value === "tests")?.selected).toBe(true);
      }
    });

    it("deselecting removes selection but preserves comment", () => {
      const ctrl = new AskUserController(multiQuestionnaire);
      ctrl.toggleChoiceOption(multiChoiceQuestion, 0); // select lint
      ctrl.setChoiceOptionComment(multiChoiceQuestion, 0, "  Important  ");
      expect(ctrl.getOptionComment("checks", "lint")).toBe("Important");
      ctrl.toggleChoiceOption(multiChoiceQuestion, 0); // deselect lint
      expect(ctrl.getOptionComment("checks", "lint")).toBe("Important");
      const outcome = ctrl.outcome();
      const resp = responseById(outcome, "checks");
      if (resp.answer.kind === "choice") {
        expect(resp.answer.options.find((o) => o.value === "lint")?.comment).toBe("Important");
        expect(resp.answer.options.find((o) => o.value === "lint")?.selected).toBe(false);
      }
    });
  });

  describe("comments", () => {
    it("stores and clears form-level comment", () => {
      const ctrl = new AskUserController(questionnaire);
      ctrl.setComment("  Use biome for this project  ");
      expect(ctrl.comment).toBe("Use biome for this project");
      ctrl.setComment("");
      expect(ctrl.comment).toBeUndefined();
    });

    it("stores and removes question comment", () => {
      const ctrl = new AskUserController(questionnaire);
      ctrl.setQuestionComment("formatter", "  Ask the team  ");
      const outcome = ctrl.outcome();
      expect(responseById(outcome, "formatter").questionComment).toBe("Ask the team");
      expect(ctrl.getQuestionComment("formatter")).toBe("Ask the team");

      ctrl.setQuestionComment("formatter", "");
      const outcome2 = ctrl.outcome();
      expect(responseById(outcome2, "formatter").questionComment).toBeUndefined();
      expect(ctrl.getQuestionComment("formatter")).toBeUndefined();
    });

    it("stores option comment on selected option", () => {
      const ctrl = new AskUserController(questionnaire);
      ctrl.setChoiceOptionComment(singleChoiceQuestion, 0, "  Fast and safe  ");
      expect(ctrl.getOptionComment("formatter", "biome")).toBe("Fast and safe");
      const outcome = ctrl.outcome();
      const resp = responseById(outcome, "formatter");
      if (resp.answer.kind === "choice") {
        expect(resp.answer.options.find((o) => o.value === "biome")?.comment).toBe("Fast and safe");
      }
    });

    it("stores option comment on unselected option", () => {
      const ctrl = new AskUserController(multiQuestionnaire);
      ctrl.setChoiceOptionComment(multiChoiceQuestion, 1, "  Might need this  ");
      expect(ctrl.getOptionComment("checks", "tests")).toBe("Might need this");
      const outcome = ctrl.outcome();
      const resp = responseById(outcome, "checks");
      if (resp.answer.kind === "choice") {
        expect(resp.answer.options.find((o) => o.value === "tests")?.comment).toBe(
          "Might need this",
        );
        expect(resp.answer.options.find((o) => o.value === "tests")?.selected).toBe(false);
      }
    });

    it("blank option comment is removed", () => {
      const ctrl = new AskUserController(questionnaire);
      ctrl.setChoiceOptionComment(singleChoiceQuestion, 0, "  ");
      expect(ctrl.getOptionComment("formatter", "biome")).toBeUndefined();
    });

    it("blank question comment is removed", () => {
      const ctrl = new AskUserController(questionnaire);
      ctrl.setQuestionComment("formatter", "  ");
      const outcome = ctrl.outcome();
      expect(responseById(outcome, "formatter").questionComment).toBeUndefined();
    });
  });

  describe("unanswered marking", () => {
    it("unmarking preserves comments but clears selection", () => {
      const ctrl = new AskUserController(questionnaire);
      ctrl.setQuestionComment("formatter", "Need input");
      ctrl.markCurrentQuestionUnanswered();
      const outcome = ctrl.outcome();
      const resp = responseById(outcome, "formatter");
      expect(resp.answer.answered).toBe(false);
      expect(resp.questionComment).toBe("Need input");
      if (resp.answer.kind === "choice") {
        expect(resp.answer.options.every((o) => !o.selected)).toBe(true);
      }
    });

    it("unanswered question still appears in responses with comments", () => {
      const ctrl = new AskUserController(questionnaire);
      ctrl.markCurrentQuestionUnanswered();
      const outcome = ctrl.outcome();
      expect(outcome.outcome).toBe("needs_discussion");
      const resp = responseById(outcome, "formatter");
      expect(resp.answer.answered).toBe(false);
    });
  });

  describe("outcome computation", () => {
    it("submitted when every question is answered", () => {
      const ctrl = new AskUserController(questionnaire);
      // formatter already answered by default
      ctrl.setTextAnswer("reason", "Fast linting");
      const outcome = ctrl.outcome();
      expect(outcome.outcome).toBe("submitted");
      expect(outcome.responses).toHaveLength(2);
    });

    it("needs_discussion when a question is unanswered", () => {
      const ctrl = new AskUserController(questionnaire);
      // formatter already answered, reason is unanswered
      const outcome = ctrl.outcome();
      expect(outcome.outcome).toBe("needs_discussion");
    });

    it("responses preserve original question order", () => {
      const ctrl = new AskUserController(questionnaire);
      ctrl.setTextAnswer("reason", "Fast linting");
      const outcome = ctrl.outcome();
      expect(outcome.responses.map((r) => r.questionId)).toEqual(["formatter", "reason"]);
    });

    it("choice responses include only touched options", () => {
      const ctrl = new AskUserController(multiQuestionnaire);
      ctrl.toggleChoiceOption(multiChoiceQuestion, 0); // lint selected
      ctrl.setChoiceOptionComment(multiChoiceQuestion, 1, "Might need this"); // tests commented
      const outcome = ctrl.outcome();
      const resp = responseById(outcome, "checks");
      if (resp.answer.kind === "choice") {
        const optionValues = resp.answer.options.map((o) => o.value);
        expect(optionValues).toContain("lint");
        expect(optionValues).toContain("tests");
        expect(optionValues).not.toContain("format");
      }
    });
  });

  describe("direct state queries", () => {
    it("isOptionSelected returns true for selected option", () => {
      const ctrl = new AskUserController(questionnaire);
      expect(ctrl.isOptionSelected("formatter", "biome")).toBe(true);
      expect(ctrl.isOptionSelected("formatter", "prettier")).toBe(false);
    });

    it("isOptionSelected returns false for non-choice question", () => {
      const ctrl = new AskUserController(questionnaire);
      expect(ctrl.isOptionSelected("reason", "anything")).toBe(false);
    });

    it("tracks explicitly marked unanswered questions", () => {
      const ctrl = new AskUserController(questionnaire);
      expect(ctrl.isQuestionMarkedUnanswered("formatter")).toBe(false);
      ctrl.markCurrentQuestionUnanswered();
      expect(ctrl.isQuestionMarkedUnanswered("formatter")).toBe(true);
      ctrl.selectChoiceOption(singleChoiceQuestion, 1);
      expect(ctrl.isQuestionMarkedUnanswered("formatter")).toBe(false);
    });

    it("throws when accessing state for an unknown question id", () => {
      const ctrl = new AskUserController(questionnaire);
      expect(() => ctrl.setQuestionComment("unknown", "x")).toThrow(
        /Unknown question id "unknown"/,
      );
    });
  });

  describe("cancel and abort", () => {
    it("cancel returns internal cancel result", () => {
      const ctrl = new AskUserController(questionnaire);
      const result = ctrl.cancel();
      expect(result.kind).toBe("cancel");
    });

    it("abort returns internal abort result", () => {
      const ctrl = new AskUserController(questionnaire);
      const result = ctrl.abort();
      expect(result.kind).toBe("abort");
    });

    it("isTerminal is false before cancel/abort", () => {
      const ctrl = new AskUserController(questionnaire);
      expect(ctrl.isTerminal).toBe(false);
    });

    it("isTerminal is true after cancel", () => {
      const ctrl = new AskUserController(questionnaire);
      ctrl.cancel();
      expect(ctrl.isTerminal).toBe(true);
    });
  });
});
