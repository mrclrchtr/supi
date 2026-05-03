import type { Theme } from "@mariozechner/pi-coding-agent";
import { getMarkdownTheme, highlightCode } from "@mariozechner/pi-coding-agent";
import { Markdown } from "@mariozechner/pi-tui";

export function renderMarkdownPreview(preview: string, width: number, theme: Theme): string[] {
  const markdownTheme = getMarkdownTheme();
  markdownTheme.highlightCode = (code: string, lang?: string) => {
    try {
      return highlightCode(code, lang);
    } catch {
      return code.split("\n").map((line) => markdownTheme.codeBlock(line));
    }
  };
  const markdown = new Markdown(preview, 1, 0, markdownTheme, {
    color: (text: string) => theme.fg("text", text),
  });
  return markdown.render(width);
}
