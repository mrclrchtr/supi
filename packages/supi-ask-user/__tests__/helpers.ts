import type { Theme } from "@mariozechner/pi-coding-agent";
import type { Component, TUI } from "@mariozechner/pi-tui";
import type { RichUiHost } from "../src/ui/ui-rich.ts";

export interface RichFixture<Outcome> {
  captured: { value: Component | undefined };
  host: RichUiHost;
  outcomePromise: Promise<Outcome>;
}

export function makeRichFixture<Outcome>(): RichFixture<Outcome> {
  const tuiStub = { requestRender: () => {}, terminal: { rows: 40 } } as unknown as TUI;
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
