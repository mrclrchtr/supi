import type { Theme } from "@mariozechner/pi-coding-agent";
import type { Component, TUI } from "@mariozechner/pi-tui";
import { describe, expect, it } from "vitest";
import type { NormalizedQuestion } from "../types.ts";
import { type RichUiHost, runRichQuestionnaire } from "../ui-rich.ts";

const multichoiceWithOther: NormalizedQuestion = {
  id: "features",
  header: "Features",
  type: "multichoice",
  prompt: "Pick features",
  required: true,
  options: [
    { value: "preview", label: "Preview" },
    { value: "multi", label: "Multi-select" },
  ],
  allowOther: true,
  allowDiscuss: true,
  recommendedIndexes: [0],
};

interface RichFixture<Outcome> {
  captured: { value: Component | undefined };
  host: RichUiHost;
  outcomePromise: Promise<Outcome>;
}

function makeRichFixture<Outcome>(): RichFixture<Outcome> {
  const tuiStub = { requestRender: () => {} } as unknown as TUI;
  const themeStub = {
    fg: (_color: string, text: string) => text,
    bold: (text: string) => text,
    bg: (_color: string, text: string) => text,
  } as unknown as Theme;
  const captured: { value: Component | undefined } = { value: undefined };
  let resolveOutcome: ((value: Outcome) => void) | undefined;
  const outcomePromise = new Promise<Outcome>((resolve) => {
    resolveOutcome = resolve;
  });
  const host: RichUiHost = {
    custom: ((
      factory: (tui: TUI, theme: Theme, kb: unknown, done: (result: Outcome) => void) => Component,
    ) => {
      captured.value = factory(tuiStub, themeStub, undefined, (outcome) =>
        resolveOutcome?.(outcome),
      );
      return outcomePromise;
    }) as unknown as RichUiHost["custom"],
  };
  return { captured, host, outcomePromise };
}

describe("runRichQuestionnaire multichoice other path", () => {
  it("supports allowOther and clears staged multiselect state after switching away", async () => {
    type Outcome = {
      terminalState: string;
      answers: { questionId: string; source: string; value?: string }[];
    };
    const { captured, host, outcomePromise } = makeRichFixture<Outcome>();
    const runPromise = runRichQuestionnaire(
      { questions: [multichoiceWithOther], allowSkip: false },
      { ui: host },
    );
    await Promise.resolve();
    if (!captured.value) throw new Error("custom() was not invoked with a factory");

    captured.value.handleInput?.("n");
    for (const char of "draft") captured.value.handleInput?.(char);
    captured.value.handleInput?.("\r");
    captured.value.handleInput?.(" ");
    captured.value.handleInput?.("\u001b[B");
    captured.value.handleInput?.("\u001b[B");
    for (const char of "custom path") captured.value.handleInput?.(char);
    captured.value.handleInput?.("\r");
    captured.value.handleInput?.("\u001b[D");

    const revised = captured.value.render(120).join("\n");
    expect(revised).toContain("Other answer: custom path");
    expect(revised).not.toContain("[x]");
    expect(revised).not.toContain("✎");

    captured.value.handleInput?.("\r");
    captured.value.handleInput?.("\r");
    captured.value.handleInput?.("\r");

    const outcome = await outcomePromise;
    await expect(runPromise).resolves.toEqual(outcome);
    expect(outcome).toMatchObject({
      terminalState: "submitted",
      answers: [{ questionId: "features", source: "other", value: "custom path" }],
    });
  });
});
