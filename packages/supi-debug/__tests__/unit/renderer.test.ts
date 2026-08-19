import type { Theme } from "@earendil-works/pi-coding-agent";
import { describe, expect, it } from "vitest";
import {
  createDebugMessageDetails,
  registerDebugMessageRenderer,
  renderDebugToolCall,
  renderDebugToolResult,
} from "../../src/renderer.ts";

function createMockTheme(): Theme {
  return {
    fg: (_color: string, text: string) => text,
    bold: (text: string) => text,
    italic: (text: string) => text,
    strikethrough: (text: string) => text,
  } as unknown as Theme;
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

function makeOptions(expanded: boolean, isPartial = false) {
  return { expanded, isPartial };
}

function getRegisteredRenderer() {
  const pi = createMockPi();
  registerDebugMessageRenderer(pi as never);
  const renderer = pi.renderers.get("supi-debug-report");
  if (!renderer) {
    throw new Error("Expected supi-debug-report renderer to be registered");
  }
  return renderer;
}

describe("debug tool renderer", () => {
  it("renders a bounded call header", () => {
    const result = renderDebugToolCall(
      {
        source: "lsp",
        category: "fallback",
        sessionFile: `/sessions/${"x".repeat(200)}`,
        includeRaw: true,
      },
      createMockTheme(),
    );

    expect((result as unknown as { text: string }).text).toContain("debug");
    expect((result as unknown as { text: string }).text).toContain("source=lsp");
    expect((result as unknown as { text: string }).text.length).toBeLessThan(400);
  });

  it("renders partial and error states without reading result content", () => {
    const partial = renderDebugToolResult(
      {
        content: [{ type: "text", text: "ignored" }],
        details: { scannedLines: 250, matchedEvents: 2 },
      },
      makeOptions(false, true),
      createMockTheme(),
      { isError: false },
    );
    expect((partial as unknown as { text: string }).text).toContain(
      "Reading persisted debug events",
    );

    const error = renderDebugToolResult(
      { content: [{ type: "text", text: "secret failure" }], details: undefined },
      makeOptions(false),
      createMockTheme(),
      { isError: true },
    );
    expect((error as unknown as { text: string }).text).toBe("debug failed");
    expect((error as unknown as { text: string }).text).not.toContain("secret failure");
  });

  it("bounds event details and excludes raw data", () => {
    const rawData = { token: "must not be rendered" };
    const details = createDebugMessageDetails([
      {
        id: 1,
        timestamp: 1_700_000_000_000,
        source: "lsp",
        level: "warning",
        category: "fallback",
        message: "timeout",
        data: { text: "x".repeat(5_000) },
        rawData,
      },
    ]);

    expect(details.events).toHaveLength(1);
    expect(details.events[0]).not.toHaveProperty("rawData");
    expect(details.eventDataTruncated).toBe(true);
    expect(JSON.stringify(details).length).toBeLessThan(3_000);
  });

  it("bounds arrays of scalar values", () => {
    const details = createDebugMessageDetails([
      {
        id: 1,
        timestamp: 1_700_000_000_000,
        source: "lsp",
        level: "debug",
        category: "trace",
        message: "many values",
        data: Array.from({ length: 10_000 }, (_, index) => index % 2 === 0),
      },
    ]);

    expect(details.eventDataTruncated).toBe(true);
    expect(JSON.stringify(details).length).toBeLessThan(10_000);
  });
});

describe("debug message renderer", () => {
  it("shows fallback text when no events in details", () => {
    const renderer = getRegisteredRenderer();

    const result = renderer(
      makeMessage("disabled", undefined),
      makeOptions(true),
      createMockTheme(),
    );
    expect((result as unknown as { text: string }).text).toBe("disabled");
  });

  it("shows summary when collapsed", () => {
    const renderer = getRegisteredRenderer();

    const result = renderer(
      makeMessage("", {
        events: [
          {
            id: 1,
            timestamp: 1_700_000_000_000,
            source: "lsp",
            level: "warning",
            category: "fallback",
            message: "timeout",
          },
          {
            id: 2,
            timestamp: 1_700_000_001_000,
            source: "lsp",
            level: "debug",
            category: "rewrite",
            message: "ok",
          },
        ],
      }),
      makeOptions(false),
      createMockTheme(),
    );

    expect((result as unknown as { text: string }).text).toBe("2 events — lsp/fallback +1 more");
  });

  it("renders full events when expanded", () => {
    const renderer = getRegisteredRenderer();

    const result = renderer(
      makeMessage("", {
        events: [
          {
            id: 1,
            timestamp: 1_700_000_000_000,
            source: "lsp",
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

    const text = (result as unknown as { text: string }).text;
    expect(text).toContain("lsp/fallback");
    expect(text).toContain("timeout");
    expect(text).toContain("/repo");
    expect(text).toContain('"command": "git status"');
    expect(text).toContain("Raw debug data was requested");
  });

  it("handles multi-line string data in expanded mode", () => {
    const renderer = getRegisteredRenderer();

    const result = renderer(
      makeMessage("", {
        events: [
          {
            id: 1,
            timestamp: 1_700_000_000_000,
            source: "lsp",
            level: "debug",
            category: "rewrite",
            message: "LSP rewrote command",
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

    const text = (result as unknown as { text: string }).text;
    expect(text).toContain("line1");
    expect(text).toContain("line2");
    expect(text).toContain("line3");
    expect(text).toContain('"other": "single"');
  });
});
