import { describe, expect, it } from "vitest";
import type { NormalizedQuestionnaire } from "../../src/types.ts";
import { runOverlayQuestionnaire } from "../../src/ui/overlay.ts";
import type { AskUserUiContext } from "../../src/ui/types.ts";
import { makeOverlayCtx } from "../helpers/index.ts";

const questionnaire: NormalizedQuestionnaire = {
  title: "Formatter",
  intro: "Need one explicit answer.",
  allowPartialSubmit: true,
  allowDiscuss: true,
  questions: [
    {
      type: "choice",
      id: "formatter",
      header: "Formatter",
      prompt: "Pick one",
      required: true,
      options: [
        { value: "biome", label: "Biome", preview: "Fast and integrated" },
        { value: "prettier", label: "Prettier" },
      ],
      multi: false,
      allowOther: true,
      recommendedIndexes: [0],
      initialIndexes: [],
    },
  ],
};

const twoStepQuestionnaire: NormalizedQuestionnaire = {
  title: "Two step",
  intro: "Need two answers.",
  allowPartialSubmit: false,
  allowDiscuss: false,
  questions: [
    {
      type: "choice",
      id: "one",
      header: "One",
      prompt: "Pick the first answer.",
      required: true,
      options: [
        { value: "a", label: "A" },
        { value: "b", label: "B" },
      ],
      multi: false,
      allowOther: false,
      recommendedIndexes: [],
      initialIndexes: [],
    },
    {
      type: "choice",
      id: "two",
      header: "Two",
      prompt: "Pick the second answer.",
      required: true,
      options: [
        { value: "c", label: "C" },
        { value: "d", label: "D" },
      ],
      multi: false,
      allowOther: false,
      recommendedIndexes: [],
      initialIndexes: [],
    },
  ],
};

const textQuestionnaire: NormalizedQuestionnaire = {
  title: "Reason",
  intro: "Need a short explanation.",
  allowPartialSubmit: true,
  allowDiscuss: true,
  questions: [
    {
      type: "text",
      id: "reason",
      header: "Reason",
      prompt: "Type the reason.",
      required: true,
      initial: "prefilled",
      placeholder: "optional",
    },
  ],
};

const multiQuestionnaire: NormalizedQuestionnaire = {
  title: "Checks",
  intro: "Need all required checks.",
  allowPartialSubmit: false,
  allowDiscuss: false,
  questions: [
    {
      type: "choice",
      id: "checks",
      header: "Checks",
      prompt: "Which checks should run?",
      required: true,
      options: [
        { value: "lint", label: "Lint" },
        { value: "tests", label: "Tests" },
      ],
      multi: true,
      allowOther: false,
      recommendedIndexes: [],
      initialIndexes: [],
    },
  ],
};

describe("runOverlayQuestionnaire", () => {
  it("uses space to select and enter to submit while keeping exceptional rows visible", async () => {
    const { captured, ctx, outcomePromise } = makeOverlayCtx();
    const runPromise = runOverlayQuestionnaire(questionnaire, {
      ui: ctx.ui as unknown as AskUserUiContext,
    });

    await Promise.resolve();
    if (!captured.value) throw new Error("overlay component was not created");

    const rendered = captured.value.render(100).join("\n");
    expect(rendered).toContain("Fast and integrated");
    expect(rendered).not.toContain("Submit form");
    expect(rendered).toContain("Discuss instead…");
    expect(rendered).not.toContain("Cancel form");

    captured.value.handleInput?.(" ");
    expect(captured.value.render(100).join("\n")).toContain("(*) Biome");
    captured.value.handleInput?.("\r");

    const outcome = await outcomePromise;
    await expect(runPromise).resolves.toEqual(outcome);
    expect(outcome).toMatchObject({
      status: "submitted",
      answersById: {
        formatter: {
          kind: "choice",
          selections: [{ value: "biome", label: "Biome" }],
        },
      },
    });
  });

  it("shows text input immediately without an enter-response row", async () => {
    const { captured, ctx } = makeOverlayCtx();
    void runOverlayQuestionnaire(textQuestionnaire, {
      ui: ctx.ui as unknown as AskUserUiContext,
    });

    await Promise.resolve();
    if (!captured.value) throw new Error("overlay component was not created");

    const rendered = captured.value.render(100).join("\n");
    expect(rendered).toContain("Your answer");
    expect(rendered).toContain("prefilled");
    expect(rendered).not.toContain("Enter response…");
    expect(rendered).toContain("Discuss instead…");
  });

  it("opens note editing with n, saves the note, and stays in the form", async () => {
    const { captured, ctx, outcomePromise } = makeOverlayCtx();
    let settled = false;
    void outcomePromise.then(() => {
      settled = true;
    });
    const runPromise = runOverlayQuestionnaire(questionnaire, {
      ui: ctx.ui as unknown as AskUserUiContext,
    });

    await Promise.resolve();
    if (!captured.value) throw new Error("overlay component was not created");

    expect(captured.value.render(100).join("\n")).toContain("n note");
    captured.value.handleInput?.("\u001b[B");
    captured.value.handleInput?.("n");
    expect(captured.value.render(100).join("\n")).toContain("Note for: Prettier");

    for (const char of "Matches team style") captured.value.handleInput?.(char);
    captured.value.handleInput?.("\r");
    await Promise.resolve();

    expect(settled).toBe(false);
    const renderedAfterSave = captured.value.render(100).join("\n");
    expect(renderedAfterSave).toContain("(*) Prettier [note]");

    captured.value.handleInput?.("\r");

    const outcome = await outcomePromise;
    await expect(runPromise).resolves.toEqual(outcome);
    expect(outcome).toMatchObject({
      status: "submitted",
      answersById: {
        formatter: {
          kind: "choice",
          selections: [{ value: "prettier", label: "Prettier", note: "Matches team style" }],
        },
      },
    });
  });

  it("closes note editing with escape without cancelling the form", async () => {
    const { captured, ctx, outcomePromise } = makeOverlayCtx();
    let settled = false;
    void outcomePromise.then(() => {
      settled = true;
    });
    const runPromise = runOverlayQuestionnaire(questionnaire, {
      ui: ctx.ui as unknown as AskUserUiContext,
    });

    await Promise.resolve();
    if (!captured.value) throw new Error("overlay component was not created");

    captured.value.handleInput?.("n");
    for (const char of "Temporary note") captured.value.handleInput?.(char);
    captured.value.handleInput?.("\u001b");
    await Promise.resolve();

    expect(settled).toBe(false);
    const rendered = captured.value.render(100).join("\n");
    expect(rendered).not.toContain("Option note");
    expect(rendered).not.toContain("[note]");

    captured.value.handleInput?.(" ");
    captured.value.handleInput?.("\r");

    const outcome = await outcomePromise;
    await expect(runPromise).resolves.toEqual(outcome);
    expect(outcome).toMatchObject({
      status: "submitted",
      answersById: {
        formatter: {
          kind: "choice",
          selections: [{ value: "biome", label: "Biome" }],
        },
      },
    });
  });

  it("uses left arrow to navigate back without a visible back row", async () => {
    const { captured, ctx } = makeOverlayCtx();
    void runOverlayQuestionnaire(twoStepQuestionnaire, {
      ui: ctx.ui as unknown as AskUserUiContext,
    });

    await Promise.resolve();
    if (!captured.value) throw new Error("overlay component was not created");

    captured.value.handleInput?.(" ");
    captured.value.handleInput?.("\r");
    expect(captured.value.render(100).join("\n")).toContain("2/2 · Two");

    captured.value.handleInput?.("\u001b[D");
    expect(captured.value.render(100).join("\n")).toContain("1/2 · One");
    expect(captured.value.render(100).join("\n")).not.toContain("Back");
  });

  it("supports switching into discuss mode via a selectable action row", async () => {
    const { captured, ctx, outcomePromise } = makeOverlayCtx();
    const runPromise = runOverlayQuestionnaire(questionnaire, {
      ui: ctx.ui as unknown as AskUserUiContext,
    });

    await Promise.resolve();
    if (!captured.value) throw new Error("overlay component was not created");

    for (let index = 0; index < 3; index += 1) captured.value.handleInput?.("\u001b[B");
    captured.value.handleInput?.("\r");
    for (const char of "Need trade-offs") captured.value.handleInput?.(char);
    captured.value.handleInput?.("\r");

    const outcome = await outcomePromise;
    await expect(runPromise).resolves.toEqual(outcome);
    expect(outcome).toMatchObject({
      status: "discuss",
      discussMessage: "Need trade-offs",
    });
  });

  it("removes a multi-select note when the option is deselected", async () => {
    const { captured, ctx, outcomePromise } = makeOverlayCtx();
    const runPromise = runOverlayQuestionnaire(multiQuestionnaire, {
      ui: ctx.ui as unknown as AskUserUiContext,
    });

    await Promise.resolve();
    if (!captured.value) throw new Error("overlay component was not created");

    captured.value.handleInput?.("n");
    for (const char of "Required for CI") captured.value.handleInput?.(char);
    captured.value.handleInput?.("\r");
    expect(captured.value.render(100).join("\n")).toContain("[x] Lint [note]");

    captured.value.handleInput?.(" ");
    expect(captured.value.render(100).join("\n")).toContain("[ ] Lint");
    expect(captured.value.render(100).join("\n")).not.toContain("Lint [note]");

    captured.value.handleInput?.("\u001b[B");
    captured.value.handleInput?.("\r");

    const outcome = await outcomePromise;
    await expect(runPromise).resolves.toEqual(outcome);
    expect(outcome).toMatchObject({
      status: "submitted",
      answersById: {
        checks: {
          kind: "choice",
          selections: [{ value: "tests", label: "Tests" }],
        },
      },
    });
  });
});
