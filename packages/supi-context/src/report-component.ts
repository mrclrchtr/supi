import type { Theme } from "@earendil-works/pi-coding-agent";
import type { ContextAnalysis } from "./analysis.ts";
import { formatContextReport } from "./format.ts";

/** Width-aware rendered context report shared by message and tool renderers. */
export class ContextReportComponent {
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
