// Generic progress widget for SuPi long-running operations.
//
// Provides a TUI-based progress display with animated loader, turn counts,
// tool usage, and activity descriptions.

import type { Theme } from "@earendil-works/pi-coding-agent";
import { CancellableLoader, Container, Text } from "@earendil-works/pi-tui";

// ── Types ──────────────────────────────────────────────────────────────────

/** Progress state for widget display, compatible with child-session updates. */
export interface WidgetProgress {
  /** Number of agent turns completed. */
  turns: number;
  /** Number of tool executions started. */
  toolUses: number;
  /** Human-readable active tool descriptions. */
  activities: string[];
  /** Token usage stats, if available. */
  tokens?: { input: number; output: number; total: number };
}

// ── Widget ─────────────────────────────────────────────────────────────────

/**
 * TUI progress widget for long-running operations.
 *
 * Shows an animated loader, turn count, tool uses, token count, and any active
 * tool descriptions while the child session or operation is running.
 */
export class ProgressWidget extends Container {
  private message: string;
  private progress: WidgetProgress = { turns: 0, toolUses: 0, activities: [] };
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

    const stats: string[] = [];
    if (this.progress.turns > 0) stats.push(`⟳${this.progress.turns}`);
    if (this.progress.toolUses > 0) stats.push(`${this.progress.toolUses} tool uses`);
    if (this.progress.tokens) stats.push(`${formatTokens(this.progress.tokens.total)} tokens`);

    const loaderMessage =
      stats.length > 0 ? `${this.message} · ${stats.join(" · ")}` : this.message;

    this.loader.setMessage(loaderMessage);
    this.addChild(this.loader);

    if (this.progress.activities.length > 0) {
      this.addChild(
        new Text(this.theme.fg("dim", `  ⎿  ${this.progress.activities.join(", ")}…`), 1, 0),
      );
    }
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────

function formatTokens(count: number): string {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}k`;
  return String(count);
}
