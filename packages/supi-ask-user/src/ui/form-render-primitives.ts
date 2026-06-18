import { getMarkdownTheme, type Theme } from "@earendil-works/pi-coding-agent";
import { Markdown, truncateToWidth, visibleWidth, wrapTextWithAnsi } from "@earendil-works/pi-tui";

export function renderMiniBox(
  theme: Theme,
  title: string,
  bodyLines: string[],
  width: number,
): string[] {
  const safe = safeWidth(width);
  if (safe < 8) {
    return [theme.fg("accent", title), ...bodyLines].map((line) => truncateToWidth(line, safe));
  }

  const innerWidth = Math.max(1, safe - 4);
  const border = (text: string) => theme.fg("borderMuted", text);
  const lines = [
    border(`╭${"─".repeat(safe - 2)}╮`),
    `${border("│")} ${padRight(theme.fg("accent", theme.bold(title)), innerWidth)} ${border("│")}`,
    ...bodyLines.map((line) => `${border("│")} ${padRight(line, innerWidth)} ${border("│")}`),
    border(`╰${"─".repeat(safe - 2)}╯`),
  ];

  return lines.map((line) => truncateToWidth(line, safe));
}

export function pushWrappedWithPrefix(args: {
  lines: string[];
  prefix: string;
  text: string;
  width: number;
}): void {
  const width = safeWidth(args.width);
  const prefixWidth = visibleWidth(args.prefix);
  const textWidth = Math.max(1, width - prefixWidth);
  const wrapped = wrapTextWithAnsi(args.text, textWidth);
  const continuationPrefix = " ".repeat(prefixWidth);

  for (let index = 0; index < wrapped.length; index += 1) {
    args.lines.push(`${index === 0 ? args.prefix : continuationPrefix}${wrapped[index]}`);
  }
}

export function renderPrompt(text: string, width: number): string[] {
  return new Markdown(text, 0, 0, getMarkdownTheme()).render(safeWidth(width));
}

export function formatSplitLine(left: string, right: string, width: number): string {
  const safe = safeWidth(width);
  const leftWidth = visibleWidth(left);
  const rightWidth = visibleWidth(right);
  if (leftWidth + rightWidth + 2 <= safe) {
    return `${left}${" ".repeat(safe - leftWidth - rightWidth)}${right}`;
  }
  return truncateToWidth(`${left} ${right}`, safe);
}

export function padRight(text: string, width: number): string {
  const safe = safeWidth(width);
  const truncated = truncateToWidth(text, safe);
  const padding = Math.max(0, safe - visibleWidth(truncated));
  return `${truncated}${" ".repeat(padding)}`;
}

export function wrapLines(lines: string[], width: number): string[] {
  return lines.flatMap((line) => wrapTextWithAnsi(line, safeWidth(width)));
}

export function safeWidth(width: number): number {
  return Math.max(1, width);
}
