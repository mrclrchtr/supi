// Bounded push-publication telemetry for one client's diagnostic state.
//
// Push-only servers can publish one or more results for one document
// synchronization. This tracker records one bounded per-synchronization
// publication summary per diagnostic operation. Events
// carry only bounded server, workspace, relative-file, synchronization
// identity, count, and timing data. They never carry diagnostic payloads or
// source text. Publication counts remain telemetry only.

import {
  recordDebugEvent,
  truncateDebugIdentity as truncateIdentity,
} from "@mrclrchtr/supi-core/debug";
import { boundCwd } from "../debug-telemetry.ts";

/** Maximum tracked synchronizations before the oldest entry is evicted. */
export const MAX_TRACKED_SYNCHRONIZATIONS = 64;

/** Maximum synchronization entries in one bounded publication summary. */
export const MAX_SUMMARY_SYNCHRONIZATIONS = 16;

/** Maximum publication count retained for telemetry; 2 means two or more. */
const MAX_PUBLICATIONS = 2;

/** Bounded identity for one publication telemetry observation. */
export interface DiagnosticPublicationIdentity {
  /** Configured server name. */
  readonly server?: string;
  /** Absolute workspace root. */
  readonly cwd?: string;
  /** Workspace-relative file path; sync-file operations only. */
  readonly file?: string;
}

/** One awaited synchronization of a completed diagnostic operation. */
export interface DiagnosticPublicationSynchronization {
  readonly uri: string;
  readonly synchronizationId: number;
  readonly evidenceRevision: number;
  readonly confirmed: boolean;
}

/** One bounded per-synchronization publication summary entry. */
export interface DiagnosticPublicationSummaryEntry {
  readonly synchronizationId: number;
  readonly publications: number;
  readonly firstReceivedAt: number;
  readonly lastReceivedAt: number;
  readonly confirmed: boolean;
}

interface SynchronizationPublicationState {
  readonly uri: string;
  readonly synchronizationId: number;
  readonly evidenceRevision: number;
  publications: number;
  firstReceivedAt: number;
  lastReceivedAt: number;
}

function synchronizationKey(
  uri: string,
  synchronizationId: number,
  evidenceRevision: number,
): string {
  return `${uri}|${synchronizationId}|${evidenceRevision}`;
}

/** Track bounded push-publication counts for one LSP client. */
export class DiagnosticPublicationTracker {
  readonly #states = new Map<string, SynchronizationPublicationState>();

  constructor(private readonly identity: { server?: string; cwd?: string }) {}

  /**
   * Record one accepted push publication for a synchronization.
   *
   * The state map is bounded to {@link MAX_TRACKED_SYNCHRONIZATIONS}; the
   * oldest tracked synchronization is evicted when the bound is exceeded.
   */
  record(
    uri: string,
    synchronizationId: number,
    evidenceRevision: number,
    receivedAt: number = Date.now(),
  ): void {
    const key = synchronizationKey(uri, synchronizationId, evidenceRevision);
    const existing = this.#states.get(key);
    if (existing) {
      existing.publications = Math.min(existing.publications + 1, MAX_PUBLICATIONS);
      existing.lastReceivedAt = receivedAt;
      return;
    }
    this.#states.set(key, {
      uri,
      synchronizationId,
      evidenceRevision,
      publications: 1,
      firstReceivedAt: receivedAt,
      lastReceivedAt: receivedAt,
    });
    if (this.#states.size > MAX_TRACKED_SYNCHRONIZATIONS) {
      const oldest = this.#states.keys().next().value;
      if (oldest !== undefined) this.#states.delete(oldest);
    }
  }

  /**
   * Emit one bounded per-synchronization publication summary.
   *
   * Synchronizations with no observed push publication are omitted. The
   * caller supplies the confirmation flag; publication counts do not change it.
   */
  emitSummary(options: {
    readonly operation: "refresh-open" | "sync-file";
    readonly identity: DiagnosticPublicationIdentity;
    readonly synchronizations: readonly DiagnosticPublicationSynchronization[];
    readonly operationId?: string;
  }): void {
    const entries: DiagnosticPublicationSummaryEntry[] = [];
    for (const synchronization of options.synchronizations) {
      const state = this.#states.get(
        synchronizationKey(
          synchronization.uri,
          synchronization.synchronizationId,
          synchronization.evidenceRevision,
        ),
      );
      if (!state) continue;
      entries.push({
        synchronizationId: state.synchronizationId,
        publications: state.publications,
        firstReceivedAt: state.firstReceivedAt,
        lastReceivedAt: state.lastReceivedAt,
        confirmed: synchronization.confirmed,
      });
    }
    if (entries.length === 0) return;
    recordDebugEvent({
      operationId: options.operationId,
      source: "lsp",
      level: "debug",
      category: "diagnostics.publication",
      message: "LSP diagnostic publication summary",
      cwd: boundCwd(options.identity.cwd),
      data: {
        operation: options.operation,
        synchronizations: entries.slice(0, MAX_SUMMARY_SYNCHRONIZATIONS),
        ...(options.identity.server !== undefined
          ? { server: truncateIdentity(options.identity.server) }
          : {}),
        ...(options.identity.file !== undefined
          ? { file: truncateIdentity(options.identity.file) }
          : {}),
      },
    });
  }
}
