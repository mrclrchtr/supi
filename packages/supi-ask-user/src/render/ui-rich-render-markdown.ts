import type { Theme } from "@earendil-works/pi-coding-agent";
import { getMarkdownTheme, highlightCode } from "@earendil-works/pi-coding-agent";
import { Markdown } from "@earendil-works/pi-tui";

export interface RenderMarkdownOptions {
  paddingX?: number;
  defaultColor?: "text" | "muted" | "dim";
}

export function renderMarkdown(
  text: string,
  width: number,
  theme: Theme,
  options: RenderMarkdownOptions = {},
): string[] {
  const { paddingX = 1, defaultColor = "text" } = options;
  const markdownTheme = getMarkdownTheme();
  markdownTheme.highlightCode = (code: string, lang?: string) => {
    try {
      return highlightCode(code, lang);
    } catch {
      return code.split("\n").map((line) => markdownTheme.codeBlock(line));
    }
  };
  const markdown = new Markdown(text, paddingX, 0, markdownTheme, {
    color: (text: string) => theme.fg(defaultColor, text),
  });
  return markdown.render(width);
}

export function renderMarkdownPreview(preview: string, width: number, theme: Theme): string[] {
  return renderMarkdown(preview, width, theme);
}
