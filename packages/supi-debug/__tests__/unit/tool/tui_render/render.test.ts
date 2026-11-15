import type { ToolRenderers } from "@earendil-works/pi-coding-agent";
import { createMarkedTheme, createPiMock, getTool } from "@mrclrchtr/supi-test-utils";
import { describe, expect, it } from "vitest";
import { registerTuiRenderTool } from "../../../../src/tool/tui_render/register.ts";
import type { TuiRenderDetails } from "../../../../src/tool/tui_render/result.ts";

const theme = createMarkedTheme() as never;
const hints = { keyText: () => "ctrl+o", keyHint: (_id: string, text: string) => `ctrl+o ${text}` };

function renderers(): ToolRenderers {
  const pi = createPiMock();
  registerTuiRenderTool(pi as never);
  return getTool(pi, "tui_render") as unknown as ToolRenderers;
}

const details: TuiRenderDetails = {
  toolName: "code_health",
  toolCallId: "c1",
  index: 0,
  matchCount: 2,
  isError: false,
  format: "marked",
  width: 110,
  expanded: false,
  renderer: { call: "custom", result: "custom" },
  shell: { kind: "default", background: "toolSuccessBg" },
  rendererErrors: [],
  notes: ["a note"],
  preview: { lines: [" [success]head[/success]", " one", " two"], omitted: 2 },
};

function renderResult(
  expanded: boolean,
  overrides: Partial<TuiRenderDetails> = {},
  isError = false,
  text = "header\n\n[success]head[/success]",
) {
  return (
    renderers()
      .renderResult?.(
        {
          content: [{ type: "text", text }],
          details: { ...details, ...overrides },
        } as never,
        { expanded, isPartial: false },
        theme,
        { ...hints, isError } as never,
      )
      .render(400)
      .join("\n") ?? ""
  );
}

describe("tui_render transcript renderers", () => {
  it("summarizes the call by target and view", () => {
    const call = renderers()
      .renderCall?.(
        { target: { tool: { name: "code_health", index: 1 } }, format: "marked", expanded: true },
        theme,
        hints as never,
      )
      .render(400)
      .join("\n");

    expect(call?.trimEnd()).toBe(
      "[toolTitle][bold]tui_render[/bold][/toolTitle] [accent]code_health #1[/accent] [dim]marked · expanded[/dim]",
    );
  });

  it("shows a collapsed summary and a short preview of the rendered row", () => {
    const text = renderResult(false);

    expect(text).toContain("[muted]code_health · latest of 2 · collapsed · 110 cols · marked");
    expect(text).toContain("[success]head[/success]");
    expect(text).toContain("two");
    expect(text).toContain("[dim]… 2 more lines, ctrl+o to expand[/dim]");
  });

  it("flags fallback renderers and renderer errors in the summary", () => {
    const text = renderResult(false, {
      renderer: { call: "custom", result: "fallback" },
      rendererErrors: [{ slot: "result", message: "boom" }],
    });

    expect(text).toContain("[warning]result fallback");
    expect(text).toContain("[error]1 renderer error");
  });

  it("shows the full model text when expanded", () => {
    const text = renderResult(true, {}, false, "header line\n\nrow line");

    expect(text).toContain("header line");
    expect(text).toContain("row line");
  });

  it("shows the failure message for a failed call", () => {
    const text = renderResult(false, {}, true, 'No "x" result on the current session branch.');

    expect(text).toContain('[error]No "x" result on the current session branch.[/error]');
  });
});
