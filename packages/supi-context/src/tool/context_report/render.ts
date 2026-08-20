import type { Theme } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { createContextPressureSnapshot } from "../../capacity.ts";
import { ContextReportComponent } from "../../report-component.ts";
import { ContextPressureComponent } from "../../snapshot-component.ts";
import type {
  ContextToolConciseDetails,
  ContextToolDetails,
  ContextToolFullDetails,
} from "./result.ts";

interface ContextToolResult {
  content: Array<{ type: string; text?: string }>;
  details?: unknown;
  isError?: boolean;
}

interface ResultOptions {
  expanded: boolean;
  isPartial: boolean;
}

export function renderContextToolCall(args: unknown, theme: Theme): Text {
  const mode =
    args &&
    typeof args === "object" &&
    "mode" in args &&
    (args as { mode?: string }).mode === "full"
      ? "full"
      : "concise";
  const content = `${theme.fg("toolTitle", "context_report")} ${theme.fg("muted", mode)}`;
  return new Text(content, 0, 0);
}

export function renderContextToolResult(
  result: ContextToolResult | undefined,
  options: ResultOptions,
  theme: Theme,
): Text | ContextPressureComponent | ContextReportComponent {
  if (options.isPartial) {
    return new Text(theme.fg("warning", "Analyzing context…"), 0, 0);
  }

  if (result?.isError) {
    return new Text(theme.fg("error", "context_report failed"), 0, 0);
  }

  const details = extractDetails(result?.details);
  if (!details) {
    return new Text(theme.fg("dim", "No context analysis data"), 0, 0);
  }

  if (details.mode === "concise") {
    return new ContextPressureComponent(details.snapshot, theme, options.expanded);
  }

  if (options.expanded) {
    return new ContextReportComponent(details.analysis, theme, "full");
  }

  return new ContextPressureComponent(
    createContextPressureSnapshot(details.analysis.modelName, details.analysis),
    theme,
    false,
  );
}

function extractDetails(details: unknown): ContextToolDetails | undefined {
  if (!details || typeof details !== "object" || !("mode" in details)) {
    return undefined;
  }

  const mode = (details as { mode?: unknown }).mode;
  if (mode === "concise" && "snapshot" in details) {
    return details as ContextToolConciseDetails;
  }
  if (mode === "full" && "analysis" in details) {
    return details as ContextToolFullDetails;
  }
  return undefined;
}
