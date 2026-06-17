// Generic progress widget for SuPi long-running operations.
//
// Provides a TUI-based progress display with animated loader, turn counts,
// tool usage, and activity descriptions.

import type { Theme } from "@earendil-works/pi-coding-agent";
import { CancellableLoader, Container, Text } from "@earendil-works/pi-tui";

// ── Types ──────────────────────────────────────────────────────────────────

/** What the reviewer is currently doing and on what. */
export interface CurrentFocus {
  /** Display label for the active tool (e.g. "Reading", "Searching", "Finding"). */
  label: string;
  /** Context detail (e.g. file path, search pattern, directory). */
  detail: string;
}

/** Progress state for widget display, compatible with child-session updates. */
export interface WidgetProgress {
  /** Number of agent turns completed. */
  turns: number;
  /** Number of tool executions started. */
  toolUses: number;
  /** Token usage stats, if available. */
  tokens?: {
    input: number;
    output: number;
    total: number;
    cacheRead?: number;
    cacheWrite?: number;
  };
  /** Per-tool execution counts keyed by short display label (e.g. "diffs", "reads", "greps"). */
  toolCounts?: Record<string, number>;
  /** Number of distinct files inspected so far (via read_snapshot_diff / read_snapshot_file). */
  filesInspected?: number;
  /** Total files in the review snapshot. */
  filesTotal?: number;
  /** Current tool + context for the progress narrative line. */
  currentFocus?: CurrentFocus;
  /** Elapsed time in milliseconds since the operation started. */
  elapsedMs?: number;
}

// ── Widget ─────────────────────────────────────────────────────────────────

/**
 * TUI progress widget for long-running operations.
 *
 * Two-line layout: top line shows the narrative (current focus + file progress),
 * bottom line shows stats (tokens, elapsed time, turns, tool counts).
 */
export class ProgressWidget extends Container {
  private message: string;
  private progress: WidgetProgress = { turns: 0, toolUses: 0 };
  private loader: CancellableLoader;
  private tui: { requestRender(): void };
  private theme: Theme;

  constructor(tui: { requestRender(): void }, theme: Theme, message: string) {
    super();
    this.tui = tui;
    this.theme = theme;
    this.message = message;
    this.loader = new CancellableLoader(
      tui as ConstructorParameters<typeof CancellableLoader>[0],
      (text: string) => theme.fg("accent", text),
      (text: string) => theme.fg("muted", text),
      message,
    );

    this.renderContent();
  }

  /** AbortSignal that fires when the user presses Escape. */
  get signal(): AbortSignal {
    return this.loader.signal;
  }

  /** Callback invoked when the user presses Escape. */
  set onAbort(fn: (() => void) | undefined) {
    this.loader.onAbort = fn;
  }

  /** Delegate keyboard input to the loader. */
  handleInput(data: string): void {
    this.loader.handleInput(data);
  }

  /** Update progress state and request a re-render. */
  updateProgress(progress: WidgetProgress): void {
    this.progress = progress;
    this.renderContent();
    this.tui.requestRender();
  }

  /** Clean up the widget. */
  dispose(): void {
    this.loader.dispose();
  }

  private renderContent(): void {
    this.clear();
    this.renderTopLine();
    this.renderBottomLine();
  }

  private renderTopLine(): void {
    const topParts: string[] = [];

    if (this.progress.currentFocus) {
      const { label, detail } = this.progress.currentFocus;
      topParts.push(detail ? `${label}: ${detail}` : label);
    }

    if (this.progress.filesTotal && this.progress.filesTotal > 0) {
      const inspected = this.progress.filesInspected ?? 0;
      topParts.push(`${inspected}/${this.progress.filesTotal} files`);
    }

    const loaderMessage =
      topParts.length > 0 ? `${this.message} · ${topParts.join(" · ")}` : this.message;
    this.loader.setMessage(loaderMessage);
    this.addChild(this.loader);
  }

  private renderBottomLine(): void {
    const stats: string[] = [];

    this.appendTokenStats(stats);

    if (this.progress.elapsedMs !== undefined && this.progress.elapsedMs >= 1000) {
      stats.push(formatElapsed(this.progress.elapsedMs));
    }

    if (this.progress.turns > 0) {
      stats.push(`⟳ ${this.progress.turns}`);
    }

    if (this.progress.toolCounts) {
      const parts = Object.entries(this.progress.toolCounts)
        .filter(([, count]) => count > 0)
        .sort(([, a], [, b]) => b - a)
        .map(([label, count]) => `${count} ${label}`);
      if (parts.length > 0) stats.push(parts.join(" · "));
    }

    if (stats.length > 0) {
      this.addChild(new Text(this.theme.fg("dim", `  ${stats.join(" · ")}`), 1, 0));
    }
  }

  private appendTokenStats(stats: string[]): void {
    const tokens = this.progress.tokens;
    if (!tokens) return;

    stats.push(`↑ ${formatTokens(tokens.input)}`);
    if (tokens.cacheRead !== undefined && tokens.cacheRead > 0) {
      stats.push(`↲ ${formatTokens(tokens.cacheRead)}`);
    }
    if (tokens.cacheWrite !== undefined && tokens.cacheWrite > 0) {
      stats.push(`↱ ${formatTokens(tokens.cacheWrite)}`);
    }
    stats.push(`↓ ${formatTokens(tokens.output)}`);
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────

export function formatTokens(count: number): string {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}k`;
  return String(count);
}

export function formatElapsed(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const hours = Math.floor(totalSec / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m ${seconds}s`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }
  return `${seconds}s`;
}
