import type { Theme } from "@mariozechner/pi-coding-agent";
import type { Component, TUI } from "@mariozechner/pi-tui";
import { describe, expect, it, vi } from "vitest";
import type { NormalizedQuestion } from "../types.ts";
import { type RichCustomOptions, type RichUiHost, runRichQuestionnaire } from "../ui-rich.ts";

const choice: NormalizedQuestion = {
  id: "scope",
  header: "Scope",
  type: "choice",
  prompt: "Pick",
  options: [
    { value: "a", label: "A" },
    { value: "b", label: "B" },
  ],
  allowOther: false,
  allowComment: false,
};

describe("runRichQuestionnaire", () => {
  it("returns an aborted outcome without opening the overlay when the signal is already aborted", async () => {
    const custom = vi.fn();
    const controller = new AbortController();
    controller.abort();
    const host: RichUiHost = { custom: custom as unknown as RichUiHost["custom"] };
    const result = await runRichQuestionnaire([choice], { ui: host, signal: controller.signal });
    expect(result).not.toBe("unsupported");
    expect(result).toMatchObject({ terminalState: "aborted", answers: [] });
    expect(custom).not.toHaveBeenCalled();
  });

  it("reports 'unsupported' when the host declines to provide an overlay", async () => {
    const host: RichUiHost = { custom: (() => undefined) as unknown as RichUiHost["custom"] };
    const result = await runRichQuestionnaire([choice], { ui: host });
    expect(result).toBe("unsupported");
  });

  it("requests overlay mode so the questionnaire renders modally", async () => {
    let observedOptions: RichCustomOptions | undefined;
    const host: RichUiHost = {
      custom: ((_factory: unknown, options?: RichCustomOptions) => {
        observedOptions = options;
        // Return a never-resolving promise so the questionnaire stays "open".
        return new Promise(() => {});
      }) as unknown as RichUiHost["custom"],
    };
    void runRichQuestionnaire([choice], { ui: host });
    // Wait a microtask for the call to settle.
    await Promise.resolve();
    expect(observedOptions).toEqual({ overlay: true });
  });

  it("aborts mid-overlay when the signal fires after the questionnaire opens", async () => {
    const tuiStub = { requestRender: () => {} } as unknown as TUI;
    const themeStub = {
      fg: (_color: string, text: string) => text,
      bold: (text: string) => text,
    } as unknown as Theme;
    type Outcome = { terminalState: string; answers: unknown[] };
    let resolveOutcome: ((value: Outcome) => void) | undefined;
    const outcomePromise = new Promise<Outcome>((resolve) => {
      resolveOutcome = resolve;
    });
    const host: RichUiHost = {
      custom: ((
        factory: (tui: TUI, theme: Theme, kb: unknown, done: (r: Outcome) => void) => Component,
      ) => {
        factory(tuiStub, themeStub, undefined, (outcome) => resolveOutcome?.(outcome));
        return outcomePromise;
      }) as unknown as RichUiHost["custom"],
    };
    const controller = new AbortController();
    void runRichQuestionnaire([choice], { ui: host, signal: controller.signal });
    await Promise.resolve();
    controller.abort();
    const outcome = await outcomePromise;
    expect(outcome.terminalState).toBe("aborted");
    expect(outcome.answers).toEqual([]);
  });

  it("invalidates cached lines when render is called with a new width", async () => {
    const tuiStub = { requestRender: () => {} } as unknown as TUI;
    const themeStub = {
      fg: (_color: string, text: string) => text,
      bold: (text: string) => text,
    } as unknown as Theme;
    let captured: Component | undefined;
    const host: RichUiHost = {
      custom: ((
        factory: (tui: TUI, theme: Theme, kb: unknown, done: (r: unknown) => void) => Component,
      ) => {
        captured = factory(tuiStub, themeStub, undefined, () => {});
        return new Promise(() => {});
      }) as unknown as RichUiHost["custom"],
    };
    void runRichQuestionnaire([choice], { ui: host });
    await Promise.resolve();
    if (!captured) throw new Error("custom() was not invoked with a factory");
    const first = captured.render(80);
    const second = captured.render(80); // same width → cache hit, identity preserved
    expect(second).toBe(first);
    const resized = captured.render(120); // width changed → must recompute
    expect(resized).not.toBe(first);
  });
});
