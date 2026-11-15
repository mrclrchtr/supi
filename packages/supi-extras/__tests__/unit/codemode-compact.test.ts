import type { ToolRenderers } from "@earendil-works/pi-coding-agent";
import { createMarkedTheme, createPiMock } from "@mrclrchtr/supi-test-utils";
import { describe, expect, it, vi } from "vitest";
import codemodeCompact, {
  callDetail,
  createCodemodeCompactRenderers,
} from "../../src/codemode-compact.ts";

type RenderResult = NonNullable<ToolRenderers["renderResult"]>;
type RenderContext = Parameters<RenderResult>[3];

const theme = createMarkedTheme() as never;
const nativeComponent = { render: () => ["native"], invalidate() {} };

function setup() {
  const native = {
    renderCall: vi.fn(() => nativeComponent),
    renderResult: vi.fn(() => nativeComponent),
  };
  return { native, renderers: createCodemodeCompactRenderers(native) };
}

function context(overrides: Partial<RenderContext> = {}): RenderContext {
  return {
    args: {},
    toolCallId: "t1",
    invalidate: () => {},
    lastComponent: undefined,
    state: {},
    cwd: "/repo",
    executionStarted: true,
    argsComplete: true,
    isPartial: false,
    expanded: false,
    showImages: false,
    isError: false,
    durationMs: 2400,
    outputPad: 1,
    keyText: () => "ctrl+o",
    keyHint: (_key, description) => description,
    ...overrides,
  };
}

const calls = [
  { name: "read", args: '{"path":"a.ts"}', status: "ok", durationMs: 12 },
  {
    name: "bash",
    args: '{"command":"ls"}',
    status: "error",
    durationMs: 1500,
    error: "ENOENT: access '/repo/x.ts'",
  },
  { name: "grep", args: '{"pattern":"x"}', status: "ok" },
  { name: "read", args: '{"path":"b.ts","offset":3}', status: "ok", cost: 0.004 },
];

const result = {
  content: [
    { type: "text", text: "Script completed\nWall time 2.4 seconds\nOutput:\n" },
    { type: "text", text: "first line\nsecond line\n" },
  ],
  details: { calls },
};

describe("codemode compact renderer", () => {
  it("collapses the script to its first line and a line count", () => {
    const { renderers } = setup();
    const code = "// @options: {}\nconst x = 1;\nreturn x;";
    const line = renderers.renderCall?.({ code }, theme, context()).render(200);
    expect(line).toEqual([
      "[toolTitle][bold]codemode[/bold][/toolTitle][dim] · 3 lines[/dim]  [muted]const x = 1;[/muted]",
    ]);
  });

  it("lists every call, the status, and the first output line", () => {
    const { renderers } = setup();
    const lines = renderers
      .renderResult?.(result as never, { expanded: false, isPartial: false }, theme, context())
      .render(200);
    expect(lines).toEqual([
      "  [success]✓[/success] [toolTitle]read[/toolTitle] [muted]a.ts[/muted]",
      "  [error]✗[/error] [toolTitle]bash[/toolTitle] [muted]ls[/muted][dim] 1.5s[/dim] [error]ENOENT: access 'x.ts'[/error]",
      "  [success]✓[/success] [toolTitle]grep[/toolTitle] [muted]x[/muted]",
      "  [success]✓[/success] [toolTitle]read[/toolTitle] [muted]b.ts[/muted]",
      "[warning]Done[/warning][dim] · 2.4s · 4 calls · 1 failed · $0.0040[/dim]",
      "  [toolOutput]first line[/toolOutput][dim] (+1 line, ctrl+o)[/dim]",
    ]);
  });

  it("shows the script error on failure", () => {
    const { renderers } = setup();
    const failed = {
      content: [
        { type: "text", text: "Script failed\nWall time 0.1 seconds\nOutput:\n" },
        { type: "text", text: "Script error:\nReferenceError: y is not defined" },
      ],
      details: { calls: [] },
    };
    const lines = renderers
      .renderResult?.(
        failed as never,
        { expanded: false, isPartial: false },
        theme,
        context({ isError: true }),
      )
      .render(200);
    expect(lines).toEqual([
      "[error]Failed[/error][dim] · 2.4s[/dim]",
      "  [error]ReferenceError: y is not defined[/error]",
    ]);
  });

  it("delegates expanded rows to Pi's renderer with its own component slot", () => {
    const { native, renderers } = setup();
    const ctx = context({ expanded: true, lastComponent: { render: () => [], invalidate() {} } });
    renderers.renderCall?.({ code: "x" }, theme, ctx);
    const first = native.renderCall.mock.calls[0] as unknown as [unknown, unknown, RenderContext];
    expect(first[2].lastComponent).toBeUndefined();
    renderers.renderCall?.({ code: "x" }, theme, ctx);
    const second = native.renderCall.mock.calls[1] as unknown as [unknown, unknown, RenderContext];
    expect(second[2].lastComponent).toBe(nativeComponent);
  });
});

describe("callDetail", () => {
  it("finds a path inside a nested target object", () => {
    expect(callDetail('{"target":{"file":"src/a.ts"}}')).toBe("src/a.ts");
  });

  it("uses tool-specific details for code-intelligence tools", () => {
    const find = '{"search":{"ast":{"kind":"definition","query":"callDetail"}},"scopes":["src"]}';
    expect(callDetail(find, "code_find")).toBe("callDetail");
    expect(callDetail('{"anchor":{"file":"a.ts","line":4,"character":2}}', "code_inspect")).toBe(
      "a.ts:4",
    );
  });

  it("falls back to raw args when the JSON was truncated", () => {
    expect(callDetail('{"path":"a.ts","con...')).toBe('{"path":"a.ts","con...');
  });
});

describe("codemodeCompact registration", () => {
  function resolve(parameters: unknown) {
    let resolver: ((name: string, next: () => ToolRenderers) => unknown) | undefined;
    const pi = createPiMock();
    Object.assign(pi, {
      registerToolRenderer: (r: typeof resolver) => {
        resolver = r;
      },
    });
    pi.registerTool({ name: "codemode", parameters });
    codemodeCompact(pi as never);
    const native = { renderCall: () => nativeComponent, renderResult: () => nativeComponent };
    return { native, resolved: resolver?.("codemode", () => native) };
  }

  it("wraps a re-registered codemode that keeps the code input", () => {
    const { native, resolved } = resolve({ properties: { code: { type: "string" } } });
    expect(resolved).not.toBe(native);
  });

  it("keeps the renderer of an unrelated codemode tool", () => {
    const { native, resolved } = resolve({ properties: { script: { type: "string" } } });
    expect(resolved).toBe(native);
  });
});
