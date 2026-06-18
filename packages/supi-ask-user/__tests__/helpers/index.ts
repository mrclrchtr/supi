import type { Theme } from "@earendil-works/pi-coding-agent";
import type { Component, TUI } from "@earendil-works/pi-tui";
import { makeCtx } from "@mrclrchtr/supi-test-utils";
import type { AskUserInteractionResult, AskUserOutcome } from "../../src/types.ts";

export interface FormFixture {
  captured: { value: Component | undefined };
  ctx: ReturnType<typeof makeCtx>;
  outcomePromise: Promise<AskUserOutcome | AskUserInteractionResult>;
}

export interface MakeFormCtxOptions {
  keybindingMatches?: (binding: string) => boolean;
}

export function makeFormCtx(options?: MakeFormCtxOptions): FormFixture {
  const captured: { value: Component | undefined } = { value: undefined };
  const tuiStub = { requestRender: () => {}, terminal: { rows: 40 } } as unknown as TUI;
  const themeStub = {
    fg: (_color: string, text: string) => text,
    bg: (_color: string, text: string) => text,
    bold: (text: string) => text,
  } as unknown as Theme;

  let resolveOutcome: ((value: AskUserOutcome | AskUserInteractionResult) => void) | undefined;
  const outcomePromise = new Promise<AskUserOutcome | AskUserInteractionResult>((resolve) => {
    resolveOutcome = resolve;
  });

  const ctx = makeCtx();
  ctx.ui.custom = ((factory: unknown) => {
    captured.value = (
      factory as (
        tui: TUI,
        theme: Theme,
        kb: unknown,
        done: (result: AskUserOutcome | AskUserInteractionResult) => void,
      ) => Component
    )(
      tuiStub,
      themeStub,
      {
        matches: (_data: string, binding: string) => options?.keybindingMatches?.(binding) ?? false,
      },
      (value) => resolveOutcome?.(value),
    );
    return outcomePromise;
  }) as typeof ctx.ui.custom;

  return { captured, ctx, outcomePromise };
}
