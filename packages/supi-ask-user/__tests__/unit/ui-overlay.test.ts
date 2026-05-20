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

describe("runOverlayQuestionnaire", () => {
  it("submits a single-select choice", async () => {
    const { captured, ctx, outcomePromise } = makeOverlayCtx();
    const runPromise = runOverlayQuestionnaire(questionnaire, {
      ui: ctx.ui as unknown as AskUserUiContext,
    });

    await Promise.resolve();
    if (!captured.value) throw new Error("overlay component was not created");

    const rendered = captured.value.render(100).join("\n");
    expect(rendered).toContain("Fast and integrated");

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

  it("supports switching into discuss mode", async () => {
    const { captured, ctx, outcomePromise } = makeOverlayCtx();
    const runPromise = runOverlayQuestionnaire(questionnaire, {
      ui: ctx.ui as unknown as AskUserUiContext,
    });

    await Promise.resolve();
    if (!captured.value) throw new Error("overlay component was not created");

    captured.value.handleInput?.("\x07");
    for (const char of "Need trade-offs") captured.value.handleInput?.(char);
    captured.value.handleInput?.("\r");

    const outcome = await outcomePromise;
    await expect(runPromise).resolves.toEqual(outcome);
    expect(outcome).toMatchObject({
      status: "discuss",
      discussMessage: "Need trade-offs",
    });
  });
});
