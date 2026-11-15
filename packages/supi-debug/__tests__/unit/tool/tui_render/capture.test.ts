import { initTheme, type Theme, type ToolRenderers } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { beforeAll, describe, expect, it } from "vitest";
import { type CaptureInput, captureToolRow } from "../../../../src/tool/tui_render/capture.ts";

let theme: Theme;

beforeAll(() => {
  initTheme("dark", false);
  // Live sessions pass ctx.ui.theme. Pi exports no getter for the initialized theme; it shares
  // the instance across module loaders under this global key.
  theme = (globalThis as Record<symbol, Theme>)[
    Symbol.for("@earendil-works/pi-coding-agent:theme")
  ] as Theme;
});

const renderers: ToolRenderers = {
  renderCall: (args, t) =>
    new Text(
      `${t.fg("toolTitle", "probe")} ${t.fg("dim", (args as { scope: string }).scope)}`,
      0,
      0,
    ),
  renderResult: (result, options, t) => {
    const count = (result.details as { count: number }).count;
    const tone = count === 0 ? "muted" : "success";
    return new Text(
      `${t.fg(tone, String(count))}${options.expanded ? `\n${t.bold("details")}` : ""}`,
      0,
      0,
    );
  },
};

function input(
  overrides: Partial<CaptureInput> = {},
  selection: Partial<CaptureInput["selection"]> = {},
): CaptureInput {
  return {
    selection: {
      kind: "selected",
      toolName: "probe",
      toolCallId: "c1",
      index: 0,
      matchCount: 1,
      args: { scope: "src" },
      result: { content: [{ type: "text", text: "model text" }], details: { count: 0 } },
      isError: false,
      ...selection,
    },
    renderers,
    theme,
    format: "plain",
    width: 40,
    expanded: false,
    cwd: "/repo",
    outputPad: 1,
    ...overrides,
  };
}

describe("captureToolRow", () => {
  it("renders the framed call and collapsed result as plain text", () => {
    const row = captureToolRow(input());

    expect(row.lines.filter((line) => line.trim())).toEqual([" probe src", " 0"]);
    expect(row.resultLines).toEqual(["0"]);
    expect(row.renderer).toEqual({ call: "custom", result: "custom" });
    expect(row.shell).toEqual({ kind: "default", background: "toolSuccessBg" });
    expect(row.rendererErrors).toEqual([]);
  });

  it("marks the theme tokens the renderer used", () => {
    const row = captureToolRow(input({ format: "marked", expanded: true }));
    const text = row.lines.join("\n");

    expect(text).toContain("[toolTitle]probe[/toolTitle] [dim]src[/dim]");
    expect(text).toContain("[muted]0[/muted]");
    expect(text).toContain("[bold]details[/bold]");
    expect(text).not.toContain("[success]");
    expect(text).not.toContain("\x1b");
  });

  it("wraps marked output at the same points as the plain TUI row", () => {
    const long = input({ width: 24 }, { args: { scope: "alpha beta gamma delta epsilon zeta" } });
    const plain = captureToolRow(long).lines;
    const marked = captureToolRow({ ...long, format: "marked" }).lines;

    expect(marked.map((line) => line.replace(/\[\/?[\w:]+\]/g, ""))).toEqual(plain);
  });

  it("keeps raw terminal colors in ansi format", () => {
    const row = captureToolRow(input({ format: "ansi" }));

    expect(row.lines.join("\n")).toContain(theme.getBgAnsi("toolSuccessBg"));
  });

  it("uses Pi's fallback and reports the error frame for a tool without renderers", () => {
    const row = captureToolRow(input({ renderers: undefined }, { isError: true }));

    expect(row.renderer).toEqual({ call: "fallback", result: "fallback" });
    expect(row.resultLines).toEqual([]);
    expect(row.shell).toEqual({ kind: "fallback", background: "toolErrorBg" });
    expect(row.lines.join("\n")).toContain("model text");
  });

  it("reports a throwing renderer once and shows Pi's fallback for that slot", () => {
    const failing: ToolRenderers = {
      ...renderers,
      renderResult: () => {
        throw new Error("boom");
      },
    };
    const row = captureToolRow(input({ renderers: failing }));

    expect(row.rendererErrors).toEqual([{ slot: "result", message: "boom" }]);
    expect(row.resultLines).toEqual([]);
    expect(row.lines.join("\n")).toContain("model text");
  });
});
