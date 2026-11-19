// Side-run signal shared over `pi.events`.
//
// A side run is agent work whose result the session will not continue from,
// such as a run on a branch that is abandoned afterwards. Listeners use the
// signal to skip work tied to the run's result, for example prompt suggestions.

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

/** Event emitted on `pi.events` when a side run starts. Payload: {@link SideRunEvent}. */
export const SIDE_RUN_START_EVENT = "supi:side-run:start";

/** Event emitted on `pi.events` when a side run ends. Payload: {@link SideRunEvent}. */
export const SIDE_RUN_END_EVENT = "supi:side-run:end";

/** Payload of {@link SIDE_RUN_START_EVENT} and {@link SIDE_RUN_END_EVENT}. */
export interface SideRunEvent {
  /** Emitting package, such as `supi-debug`. */
  readonly source: string;
}

/**
 * Run `run` as a side run: emit {@link SIDE_RUN_START_EVENT} before it and
 * {@link SIDE_RUN_END_EVENT} after it, also when it throws.
 *
 * After a session replacement or reload the captured `pi` is stale and its
 * `events.emit` throws. That end signal is dropped instead of masking the
 * run's result; listeners reset their side-run state on `session_start` and
 * `session_shutdown`.
 */
export async function runSideRun<T>(
  pi: Pick<ExtensionAPI, "events">,
  source: string,
  run: () => Promise<T>,
): Promise<T> {
  const payload: SideRunEvent = { source };
  pi.events.emit(SIDE_RUN_START_EVENT, payload);
  try {
    return await run();
  } finally {
    try {
      pi.events.emit(SIDE_RUN_END_EVENT, payload);
    } catch {
      // Stale extension instance after session replacement; see JSDoc.
    }
  }
}
