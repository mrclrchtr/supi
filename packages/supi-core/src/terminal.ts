/**
 * Shared terminal title formatting and signaling utilities.
 *
 * Centralized place for pi title convention (π prefix), completion (✓)
 * and waiting (●) indicators, and the audible terminal bell.
 */
import path from "node:path";

/** Unicode checkmark shown when the agent finishes a turn. */
export const DONE_SYMBOL = "\u2713";
/** Unicode dot shown when waiting for user input. */
export const WAITING_SYMBOL = "\u25CF";

/** Minimal UI surface needed for title operations. */
export interface TitleTarget {
  ui: {
    setTitle?(title: string): void;
  };
}

/**
 * Format pi's canonical terminal title from session name and cwd.
 * Falls back gracefully when either is missing.
 *
 * @example
 *   formatTitle("my-session", "/home/projects/foo")  // "π - my-session - foo"
 *   formatTitle(undefined, "/home/projects/foo")      // "π - foo"
 *   formatTitle("my-session")                         // "π - my-session"
 *   formatTitle()                                     // "π"
 */
export function formatTitle(sessionName?: string, cwd?: string): string {
  const base = cwd ? path.basename(cwd) : undefined;
  if (sessionName && base) return `π - ${sessionName} - ${base}`;
  if (sessionName) return `π - ${sessionName}`;
  if (base) return `π - ${base}`;
  return "π";
}

/** Sound the audible terminal bell (ASCII BEL). */
export function signalBell(): void {
  process.stdout.write("\x07");
}

/**
 * Set the terminal title to indicate the agent is waiting for user input.
 * Prefixes with ● and sounds the terminal bell.
 */
export function signalWaiting(ctx: TitleTarget, title: string): void {
  ctx.ui.setTitle?.(`${WAITING_SYMBOL}  ${title}`);
  signalBell();
}

/**
 * Set the terminal title to indicate the agent turn has completed.
 * Prefixes with ✓ and sounds the terminal bell.
 */
export function signalDone(ctx: TitleTarget, title: string): void {
  ctx.ui.setTitle?.(`${DONE_SYMBOL} ${title}`);
  signalBell();
}
