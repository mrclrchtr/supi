// Bounded identity vocabulary for LSP debug telemetry.
//
// LSP debug events can include server, workspace, file, method, and root
// identity for local protocol diagnosis. Each identity string and list uses
// the shared bounds.

import type { CodeRequestControl } from "@mrclrchtr/supi-code-runtime/api";
import { truncateDebugIdentity } from "@mrclrchtr/supi-core/debug";

/** Maximum number of server entries in one bounded LSP debug payload. */
export const MAX_SERVERS = 16;

/**
 * JSON-RPC error code recorded for client-local request timeouts.
 *
 * The JSON-RPC and LSP vocabularies define no timeout code. This constant
 * uses the JSON-RPC implementation-defined error range (-32099..-32000) at a
 * value that vscode-jsonrpc transport codes (-32099, -32098, -32097, -32096,
 * -32002, -32001) and LSP error codes never use.
 */
export const LSP_REQUEST_TIMEOUT_ERROR_CODE = -32_095;

/** Bound an optional workspace root for event-level identity; undefined stays absent. */
export function boundCwd(cwd: string | undefined): string | undefined {
  if (cwd === undefined) return undefined;
  return truncateDebugIdentity(cwd);
}

/** Bound a server-name list to MAX_SERVERS entries, truncating each name. */
export function boundServerNames(names: readonly string[]): string[] {
  return names.slice(0, MAX_SERVERS).map(truncateDebugIdentity);
}

/** Maximum number of distinct methods one batch reports by name. */
const MAX_BATCH_METHODS = 16;
const OTHER_BATCH_METHODS = "other";

/** Completed-request totals for one method of a batch operation. */
export interface RequestTimingTotals {
  readonly count: number;
  readonly totalMs: number;
  readonly maxMs: number;
}

/**
 * Completed-request timings of one batch operation, such as a diagnostic
 * refresh over every open document or a workspace-symbol warm-up pass.
 *
 * A batch sends one request per document. Recording each as its own
 * `request.timing` event fills the Debug buffer with near-identical events, so
 * the transport adds completed requests here instead and the batch's summary
 * event reports them through `snapshot()`. Failed, timed-out, and cancelled
 * requests still record their own event. A request that completes after its
 * batch reported is not recorded.
 */
export class RequestTimingBatch {
  readonly #methods = new Map<string, { count: number; totalMs: number; maxMs: number }>();

  /** Add one completed request. */
  add(method: string, durationMs: number): void {
    const known = this.#methods.has(method) || this.#methods.size < MAX_BATCH_METHODS;
    const key = known ? method : OTHER_BATCH_METHODS;
    const totals = this.#methods.get(key) ?? { count: 0, totalMs: 0, maxMs: 0 };
    const elapsed = Number.isFinite(durationMs) ? Math.max(0, durationMs) : 0;
    totals.count++;
    totals.totalMs += elapsed;
    totals.maxMs = Math.max(totals.maxMs, elapsed);
    this.#methods.set(key, totals);
  }

  /** Totals by method, or `undefined` when no request completed. */
  snapshot(): Record<string, RequestTimingTotals> | undefined {
    if (this.#methods.size === 0) return undefined;
    return Object.fromEntries(
      Array.from(this.#methods, ([method, totals]) => [
        method,
        {
          count: totals.count,
          totalMs: roundDuration(totals.totalMs),
          maxMs: roundDuration(totals.maxMs),
        },
      ]),
    );
  }
}

/** Request control that also routes completed-request timings into a batch. */
export interface BatchedRequestControl extends CodeRequestControl {
  /** Collects completed request timings instead of one event per request. */
  readonly requestTimings?: RequestTimingBatch;
}

function roundDuration(value: number): number {
  return Math.round(value * 10) / 10;
}
