import { visibleWidth } from "@earendil-works/pi-tui";
import { describe, expect, it } from "vitest";
import type { NormalizedQuestionnaire } from "../../src/types.ts";
import { runFormQuestionnaire } from "../../src/ui/form.ts";
import type { AskUserUiContext } from "../../src/ui/types.ts";
import { makeFormCtx } from "../helpers/index.ts";

const questionnaire: NormalizedQuestionnaire = {
  title: "Formatter",
  intro: "Need one explicit answer.",
  questions: [
    {
      type: "choice",
      id: "formatter",
      header: "Formatter",
      prompt: "Pick one",
      options: [
        { value: "biome", label: "Biome", preview: "Fast and integrated" },
        { value: "prettier", label: "Prettier" },
        { value: "rome", label: "Rome" },
      ],
      multi: false,
      recommendedIndexes: [0],
    },
  ],
};

const singleChoiceNoRecQ: NormalizedQuestionnaire = {
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

const twoStepQuestionnaire: NormalizedQuestionnaire = {
  title: "Two step",
  intro: "Need two answers.",
  questions: [
    {
      type: "choice",
      id: "one",
      header: "One",
      prompt: "Pick the first answer.",
      options: [
        { value: "a", label: "A" },
        { value: "b", label: "B" },
      ],
      multi: false,
      recommendedIndexes: [0],
    },
    {
      type: "choice",
      id: "two",
      header: "Two",
      prompt: "Pick the second answer.",
      options: [
        { value: "c", label: "C" },
        { value: "d", label: "D" },
      ],
      multi: false,
      recommendedIndexes: [0],
    },
  ],
};

const textQuestionnaire: NormalizedQuestionnaire = {
  title: "Reason",
  intro: "Need a short explanation.",
  questions: [
    {
      type: "text",
      id: "reason",
      header: "Reason",
      prompt: "Type the reason.",
      recommendation: "prefilled",
      placeholder: "optional",
    },
  ],
};

const multiQuestionnaire: NormalizedQuestionnaire = {
  title: "Checks",
  intro: "Need all required checks.",
  questions: [
    {
      type: "choice",
      id: "checks",
      header: "Checks",
      prompt: "Which checks should run?",
      options: [
        { value: "lint", label: "Lint" },
        { value: "tests", label: "Tests" },
      ],
      multi: true,
      recommendedIndexes: [],
    },
  ],
};

function tabKey(): string {
  return "\t";
}

function shiftTabKey(): string {
  return "\u001b[Z";
}

function enterKey(): string {
  return "\r";
}

function escKey(): string {
  return "\u001b";
}

function altCKey(): string {
  return "\u001bc";
}

function altUKey(): string {
  return "\u001bu";
}

function downKey(): string {
  return "\u001b[B";
}

function upKey(): string {
  return "\u001b[A";
}

function leftKey(): string {
  return "\u001b[D";
}

function rightKey(): string {
  return "\u001b[C";
}

function spaceKey(): string {
  return " ";
}

describe("runFormQuestionnaire", () => {
  describe("single-select choice", () => {
    it("starts with recommended option selected", async () => {
      const { captured, ctx } = makeFormCtx();
      void runFormQuestionnaire(questionnaire, {
        ui: ctx.ui as unknown as AskUserUiContext,
      });

      await Promise.resolve();
      if (!captured.value) throw new Error("form component was not created");

      const rendered = captured.value.render(100).join("\n");
      expect(rendered).toContain("Need one explicit answer.");
      expect(rendered).toContain("(*)"); // selected marker
      expect(rendered).toContain("Biome");
    });

    it("shows a [recommended] badge on the recommended option", async () => {
      const { captured, ctx } = makeFormCtx();
      void runFormQuestionnaire(questionnaire, {
        ui: ctx.ui as unknown as AskUserUiContext,
      });

      await Promise.resolve();
      if (!captured.value) throw new Error("form component was not created");

      const rendered = captured.value.render(100).join("\n");
      expect(rendered).toContain("(*) Biome [recommended]");
    });

    it("mentions Space select in the single-select footer", async () => {
      const { captured, ctx } = makeFormCtx();
      void runFormQuestionnaire(questionnaire, {
        ui: ctx.ui as unknown as AskUserUiContext,
      });

      await Promise.resolve();
      if (!captured.value) throw new Error("form component was not created");

      const rendered = captured.value.render(100).join("\n");
      expect(rendered).toContain("Space select");
    });

    it("Enter selects the focused option and advances past the last question to review", async () => {
      const { captured, ctx } = makeFormCtx();
      const _runPromise = runFormQuestionnaire(singleChoiceNoRecQ, {
        ui: ctx.ui as unknown as AskUserUiContext,
      });

      await Promise.resolve();
      if (!captured.value) throw new Error("form component was not created");

      // Should show review after Enter since it's the only question
      captured.value.handleInput?.(enterKey());

      // Should show review screen
      const rendered = captured.value.render(100).join("\n");
      expect(rendered).toContain("Review");
    });

    it("Space selects the focused option on single-select", async () => {
      const { captured, ctx, outcomePromise } = makeFormCtx();
      void runFormQuestionnaire(singleChoiceNoRecQ, {
        ui: ctx.ui as unknown as AskUserUiContext,
      });

      await Promise.resolve();
      if (!captured.value) throw new Error("form component was not created");

      captured.value.handleInput?.(downKey());
      captured.value.handleInput?.(spaceKey());
      captured.value.handleInput?.(enterKey());
      captured.value.handleInput?.(enterKey());

      const outcome = await outcomePromise;
      if (!("outcome" in outcome)) throw new Error("Expected submitted outcome");
      expect(outcome.outcome).toBe("submitted");
      expect(outcome.responses[0]?.answer).toMatchObject({
        kind: "choice",
        answered: true,
        options: [{ value: "prettier", label: "Prettier", selected: true }],
      });
    });
  });

  describe("multi-select choice", () => {
    it("starts with no selections when no recommendation exists", async () => {
      const { captured, ctx } = makeFormCtx();
      void runFormQuestionnaire(multiQuestionnaire, {
        ui: ctx.ui as unknown as AskUserUiContext,
      });

      await Promise.resolve();
      if (!captured.value) throw new Error("form component was not created");

      const rendered = captured.value.render(100).join("\n");
      expect(rendered).toContain("1/1 · Checks");
      expect(rendered).toContain("[ ]"); // no selection marker
    });

    it("Space toggles a multi-select option and Enter advances", async () => {
      const { captured, ctx } = makeFormCtx();
      void runFormQuestionnaire(multiQuestionnaire, {
        ui: ctx.ui as unknown as AskUserUiContext,
      });

      await Promise.resolve();
      if (!captured.value) throw new Error("form component was not created");

      // Toggle lint on
      captured.value.handleInput?.(spaceKey());
      expect(captured.value.render(100).join("\n")).toContain("[x] Lint");

      // Toggle tests on
      captured.value.handleInput?.(downKey());
      captured.value.handleInput?.(spaceKey());
      expect(captured.value.render(100).join("\n")).toContain("[x] Tests");

      // Enter advances without toggling
      captured.value.handleInput?.(enterKey());

      // Should show review screen
      const rendered = captured.value.render(100).join("\n");
      expect(rendered).toContain("Review");
    });
  });

  describe("arrow-key navigation", () => {
    it("right arrow advances by question and goes to review from the last question", async () => {
      const { captured, ctx } = makeFormCtx();
      void runFormQuestionnaire(twoStepQuestionnaire, {
        ui: ctx.ui as unknown as AskUserUiContext,
      });

      await Promise.resolve();
      if (!captured.value) throw new Error("form component was not created");

      expect(captured.value.render(100).join("\n")).toContain("1/2 · One");

      captured.value.handleInput?.(rightKey());
      expect(captured.value.render(100).join("\n")).toContain("2/2 · Two");

      captured.value.handleInput?.(rightKey());
      expect(captured.value.render(100).join("\n")).toContain("Review");
    });

    it("left arrow goes backward by question and from review to the last question", async () => {
      const { captured, ctx } = makeFormCtx();
      void runFormQuestionnaire(twoStepQuestionnaire, {
        ui: ctx.ui as unknown as AskUserUiContext,
      });

      await Promise.resolve();
      if (!captured.value) throw new Error("form component was not created");

      captured.value.handleInput?.(rightKey());
      captured.value.handleInput?.(rightKey());
      expect(captured.value.render(100).join("\n")).toContain("Review");

      captured.value.handleInput?.(leftKey());
      expect(captured.value.render(100).join("\n")).toContain("2/2 · Two");

      captured.value.handleInput?.(leftKey());
      expect(captured.value.render(100).join("\n")).toContain("1/2 · One");

      captured.value.handleInput?.(leftKey());
      expect(captured.value.render(100).join("\n")).toContain("1/2 · One");
    });

    it("preserves choice focus when navigating backward and forward", async () => {
      const { captured, ctx } = makeFormCtx();
      void runFormQuestionnaire(twoStepQuestionnaire, {
        ui: ctx.ui as unknown as AskUserUiContext,
      });

      await Promise.resolve();
      if (!captured.value) throw new Error("form component was not created");

      // Move to question two and focus the second option
      captured.value.handleInput?.(rightKey());
      captured.value.handleInput?.(downKey());
      expect(captured.value.render(100).join("\n")).toContain("→ ( ) D");

      // Go back and then forward again
      captured.value.handleInput?.(leftKey());
      expect(captured.value.render(100).join("\n")).toContain("1/2 · One");
      captured.value.handleInput?.(rightKey());
      expect(captured.value.render(100).join("\n")).toContain("→ ( ) D");
    });

    it("left/right arrows are passed to the text editor in text mode", async () => {
      const { captured, ctx, outcomePromise } = makeFormCtx();
      void runFormQuestionnaire(textQuestionnaire, {
        ui: ctx.ui as unknown as AskUserUiContext,
      });

      await Promise.resolve();
      if (!captured.value) throw new Error("form component was not created");

      // The editor starts with "prefilled" and the cursor at the end.
      // Type "x", move cursor left, type "y" — the result should be
      // "prefilledyx". If arrows navigated away, the final text would differ.
      for (const char of "x") captured.value.handleInput?.(char);
      captured.value.handleInput?.(leftKey());
      for (const char of "y") captured.value.handleInput?.(char);
      captured.value.handleInput?.(enterKey());
      captured.value.handleInput?.(enterKey());

      const outcome = await outcomePromise;
      if (!("outcome" in outcome)) throw new Error("Expected submitted outcome");
      expect(outcome.responses[0]?.answer).toMatchObject({
        kind: "text",
        answered: true,
        value: "prefilledyx",
      });
    });
  });

  describe("Tab/Shift+Tab navigation", () => {
    it("Tab goes forward by question and goes to review from the last question", async () => {
      const { captured, ctx } = makeFormCtx();
      void runFormQuestionnaire(twoStepQuestionnaire, {
        ui: ctx.ui as unknown as AskUserUiContext,
      });

      await Promise.resolve();
      if (!captured.value) throw new Error("form component was not created");

      expect(captured.value.render(100).join("\n")).toContain("1/2 · One");

      captured.value.handleInput?.(tabKey());
      expect(captured.value.render(100).join("\n")).toContain("2/2 · Two");

      captured.value.handleInput?.(tabKey());
      expect(captured.value.render(100).join("\n")).toContain("Review");
    });

    it("Shift+Tab goes backward from review to last question", async () => {
      const { captured, ctx } = makeFormCtx();
      void runFormQuestionnaire(twoStepQuestionnaire, {
        ui: ctx.ui as unknown as AskUserUiContext,
      });

      await Promise.resolve();
      if (!captured.value) throw new Error("form component was not created");

      // Go to question 2 then review
      captured.value.handleInput?.(tabKey());
      captured.value.handleInput?.(tabKey());
      expect(captured.value.render(100).join("\n")).toContain("Review");

      // Shift+Tab back
      captured.value.handleInput?.(shiftTabKey());
      expect(captured.value.render(100).join("\n")).toContain("2/2 · Two");
    });

    it("Tab from review stays on review", async () => {
      const { captured, ctx } = makeFormCtx();
      void runFormQuestionnaire(twoStepQuestionnaire, {
        ui: ctx.ui as unknown as AskUserUiContext,
      });

      await Promise.resolve();
      if (!captured.value) throw new Error("form component was not created");

      captured.value.handleInput?.(tabKey());
      captured.value.handleInput?.(tabKey());
      expect(captured.value.render(100).join("\n")).toContain("Review");

      captured.value.handleInput?.(tabKey());
      expect(captured.value.render(100).join("\n")).toContain("Review");
    });

    it("Shift+Tab on the first question stays on the first question", async () => {
      const { captured, ctx } = makeFormCtx();
      void runFormQuestionnaire(twoStepQuestionnaire, {
        ui: ctx.ui as unknown as AskUserUiContext,
      });

      await Promise.resolve();
      if (!captured.value) throw new Error("form component was not created");

      expect(captured.value.render(100).join("\n")).toContain("1/2 · One");
      captured.value.handleInput?.(shiftTabKey());
      expect(captured.value.render(100).join("\n")).toContain("1/2 · One");
    });
  });

  describe("text questions", () => {
    it("persists typed text when Tab advances to review", async () => {
      const { captured, ctx, outcomePromise } = makeFormCtx();
      void runFormQuestionnaire(
        {
          questions: [
            {
              type: "text",
              id: "reason",
              header: "Reason",
              prompt: "Type the reason.",
            },
          ],
        },
        {
          ui: ctx.ui as unknown as AskUserUiContext,
        },
      );

      await Promise.resolve();
      if (!captured.value) throw new Error("form component was not created");

      for (const char of "Typed answer") captured.value.handleInput?.(char);
      captured.value.handleInput?.(tabKey());
      expect(captured.value.render(100).join("\n")).toContain("Typed answer");
      captured.value.handleInput?.(enterKey());

      const outcome = await outcomePromise;
      if (!("outcome" in outcome)) throw new Error("Expected submitted outcome");
      expect(outcome.outcome).toBe("submitted");
      expect(outcome.responses[0]?.answer).toMatchObject({
        kind: "text",
        answered: true,
        value: "Typed answer",
      });
    });

    it("Alt+U keeps recommended text unanswered across revisits", async () => {
      const { captured, ctx, outcomePromise } = makeFormCtx();
      void runFormQuestionnaire(textQuestionnaire, {
        ui: ctx.ui as unknown as AskUserUiContext,
      });

      await Promise.resolve();
      if (!captured.value) throw new Error("form component was not created");

      captured.value.handleInput?.(altUKey());
      const rendered = captured.value.render(100).join("\n");
      expect(rendered).toContain("Placeholder: optional");
      expect(rendered).not.toContain("prefilled");

      captured.value.handleInput?.(tabKey());
      expect(captured.value.render(100).join("\n")).toContain("Review");
      captured.value.handleInput?.(shiftTabKey());
      expect(captured.value.render(100).join("\n")).not.toContain("prefilled");

      captured.value.handleInput?.(tabKey());
      captured.value.handleInput?.(enterKey());

      const outcome = await outcomePromise;
      if (!("outcome" in outcome)) throw new Error("Expected needs_discussion outcome");
      expect(outcome.outcome).toBe("needs_discussion");
      expect(outcome.responses[0]?.answer).toMatchObject({ kind: "text", answered: false });
    });

    it("shows text input with recommendation prefilled", async () => {
      const { captured, ctx } = makeFormCtx();
      void runFormQuestionnaire(textQuestionnaire, {
        ui: ctx.ui as unknown as AskUserUiContext,
      });

      await Promise.resolve();
      if (!captured.value) throw new Error("form component was not created");

      const rendered = captured.value.render(100).join("\n");
      expect(rendered).toContain("Your answer");
      expect(rendered).toContain("prefilled");
    });

    it("Alt+C edits text question comments without stealing printable c", async () => {
      const { captured, ctx, outcomePromise } = makeFormCtx();
      void runFormQuestionnaire(
        {
          questions: [
            {
              type: "text",
              id: "word",
              header: "Word",
              prompt: "Type a word.",
            },
          ],
        },
        {
          ui: ctx.ui as unknown as AskUserUiContext,
        },
      );

      await Promise.resolve();
      if (!captured.value) throw new Error("form component was not created");

      captured.value.handleInput?.(altCKey());
      for (const char of "Text note") captured.value.handleInput?.(char);
      captured.value.handleInput?.(enterKey());
      for (const char of "cat") captured.value.handleInput?.(char);
      captured.value.handleInput?.(enterKey());
      captured.value.handleInput?.(enterKey());

      const outcome = await outcomePromise;
      if (!("outcome" in outcome)) throw new Error("Expected submitted outcome");
      expect(outcome.responses[0]).toMatchObject({
        questionComment: "Text note",
        answer: { kind: "text", answered: true, value: "cat" },
      });
    });

    it("lets printable c and u characters pass through to the text editor", async () => {
      const { captured, ctx, outcomePromise } = makeFormCtx();
      void runFormQuestionnaire(
        {
          questions: [
            {
              type: "text",
              id: "word",
              header: "Word",
              prompt: "Type a word.",
            },
          ],
        },
        {
          ui: ctx.ui as unknown as AskUserUiContext,
        },
      );

      await Promise.resolve();
      if (!captured.value) throw new Error("form component was not created");

      for (const char of "cucumber") captured.value.handleInput?.(char);
      captured.value.handleInput?.(enterKey());
      captured.value.handleInput?.(enterKey());

      const outcome = await outcomePromise;
      if (!("outcome" in outcome)) throw new Error("Expected submitted outcome");
      expect(outcome.responses[0]?.answer).toMatchObject({
        kind: "text",
        answered: true,
        value: "cucumber",
      });
    });

    it("Enter on text saves and advances", async () => {
      const { captured, ctx } = makeFormCtx();
      void runFormQuestionnaire(textQuestionnaire, {
        ui: ctx.ui as unknown as AskUserUiContext,
      });

      await Promise.resolve();
      if (!captured.value) throw new Error("form component was not created");

      // Enter with recommendation prefilled — should advance to review
      captured.value.handleInput?.(enterKey());

      const rendered = captured.value.render(100).join("\n");
      expect(rendered).toContain("Review");
    });
  });

  describe("u for unanswered", () => {
    it("marks current question unanswered, preserving comments", async () => {
      const { captured, ctx } = makeFormCtx();
      void runFormQuestionnaire(questionnaire, {
        ui: ctx.ui as unknown as AskUserUiContext,
      });

      await Promise.resolve();
      if (!captured.value) throw new Error("form component was not created");

      captured.value.handleInput?.("c");
      for (const char of "Need team input") captured.value.handleInput?.(char);
      captured.value.handleInput?.(enterKey());

      captured.value.handleInput?.("u");
      expect(captured.value.render(100).join("\n")).toContain(
        "Marked unanswered; comments preserved.",
      );
    });

    it("Enter on unanswered single-select advances without selecting", async () => {
      const { captured, ctx, outcomePromise } = makeFormCtx();
      void runFormQuestionnaire(questionnaire, {
        ui: ctx.ui as unknown as AskUserUiContext,
      });

      await Promise.resolve();
      if (!captured.value) throw new Error("form component was not created");

      captured.value.handleInput?.("u");
      captured.value.handleInput?.(enterKey());
      captured.value.handleInput?.(enterKey());

      const outcome = await outcomePromise;
      if (!("outcome" in outcome)) throw new Error("Expected needs_discussion outcome");
      expect(outcome.outcome).toBe("needs_discussion");
      const resp = outcome.responses.find((r) => r.questionId === "formatter");
      expect(resp?.answer.answered).toBe(false);
    });
  });

  describe("c for comments", () => {
    it("c on question screen edits question comment", async () => {
      const { captured, ctx } = makeFormCtx();
      void runFormQuestionnaire(questionnaire, {
        ui: ctx.ui as unknown as AskUserUiContext,
      });

      await Promise.resolve();
      if (!captured.value) throw new Error("form component was not created");

      captured.value.handleInput?.("c");
      expect(captured.value.render(100).join("\n")).toContain("Question comment");

      for (const char of "Ask the team") captured.value.handleInput?.(char);
      captured.value.handleInput?.(enterKey());

      // Back to choice view with question comment visible
      const rendered = captured.value.render(100).join("\n");
      expect(rendered).toContain("(*) Biome");
    });

    it("shows the question header in the question comment editor", async () => {
      const { captured, ctx } = makeFormCtx();
      void runFormQuestionnaire(questionnaire, {
        ui: ctx.ui as unknown as AskUserUiContext,
      });

      await Promise.resolve();
      if (!captured.value) throw new Error("form component was not created");

      captured.value.handleInput?.("c");
      const rendered = captured.value.render(100).join("\n");
      expect(rendered).toContain("Question comment: Formatter");
    });
  });

  describe("n for option comments", () => {
    it("shows the option label in the option comment editor", async () => {
      const { captured, ctx } = makeFormCtx();
      void runFormQuestionnaire(questionnaire, {
        ui: ctx.ui as unknown as AskUserUiContext,
      });

      await Promise.resolve();
      if (!captured.value) throw new Error("form component was not created");

      captured.value.handleInput?.("n");
      const rendered = captured.value.render(100).join("\n");
      expect(rendered).toContain("Option comment: Biome");
    });

    it("n edits the focused option comment, preserving state", async () => {
      const { captured, ctx } = makeFormCtx();
      void runFormQuestionnaire(questionnaire, {
        ui: ctx.ui as unknown as AskUserUiContext,
      });

      await Promise.resolve();
      if (!captured.value) throw new Error("form component was not created");

      captured.value.handleInput?.("n");
      expect(captured.value.render(100).join("\n")).toContain("Option comment");

      for (const char of "Use repo defaults") captured.value.handleInput?.(char);
      captured.value.handleInput?.(enterKey());

      // Back to choice view - option should have comment indicator
      const rendered = captured.value.render(100).join("\n");
      expect(rendered).toContain("[comment]");
    });

    it("returns focus to the commented option after saving an option comment", async () => {
      const { captured, ctx } = makeFormCtx();
      void runFormQuestionnaire(questionnaire, {
        ui: ctx.ui as unknown as AskUserUiContext,
      });

      await Promise.resolve();
      if (!captured.value) throw new Error("form component was not created");

      captured.value.handleInput?.(downKey());
      captured.value.handleInput?.("n");
      for (const char of "Second option note") captured.value.handleInput?.(char);
      captured.value.handleInput?.(enterKey());

      const rendered = captured.value.render(100).join("\n");
      expect(rendered).toContain("→ ( ) Prettier [comment]");
    });
  });

  describe("review screen", () => {
    it("shows selected choices, text answers, and comments before submit", async () => {
      const { captured, ctx } = makeFormCtx();
      void runFormQuestionnaire(questionnaire, {
        ui: ctx.ui as unknown as AskUserUiContext,
      });

      await Promise.resolve();
      if (!captured.value) throw new Error("form component was not created");

      captured.value.handleInput?.("n");
      for (const char of "Fast default") captured.value.handleInput?.(char);
      captured.value.handleInput?.(enterKey());
      captured.value.handleInput?.(enterKey());

      const rendered = captured.value.render(100).join("\n");
      expect(rendered).toContain("Review");
      expect(rendered).toContain("Biome");
      expect(rendered).toContain("Fast default");
    });

    it("shows answered/unanswered state and Enter submits", async () => {
      const { captured, ctx, outcomePromise } = makeFormCtx();
      const _runPromise = runFormQuestionnaire(twoStepQuestionnaire, {
        ui: ctx.ui as unknown as AskUserUiContext,
      });

      await Promise.resolve();
      if (!captured.value) throw new Error("form component was not created");

      // Answer first question
      captured.value.handleInput?.(enterKey());

      // Answer second question with the second option; Enter moves to review
      captured.value.handleInput?.(downKey());
      captured.value.handleInput?.(enterKey());

      const rendered = captured.value.render(100).join("\n");
      expect(rendered).toContain("Review");
      expect(rendered).toContain("[\u2713] One");
      expect(rendered).toContain("[\u2713] Two");
      expect(rendered).toContain("A");
      expect(rendered).toContain("D");

      // Submit from review
      captured.value.handleInput?.(enterKey());

      const outcome = await outcomePromise;
      if (!("outcome" in outcome && outcome.outcome === "submitted")) {
        throw new Error("Expected submitted outcome");
      }
      expect(outcome.outcome).toBe("submitted");
      expect(outcome.responses).toHaveLength(2);
    });

    it("c on review edits the form-level comment", async () => {
      const { captured, ctx, outcomePromise } = makeFormCtx();
      void runFormQuestionnaire(twoStepQuestionnaire, {
        ui: ctx.ui as unknown as AskUserUiContext,
      });

      await Promise.resolve();
      if (!captured.value) throw new Error("form component was not created");

      captured.value.handleInput?.(tabKey());
      captured.value.handleInput?.(tabKey());
      expect(captured.value.render(100).join("\n")).toContain("Review");

      captured.value.handleInput?.("c");
      const commentEditor = captured.value.render(100).join("\n");
      expect(commentEditor).toContain("Review · form comment");
      expect(commentEditor).toContain("Form comment");
      expect(commentEditor).not.toContain("2/2 · Two");

      for (const char of "Need team sign-off") captured.value.handleInput?.(char);
      captured.value.handleInput?.(enterKey());

      const rendered = captured.value.render(100).join("\n");
      expect(rendered).toContain("Need team sign-off");

      captured.value.handleInput?.(enterKey());

      const outcome = await outcomePromise;
      if (!("outcome" in outcome)) throw new Error("Expected submitted outcome");
      expect(outcome.comment).toBe("Need team sign-off");
    });

    it("returns to review after editing a non-final question from review", async () => {
      const { captured, ctx } = makeFormCtx();
      void runFormQuestionnaire(twoStepQuestionnaire, {
        ui: ctx.ui as unknown as AskUserUiContext,
      });

      await Promise.resolve();
      if (!captured.value) throw new Error("form component was not created");

      captured.value.handleInput?.(tabKey());
      captured.value.handleInput?.(tabKey());
      expect(captured.value.render(100).join("\n")).toContain("→ Submit form");

      captured.value.handleInput?.(upKey());
      captured.value.handleInput?.(upKey());
      captured.value.handleInput?.(enterKey());
      expect(captured.value.render(100).join("\n")).toContain("1/2 · One");

      captured.value.handleInput?.(downKey());
      captured.value.handleInput?.(enterKey());

      const rendered = captured.value.render(100).join("\n");
      expect(rendered).toContain("Review");
      expect(rendered).not.toContain("2/2 · Two");
      expect(rendered).toContain("→ Submit form");
      expect(rendered).toContain("B");
    });

    it("Enter on a focused review question edits it; Enter on Submit submits", async () => {
      const { captured, ctx, outcomePromise } = makeFormCtx();
      void runFormQuestionnaire(twoStepQuestionnaire, {
        ui: ctx.ui as unknown as AskUserUiContext,
      });

      await Promise.resolve();
      if (!captured.value) throw new Error("form component was not created");

      // Reach review (Submit row is focused by default)
      captured.value.handleInput?.(tabKey());
      captured.value.handleInput?.(tabKey());
      expect(captured.value.render(100).join("\n")).toContain("Review");
      expect(captured.value.render(100).join("\n")).toContain("→ Submit form");

      // Move up to question Two and press Enter to edit
      captured.value.handleInput?.(upKey());
      captured.value.handleInput?.(enterKey());
      expect(captured.value.render(100).join("\n")).toContain("2/2 · Two");

      // Change answer to option D and return to review
      captured.value.handleInput?.(downKey());
      captured.value.handleInput?.(enterKey());
      expect(captured.value.render(100).join("\n")).toContain("Review");

      // Move down to Submit and submit
      captured.value.handleInput?.(downKey());
      captured.value.handleInput?.(downKey());
      captured.value.handleInput?.(enterKey());

      const outcome = await outcomePromise;
      if (!("outcome" in outcome && outcome.outcome === "submitted")) {
        throw new Error("Expected submitted outcome");
      }
      expect(outcome.responses[1]?.answer).toMatchObject({
        kind: "choice",
        answered: true,
        options: [{ value: "d", label: "D", selected: true }],
      });
    });

    it("shows option comments on the review screen", async () => {
      const { captured, ctx } = makeFormCtx();
      void runFormQuestionnaire(questionnaire, {
        ui: ctx.ui as unknown as AskUserUiContext,
      });

      await Promise.resolve();
      if (!captured.value) throw new Error("form component was not created");

      captured.value.handleInput?.("n");
      for (const char of "Use repo defaults") captured.value.handleInput?.(char);
      captured.value.handleInput?.(enterKey());
      captured.value.handleInput?.(enterKey());

      const rendered = captured.value.render(100).join("\n");
      expect(rendered).toContain("Review");
      expect(rendered).toContain("Use repo defaults");
    });
  });

  describe("Esc for cancel", () => {
    it("Esc from a comment editor returns to the form without cancelling", async () => {
      const { captured, ctx, outcomePromise } = makeFormCtx();
      let settled = false;
      void outcomePromise.then(() => {
        settled = true;
      });
      void runFormQuestionnaire(questionnaire, {
        ui: ctx.ui as unknown as AskUserUiContext,
      });

      await Promise.resolve();
      if (!captured.value) throw new Error("form component was not created");

      captured.value.handleInput?.("c");
      captured.value.handleInput?.(escKey());
      await Promise.resolve();

      expect(settled).toBe(false);
      const rendered = captured.value.render(100).join("\n");
      expect(rendered).toContain("1/1 · Formatter");
    });

    it("Esc returns a cancel interaction result", async () => {
      const { captured, ctx, outcomePromise } = makeFormCtx();
      void runFormQuestionnaire(questionnaire, {
        ui: ctx.ui as unknown as AskUserUiContext,
      });

      await Promise.resolve();
      if (!captured.value) throw new Error("form component was not created");

      captured.value.handleInput?.(escKey());

      const outcome = await outcomePromise;
      expect(outcome).toMatchObject({ kind: "cancel" });
    });
  });

  describe("choice preview layout", () => {
    it("renders preview side-by-side with options on wide terminals", async () => {
      const { captured, ctx } = makeFormCtx();
      void runFormQuestionnaire(questionnaire, {
        ui: ctx.ui as unknown as AskUserUiContext,
      });

      await Promise.resolve();
      if (!captured.value) throw new Error("form component was not created");

      const lines = captured.value.render(100);
      const text = lines.join("\n");
      expect(text).toContain("Fast and integrated");
      expect(text).toContain("│");
      expect(text).toContain("Biome");
    });

    it("stacks preview below options on narrow terminals", async () => {
      const { captured, ctx } = makeFormCtx();
      void runFormQuestionnaire(questionnaire, {
        ui: ctx.ui as unknown as AskUserUiContext,
      });

      await Promise.resolve();
      if (!captured.value) throw new Error("form component was not created");

      const lines = captured.value.render(60);
      expect(lines.some((line) => line.includes("Fast and integrated"))).toBe(true);
      expect(lines.some((line) => line.includes("Biome") && line.includes("Preview"))).toBe(false);
    });
  });

  describe("render width", () => {
    it("does not render lines wider than the requested terminal width", async () => {
      const { captured, ctx } = makeFormCtx();
      void runFormQuestionnaire(
        {
          title: "A very long ask_user title that should be safely wrapped or truncated",
          questions: [
            {
              type: "choice",
              id: "long",
              header: "A very long header that should not overflow",
              prompt: "Choose one of these long options.",
              options: [
                {
                  value: "a",
                  label: "An extremely long option label that would overflow a narrow terminal",
                  description:
                    "An extremely long description that also needs wrapping within the available width.",
                },
                { value: "b", label: "Another long option label" },
              ],
              multi: false,
              recommendedIndexes: [0],
            },
          ],
        },
        {
          ui: ctx.ui as unknown as AskUserUiContext,
        },
      );

      await Promise.resolve();
      if (!captured.value) throw new Error("form component was not created");

      for (const line of captured.value.render(30)) {
        expect(visibleWidth(line)).toBeLessThanOrEqual(30);
      }
    });
  });

  describe("tool expand passthrough", () => {
    it("calls onToggleToolsExpanded when app.tools.expand keybinding matches", async () => {
      let toggled = false;
      const { captured, ctx } = makeFormCtx({
        keybindingMatches: (binding) => binding === "app.tools.expand",
      });
      void runFormQuestionnaire(questionnaire, {
        ui: ctx.ui as unknown as AskUserUiContext,
        onToggleToolsExpanded: () => {
          toggled = true;
        },
      });

      await Promise.resolve();
      if (!captured.value) throw new Error("form component was not created");

      captured.value.handleInput?.("\u000f"); // Ctrl+O placeholder
      expect(toggled).toBe(true);
    });
  });

  describe("signal abort", () => {
    it("aborts the form and returns an abort interaction result", async () => {
      const { captured, ctx, outcomePromise } = makeFormCtx();
      const controller = new AbortController();
      void runFormQuestionnaire(questionnaire, {
        ui: ctx.ui as unknown as AskUserUiContext,
        signal: controller.signal,
      });

      await Promise.resolve();
      if (!captured.value) throw new Error("form component was not created");

      controller.abort();
      const outcome = await outcomePromise;
      expect(outcome).toMatchObject({ kind: "abort" });
    });

    it("returns abort immediately when the signal is already aborted", async () => {
      const { ctx } = makeFormCtx();
      const controller = new AbortController();
      controller.abort();

      const outcome = await runFormQuestionnaire(questionnaire, {
        ui: ctx.ui as unknown as AskUserUiContext,
        signal: controller.signal,
      });

      expect(outcome).toMatchObject({ kind: "abort" });
    });
  });
});
