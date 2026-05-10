import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import type { DebugEventView } from "@mrclrchtr/supi-core";
import { formatDataLines } from "./format.ts";

const DEBUG_REPORT_TYPE = "supi-debug-report";

interface DebugReportDetails {
  events?: DebugEventView[];
  rawAccessDenied?: boolean;
}

type Theme = Parameters<Parameters<ExtensionAPI["registerMessageRenderer"]>[1]>[2];

function formatLevel(theme: Theme, level: string): string {
  const color =
    level === "error"
      ? "error"
      : level === "warning"
        ? "warning"
        : level === "info"
          ? "accent"
          : "muted";
  return theme.fg(color, level.toUpperCase());
}

function pushEventLines(lines: string[], event: DebugEventView, theme: Theme): void {
  const timestamp = theme.fg("dim", `[${new Date(event.timestamp).toISOString()}]`);
  const level = formatLevel(theme, event.level);
  const source = theme.fg("toolTitle", `${event.source}/${event.category}`);

  lines.push(`${timestamp} ${level} ${source}: ${event.message}`);

  if (event.cwd) {
    lines.push(theme.fg("dim", `  cwd: ${event.cwd}`));
  }

  const dataLines = formatDataLines(event.data);
  if (dataLines.length > 0) {
    if (dataLines.length === 1) {
      lines.push(theme.fg("dim", `  data: ${dataLines[0]}`));
    } else {
      lines.push(theme.fg("dim", "  data:"));
      for (const dl of dataLines) {
        lines.push(theme.fg("dim", `    ${dl}`));
      }
    }
  }

  const rawLines = formatDataLines(event.rawData);
  if (rawLines.length > 0) {
    if (rawLines.length === 1) {
      lines.push(theme.fg("dim", `  rawData: ${rawLines[0]}`));
    } else {
      lines.push(theme.fg("dim", "  rawData:"));
      for (const rl of rawLines) {
        lines.push(theme.fg("dim", `    ${rl}`));
      }
    }
  }
}

function renderExpandedReport(details: DebugReportDetails, theme: Theme): string {
  const lines: string[] = [];
  for (const event of details.events ?? []) {
    if (lines.length > 0) lines.push("");
    pushEventLines(lines, event, theme);
  }

  if (details.rawAccessDenied) {
    lines.push("");
    lines.push(
      theme.fg(
        "warning",
        "Raw debug data was requested but is not enabled in SuPi Debug settings.",
      ),
    );
  }

  return lines.join("\n");
}

/** Register the TUI message renderer for supi-debug-report custom messages. */
export function registerDebugMessageRenderer(pi: ExtensionAPI): void {
  pi.registerMessageRenderer(DEBUG_REPORT_TYPE, (message, options, theme) => {
    const { expanded } = options;
    const details = (message.details ?? {}) as DebugReportDetails;
    const events = details.events ?? [];

    if (events.length === 0) {
      const text = typeof message.content === "string" ? message.content : "No debug events.";
      return new Text(theme.fg("muted", text), 0, 0);
    }

    if (!expanded) {
      const first = events[0];
      const more = events.length > 1 ? ` +${events.length - 1} more` : "";
      const summary = `${events.length} event${events.length === 1 ? "" : "s"} — ${first.source}/${first.category}${more}`;
      return new Text(theme.fg("muted", summary), 0, 0);
    }

    return new Text(renderExpandedReport(details, theme), 0, 0);
  });
}
