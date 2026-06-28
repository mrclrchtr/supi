/**
 * Lightweight status-bar spinner for SuPi extensions.
 *
 * Manages a setInterval-based animated spinner that writes to
 * `ctx.ui.setStatus`.  Each tick advances the frame and re-renders
 * with the current message.
 *
 * @module
 */

import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { BRAILLE_SPINNER_FRAMES, SPINNER_INTERVAL_MS } from "./spinner-frames.ts";

/**
 * Manages an animated braille spinner on the status bar.
 *
 * Usage:
 * ```ts
 * const spinner = new StatusSpinner(ctx, "my-package");
 * spinner.start("generating…");
 * // later
 * spinner.stop();
 * ```
 */
export class StatusSpinner {
  private interval: ReturnType<typeof setInterval> | null = null;
  private frame = 0;
  private currentMessage = "";

  constructor(
    private ctx: ExtensionContext,
    private source: string,
    private frames: readonly string[] = BRAILLE_SPINNER_FRAMES,
  ) {}

  /** Start the spinner with the given message. Overwrites any active spinner. */
  start(message: string): void {
    this.stop();
    this.currentMessage = message;
    this.render();

    this.interval = setInterval(() => {
      this.frame++;
      this.render();
    }, SPINNER_INTERVAL_MS);
  }

  /** Update the display message without resetting the spinner. */
  update(message: string): void {
    this.currentMessage = message;
  }

  /** Stop the spinner and clear the status. */
  stop(): void {
    if (this.interval !== null) {
      clearInterval(this.interval);
      this.interval = null;
    }
    this.ctx.ui.setStatus(this.source, "");
  }

  // ── Private ──────────────────────────────────────────────────────────

  private render(): void {
    const icon = this.frames[this.frame % this.frames.length];
    this.ctx.ui.setStatus(this.source, `${icon} ${this.currentMessage}`);
  }
}
