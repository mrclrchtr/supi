/**
 * Lightweight status-bar spinner for SuPi extensions.
 *
 * In the TUI it animates a braille spinner on `ctx.ui.setStatus`. In every other
 * mode it sets the status once and re-sends it only when the message changes.
 *
 * @module
 */

import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { BRAILLE_SPINNER_FRAMES, SPINNER_INTERVAL_MS } from "./spinner-frames.ts";

/**
 * Manages a status-bar spinner that animates only in the TUI.
 *
 * Outside the TUI (`rpc`, `json`, `print`), each `setStatus` call is a record sent to
 * the client: in RPC an 80 ms animation would stream about twelve records per second.
 * There the spinner shows the message without a frame icon, sends it once per
 * distinct message, and clears it once on {@link StatusSpinner.stop}.
 *
 * Usage:
 * ```ts
 * const spinner = new StatusSpinner(ctx, "my-package");
 * spinner.start("generating…");
 * spinner.update("generating… (1 of 2)");
 * // later
 * spinner.stop();
 * ```
 */
export class StatusSpinner {
  private interval: ReturnType<typeof setInterval> | null = null;
  private frame = 0;
  private currentMessage = "";
  /** Last text sent outside the TUI; `undefined` when no status is shown. */
  private sentMessage: string | undefined;

  constructor(
    private ctx: ExtensionContext,
    private source: string,
    private frames: readonly string[] = BRAILLE_SPINNER_FRAMES,
  ) {}

  /** Start the spinner with the given message. Overwrites any active spinner. */
  start(message: string): void {
    this.stopTimer();
    this.currentMessage = message;
    if (!this.animates()) {
      this.sendStatic();
      return;
    }
    this.render();
    this.interval = setInterval(() => {
      this.frame++;
      this.render();
    }, SPINNER_INTERVAL_MS);
  }

  /**
   * Update the display message without resetting the spinner. The TUI shows it on the
   * next frame; other modes send it at once when it differs from the shown message.
   */
  update(message: string): void {
    this.currentMessage = message;
    if (this.interval === null && this.sentMessage !== undefined) this.sendStatic();
  }

  /** Stop the spinner and clear the status. */
  stop(): void {
    this.stopTimer();
    this.sentMessage = undefined;
    this.ctx.ui.setStatus(this.source, undefined);
  }

  // ── Private ──────────────────────────────────────────────────────────

  private stopTimer(): void {
    if (this.interval === null) return;
    clearInterval(this.interval);
    this.interval = null;
  }

  private animates(): boolean {
    return this.ctx.mode === "tui";
  }

  private render(): void {
    const icon = this.frames[this.frame % this.frames.length];
    this.ctx.ui.setStatus(this.source, `${icon} ${this.currentMessage}`);
  }

  private sendStatic(): void {
    if (this.sentMessage === this.currentMessage) return;
    this.sentMessage = this.currentMessage;
    this.ctx.ui.setStatus(this.source, this.currentMessage);
  }
}
