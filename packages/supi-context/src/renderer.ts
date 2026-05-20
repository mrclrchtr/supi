import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import type { ContextAnalysis } from "./analysis.ts";
import { formatContextReport } from "./format.ts";

type Theme = Parameters<Parameters<ExtensionAPI["registerMessageRenderer"]>[1]>[2];

class ContextReportComponent {
  private cachedWidth?: number;
  private cachedLines?: string[];

  constructor(
    private readonly analysis: ContextAnalysis,
    private readonly theme: Theme,
  ) {}

  render(width: number): string[] {
    if (this.cachedLines && this.cachedWidth === width) {
      return this.cachedLines;
    }

    const lines = formatContextReport(this.analysis, this.theme, width);
    this.cachedWidth = width;
    this.cachedLines = lines;
    return lines;
  }

  invalidate(): void {
    this.cachedWidth = undefined;
    this.cachedLines = undefined;
  }
}

export function registerContextRenderer(pi: ExtensionAPI): void {
  pi.registerMessageRenderer("supi-context", (message, _renderOptions, theme) => {
    const analysis = (message.details as { analysis?: ContextAnalysis } | undefined)?.analysis;
    if (!analysis) {
      return new Text(theme.fg("dim", "No context analysis data"), 1, 0);
    }

    return new ContextReportComponent(analysis, theme);
  });
}
