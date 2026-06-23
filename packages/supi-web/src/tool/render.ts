import type { ThemeColor } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";

interface RenderTheme {
  fg: (color: ThemeColor, text: string) => string;
}

interface CollapsibleTextResultOptions {
  summary: string;
  body?: string;
  expanded: boolean;
  theme: RenderTheme;
  fullOutputPath?: string;
  bodyColor?: ThemeColor;
}

export function renderToolCall(
  name: string,
  primary: string,
  theme: RenderTheme,
  secondary?: string,
): Text {
  let content = theme.fg("toolTitle", name);
  if (primary) {
    content += ` ${theme.fg("accent", primary)}`;
  }
  if (secondary) {
    content += theme.fg("dim", ` — ${secondary}`);
  }
  return new Text(content, 0, 0);
}

/** Render a compact tool summary that expands into the full text body on demand. */
export function renderCollapsibleTextResult({
  summary,
  body,
  expanded,
  theme,
  fullOutputPath,
  bodyColor = "toolOutput",
}: CollapsibleTextResultOptions): Text {
  const lines = [summary];
  const bodyText = body?.trimEnd();

  if (expanded && bodyText) {
    lines.push(formatMultiline(bodyText, theme, bodyColor));
  } else if (bodyText) {
    lines[0] += theme.fg("dim", " (expand for output)");
  }

  if (expanded && fullOutputPath) {
    lines.push(theme.fg("dim", `Full output: ${fullOutputPath}`));
  }

  return new Text(lines.filter(Boolean).join("\n"), 0, 0);
}

function formatMultiline(text: string, theme: RenderTheme, color: ThemeColor): string {
  return text
    .split("\n")
    .map((line) => (line.length > 0 ? theme.fg(color, line) : ""))
    .join("\n");
}
