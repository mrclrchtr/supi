import { describe, expect, it, vi } from "vitest";
import type { NormalizedQuestionnaire } from "../../src/types.ts";
import { runDialogQuestionnaire } from "../../src/ui/dialog.ts";

const questionnaire: NormalizedQuestionnaire = {
  title: "Formatter",
  intro: "Need an explicit answer.",
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
        { value: "biome", label: "Biome" },
        { value: "prettier", label: "Prettier" },
      ],
      multi: false,
      allowOther: true,
      recommendedIndexes: [0],
      initialIndexes: [],
    },
  ],
};

describe("runDialogQuestionnaire", () => {
  it("submits a single-select answer", async () => {
    const outcome = await runDialogQuestionnaire(questionnaire, {
      ui: {
        select: vi.fn(async () => "1. Biome"),
        input: vi.fn(async () => undefined),
        editor: vi.fn(async () => undefined),
      },
    });

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

  it("returns discuss when the user chooses discussion", async () => {
    const outcome = await runDialogQuestionnaire(questionnaire, {
      ui: {
        select: vi.fn(async () => "Discuss instead…"),
        input: vi.fn(async () => "Compare trade-offs first"),
        editor: vi.fn(async () => undefined),
      },
    });

    expect(outcome).toMatchObject({
      status: "discuss",
      discussMessage: "Compare trade-offs first",
    });
  });
});
