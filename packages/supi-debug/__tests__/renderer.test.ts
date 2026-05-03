import { describe, expect, it } from "vitest";
import { registerDebugMessageRenderer } from "../src/renderer.ts";

function createMockTheme() {
  return {
    fg: (_color: string, text: string) => text,
    bold: (text: string) => text,
    italic: (text: string) => text,
    strikethrough: (text: string) => text,
  };
}

function createMockPi() {
  const renderers = new Map<
    string,
    (message: unknown, options: unknown, theme: unknown) => unknown
  >();
  return {
    renderers,
    registerMessageRenderer: (customType: string, renderer: unknown) => {
      renderers.set(
        customType,
        renderer as (message: unknown, options: unknown, theme: unknown) => unknown,
      );
    },
  };
}

function makeMessage(content: string, details?: unknown) {
  return {
    customType: "supi-debug-report",
    content,
    display: true,
    details,
  };
}

function makeOptions(expanded: boolean) {
  return { expanded };
}

describe("debug message renderer", () => {
  it("shows fallback text when no events in details", () => {
    const pi = createMockPi();
    registerDebugMessageRenderer(pi as never);
    const renderer = pi.renderers.get("supi-debug-report")!;

    const result = renderer(
      makeMessage("disabled", undefined),
      makeOptions(true),
      createMockTheme(),
    );
    expect((result as { text: string }).text).toBe("disabled");
  });

  it("shows summary when collapsed", () => {
    const pi = createMockPi();
    registerDebugMessageRenderer(pi as never);
    const renderer = pi.renderers.get("supi-debug-report")!;

    const result = renderer(
      makeMessage("", {
        events: [
          {
            id: 1,
            timestamp: 1_700_000_000_000,
            source: "rtk",
            level: "warning",
            category: "fallback",
            message: "timeout",
          },
          {
            id: 2,
            timestamp: 1_700_000_001_000,
            source: "rtk",
            level: "debug",
            category: "rewrite",
            message: "ok",
          },
        ],
      }),
      makeOptions(false),
      createMockTheme(),
    );

    expect((result as { text: string }).text).toBe("2 events — rtk/fallback +1 more");
  });

  it("renders full events when expanded", () => {
    const pi = createMockPi();
    registerDebugMessageRenderer(pi as never);
    const renderer = pi.renderers.get("supi-debug-report")!;

    const result = renderer(
      makeMessage("", {
        events: [
          {
            id: 1,
            timestamp: 1_700_000_000_000,
            source: "rtk",
            level: "warning",
            category: "fallback",
            message: "timeout",
            cwd: "/repo",
            data: { command: "git status" },
          },
        ],
        rawAccessDenied: true,
      }),
      makeOptions(true),
      createMockTheme(),
    );

    const text = (result as { text: string }).text;
    expect(text).toContain("rtk/fallback");
    expect(text).toContain("timeout");
    expect(text).toContain("/repo");
    expect(text).toContain('"command": "git status"');
    expect(text).toContain("Raw debug data was requested");
  });

  it("handles multi-line string data in expanded mode", () => {
    const pi = createMockPi();
    registerDebugMessageRenderer(pi as never);
    const renderer = pi.renderers.get("supi-debug-report")!;

    const result = renderer(
      makeMessage("", {
        events: [
          {
            id: 1,
            timestamp: 1_700_000_000_000,
            source: "rtk",
            level: "debug",
            category: "rewrite",
            message: "RTK rewrote command",
            data: {
              command: "line1\nline2\nline3",
              other: "single",
            },
          },
        ],
      }),
      makeOptions(true),
      createMockTheme(),
    );

    const text = (result as { text: string }).text;
    expect(text).toContain("line1");
    expect(text).toContain("line2");
    expect(text).toContain("line3");
    expect(text).toContain('"other": "single"');
  });
});
