import type { Theme } from "@earendil-works/pi-coding-agent";
import type { ContextAnalysis } from "./analysis.ts";
import { type ContextReportMode, formatContextReport } from "./format.ts";

/** Width-aware Context Usage Report shared by custom-entry and tool renderers. */
export class ContextReportComponent {
  private cachedWidth?: number;
  private cachedLines?: string[];

  constructor(
    private readonly analysis: ContextAnalysis,
    private readonly theme: Theme,
    private readonly mode: ContextReportMode = "preview",
  ) {}

  render(width: number): string[] {
    if (this.cachedLines && this.cachedWidth === width) {
      return this.cachedLines;
    }

    const lines = formatContextReport(this.analysis, this.theme, width, this.mode);
    this.cachedWidth = width;
    this.cachedLines = lines;
    return lines;
  }

  invalidate(): void {
    this.cachedWidth = undefined;
    this.cachedLines = undefined;
  }
}
