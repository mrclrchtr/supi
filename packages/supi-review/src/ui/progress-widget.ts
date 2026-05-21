import type { Theme } from "@earendil-works/pi-coding-agent";
import { CancellableLoader, Container, Text } from "@earendil-works/pi-tui";
import type { ReviewProgress } from "../tool/runner-types.ts";

interface ReviewProgressTui {
  requestRender(): void;
}

/**
 * Live progress widget for review-related child sessions.
 *
 * Shows an animated loader, turn count, tool uses, token count, and any active
 * tool descriptions while the synthesis or review child session is running.
 */
export class ReviewProgressWidget extends Container {
  private message: string;
  private progress: ReviewProgress = { turns: 0, toolUses: 0, activities: [] };
  private loader: CancellableLoader;
  private tui: ReviewProgressTui;
  private theme: Theme;

  constructor(tui: ReviewProgressTui, theme: Theme, message: string) {
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

  get signal(): AbortSignal {
    return this.loader.signal;
  }

  set onAbort(fn: (() => void) | undefined) {
    this.loader.onAbort = fn;
  }

  handleInput(data: string): void {
    this.loader.handleInput(data);
  }

  /** Update progress state and request a re-render. */
  updateProgress(progress: ReviewProgress): void {
    this.progress = progress;
    this.renderContent();
    this.tui.requestRender();
  }

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

function formatTokens(count: number): string {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}k`;
  return String(count);
}
