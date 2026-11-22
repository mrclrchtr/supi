import { getMarkdownTheme, type Theme } from "@earendil-works/pi-coding-agent";
import { Box, type Component, Markdown, Text } from "@earendil-works/pi-tui";

/** Custom message type for the `/supi-insights` report summary. */
export const REPORT_TYPE = "supi-insights-report";

/**
 * Render the report summary message. Collapsed shows the stats line from `content`;
 * expanded shows the At-a-Glance summary and report link from `details.summary`.
 */
export function renderReportMessage(
  message: { content: unknown; details?: unknown },
  options: { expanded: boolean; outputPad: number },
  theme: Theme,
): Component {
  const stats = typeof message.content === "string" ? message.content : "";
  const summary = (message.details as { summary?: unknown } | undefined)?.summary;
  const box = new Box(options.outputPad, 0, undefined);
  box.addChild(new Text(`${theme.fg("toolTitle", "Pi Insights")} ${theme.fg("dim", stats)}`, 0, 0));
  if (options.expanded && typeof summary === "string") {
    box.addChild(new Markdown(summary, 0, 0, getMarkdownTheme()));
  }
  return box;
}
