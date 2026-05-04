import type { Theme } from "@mariozechner/pi-coding-agent";
import { CancellableLoader, Container, Text, type TUI } from "@mariozechner/pi-tui";
import { formatTokens } from "./runner.ts";
import type { ReviewProgress } from "./runner-types.ts";

/**
 * Live progress widget for code review.
 *
 * Shows an animated loader, turn count, tool uses, token count,
 * and human-readable activity description.
 */
export class ReviewProgressWidget extends Container {
  private _message: string;
  private _progress: ReviewProgress = { turns: 0, toolUses: 0, activities: [] };
  private _loader: CancellableLoader;
  private _tui: TUI;
  private _theme: Theme;

  constructor(tui: TUI, theme: Theme, message: string) {
    super();
    this._tui = tui;
    this._theme = theme;
    this._message = message;
    this._loader = new CancellableLoader(
      tui,
      (s: string) => theme.fg("accent", s),
      (s: string) => theme.fg("muted", s),
      message,
    );

    this._renderContent();
  }

  get signal(): AbortSignal {
    return this._loader.signal;
  }

  set onAbort(fn: (() => void) | undefined) {
    this._loader.onAbort = fn;
  }

  handleInput(data: string): void {
    this._loader.handleInput(data);
  }

  /** Update progress state and re-render. */
  updateProgress(progress: ReviewProgress): void {
    this._progress = progress;
    this._renderContent();
    this._tui.requestRender();
  }

  dispose(): void {
    this._loader.dispose();
  }

  private _renderContent(): void {
    this.clear();

    const { turns, toolUses, activities, tokens } = this._progress;

    // Build the loader message with stats
    const stats: string[] = [];
    if (turns > 0) stats.push(`⟳${turns}`);
    if (toolUses > 0) stats.push(`${toolUses} tool uses`);
    if (tokens) {
      stats.push(`${formatTokens(tokens.total)} tokens`);
    }

    const loaderMessage =
      stats.length > 0 ? `${this._message} · ${stats.join(" · ")}` : this._message;

    this._loader.setMessage(loaderMessage);
    this.addChild(this._loader);

    // Activity line
    if (activities.length > 0) {
      const activityText = activities.join(", ");
      this.addChild(new Text(this._theme.fg("dim", `  ⎿  ${activityText}…`), 1, 0));
    }
  }
}
