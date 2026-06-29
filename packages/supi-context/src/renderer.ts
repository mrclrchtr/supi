import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import type { ContextAnalysis } from "./analysis.ts";
import { ContextReportComponent } from "./report-component.ts";

export function registerContextRenderer(pi: ExtensionAPI): void {
  pi.registerMessageRenderer("supi-context", (message, _renderOptions, theme) => {
    const analysis = (message.details as { analysis?: ContextAnalysis } | undefined)?.analysis;
    if (!analysis) {
      return new Text(theme.fg("dim", "No context analysis data"), 1, 0);
    }

    return new ContextReportComponent(analysis, theme);
  });
}
