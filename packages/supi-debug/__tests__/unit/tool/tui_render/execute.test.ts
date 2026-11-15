import { initTheme, type Theme, type ToolRenderers } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { createPiMock, getTool, makeCtx } from "@mrclrchtr/supi-test-utils";
import { Value } from "typebox/value";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { registerTuiRenderTool } from "../../../../src/tool/tui_render/register.ts";
import { tuiRenderOutputSchema } from "../../../../src/tool/tui_render/result-schema.ts";

let theme: Theme;

beforeAll(() => {
  initTheme("dark", false);
  // Pi exports no getter for the initialized theme; it shares the instance under this key.
  theme = (globalThis as Record<symbol, Theme>)[
    Symbol.for("@earendil-works/pi-coding-agent:theme")
  ] as Theme;
});

function entries(id: string, count: number) {
  return [
    {
      type: "message",
      message: {
        role: "assistant",
        content: [{ type: "toolCall", id, name: "probe", arguments: {} }],
      },
    },
    {
      type: "message",
      message: {
        role: "toolResult",
        toolCallId: id,
        toolName: "probe",
        content: [{ type: "text", text: "text" }],
        details: { count },
        isError: false,
      },
    },
  ];
}

function countRenderer(label: string): ToolRenderers {
  return {
    renderResult: (result, _options, t) =>
      new Text(
        `${label} ${t.fg("success", String((result.details as { count: number }).count))}`,
        0,
        0,
      ),
  };
}

/** Register tui_render and let Pi's resolver chain draw `probe` once, as the TUI would. */
function setup(resolve: () => ToolRenderers | undefined = () => countRenderer("v1")) {
  const pi = createPiMock();
  Object.assign(pi, { getSettings: vi.fn(() => ({ outputPad: 1 })) });
  registerTuiRenderTool(pi as never);
  const [resolver] = pi.toolRenderers as Array<
    (name: string, next: () => ToolRenderers | undefined) => ToolRenderers | undefined
  >;
  const drawn = resolver?.("probe", resolve);
  const tool = getTool(pi, "tui_render");
  const ctx = (branch: unknown[], mode = "tui") =>
    makeCtx({
      mode,
      sessionManager: { getBranch: () => branch },
      ui: { ...makeCtx().ui, theme },
    });
  const run = (params: Record<string, unknown>, context = ctx(entries("c1", 3))) =>
    tool.execute("t1", params, undefined, undefined, context as never);
  return { drawn, run, ctx };
}

describe("tui_render tool", () => {
  it("passes the TUI's renderers through unchanged", () => {
    const renderers = countRenderer("v1");
    expect(setup(() => renderers).drawn).toBe(renderers);
  });

  it("returns a result that matches its output schema after a JSON round trip", async () => {
    const result = (await setup().run({
      target: { tool: { name: "probe" } },
      format: "marked",
      width: 60,
    })) as { structuredContent: unknown; details: Record<string, unknown> };

    expect([...Value.Errors(tuiRenderOutputSchema, result.structuredContent)]).toEqual([]);
    const serialized: unknown = JSON.parse(JSON.stringify(result.structuredContent));
    expect(Value.Check(tuiRenderOutputSchema, serialized)).toBe(true);
    expect(result.structuredContent).toMatchObject({
      toolName: "probe",
      lines: expect.arrayContaining([" v1 [success]3[/success]"]),
    });
    expect(result.details).not.toHaveProperty("lines");
  });

  it("keeps the row's blank padding in lines but not in the model text", async () => {
    const result = (await setup().run({ target: { tool: { name: "probe" } }, width: 40 })) as {
      content: Array<{ text: string }>;
      structuredContent: { lines: string[] };
    };

    expect(result.structuredContent.lines.slice(0, 2)).toEqual(["", ""]);
    expect(result.content[0]?.text).toMatch(/shell default \(toolSuccessBg\)\n\n probe\n v1 3$/);
  });

  it("previews the result lines, not the call header, in the transcript details", async () => {
    const result = (await setup().run({ target: { tool: { name: "probe" } }, width: 40 })) as {
      details: { preview: { lines: string[]; omitted: number } };
    };

    expect(result.details.preview).toEqual({ lines: ["v1 3"], omitted: 0 });
  });

  it("renders with the renderers the TUI resolves now, for example after /reload", async () => {
    let current = countRenderer("v1");
    const { run } = setup(() => current);
    current = countRenderer("v2");

    const result = (await run({ target: { tool: { name: "probe" } } })) as {
      structuredContent: { lines: string[] };
    };

    expect(result.structuredContent.lines).toContain(" v2 3");
  });

  it("selects from the session branch only", async () => {
    const { run, ctx } = setup();
    const branch = [...entries("old", 1), ...entries("current", 2)];

    const result = (await run({ target: { toolCallId: "current" } }, ctx(branch))) as {
      structuredContent: { lines: string[] };
    };

    expect(result.structuredContent.lines).toContain(" v1 2");
    await expect(run({ target: { toolCallId: "elsewhere" } }, ctx(branch))).rejects.toThrow(
      'No tool result with toolCallId "elsewhere"',
    );
  });

  it("fails for a missing result, an unobserved tool, and non-TUI modes", async () => {
    const { run, ctx } = setup();

    await expect(run({ target: { tool: { name: "probe", index: 1 } } })).rejects.toThrow(
      "Index 1 is out of range",
    );
    const other = entries("c2", 1).map((entry) =>
      JSON.parse(JSON.stringify(entry).replaceAll('"probe"', '"unseen"')),
    );
    await expect(run({ target: { tool: { name: "unseen" } } }, ctx(other))).rejects.toThrow(
      'The TUI has not drawn "unseen"',
    );
    await expect(
      run({ target: { tool: { name: "probe" } } }, ctx(entries("c1", 3), "print")),
    ).rejects.toThrow("needs the interactive TUI");
  });
});
