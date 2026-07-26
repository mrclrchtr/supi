import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import type { ContextAnalysis } from "./analysis.ts";
import type { ContextReportMode } from "./format.ts";
import { ContextReportComponent } from "./report-component.ts";

/** Durable, TUI-only payload appended by the `/supi-context` command. */
export interface ContextReportEntryData {
  analysis: ContextAnalysis;
  mode: ContextReportMode;
}

/** Register the TUI renderer for new Context Usage Report custom entries. */
export function registerContextEntryRenderer(pi: ExtensionAPI): void {
  pi.registerEntryRenderer<ContextReportEntryData>("supi-context", (entry, _options, theme) => {
    const data = entry.data;
    if (!data) {
      return new Text(theme.fg("dim", "No context analysis data"), 1, 0);
    }

    return new ContextReportComponent(data.analysis, theme, data.mode);
  });
}
