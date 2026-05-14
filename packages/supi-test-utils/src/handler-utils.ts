/**
 * Shared test utilities for accessing registered pi event handlers.
 *
 * Handlers registered via `pi.on()` are stored as `Map<string, handler[]>`.
 * These helpers provide typed access and throw on not-found to avoid
 * non-null assertions that Biome prohibits.
 */

import type { PiMock } from "./pi-mock.ts";

type Handler = (...args: unknown[]) => unknown;

/**
 * Returns the first handler for an event, or undefined if none registered.
 * Use with optional call: `await handler?.(event, ctx)`.
 *
 * @example
 * ```ts
 * const handler = getHandler(pi, "message_end");
 * await handler?.(event, ctx);
 * ```
 */
export function getHandler(pi: PiMock, event: string): Handler | undefined {
  return pi.getHandlers(event)[0];
}

/**
 * Returns the first handler for an event, or throws if none registered.
 * Use when the handler must exist (test setup guarantee).
 *
 * @example
 * ```ts
 * const handler = getHandlerOrThrow(pi, "message_end");
 * await handler(event, ctx);
 * ```
 */
export function getHandlerOrThrow(pi: PiMock, event: string): Handler {
  const handlers = pi.getHandlers(event);
  if (handlers.length === 0) {
    throw new Error(`Handler for "${event}" not registered`);
  }
  return handlers[0];
}
