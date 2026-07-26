import type { Theme } from "@earendil-works/pi-coding-agent";
import { type Component, truncateToWidth } from "@earendil-works/pi-tui";
import type { ContextPressureSnapshot } from "./capacity.ts";
import { healthColor } from "./format-helpers.ts";
import { formatTokens } from "./utils.ts";

function formatPercentage(value: number | null): string {
  return value === null ? "unavailable" : `${value.toFixed(1)}%`;
}

function formatTokenValue(value: number | null): string {
  return value === null ? "unavailable" : formatTokens(value);
}

/**
 * Width-safe TUI renderer for the small Context Pressure Snapshot.
 *
 * The collapsed view is intentionally one dense line. Expansion exposes every
 * snapshot field without falling back to the raw JSON returned to the agent.
 */
export class ContextPressureComponent implements Component {
  constructor(
    private readonly snapshot: ContextPressureSnapshot,
    private readonly theme: Theme,
    private readonly expanded: boolean,
  ) {}

  render(width: number): string[] {
    return this.expanded ? this.renderExpanded(width) : [this.renderCollapsed(width)];
  }

  invalidate(): void {}

  private renderCollapsed(width: number): string {
    const usage =
      this.snapshot.contextWindow === null
        ? `${formatTokens(this.snapshot.usedTokens)} used`
        : `${formatTokens(this.snapshot.usedTokens)}/${formatTokens(this.snapshot.contextWindow)} used`;
    const parts = [
      `${this.theme.fg(healthColor(this.snapshot), "●")} ${this.theme.fg("text", usage)}`,
      `${this.theme.fg("dim", "headroom")} ${this.theme.fg("muted", formatTokenValue(this.snapshot.headroomTokens))}`,
      `${this.theme.fg("dim", "pressure")} ${this.theme.fg("muted", formatPercentage(this.snapshot.pressurePercent))}`,
      this.theme.fg("muted", this.snapshot.modelName),
    ];

    return truncateToWidth(parts.join(` ${this.theme.fg("dim", "·")} `), width);
  }

  private renderExpanded(width: number): string[] {
    const values: Array<[string, string]> = [
      ["Model", this.snapshot.modelName],
      ["Context window", formatTokenValue(this.snapshot.contextWindow)],
      ["Used", formatTokens(this.snapshot.usedTokens)],
      ["Usage", formatPercentage(this.snapshot.usagePercent)],
      ["Auto-compaction", this.snapshot.compactionEnabled ? "enabled" : "disabled"],
      ["Compaction reserve", formatTokens(this.snapshot.reserveTokens)],
      ["Headroom", formatTokenValue(this.snapshot.headroomTokens)],
      ["Pressure", formatPercentage(this.snapshot.pressurePercent)],
      ["Compacted", this.snapshot.compacted ? "yes" : "no"],
    ];
    const labelWidth = Math.max(8, Math.min(18, width - 12));
    const lines = values.map(([label, value]) =>
      truncateToWidth(
        `${this.theme.fg("dim", `${label.padEnd(labelWidth)} `)}${this.theme.fg("text", value)}`,
        width,
      ),
    );

    if (this.snapshot.approximationNote) {
      lines.push(truncateToWidth(this.theme.fg("warning", this.snapshot.approximationNote), width));
    }

    return lines;
  }
}
