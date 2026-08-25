// Bounded push-publication telemetry for one client's diagnostic state.
//
// Push-only servers can publish an early result and a later semantic result
// for one document synchronization (ADR 0021). This tracker records one
// bounded per-synchronization publication summary per diagnostic operation
// and one ambient event when a later publication promotes a synchronization
// that an earlier operation already reported unconfirmed. Events carry only
// bounded server, workspace, relative-file, synchronization identity, count,
// and timing data. They never carry diagnostic payloads or source text.

import * as path from "node:path";
import { recordDebugEvent } from "@mrclrchtr/supi-core/debug";
import { boundCwd, truncateIdentity } from "../debug-telemetry.ts";
import { uriToFile } from "../utils.ts";

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
  /** When a finished operation first reported this synchronization unconfirmed. */
  unconfirmedAt?: number;
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

  constructor(
    private readonly identity: { server?: string; cwd?: string },
    private readonly fileFor: (uri: string) => string | undefined,
  ) {}

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
   * Synchronizations with no observed push publication are omitted. A
   * synchronization that ends unconfirmed is marked so a later promotion can
   * emit the ambient late-republish event.
   */
  emitSummary(options: {
    readonly operation: "refresh-open" | "sync-file";
    readonly identity: DiagnosticPublicationIdentity;
    readonly synchronizations: readonly DiagnosticPublicationSynchronization[];
    readonly operationId?: string;
  }): void {
    const entries: DiagnosticPublicationSummaryEntry[] = [];
    const now = Date.now();
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
      if (!synchronization.confirmed) state.unconfirmedAt ??= now;
      else state.unconfirmedAt = undefined;
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

  /**
   * Observe one promotion of a synchronization by a later publication.
   *
   * The ambient late-republish event fires only when a finished operation
   * previously reported the synchronization unconfirmed. The mark is cleared
   * so one promotion emits at most one event.
   */
  promoted(
    uri: string,
    synchronizationId: number,
    evidenceRevision: number,
    receivedAt: number = Date.now(),
  ): void {
    const state = this.#states.get(synchronizationKey(uri, synchronizationId, evidenceRevision));
    const unconfirmedAt = state?.unconfirmedAt;
    if (!state || state.publications < 2 || unconfirmedAt === undefined) return;
    state.unconfirmedAt = undefined;
    const file = this.fileFor(uri);
    recordDebugEvent({
      source: "lsp",
      level: "debug",
      category: "diagnostics.publication",
      message: "LSP diagnostic late republish",
      cwd: boundCwd(this.identity.cwd),
      data: {
        synchronizationId,
        publications: state.publications,
        receivedAt,
        delayMs: Math.max(0, receivedAt - unconfirmedAt),
        ...(this.identity.server !== undefined
          ? { server: truncateIdentity(this.identity.server) }
          : {}),
        ...(file !== undefined ? { file: truncateIdentity(file) } : {}),
      },
    });
  }
}

/** Return a workspace-relative diagnostic file path for telemetry identity. */
export function trackerFileIdentityFor(
  cwd: string | undefined,
): (uri: string) => string | undefined {
  return (uri) => {
    if (cwd === undefined) return undefined;
    return path.relative(cwd, path.resolve(cwd, uriToFile(uri)));
  };
}
