import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderMarkdown, renderMarkdownPreview } from "../src/ui-rich-render-markdown.ts";

const mockRender = vi.hoisted(() => vi.fn(() => ["rendered line"]));

const MockMarkdown = vi.hoisted(() =>
  vi.fn(function (this: unknown) {
    // biome-ignore lint/suspicious/noExplicitAny: test mock
    (this as any).render = mockRender;
  }),
);

const mockHighlightCode = vi.hoisted(() => vi.fn(() => ["highlighted"]));
const mockGetMarkdownTheme = vi.hoisted(() =>
  vi.fn(() => ({
    heading: (text: string) => text,
    codeBlock: (text: string) => `code:${text}`,
  })),
);

vi.mock("@mariozechner/pi-tui", () => ({
  Markdown: MockMarkdown,
}));

vi.mock("@mariozechner/pi-coding-agent", () => ({
  getMarkdownTheme: mockGetMarkdownTheme,
  highlightCode: mockHighlightCode,
}));

describe("renderMarkdownPreview", () => {
  beforeEach(() => {
    mockRender.mockReturnValue(["rendered line"]);
    mockHighlightCode.mockReturnValue(["highlighted"]);
    MockMarkdown.mockClear();
    mockGetMarkdownTheme.mockClear();
    mockHighlightCode.mockClear();
    mockRender.mockClear();
  });

  it("renders preview through Markdown component with correct parameters", () => {
    const theme = {
      fg: (_color: string, text: string) => text,
    } as unknown as import("@mariozechner/pi-coding-agent").Theme;
    const result = renderMarkdownPreview("# Hello", 50, theme);

    expect(MockMarkdown).toHaveBeenCalledTimes(1);
    expect(MockMarkdown).toHaveBeenCalledWith(
      "# Hello",
      1,
      0,
      expect.objectContaining({
        highlightCode: expect.any(Function),
      }),
      expect.objectContaining({
        color: expect.any(Function),
      }),
    );
    expect(result).toEqual(["rendered line"]);
  });

  it("maps default text color through the provided theme", () => {
    const theme = {
      fg: (color: string, text: string) => `[${color}]${text}`,
    } as unknown as import("@mariozechner/pi-coding-agent").Theme;
    renderMarkdownPreview("plain", 40, theme);
    const passedDefaultStyle = (MockMarkdown.mock.calls[0] as unknown[])[4] as {
      color: (text: string) => string;
    };
    expect(passedDefaultStyle.color("text")).toBe("[text]text");
  });

  it("injects highlightCode that delegates to pi-coding-agent", () => {
    const theme = {
      fg: (_color: string, text: string) => text,
    } as unknown as import("@mariozechner/pi-coding-agent").Theme;
    renderMarkdownPreview("code", 40, theme);
    const passedTheme = (MockMarkdown.mock.calls[0] as unknown[])[3] as {
      highlightCode: (code: string, lang?: string) => string[];
    };
    mockHighlightCode.mockReturnValueOnce(["hl1", "hl2"]);
    const result = passedTheme.highlightCode("some code", "ts");
    expect(mockHighlightCode).toHaveBeenCalledWith("some code", "ts");
    expect(result).toEqual(["hl1", "hl2"]);
  });

  it("falls back to codeBlock styling when highlightCode throws", () => {
    const theme = {
      fg: (_color: string, text: string) => text,
    } as unknown as import("@mariozechner/pi-coding-agent").Theme;
    mockHighlightCode.mockImplementationOnce(() => {
      throw new Error("bad lang");
    });
    renderMarkdownPreview("code", 40, theme);
    const passedTheme = (MockMarkdown.mock.calls[0] as unknown[])[3] as {
      highlightCode: (code: string, lang?: string) => string[];
    };
    const result = passedTheme.highlightCode("some code", "badlang");
    expect(result).toEqual(["code:some code"]);
  });

  it("passes custom paddingX and defaultColor through options", () => {
    const theme = {
      fg: (color: string, text: string) => `[${color}]${text}`,
    } as unknown as import("@mariozechner/pi-coding-agent").Theme;
    renderMarkdown("hello", 40, theme, { paddingX: 3, defaultColor: "muted" });
    expect(MockMarkdown).toHaveBeenCalledWith(
      "hello",
      3,
      0,
      expect.any(Object),
      expect.objectContaining({
        color: expect.any(Function),
      }),
    );
    const passedDefaultStyle = (MockMarkdown.mock.calls[0] as unknown[])[4] as {
      color: (text: string) => string;
    };
    expect(passedDefaultStyle.color("x")).toBe("[muted]x");
  });
});
