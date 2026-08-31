// LSP Manager — server pool with lazy spawning and diagnostic collection.
// biome-ignore-all lint/style/noExcessiveLinesPerFile: LspManager stays cohesive; recovery and sync helpers are split into manager-*.ts modules.
import * as fs from "node:fs";
import * as path from "node:path";
import {
  type CodeQueryResult,
  type CodeRequestControl,
  isCodeRequestInterruption,
  throwIfCodeRequestInterrupted,
  unavailableCodeQuery,
} from "@mrclrchtr/supi-code-runtime/api";
import * as projectRoots from "@mrclrchtr/supi-core/project";
import * as ts from "typescript";
import {
  LspClient,
  type LspClientLifecycleTransitionKind,
  RECOVERY_CLIENT_STARTUP_BOUND_MS,
  withTimeout,
} from "../client/client.ts";
import type { ClientDiagnosticSnapshot } from "../client/client-document-state.ts";

export { RECOVERY_CLIENT_STARTUP_BOUND_MS } from "../client/client.ts";

import {
  recordDebugEvent,
  truncateDebugIdentity as truncateIdentity,
} from "@mrclrchtr/supi-core/debug";
import { resolveToolPath as resolveSessionPath, uriToFile } from "@mrclrchtr/supi-core/path";
import { getServerForFile } from "../config/config.ts";
import {
  getFileScopeDecision,
  invalidateTsconfigCacheForConfig,
  invalidateTsconfigCacheForConfigDir,
  isProjectConfigFileName,
} from "../config/tsconfig-scope.ts";
import type {
  DetectedProjectServer,
  Diagnostic,
  FileEvent,
  LspConfig,
  ProjectServerInfo,
  ProjectServerStatusReason,
  ServerConfig,
  SymbolInformation,
  WorkspaceSymbol,
} from "../config/types.ts";
import { FileChangeType } from "../config/types.ts";
import { boundCwd } from "../debug-telemetry.ts";
import {
  accumulateOutstandingDiagnostics,
  collectDiagnosticSummaryCounts,
  createOutstandingDiagnosticSummary,
  relativeFilePathFromUri,
} from "../diagnostics/diagnostic-summary.ts";
import {
  type DiagnosticEvidenceDocument,
  type DiagnosticEvidenceSummary,
  summarizeDiagnosticEvidence,
} from "../diagnostics/evidence.ts";
import {
  scanWorkspaceSentinels as scanAutomaticWorkspaceSentinels,
  syncWorkspaceSentinelSnapshot as syncAutomaticWorkspaceSentinelSnapshot,
  type WorkspaceSentinelScanOptions,
  type WorkspaceSentinelSyncResult,
} from "../diagnostics/workspace-sentinels.ts";
import { raceRequestControl } from "../session/readiness.ts";
import {
  emptyProcessCrashRecoverySummary,
  type ProcessCrashRecoverySummary,
  type ScopeDecisionEntry,
  type ScopeDecisionSummary,
  type WorkspaceDiagnosticReport,
} from "../session/runtime-diagnostics.ts";
import {
  displayRelativeFilePath,
  formatCoverageSummaryText,
  formatOutstandingDiagnosticsSummaryText,
  isPathRelevant,
  normalizeRelevantPaths,
  shouldIgnoreLspPath,
} from "../summary.ts";
import { commandExists } from "../utils.ts";
import {
  type AutomaticLspPathPolicy,
  createDefaultAutomaticLspPathPolicy,
} from "../workspace-path-policy.ts";
import {
  closeFileAcrossClients,
  pruneMissingFilesFromClients,
  refreshOpenDiagnosticsForClients,
} from "./manager-client-state.ts";
import {
  collectOutstandingDiagnosticsDetailed,
  syncClientFileAndGetDiagnostics,
} from "./manager-diagnostics.ts";
import { clientKey, rememberKnownRoot, resolveRootForFile } from "./manager-helpers.ts";
import { buildProjectServerInfo } from "./manager-project-info.ts";
import type {
  ActiveCoverageSummaryEntry,
  CoverageSummaryEntry,
  DiagnosticSummary,
  ManagerStatus,
  OutstandingDiagnosticSummaryEntry,
  ServerStatus,
} from "./manager-types.ts";
import {
  recoverWorkspaceDiagnostics as recoverWorkspaceDiagnosticsImpl,
  type WorkspaceRecoveryResult,
} from "./manager-workspace-recovery.ts";
import {
  collectWorkspaceSymbols,
  findWorkspaceSymbolWarmTargets,
  getWorkspaceSymbolWarmPosition,
  type WorkspaceSymbolCollection,
  workspaceSymbolCollectionResult,
} from "./manager-workspace-symbol.ts";

type UnavailableReason = "missing-command" | "start-failed" | "runtime-error";

/** Maximum tracked-file entries retained in one scope-decision telemetry summary. */
const SCOPE_DECISION_MAX_ENTRIES = 24;

interface ScopeDecisionAccumulator {
  entries: ScopeDecisionEntry[];
  counts: ScopeDecisionSummary["counts"];
  basisCounts: Record<string, number>;
}

function accumulateScopeDecision(
  accumulator: ScopeDecisionAccumulator,
  file: string,
  decision: ReturnType<typeof getFileScopeDecision>,
): void {
  const statusKey =
    decision.status === "no-config"
      ? "noConfig"
      : decision.status === "out-of-tree"
        ? "outOfTree"
        : decision.status;
  accumulator.counts[statusKey]++;
  if (decision.basis) {
    accumulator.basisCounts[decision.basis] = (accumulator.basisCounts[decision.basis] ?? 0) + 1;
  }
  if (accumulator.entries.length < SCOPE_DECISION_MAX_ENTRIES) {
    accumulator.entries.push({ file, status: decision.status, basis: decision.basis });
  }
}

type FileRoute = {
  serverName: string;
  serverConfig: ServerConfig;
  root: string;
  key: string;
};

type ClientRestartResult = {
  key: string;
  serverName: string;
  files: string[];
  restarted: boolean;
};

export type ManagerLifecycleTransitionKind = LspClientLifecycleTransitionKind | "recovery";

/** Package-internal aggregate lifecycle snapshot for the runtime controller. */
export interface ManagerLifecycleTransition {
  readonly kind: ManagerLifecycleTransitionKind;
  readonly semanticReady: boolean;
  readonly projectServers: readonly ProjectServerInfo[];
}

type ManagerLifecycleListener = (transition: ManagerLifecycleTransition) => void;

type FileClientRequestOptions = {
  /** Allow this request to start the route's one process-crash recovery. */
  recoverProcessCrash?: boolean;
  /** Control only this caller's wait for a shared replacement. */
  control?: CodeRequestControl;
};

interface FileReadinessResult {
  client: LspClient | null;
  processCrashRecovery: ProcessCrashRecoverySummary;
}

interface ProcessCrashRecoveryState {
  /** The one automatic attempt is consumed when a replacement starts. */
  attemptConsumed: boolean;
  /** Current user-facing reason, or undefined after successful recovery. */
  statusReason: ProjectServerStatusReason | undefined;
  /** The failed generation whose tracked files must be restored. */
  failedClient: LspClient;
  /** Files tracked by the failed route at the time of the crash. */
  files: string[];
  /** Shared replacement startup and document-restoration operation. */
  pending: Promise<LspClient | null> | null;
  /** Start time for the current replacement attempt, when one exists. */
  attemptStartedAt?: number;
}

type ProcessCrashRecoveryOutcome = "attempt" | "success" | "failure" | "exhausted" | "cancelled";

type ProcessCrashDemandResult = {
  /** Whether at least one required crashed route supports the operation. */
  hasSupport: boolean;
  /** Separate route-level result for this explicit process-crash demand. */
  processCrashRecovery: ProcessCrashRecoverySummary;
  /** Required routes that remain unavailable after shared recovery settles. */
  failures: string[];
  /** In-scope tracked files from required routes that remain unavailable. */
  failedFiles: string[];
};

type RequiredProcessCrashDemand = {
  key: string;
  recovery: ProcessCrashRecoveryState;
  failedFiles: readonly string[];
};

type ProcessCrashRecoveryRouteOutcome = "pending" | "recovered" | "failed";

function summarizeProcessCrashRecoveryRoutes(
  outcomes: Iterable<ProcessCrashRecoveryRouteOutcome>,
): ProcessCrashRecoverySummary {
  const summary = emptyProcessCrashRecoverySummary();
  for (const outcome of outcomes) {
    summary.attemptedRoutes++;
    if (outcome === "recovered") summary.recoveredRoutes++;
    if (outcome === "failed") summary.failedRoutes++;
  }
  return summary;
}

// ── LspManager ────────────────────────────────────────────────────────
export class LspManager {
  /** Active clients keyed by "serverName:root" */
  private clients = new Map<string, LspClient>();
  /** Per-root startup failures keyed by "serverName:root" */
  private unavailable = new Map<string, UnavailableReason>();
  /** Memoized per-command availability of LSP server binaries on PATH */
  private commandAvailability = new Map<string, boolean>();
  /** Guards against concurrent client creation for the same server:root key. */
  private pendingStarts = new Map<string, Promise<LspClient | null>>();
  /** Shared diagnostic-recovery restart for each replaceable client route. */
  private pendingRestarts = new Map<string, Promise<{ files: string[]; restarted: boolean }>>();
  /** Monotonic ownership generation for each replaceable client route. */
  private clientGenerations = new Map<string, number>();
  /** Preferred project roots discovered by proactive scan or lazy startup */
  private knownRoots = new Map<string, string[]>();
  /** Monotonic workspace invalidation generation advanced by each invalidation event. */
  private invalidationEpoch = 0;
  /** Invalidation generation in which each route last received a recovery restart. */
  private recoveryRestartEpochs = new Map<string, number>();
  /** Project roots already warmed for workspace-symbol queries. */
  private warmedWorkspaceSymbolProjects = new Set<string>();
  /** Project roots whose semantic state was warmed with a readiness probe. */
  private warmedSemanticProjects = new Set<string>();
  /** In-flight warm-up probes keyed by project key so concurrent callers share one probe. */
  private pendingWarmProbes = new Map<string, Promise<void>>();
  /** One process-crash recovery budget and shared replacement per route. */
  private processCrashRecoveries = new Map<string, ProcessCrashRecoveryState>();
  /** Client generations that completed the initialize handshake. */
  private initializedClientGenerations = new Map<string, number>();
  /** Client generations whose process-failure fact was already handled. */
  private handledCrashGenerations = new Map<string, number>();
  /** Prevent late startup and lifecycle callbacks from republishing after shutdown. */
  private shuttingDown = false;
  constructor(
    private readonly config: LspConfig,
    private readonly cwd: string,
    private readonly onLifecycleTransition?: ManagerLifecycleListener,
    private readonly automaticPathPolicy: AutomaticLspPathPolicy = createDefaultAutomaticLspPathPolicy(
      cwd,
    ),
  ) {}
  getCwd(): string {
    return this.cwd;
  }

  // ── Public API ────────────────────────────────────────────────────
  registerDetectedServers(detected: DetectedProjectServer[]): void {
    this.knownRoots = projectRoots.buildKnownRootsMap(
      detected.filter((entry) => this.automaticPathPolicy.isEligible(entry.root, "directory")),
    );
  }
  /** Check whether a file path has an available LSP server for explicit semantic operations. */
  canServeFile(filePath: string): boolean {
    const route = this.resolveFileRoute(filePath);
    if (!route) return false;
    if (this.getUnavailableReason(route.key, route.serverConfig.command)) return false;
    return this.isServerCommandAvailable(route.serverConfig.command);
  }

  /**
   * Return the consumed process-crash outcome for a file readiness result.
   * The result supports unavailable and non-resolved waits; it is null before
   * an attempt is consumed and after successful recovery, so old success is
   * not reported as a new outcome. This is a passive read and never starts
   * recovery.
   */
  getProcessCrashRecoverySummaryForFile(filePath: string): ProcessCrashRecoverySummary | null {
    const route = this.resolveFileRoute(resolveSessionPath(this.cwd, filePath));
    const recovery = route ? this.processCrashRecoveries.get(route.key) : undefined;
    if (!recovery?.attemptConsumed || recovery.statusReason === undefined) return null;

    const outcome: ProcessCrashRecoveryRouteOutcome =
      recovery.statusReason === "process-crash-recovery-exhausted" ? "failed" : "pending";
    return summarizeProcessCrashRecoveryRoutes([outcome]);
  }

  /**
   * Check whether a file should participate in automatic LSP work.
   * This is stricter than {@link canServeFile} and applies the workspace path
   * policy plus tsconfig diagnostic suppression.
   */
  isSupportedSourceFile(filePath: string): boolean {
    if (!this.isAutomaticScopePath(filePath)) return false;
    return this.canServeFile(filePath);
  }

  /** Inventory automatic workspace sentinel and source paths with the runtime policy. */
  scanWorkspaceSentinels(options: WorkspaceSentinelScanOptions = {}): Map<string, number> {
    return scanAutomaticWorkspaceSentinels(this.cwd, {
      ...options,
      policy: this.automaticPathPolicy,
    });
  }

  /** Refresh the automatic workspace inventory with the runtime policy. */
  syncWorkspaceSentinelSnapshot(
    previous: Map<string, number>,
    options: WorkspaceSentinelScanOptions = {},
  ): WorkspaceSentinelSyncResult {
    return syncAutomaticWorkspaceSentinelSnapshot(this.cwd, previous, {
      ...options,
      policy: this.automaticPathPolicy,
    });
  }

  /** Apply automatic path exclusions plus diagnostic tsconfig suppression. */
  private isAutomaticScopePath(filePath: string): boolean {
    return !shouldIgnoreLspPath(filePath, this.cwd, this.automaticPathPolicy);
  }

  private isServerCommandAvailable(command: string): boolean {
    // Only memoize positive lookups. A negative result may become stale if the
    // user installs the binary mid-session (e.g. `mise install`), and
    // getClientForFile calls commandExists directly — caching false here would
    // leave runtime guidance permanently dormant while client spawning can
    // still succeed.
    if (this.commandAvailability.get(command) === true) return true;
    const available = commandExists(command);
    if (available) this.commandAvailability.set(command, true);
    return available;
  }

  private getUnavailableReason(key: string, command?: string): UnavailableReason | null {
    const reason = this.unavailable.get(key);
    if (!reason) return null;

    if (reason === "missing-command" && command && this.isServerCommandAvailable(command)) {
      this.unavailable.delete(key);
      return null;
    }

    return reason;
  }

  /** Return the open document version without starting a server. */
  getOpenDocumentVersion(filePath: string): number | null {
    const resolvedPath = resolveSessionPath(this.cwd, filePath);
    return (
      this.getExistingClientForFile(resolvedPath)?.getOpenDocumentVersion(resolvedPath) ?? null
    );
  }

  /** Get or create an LSP client for the given file. */
  async getClientForFile(
    filePath: string,
    options: FileClientRequestOptions = {},
  ): Promise<LspClient | null> {
    throwIfCodeRequestInterrupted(options.control);
    if (this.shuttingDown) return null;
    const route = this.resolveFileRoute(filePath);
    if (!route) return null;

    const recovery = this.processCrashRecoveries.get(route.key);
    if (recovery && (recovery.pending || recovery.statusReason)) {
      if (!options.recoverProcessCrash) return null;
      return this.acquireProcessCrashReplacement(recovery, route, options.control);
    }
    // A recovered route keeps its consumed budget but has no active reason.
    // Passive callers can use its running client normally.

    return this.startServerForRoot(route.serverName, route.root);
  }
  async startServerForRoot(serverName: string, root: string): Promise<LspClient | null> {
    if (this.shuttingDown) return null;
    const serverConfig = this.config.servers[serverName];
    if (!serverConfig) return null;
    const key = clientKey(serverName, root);
    if (this.getUnavailableReason(key, serverConfig.command)) return null;

    // Return existing client
    const existing = this.clients.get(key);
    if (existing && existing.status === "running") return existing;

    // A crashed route is retained until evidence demand starts its shared
    // replacement. Proactive starts must not consume that budget.
    if (existing && existing.status === "error" && this.processCrashRecoveries.has(key)) {
      return null;
    }

    // If existing client errored, remove it
    if (existing && existing.status === "error") {
      this.clients.delete(key);
      this.unavailable.set(key, "runtime-error");
      this.clearWarmedWorkspaceSymbolProjects(existing.name, existing.root);
      this.clearWarmedSemanticProjects(existing.name, existing.root);
      this.clearPendingWarmProbes(existing.name, existing.root);
      return null;
    }

    // Deduplicate concurrent starts for the same server:root pair.
    // This prevents spawning duplicate server processes when two
    // callers race through getClientForFile before either await yields.
    const pending = this.pendingStarts.get(key);
    if (pending) return pending;

    const startPromise = this.performStart(serverName, serverConfig, root, key);
    this.pendingStarts.set(key, startPromise);
    try {
      return await startPromise;
    } finally {
      if (this.pendingStarts.get(key) === startPromise) {
        this.pendingStarts.delete(key);
      }
    }
  }

  private createClient(
    serverName: string,
    serverConfig: ServerConfig,
    root: string,
    key: string,
  ): LspClient {
    const generation = (this.clientGenerations.get(key) ?? 0) + 1;
    this.clientGenerations.set(key, generation);
    let client: LspClient;
    client = new LspClient(
      serverName,
      serverConfig,
      root,
      (kind) => {
        this.handleClientLifecycle(key, generation, client, kind);
      },
      this.cwd,
    );
    return client;
  }

  private handleClientLifecycle(
    key: string,
    generation: number,
    client: LspClient,
    kind: LspClientLifecycleTransitionKind,
  ): void {
    if (this.shuttingDown) return;
    if (this.clientGenerations.get(key) !== generation) return;
    if (this.clients.get(key) !== client) return;

    if (kind === "startup") {
      this.initializedClientGenerations.set(key, generation);
    }
    if (kind === "crash") {
      if (this.handledCrashGenerations.get(key) === generation) return;
      this.handledCrashGenerations.set(key, generation);
      if (this.initializedClientGenerations.get(key) === generation) {
        this.handleInitializedClientCrash(key, client);
      }
    }

    const aggregateKind =
      kind === "readiness" && generation > 1 && client.ready ? "recovery" : kind;
    this.publishLifecycle(aggregateKind);
  }

  private handleInitializedClientCrash(key: string, client: LspClient): void {
    const existing = this.processCrashRecoveries.get(key);
    if (existing?.attemptConsumed) {
      existing.failedClient = client;
      existing.files = this.trackedFilesForClient(client);
      this.unavailable.set(key, "runtime-error");
      if (existing.statusReason !== "process-crash-recovery-exhausted") {
        existing.statusReason = "process-crash-recovery-exhausted";
        this.recordProcessCrashRecoveryEvent(
          client.name,
          client.root,
          "exhausted",
          existing.pending ? existing.attemptStartedAt : Date.now(),
        );
      }
      return;
    }

    this.processCrashRecoveries.set(key, {
      attemptConsumed: false,
      statusReason: "process-crashed",
      failedClient: client,
      files: this.trackedFilesForClient(client),
      pending: null,
    });
  }

  private trackedFilesForClient(client: LspClient): string[] {
    const files = new Set(client.openFiles);
    for (const document of client.getDiagnosticSnapshot().documents) {
      files.add(uriToFile(document.uri));
    }
    return Array.from(files);
  }

  private waitForProcessCrashRecovery(
    recovery: ProcessCrashRecoveryState,
    control?: CodeRequestControl,
  ): Promise<LspClient | null> {
    if (!recovery.pending) return Promise.resolve(null);
    return raceRequestControl(recovery.pending, control);
  }

  private acquireProcessCrashReplacement(
    recovery: ProcessCrashRecoveryState,
    route: FileRoute,
    control?: CodeRequestControl,
  ): Promise<LspClient | null> {
    if (recovery.pending) return this.waitForProcessCrashRecovery(recovery, control);
    if (
      recovery.statusReason === "process-crashed" &&
      !recovery.attemptConsumed &&
      !this.shuttingDown
    ) {
      return this.startProcessCrashRecovery(recovery, route, control);
    }
    return Promise.resolve(null);
  }

  /**
   * Recover all crashed routes selected by one evidence-producing operation.
   * Each route keeps its independent attempt budget and shared replacement.
   */
  private async recoverProcessCrashDemand(
    selectFiles: (recovery: ProcessCrashRecoveryState) => readonly string[] | null,
    control?: CodeRequestControl,
  ): Promise<ProcessCrashDemandResult> {
    const required = Array.from(this.processCrashRecoveries.entries()).flatMap(
      ([key, recovery]): RequiredProcessCrashDemand[] => {
        if (recovery.statusReason === undefined) return [];
        const failedFiles = selectFiles(recovery);
        return failedFiles === null ? [] : [{ key, recovery, failedFiles }];
      },
    );
    if (required.length === 0) {
      return {
        hasSupport: false,
        processCrashRecovery: emptyProcessCrashRecoverySummary(),
        failures: [],
        failedFiles: [],
      };
    }

    await Promise.all(
      required.map(async ({ key, recovery }) => {
        const serverConfig = this.config.servers[recovery.failedClient.name];
        if (!serverConfig) return;
        await this.acquireProcessCrashReplacement(
          recovery,
          {
            serverName: recovery.failedClient.name,
            serverConfig,
            root: recovery.failedClient.root,
            key,
          },
          control,
        );
      }),
    );

    const failedDemands = required.filter(({ recovery }) => recovery.statusReason !== undefined);
    const outcomes = required.map(
      ({ recovery }): ProcessCrashRecoveryRouteOutcome =>
        recovery.statusReason === undefined ? "recovered" : "failed",
    );
    return {
      hasSupport: true,
      processCrashRecovery: summarizeProcessCrashRecoveryRoutes(outcomes),
      failures: failedDemands.map(({ recovery }) => this.formatProcessCrashDemandFailure(recovery)),
      failedFiles: Array.from(new Set(failedDemands.flatMap(({ failedFiles }) => failedFiles))),
    };
  }

  private formatProcessCrashDemandFailure(recovery: ProcessCrashRecoveryState): string {
    const root = (path.relative(this.cwd, recovery.failedClient.root) || ".").replaceAll("\\", "/");
    const reason =
      recovery.statusReason === "process-crash-recovery-exhausted"
        ? "process recovery exhausted; reload required"
        : recovery.statusReason === "process-crash-recovery-pending"
          ? "process recovery in progress"
          : "process crashed";
    return `${recovery.failedClient.name} @ ${root} is unavailable — ${reason}.`;
  }

  private startProcessCrashRecovery(
    recovery: ProcessCrashRecoveryState,
    route: FileRoute,
    control?: CodeRequestControl,
  ): Promise<LspClient | null> {
    throwIfCodeRequestInterrupted(control);
    recovery.attemptConsumed = true;
    recovery.statusReason = "process-crash-recovery-pending";
    recovery.attemptStartedAt = Date.now();
    const pending = this.performProcessCrashRecovery(recovery, route);
    recovery.pending = pending;
    // A cancelled caller may be the only current waiter. Keep the shared
    // replacement promise observed until it settles without adopting that
    // caller's cancellation or deadline.
    pending.catch(() => {});
    this.recordProcessCrashRecoveryEvent(
      route.serverName,
      route.root,
      "attempt",
      recovery.attemptStartedAt,
    );
    this.publishLifecycle("recovery");
    return raceRequestControl(pending, control);
  }

  private async performProcessCrashRecovery(
    recovery: ProcessCrashRecoveryState,
    route: FileRoute,
  ): Promise<LspClient | null> {
    const key = route.key;
    const attemptStartedAt = recovery.attemptStartedAt;

    try {
      // A process-error event can leave the child alive. Stop the old tree
      // before installing its replacement, but retain its captured evidence.
      await recovery.failedClient.forceKill().catch(() => {});
      if (this.isProcessCrashRecoveryCancelled(recovery, key)) {
        this.recordProcessCrashRecoveryEvent(
          route.serverName,
          route.root,
          "cancelled",
          attemptStartedAt,
        );
        return null;
      }

      const replacement = this.installProcessCrashReplacement(recovery, route);
      const started = await this.startProcessCrashReplacement(recovery, route, replacement);
      if (!started) return null;

      // A replacement can crash after initialize and before this operation
      // resumes. Its lifecycle callback has already exhausted the route.
      if (
        started.status !== "running" ||
        recovery.statusReason === "process-crash-recovery-exhausted"
      ) {
        return null;
      }

      this.unavailable.delete(key);
      recovery.statusReason = undefined;
      this.publishLifecycle("recovery");
      this.restoreTrackedDocuments(started, recovery.files);
      this.recordProcessCrashRecoveryEvent(
        route.serverName,
        route.root,
        "success",
        attemptStartedAt,
      );
      return started;
    } finally {
      if (this.processCrashRecoveries.get(key) === recovery) recovery.pending = null;
    }
  }

  private isProcessCrashRecoveryCancelled(
    recovery: ProcessCrashRecoveryState,
    key: string,
  ): boolean {
    return this.shuttingDown || this.processCrashRecoveries.get(key) !== recovery;
  }

  private installProcessCrashReplacement(
    recovery: ProcessCrashRecoveryState,
    route: FileRoute,
  ): LspClient {
    const key = route.key;
    if (this.clients.get(key) === recovery.failedClient) this.clients.delete(key);
    this.clearWarmedWorkspaceSymbolProjects(route.serverName, route.root);
    this.clearWarmedSemanticProjects(route.serverName, route.root);
    this.clearPendingWarmProbes(route.serverName, route.root);

    const replacement = this.createClient(route.serverName, route.serverConfig, route.root, key);
    this.clients.set(key, replacement);
    rememberKnownRoot(this.knownRoots, route.serverName, route.root);
    return replacement;
  }

  private async startProcessCrashReplacement(
    recovery: ProcessCrashRecoveryState,
    route: FileRoute,
    replacement: LspClient,
  ): Promise<LspClient | null> {
    try {
      // LspClient's initialize request already has the 30-second transport
      // bound. Do not apply the 5-second diagnostic-restart bound here.
      await replacement.start();
    } catch {
      if (this.isProcessCrashRecoveryCancelled(recovery, route.key)) {
        await replacement.forceKill().catch(() => {});
        this.recordProcessCrashRecoveryEvent(
          route.serverName,
          route.root,
          "cancelled",
          recovery.attemptStartedAt,
        );
        return null;
      }
      if (recovery.statusReason !== "process-crash-recovery-exhausted") {
        this.markProcessCrashRecoveryFailed(recovery, route.key, replacement);
        this.recordProcessCrashRecoveryEvent(
          route.serverName,
          route.root,
          "failure",
          recovery.attemptStartedAt,
        );
      }
      return null;
    }

    if (
      this.isProcessCrashRecoveryCancelled(recovery, route.key) ||
      this.clients.get(route.key) !== replacement
    ) {
      await replacement.forceKill().catch(() => {});
      this.recordProcessCrashRecoveryEvent(
        route.serverName,
        route.root,
        "cancelled",
        recovery.attemptStartedAt,
      );
      return null;
    }
    return replacement;
  }

  /** Restore route documents from disk and retain failed-document evidence. */
  private restoreTrackedDocuments(client: LspClient, files: readonly string[]): void {
    const failedFiles: string[] = [];
    for (const filePath of files) {
      if (!fs.existsSync(filePath)) {
        failedFiles.push(filePath);
        continue;
      }
      try {
        client.didOpen(filePath, fs.readFileSync(filePath, "utf-8"));
      } catch {
        failedFiles.push(filePath);
      }
    }
    for (const filePath of failedFiles) client.markFailedFile(filePath);
  }

  private markProcessCrashRecoveryFailed(
    recovery: ProcessCrashRecoveryState,
    key: string,
    replacement: LspClient,
  ): void {
    recovery.statusReason = "process-crash-recovery-exhausted";
    this.unavailable.set(key, "start-failed");
    if (this.clients.get(key) === replacement) this.clients.delete(key);
    // A failed initialize may still leave a child process alive. The
    // replacement is no longer owned by the manager before it is terminated.
    void replacement.forceKill().catch(() => {});
    this.publishLifecycle("recovery");
  }

  private recordProcessCrashRecoveryEvent(
    serverName: string,
    root: string,
    outcome: ProcessCrashRecoveryOutcome,
    startedAt?: number,
  ): void {
    try {
      recordDebugEvent({
        source: "lsp",
        level: outcome === "failure" || outcome === "exhausted" ? "warning" : "debug",
        category: "runtime.recovery",
        message: `LSP process-crash recovery ${outcome}`,
        cwd: boundCwd(this.cwd),
        data: {
          reason: "process-crash",
          outcome,
          server: truncateIdentity(serverName),
          root: truncateIdentity(root),
          elapsedMs: startedAt === undefined ? 0 : Math.max(0, Date.now() - startedAt),
        },
      });
    } catch {
      // Recovery telemetry must never change route behavior.
    }
  }

  private publishLifecycle(kind: ManagerLifecycleTransitionKind): void {
    if (!this.onLifecycleTransition) return;
    const projectServers = this.getKnownProjectServers([]);
    const semanticReady = projectServers.some(
      (server) => server.status === "running" && server.ready,
    );
    try {
      this.onLifecycleTransition({ kind, semanticReady, projectServers });
    } catch {
      // Runtime lifecycle consumers must not alter manager behavior.
    }
  }

  /**
   * Perform the actual server start — extracted so the public method can
   * deduplicate via pendingStarts without wrapping the entire body.
   */
  private async performStart(
    serverName: string,
    serverConfig: ServerConfig,
    root: string,
    key: string,
  ): Promise<LspClient | null> {
    // Validate command exists
    if (!commandExists(serverConfig.command)) {
      this.unavailable.set(key, "missing-command");
      return null;
    }

    // Spawn new client
    const client = this.createClient(serverName, serverConfig, root, key);
    this.clearWarmedWorkspaceSymbolProjects(serverName, root);
    this.clearWarmedSemanticProjects(serverName, root);
    this.clearPendingWarmProbes(serverName, root);
    this.clients.set(key, client);
    rememberKnownRoot(this.knownRoots, serverName, root);
    try {
      await client.start();
      if (this.shuttingDown) {
        await client.forceKill().catch(() => {});
        if (this.clients.get(key) === client) this.clients.delete(key);
        return null;
      }
      this.unavailable.delete(key);
      return client;
    } catch {
      this.unavailable.set(key, "start-failed");
      if (this.clients.get(key) === client) this.clients.delete(key);
      return null;
    }
  }

  /** Resolve a file to its configured server and workspace-specific client key. */
  private resolveFileRoute(filePath: string): FileRoute | null {
    const resolvedPath = resolveSessionPath(this.cwd, filePath);
    const match = getServerForFile(this.config, resolvedPath);
    if (!match) return null;
    const [serverName, serverConfig] = match;
    const root = resolveRootForFile(resolvedPath, serverName, serverConfig.rootMarkers, {
      knownRoots: this.knownRoots,
      cwd: this.cwd,
    });
    return { serverName, serverConfig, root, key: clientKey(serverName, root) };
  }

  /** Find an already-started client for a file without spawning a new server. */
  private getExistingClientForFile(filePath: string): LspClient | null {
    const route = this.resolveFileRoute(filePath);
    return route ? (this.clients.get(route.key) ?? null) : null;
  }

  /**
   * Restart the clients that own the supplied file paths, if any are active.
   *
   * Each route restarts at most once per invalidation generation. Pass
   * `pushOnly` to restrict restarts to clients without pull diagnostics.
   * The loop observes request cancellation between route restarts.
   */
  async restartClientsForFiles(
    filePaths: string[],
    options?: { pushOnly?: boolean; control?: CodeRequestControl },
  ): Promise<ClientRestartResult[]> {
    const restarted: ClientRestartResult[] = [];
    const seen = new Set<string>();

    for (const filePath of filePaths) {
      const candidate = this.getRestartCandidate(filePath, options?.pushOnly === true, seen);
      if (!candidate) continue;
      const { client, key } = candidate;

      // Observe cancellation between route restarts so a cancelled pass does
      // not keep restarting further clients.
      throwIfCodeRequestInterrupted(options?.control);
      const restartPromise = this.pendingRestarts.get(key) ?? this.startSharedRestart(client, key);
      const result = await raceRequestControl(restartPromise, options?.control);
      restarted.push({ key, serverName: client.name, ...result });
    }

    return restarted;
  }

  private startSharedRestart(
    client: LspClient,
    key: string,
  ): Promise<{ files: string[]; restarted: boolean }> {
    const restartEpoch = this.invalidationEpoch;
    const restartPromise = this.restartClient(client).then((result) => {
      this.recoveryRestartEpochs.set(key, restartEpoch);
      return result;
    });
    this.pendingRestarts.set(key, restartPromise);
    void restartPromise
      .finally(() => {
        if (this.pendingRestarts.get(key) === restartPromise) this.pendingRestarts.delete(key);
      })
      .catch(() => {});
    return restartPromise;
  }

  private getRestartCandidate(
    filePath: string,
    pushOnly: boolean,
    seen: Set<string>,
  ): { client: LspClient; key: string } | null {
    const client = this.getExistingClientForFile(filePath);
    if (!client || (pushOnly && client.hasDiagnosticProvider)) return null;

    const key = clientKey(client.name, client.root);
    if (this.processCrashRecoveries.get(key)?.pending || seen.has(key)) return null;
    seen.add(key);
    if (this.recoveryRestartEpochs.get(key) === this.invalidationEpoch) return null;
    return { client, key };
  }

  private async restartClient(client: LspClient): Promise<{ files: string[]; restarted: boolean }> {
    const key = clientKey(client.name, client.root);
    const serverConfig = this.config.servers[client.name];
    if (!serverConfig || this.clients.get(key) !== client) {
      return { files: [], restarted: false };
    }

    const openFiles = client.openFiles;
    const trackedDiagnosticFiles = client
      .getDiagnosticSnapshot()
      .documents.map((document) => uriToFile(document.uri));
    const files = [...new Set([...openFiles, ...trackedDiagnosticFiles])];
    try {
      await client.shutdown();
    } catch {
      // Ignore shutdown failures when forcing a restart.
    }

    if (this.clients.get(key) !== client) return { files, restarted: false };
    this.clients.delete(key);
    this.unavailable.delete(key);
    this.clearWarmedWorkspaceSymbolProjects(client.name, client.root);
    this.clearWarmedSemanticProjects(client.name, client.root);
    this.clearPendingWarmProbes(client.name, client.root);

    const replacement = this.createClient(client.name, serverConfig, client.root, key);
    this.clients.set(key, replacement);
    rememberKnownRoot(this.knownRoots, client.name, client.root);

    try {
      await withTimeout(
        replacement.start(),
        RECOVERY_CLIENT_STARTUP_BOUND_MS,
        "replacement client startup bound exceeded",
      );
      if (this.clients.get(key) !== replacement || this.shuttingDown) {
        void replacement.forceKill().catch(() => {});
        return { files, restarted: false };
      }
      this.restoreTrackedDocuments(replacement, files);
      this.clearUnconsumedProcessCrashState(key, client);
      return { files, restarted: true };
    } catch {
      if (this.clients.get(key) === replacement) {
        this.clients.delete(key);
        this.unavailable.set(key, "start-failed");
      }
      // A bound-exceeded start may have spawned a live process; terminate
      // the tree so the orphan cannot outlive the failed restart.
      void replacement.forceKill().catch(() => {});
      return { files, restarted: false };
    }
  }

  private clearUnconsumedProcessCrashState(key: string, failedClient: LspClient): void {
    const recovery = this.processCrashRecoveries.get(key);
    if (recovery?.failedClient !== failedClient || recovery.attemptConsumed) return;
    this.processCrashRecoveries.delete(key);
    this.publishLifecycle("recovery");
  }

  getProjectServerInfo(serverName: string, root: string, fileTypes: string[]): ProjectServerInfo {
    const key = clientKey(serverName, root);
    return buildProjectServerInfo(
      {
        serverName,
        root,
        fileTypes,
        client: this.clients.get(key),
        unavailableReason:
          this.getUnavailableReason(key, this.config.servers[serverName]?.command) ?? undefined,
        statusReason: this.processCrashRecoveries.get(key)?.statusReason,
        includeOpenFile: (file) => this.isAutomaticScopePath(file),
      },
      this.cwd,
    );
  }
  getKnownProjectServers(detected: DetectedProjectServer[]): ProjectServerInfo[] {
    const known = new Map<string, DetectedProjectServer>();
    for (const entry of detected) {
      if (!this.automaticPathPolicy.isEligible(entry.root, "directory")) continue;
      known.set(clientKey(entry.name, entry.root), entry);
    }
    for (const client of this.clients.values()) {
      const key = clientKey(client.name, client.root);
      if (known.has(key)) continue;
      known.set(key, {
        name: client.name,
        root: client.root,
        fileTypes: [...(this.config.servers[client.name]?.fileTypes ?? [])],
      });
    }
    // Keep an exhausted recovery route visible after its failed replacement
    // is removed from the active client pool.
    for (const recovery of this.processCrashRecoveries.values()) {
      const name = recovery.failedClient.name;
      const root = recovery.failedClient.root;
      const key = clientKey(name, root);
      if (known.has(key)) continue;
      known.set(key, {
        name,
        root,
        fileTypes: [...(this.config.servers[name]?.fileTypes ?? [])],
      });
    }
    return Array.from(known.values())
      .map((entry) => this.getProjectServerInfo(entry.name, entry.root, entry.fileTypes))
      .sort(
        (a, b) =>
          a.root.localeCompare(b.root) ||
          a.name.localeCompare(b.name) ||
          a.status.localeCompare(b.status),
      );
  }

  /** Wait until the client that owns a file is query-ready, then run a light warm-up probe. */
  async waitUntilFileReady(
    filePath: string,
    control?: CodeRequestControl,
    onProcessCrashRecovery?: (summary: ProcessCrashRecoverySummary) => void,
  ): Promise<FileReadinessResult> {
    throwIfCodeRequestInterrupted(control);
    const resolvedPath = resolveSessionPath(this.cwd, filePath);
    const route = this.resolveFileRoute(resolvedPath);
    const recovery = route ? this.processCrashRecoveries.get(route.key) : undefined;
    const processCrashRecoveryRequested =
      recovery !== undefined && (recovery.pending !== null || recovery.statusReason !== undefined);
    if (processCrashRecoveryRequested) {
      onProcessCrashRecovery?.(summarizeProcessCrashRecoveryRoutes(["pending"]));
    }
    const client = await this.getClientForFile(resolvedPath, {
      recoverProcessCrash: true,
      control,
    });
    const processCrashRecovery = processCrashRecoveryRequested
      ? summarizeProcessCrashRecoveryRoutes([client ? "recovered" : "failed"])
      : emptyProcessCrashRecoverySummary();
    if (!client) return { client: null, processCrashRecovery };
    // The caller's wait stops on cancellation even though the shared
    // readiness state keeps its own lifecycle.
    await client.getReady(control);
    await this.warmSemanticProject(client, resolvedPath, true, control);
    throwIfCodeRequestInterrupted(control);
    return { client, processCrashRecovery };
  }

  /**
   * Wait until one started client is query-ready, then warm its project.
   * Returns the number of concrete clients that are ready after the warm-up.
   */
  async waitUntilWorkspaceReady(control?: CodeRequestControl): Promise<number> {
    throwIfCodeRequestInterrupted(control);
    const activeClients = Array.from(this.clients.values()).filter(
      (client) => client.status === "running",
    );
    if (activeClients.length === 0) return 0;

    const alreadyReady = activeClients.find((client) => client.ready);
    const firstReady =
      alreadyReady ??
      (await Promise.any(
        activeClients.map(async (client) => {
          await client.getReady(control);
          if (client.status !== "running" || !client.ready) {
            throw new Error("LSP client did not reach concrete readiness.");
          }
          return client;
        }),
      ).catch(() => null));
    // Promise.any swallows individual rejections, so an interruption that
    // raced the readiness wait must be re-raised before it degrades into a
    // zero-ready outcome.
    throwIfCodeRequestInterrupted(control);
    if (!firstReady) return 0;

    const serverConfig = this.config.servers[firstReady.name];
    if (serverConfig) {
      const target = findWorkspaceSymbolWarmTargets(
        firstReady.root,
        serverConfig.rootMarkers,
        serverConfig.fileTypes,
        { policy: this.automaticPathPolicy },
      )[0];
      if (target) await this.warmSemanticProject(firstReady, target.file, false, control);
    }

    throwIfCodeRequestInterrupted(control);
    return activeClients.filter((client) => client.status === "running" && client.ready).length;
  }
  async syncFileAndGetDiagnostics(
    filePath: string,
    maxSeverity: number = 1,
    control?: CodeRequestControl,
  ): Promise<CodeQueryResult<Diagnostic[]>> {
    const resolvedPath = resolveSessionPath(this.cwd, filePath);
    const client = await this.getClientForFile(resolvedPath, {
      recoverProcessCrash: true,
      control,
    });
    if (!client) {
      return unavailableCodeQuery(`No LSP client can collect diagnostics for ${resolvedPath}.`);
    }
    try {
      return await syncClientFileAndGetDiagnostics(client, resolvedPath, maxSeverity, control);
    } catch (error) {
      // Cancellation must propagate; a cancelled caller no longer awaits a
      // diagnostic result or the file cleanup side effects.
      if (isCodeRequestInterruption(error, control)) throw error;
      this.closeFile(resolvedPath);
      const detail = error instanceof Error ? error.message : String(error);
      return unavailableCodeQuery(`Diagnostic collection failed for ${resolvedPath}: ${detail}`);
    }
  }
  /** Close a file across any active LSP clients and clear its cached diagnostics. */
  closeFile(filePath: string): void {
    closeFileAcrossClients(this.clients.values(), resolveSessionPath(this.cwd, filePath));
  }
  /** Remove any missing files from open-document and diagnostic state. */
  pruneMissingFiles(): string[] {
    return pruneMissingFilesFromClients(this.clients.values());
  }
  /** Re-sync all open documents across active clients and return exact evidence coverage. */
  async refreshOpenDiagnostics(
    options?: { maxWaitMs?: number; quietMs?: number } & CodeRequestControl,
  ): Promise<DiagnosticEvidenceSummary> {
    const summary = await refreshOpenDiagnosticsForClients(this.clients.values(), options);
    return this.toWorkspaceDiagnosticEvidence(summary.documents);
  }

  /** Clear cached pull-diagnostic result IDs across all clients. */
  clearAllPullResultIds(): void {
    for (const client of this.clients.values()) {
      client.clearPullResultIds();
    }
  }

  /** Notify running clients about watched workspace file changes. */
  notifyWorkspaceFileChanges(changes: FileEvent[]): void {
    for (const client of this.clients.values()) {
      client.notifyWorkspaceFileChanges(changes);
    }
  }

  /**
   * Record one workspace invalidation event and forward it to clients.
   *
   * Every call with a non-empty change batch advances the invalidation
   * generation, so a repeated edit to the same file opens a fresh
   * generation. Recovery passes forward changes through
   * {@link notifyWorkspaceFileChanges} and never advance the generation.
   */
  noteWorkspaceChanges(changes: FileEvent[]): void {
    if (changes.length > 0) this.invalidationEpoch++;
    invalidateProjectConfigCaches(changes);
    this.notifyWorkspaceFileChanges(changes);
  }

  /** Return per-route diagnostic evidence capability for recovery targeting. */
  getClientDiagnosticRoutes(): Array<{
    key: string;
    supportsPull: boolean;
    unconfirmedFiles: string[];
    stallSignal: ReturnType<LspClient["getRecoveryStallSignal"]>;
  }> {
    const routes: Array<{
      key: string;
      supportsPull: boolean;
      unconfirmedFiles: string[];
      stallSignal: ReturnType<LspClient["getRecoveryStallSignal"]>;
    }> = [];
    for (const [key, client] of this.clients) {
      if (client.status !== "running") continue;
      const unconfirmedFiles = client
        .getDiagnosticSnapshot()
        .documents.filter((document) => document.status === "unconfirmed")
        .map((document) => uriToFile(document.uri))
        .filter((file) => this.isDiagnosticFile(file));
      routes.push({
        key,
        supportsPull: client.hasDiagnosticProvider,
        unconfirmedFiles,
        stallSignal: client.getRecoveryStallSignal(),
      });
    }
    return routes;
  }

  /** Force a workspace-wide diagnostic recovery pass. */
  async recoverWorkspaceDiagnostics(options?: {
    changes?: FileEvent[];
    restartIfStillStale?: boolean;
    maxWaitMs?: number;
    quietMs?: number;
    /** Evidence from a refresh the caller already completed; skips this pass's own refresh when no watched-file changes apply. */
    initialEvidence?: DiagnosticEvidenceSummary;
    /** Explicit demand to recover crashed routes with tracked files in scope. */
    processCrashDemand?: { scopes?: readonly string[] };
    control?: CodeRequestControl;
  }): Promise<WorkspaceRecoveryResult> {
    const demand = options?.processCrashDemand
      ? await this.recoverProcessCrashDemand((recovery) => {
          const files = this.processCrashDiagnosticFiles(recovery, options.processCrashDemand);
          return files.length > 0 ? files : null;
        }, options.control)
      : {
          hasSupport: false,
          processCrashRecovery: emptyProcessCrashRecoverySummary(),
          failures: [],
          failedFiles: [],
        };
    const recoveryOptions = demand.hasSupport
      ? { ...options, initialEvidence: undefined }
      : options;
    const result = await recoverWorkspaceDiagnosticsImpl(this, recoveryOptions);
    return this.addProcessCrashDiagnosticEvidence(
      { ...result, processCrashRecovery: demand.processCrashRecovery },
      demand,
    );
  }

  private processCrashDiagnosticFiles(
    recovery: ProcessCrashRecoveryState,
    demand: { scopes?: readonly string[] } | undefined,
  ): string[] {
    if (!demand) return [];
    const scopes = demand.scopes?.map((scope) => resolveSessionPath(this.cwd, scope));
    return recovery.files.filter(
      (file) =>
        this.isDiagnosticFile(file) &&
        (!scopes ||
          scopes.length === 0 ||
          scopes.some((scope) => projectRoots.isWithinOrEqual(scope, file))),
    );
  }

  private addProcessCrashDiagnosticEvidence(
    result: WorkspaceRecoveryResult,
    demand: ProcessCrashDemandResult,
  ): WorkspaceRecoveryResult {
    if (demand.failures.length === 0) return result;
    const byFile = new Map(
      result.diagnosticEvidence.documents.map((document) => [document.file, document] as const),
    );
    for (const file of demand.failedFiles) {
      const relativeFile = path.relative(this.cwd, file);
      byFile.set(relativeFile, { file: relativeFile, status: "failed" });
    }
    const diagnosticEvidence = summarizeDiagnosticEvidence(Array.from(byFile.values()));
    const diagnosticReport = {
      summary: { ...result.diagnosticReport.summary, current: false, evidence: diagnosticEvidence },
      outstanding: {
        ...result.diagnosticReport.outstanding,
        current: false,
        evidence: diagnosticEvidence,
      },
    };
    return {
      ...result,
      diagnosticEvidence,
      diagnosticReport,
      refreshFailureReason: [result.refreshFailureReason, ...demand.failures]
        .filter(Boolean)
        .join("; "),
    };
  }

  /** Shut down all running LSP servers. */
  async shutdownAll(): Promise<void> {
    this.shuttingDown = true;
    const clients = Array.from(this.clients.values());
    const shutdowns = clients.map((client) => client.shutdown().catch(() => {}));
    await Promise.all(shutdowns);
    // Dispose every client so pending or active progress tokens and
    // readiness promises cannot outlive the manager.
    for (const client of clients) client.dispose();
    this.clients.clear();
    this.clientGenerations.clear();
    this.initializedClientGenerations.clear();
    this.handledCrashGenerations.clear();
    this.processCrashRecoveries.clear();
    this.recoveryRestartEpochs.clear();
    this.unavailable.clear();
    this.knownRoots.clear();
    this.warmedWorkspaceSymbolProjects.clear();
    this.warmedSemanticProjects.clear();
    this.pendingWarmProbes.clear();
    this.pendingRestarts.clear();
  }
  /** Get status of all servers. */
  getRunningClientCount(): number {
    return Array.from(this.clients.values()).filter((client) => client.status === "running").length;
  }

  /** Get the server names of all running clients, for recovery telemetry. */
  getRunningClientNames(): string[] {
    return Array.from(this.clients.values())
      .filter((client) => client.status === "running")
      .map((client) => client.name);
  }

  /** Check whether a path belongs to the automatic diagnostic evidence scope. */
  isDiagnosticFile(filePath: string): boolean {
    return this.isAutomaticScopePath(filePath);
  }

  getDiagnosticEvidence(): DiagnosticEvidenceSummary {
    return this.getDiagnosticSnapshot().evidence;
  }

  getStatus(): ManagerStatus {
    this.pruneMissingFiles();
    const servers: ServerStatus[] = [];
    for (const [_key, client] of this.clients) {
      servers.push({
        name: client.name,
        status: client.status === "running" ? "running" : "error",
        root: client.root,
        openFiles: client.openFiles.filter((file) => this.isAutomaticScopePath(file)),
      });
    }
    return { servers };
  }
  /** Get configured and active LSP coverage for the current project. */
  getCoverageSummary(): CoverageSummaryEntry[] {
    this.pruneMissingFiles();
    const activeServers = new Map<string, { active: boolean; openFiles: number }>();
    for (const server of this.getStatus().servers) {
      const current = activeServers.get(server.name) ?? { active: false, openFiles: 0 };
      current.active = current.active || server.status === "running";
      current.openFiles += server.openFiles.length;
      activeServers.set(server.name, current);
    }
    return Object.entries(this.config.servers)
      .map(([name, server]) => {
        const activity = activeServers.get(name);
        return {
          name,
          fileTypes: server.fileTypes,
          active: activity?.active ?? false,
          openFiles: activity?.openFiles ?? 0,
        } satisfies CoverageSummaryEntry;
      })
      .sort(
        (a, b) =>
          Number(b.active) - Number(a.active) ||
          b.openFiles - a.openFiles ||
          a.name.localeCompare(b.name),
      );
  }
  /** Get active LSP coverage summarized by running servers with open files. */
  getActiveCoverageSummary(): ActiveCoverageSummaryEntry[] {
    this.pruneMissingFiles();
    const activeServers = new Map<string, Set<string>>();
    for (const server of this.getStatus().servers) {
      if (server.status !== "running" || server.openFiles.length === 0) continue;
      const openFiles = activeServers.get(server.name) ?? new Set<string>();
      for (const file of server.openFiles) {
        const relativeFile = displayRelativeFilePath(file, this.cwd);
        if (!this.isAutomaticScopePath(relativeFile)) continue;
        openFiles.add(relativeFile);
      }
      activeServers.set(server.name, openFiles);
    }
    return Array.from(activeServers.entries())
      .map(([name, openFiles]) => ({
        name,
        openFiles: Array.from(openFiles).sort(),
      }))
      .sort((a, b) => b.openFiles.length - a.openFiles.length || a.name.localeCompare(b.name));
  }
  getCoverageSummaryText(maxServers: number = 2, maxFiles: number = 2): string | null {
    return formatCoverageSummaryText(this.getActiveCoverageSummary(), maxServers, maxFiles);
  }
  getRelevantCoverageSummaryText(
    relevantPaths: string[],
    maxServers: number = 2,
    maxFiles: number = 2,
  ): string | null {
    const normalizedPaths = normalizeRelevantPaths(relevantPaths);
    if (normalizedPaths.length === 0) return null;
    const relevantEntries = this.getActiveCoverageSummary()
      .map((entry) => ({
        ...entry,
        openFiles: entry.openFiles.filter((file) =>
          isPathRelevant(file, normalizedPaths, this.cwd, this.automaticPathPolicy),
        ),
      }))
      .filter((entry) => entry.openFiles.length > 0);
    return formatCoverageSummaryText(relevantEntries, maxServers, maxFiles);
  }
  /**
   * Capture one coherent diagnostic report from the current client snapshots.
   *
   * Summary and detailed projections share the same cache observation so a
   * caller cannot combine entries from one generation with evidence from
   * another.
   */
  getWorkspaceDiagnosticReport(maxSeverity: number = 2): WorkspaceDiagnosticReport {
    this.pruneMissingFiles();
    const snapshots = Array.from(this.clients.values()).map((client) =>
      client.getDiagnosticSnapshot(),
    );
    const evidence = this.toWorkspaceDiagnosticEvidence(
      snapshots.flatMap((snapshot) =>
        snapshot.documents.map((document) => ({
          file: relativeFilePathFromUri(document.uri, this.cwd),
          status: document.status,
        })),
      ),
    );
    const current =
      snapshots.every((snapshot) => snapshot.current) &&
      evidence.documents.every((document) => document.status === "confirmed");
    const fileDiags = new Map<string, { errors: number; warnings: number }>();
    for (const snapshot of snapshots) {
      for (const entry of snapshot.entries) {
        collectDiagnosticSummaryCounts(fileDiags, entry, this.cwd, (file) =>
          this.isAutomaticScopePath(file),
        );
      }
    }

    return {
      summary: {
        entries: Array.from(fileDiags.entries()).map(([file, counts]) => ({ file, ...counts })),
        current,
        evidence,
      },
      outstanding: {
        entries: collectOutstandingDiagnosticsDetailed(
          snapshots.map((snapshot) => snapshot.entries),
          this.cwd,
          (file) => this.isAutomaticScopePath(file),
          maxSeverity,
        ),
        current,
        evidence,
      },
    };
  }

  /** Get a diagnostic summary across all servers and files. */
  getDiagnosticSummary(): DiagnosticSummary[] {
    return this.getDiagnosticSnapshot().entries;
  }
  getDiagnosticSnapshot(): {
    entries: DiagnosticSummary[];
    current: boolean;
    evidence: DiagnosticEvidenceSummary;
  } {
    this.pruneMissingFiles();
    const fileDiags = new Map<string, { errors: number; warnings: number }>();
    const evidenceDocuments: DiagnosticEvidenceDocument[] = [];
    let clientCurrent = true;
    for (const client of this.clients.values()) {
      const snapshot = client.getDiagnosticSnapshot();
      clientCurrent &&= snapshot.current;
      for (const document of snapshot.documents) {
        evidenceDocuments.push({
          file: relativeFilePathFromUri(document.uri, this.cwd),
          status: document.status,
        });
      }
      for (const entry of snapshot.entries) {
        collectDiagnosticSummaryCounts(fileDiags, entry, this.cwd, (file) =>
          this.isAutomaticScopePath(file),
        );
      }
    }
    const evidence = this.toWorkspaceDiagnosticEvidence(evidenceDocuments);
    return {
      entries: Array.from(fileDiags.entries()).map(([file, counts]) => ({ file, ...counts })),
      current:
        clientCurrent && evidence.documents.every((document) => document.status === "confirmed"),
      evidence,
    };
  }
  /** Get outstanding diagnostics at or above the configured inline threshold. */
  getOutstandingDiagnosticSummary(maxSeverity: number = 1): OutstandingDiagnosticSummaryEntry[] {
    return this.getOutstandingDiagnosticSummarySnapshot(maxSeverity).entries;
  }
  getOutstandingDiagnosticSummarySnapshot(maxSeverity: number = 1): {
    entries: OutstandingDiagnosticSummaryEntry[];
    current: boolean;
    evidence: DiagnosticEvidenceSummary;
  } {
    this.pruneMissingFiles();
    const snapshots = Array.from(this.clients.values()).map((client) =>
      client.getDiagnosticSnapshot(),
    );
    const evidence = this.toWorkspaceDiagnosticEvidence(
      collectClientDiagnosticEvidenceDocuments(snapshots, this.cwd),
    );
    const clientCurrent = snapshots.every((snapshot) => snapshot.current);
    return {
      entries: collectOutstandingDiagnosticSummaryEntries(
        snapshots,
        this.cwd,
        (file) => this.isAutomaticScopePath(file),
        maxSeverity,
      ),
      current:
        clientCurrent && evidence.documents.every((document) => document.status === "confirmed"),
      evidence,
    };
  }
  getRelevantOutstandingDiagnosticsSummaryText(
    relevantPaths: string[],
    maxSeverity: number = 1,
    maxFiles: number = 3,
  ): string | null {
    const normalizedPaths = normalizeRelevantPaths(relevantPaths);
    if (normalizedPaths.length === 0) return null;
    return formatOutstandingDiagnosticsSummaryText(
      this.getOutstandingDiagnosticSummary(maxSeverity).filter((entry) =>
        isPathRelevant(entry.file, normalizedPaths, this.cwd, this.automaticPathPolicy),
      ),
      maxFiles,
    );
  }
  getOutstandingDiagnostics(
    maxSeverity: number = 1,
  ): Array<{ file: string; diagnostics: Diagnostic[] }> {
    return this.getOutstandingDiagnosticsSnapshot(maxSeverity).entries;
  }
  getOutstandingDiagnosticsSnapshot(maxSeverity: number = 1): {
    entries: Array<{ file: string; diagnostics: Diagnostic[] }>;
    current: boolean;
    evidence: DiagnosticEvidenceSummary;
  } {
    this.pruneMissingFiles();
    const snapshots = Array.from(this.clients.values()).map((client) =>
      client.getDiagnosticSnapshot(),
    );
    const evidenceDocuments = snapshots.flatMap((snapshot) =>
      snapshot.documents.map((document) => ({
        file: relativeFilePathFromUri(document.uri, this.cwd),
        status: document.status,
      })),
    );
    const evidence = this.toWorkspaceDiagnosticEvidence(evidenceDocuments);
    return {
      entries: collectOutstandingDiagnosticsDetailed(
        snapshots.map((snapshot) => snapshot.entries),
        this.cwd,
        (file) => this.isAutomaticScopePath(file),
        maxSeverity,
      ),
      current:
        snapshots.every((snapshot) => snapshot.current) &&
        evidence.documents.every((document) => document.status === "confirmed"),
      evidence,
    };
  }

  /**
   * Aggregate the tsconfig scope decision for every tracked file.
   *
   * The recovery telemetry surface uses this to report why tracked files are
   * in or out of scope without re-deriving the scope logic. The returned
   * entry list is bounded; counts are exact.
   */
  getScopeDecisionSummary(): ScopeDecisionSummary {
    this.pruneMissingFiles();
    const accumulator: ScopeDecisionAccumulator = {
      entries: [],
      counts: { included: 0, excluded: 0, noConfig: 0, outOfTree: 0 },
      basisCounts: {},
    };
    let totalFiles = 0;

    for (const client of this.clients.values()) {
      for (const document of client.getDiagnosticSnapshot().documents) {
        const file = relativeFilePathFromUri(document.uri, this.cwd);
        if (!this.isAutomaticScopePath(file)) continue;
        totalFiles++;
        accumulateScopeDecision(accumulator, file, getFileScopeDecision(file, this.cwd));
      }
    }

    return {
      caseSensitiveFileNames: ts.sys.useCaseSensitiveFileNames,
      counts: accumulator.counts,
      basisCounts: accumulator.basisCounts,
      entries: accumulator.entries,
      totalFiles,
    };
  }
  private toWorkspaceDiagnosticEvidence(
    documents: readonly DiagnosticEvidenceDocument[],
  ): DiagnosticEvidenceSummary {
    const byFile = new Map<string, DiagnosticEvidenceDocument>();
    for (const document of documents) {
      const file = path.relative(this.cwd, path.resolve(this.cwd, document.file));
      if (!this.isAutomaticScopePath(file)) continue;
      const existing = byFile.get(file);
      if (!existing || evidenceStatusRank(document.status) > evidenceStatusRank(existing.status)) {
        byFile.set(file, { file, status: document.status });
      }
    }
    return summarizeDiagnosticEvidence(
      Array.from(byFile.values()).sort((a, b) => a.file.localeCompare(b.file)),
    );
  }

  async workspaceSymbol(
    query: string,
    control?: CodeRequestControl,
    scopes?: readonly string[],
  ): Promise<CodeQueryResult<(SymbolInformation | WorkspaceSymbol)[]>> {
    const resolvedScopes = scopes?.map((scope) => resolveSessionPath(this.cwd, scope));
    const routeMatches = (client: LspClient) =>
      this.workspaceSymbolRouteMatchesScopes(client, resolvedScopes);
    if (resolvedScopes && !this.hasWorkspaceSymbolRouteForScopes(resolvedScopes)) {
      return unavailableCodeQuery(
        "No known LSP route intersects the requested workspace-symbol scope.",
      );
    }
    const demand = await this.recoverProcessCrashDemand(
      (recovery) =>
        recovery.failedClient.serverCapabilities?.workspaceSymbolProvider &&
        routeMatches(recovery.failedClient)
          ? []
          : null,
      control,
    );
    const collect = async (clients: Iterable<LspClient>, value: string) =>
      this.addWorkspaceSymbolDemandEvidence(
        await collectWorkspaceSymbols(
          Array.from(clients).filter((client) => routeMatches(client)),
          value,
          control,
        ),
        demand,
      );
    const initial = await collect(this.clients.values(), query);
    if (!initial.hasSupport || initial.results.length > 0) {
      return workspaceSymbolCollectionResult(initial);
    }

    const warmed = await this.warmWorkspaceSymbolProjectsUntilResult({
      findWarmTargets: (root, rootMarkers, fileTypes) =>
        findWorkspaceSymbolWarmTargets(root, rootMarkers, fileTypes, {
          policy: this.automaticPathPolicy,
        }),
      getWarmPosition: getWorkspaceSymbolWarmPosition,
      collect,
      routeMatches,
      query,
      control,
    });
    return workspaceSymbolCollectionResult(warmed.collection ?? initial);
  }

  private addWorkspaceSymbolDemandEvidence(
    collection: WorkspaceSymbolCollection,
    demand: ProcessCrashDemandResult,
  ): WorkspaceSymbolCollection {
    return {
      ...collection,
      hasSupport: collection.hasSupport || demand.hasSupport,
      failures: [...collection.failures, ...demand.failures],
    };
  }

  private hasWorkspaceSymbolRouteForScopes(scopes: readonly string[]): boolean {
    const clients = [
      ...this.clients.values(),
      ...Array.from(this.processCrashRecoveries.values(), (recovery) => recovery.failedClient),
    ];
    return clients.some((client) => this.workspaceSymbolRouteMatchesScopes(client, scopes));
  }

  private workspaceSymbolRouteMatchesScopes(
    client: LspClient,
    scopes: readonly string[] | undefined,
  ): boolean {
    if (!scopes || scopes.length === 0) return true;
    const key = clientKey(client.name, client.root);
    return scopes.some((scope) => {
      try {
        if (fs.statSync(scope).isFile()) return this.resolveFileRoute(scope)?.key === key;
      } catch {
        return false;
      }
      return (
        projectRoots.isWithinOrEqual(client.root, scope) ||
        projectRoots.isWithinOrEqual(scope, client.root)
      );
    });
  }
  async ensureFileOpen(
    filePath: string,
    options: FileClientRequestOptions = {},
  ): Promise<LspClient | null> {
    const resolvedPath = resolveSessionPath(this.cwd, filePath);
    const client = await this.getClientForFile(resolvedPath, options);
    if (!client) return null;
    try {
      client.didOpen(resolvedPath, fs.readFileSync(resolvedPath, "utf-8"));
      return client;
    } catch {
      this.closeFile(resolvedPath);
      return null;
    }
  }

  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: warm-up coordinates client/project iteration, targeted semantic nudges, and early-return queries in one place.
  private async warmWorkspaceSymbolProjectsUntilResult(options: {
    findWarmTargets: (
      root: string,
      rootMarkers: string[],
      fileTypes: string[],
    ) => Array<{ projectRoot: string; file: string }>;
    getWarmPosition: (
      symbols: import("../config/types.ts").DocumentSymbol[] | SymbolInformation[] | null,
    ) => import("../config/types.ts").Position | null;
    collect: (clients: Iterable<LspClient>, query: string) => Promise<WorkspaceSymbolCollection>;
    routeMatches?: (client: LspClient) => boolean;
    query: string;
    control?: CodeRequestControl;
  }): Promise<{ warmedAny: boolean; collection: WorkspaceSymbolCollection | null }> {
    const { findWarmTargets, getWarmPosition, collect, routeMatches, query, control } = options;
    let warmedAny = false;

    for (const client of Array.from(this.clients.values())) {
      if (routeMatches && !routeMatches(client)) continue;
      if (client.status !== "running") continue;
      if (!client.serverCapabilities?.workspaceSymbolProvider) continue;

      const serverConfig = this.config.servers[client.name];
      if (!serverConfig) continue;

      const warmTargets = findWarmTargets(
        client.root,
        serverConfig.rootMarkers,
        serverConfig.fileTypes,
      ).slice(0, 24);

      for (const target of warmTargets) {
        const projectKey = this.workspaceSymbolProjectKey(client.name, target.projectRoot);
        if (this.warmedWorkspaceSymbolProjects.has(projectKey)) continue;

        const openedClient = await this.ensureFileOpen(target.file);
        if (!openedClient) continue;

        // A cancelled pass must not mark projects warmed on its way out.
        throwIfCodeRequestInterrupted(control);
        const available = await this.probeDocumentSymbols(
          openedClient,
          target.file,
          getWarmPosition,
          control,
        );
        if (available) {
          this.warmedWorkspaceSymbolProjects.add(projectKey);
          warmedAny = true;
        }

        const collected = await collect(this.clients.values(), query);
        if (collected.hasSupport && collected.results.length > 0) {
          return { warmedAny, collection: collected };
        }
      }
    }

    return { warmedAny, collection: null };
  }

  private async warmSemanticProject(
    client: LspClient,
    filePath: string,
    preferExactFile: boolean = false,
    control?: CodeRequestControl,
  ): Promise<void> {
    const serverConfig = this.config.servers[client.name];
    if (!serverConfig) return;

    const resolvedFile = resolveSessionPath(this.cwd, filePath);
    const projectRoot = preferExactFile
      ? resolveRootForFile(resolvedFile, client.name, serverConfig.rootMarkers, {
          knownRoots: this.knownRoots,
          cwd: this.cwd,
        })
      : client.root;
    const projectKey = this.workspaceSymbolProjectKey(client.name, projectRoot);
    if (this.warmedSemanticProjects.has(projectKey)) return;

    const pending = this.pendingWarmProbes.get(projectKey);
    if (pending) {
      // The shared probe keeps running for other consumers; only this
      // caller's wait stops when it cancels.
      await raceRequestControl(pending, control);
      return;
    }

    const probe = this.performWarmProbe(client, resolvedFile, projectKey, control);
    this.pendingWarmProbes.set(projectKey, probe);
    try {
      await raceRequestControl(probe, control);
    } finally {
      if (this.pendingWarmProbes.get(projectKey) === probe) {
        this.pendingWarmProbes.delete(projectKey);
      }
    }
  }

  private async performWarmProbe(
    client: LspClient,
    resolvedFile: string,
    projectKey: string,
    control?: CodeRequestControl,
  ): Promise<void> {
    const key = clientKey(client.name, client.root);
    if (this.clients.get(key) !== client) return;
    const openedClient = await this.ensureFileOpen(resolvedFile);
    if (!openedClient || openedClient !== client || this.clients.get(key) !== client) return;

    // The probe is shared state for concurrent callers. One caller's
    // cancellation must not cancel the shared in-flight queries, so only the
    // Debug Operation ID is forwarded; each caller races its own wait above.
    const sharedControl = { operationId: control?.operationId };
    const available = await this.probeDocumentSymbols(
      openedClient,
      resolvedFile,
      getWorkspaceSymbolWarmPosition,
      sharedControl,
    );
    if (available && this.clients.get(key) === client) {
      this.warmedSemanticProjects.add(projectKey);
    }
  }

  private async probeDocumentSymbols(
    client: LspClient,
    file: string,
    getWarmPosition: (
      symbols: import("../config/types.ts").DocumentSymbol[] | SymbolInformation[] | null,
    ) => import("../config/types.ts").Position | null,
    control?: CodeRequestControl,
  ): Promise<boolean> {
    const symbols = control
      ? await client.documentSymbols(file, control)
      : await client.documentSymbols(file);
    if (symbols.kind === "unavailable") return false;
    const hoverPosition = getWarmPosition(symbols.data);
    if (hoverPosition) {
      if (control) await client.hover(file, hoverPosition, control);
      else await client.hover(file, hoverPosition);
    }
    return true;
  }

  private workspaceSymbolProjectKey(serverName: string, projectRoot: string): string {
    return `${serverName}:${path.resolve(projectRoot)}`;
  }

  private clearWarmedWorkspaceSymbolProjects(serverName: string, root: string): void {
    const prefix = `${serverName}:${path.resolve(root)}`;
    for (const key of Array.from(this.warmedWorkspaceSymbolProjects)) {
      if (key === prefix || key.startsWith(`${prefix}${path.sep}`)) {
        this.warmedWorkspaceSymbolProjects.delete(key);
      }
    }
  }

  private clearWarmedSemanticProjects(serverName: string, root: string): void {
    const prefix = `${serverName}:${path.resolve(root)}`;
    for (const key of Array.from(this.warmedSemanticProjects)) {
      if (key === prefix || key.startsWith(`${prefix}${path.sep}`)) {
        this.warmedSemanticProjects.delete(key);
      }
    }
  }

  private clearPendingWarmProbes(serverName: string, root: string): void {
    const prefix = `${serverName}:${path.resolve(root)}`;
    for (const key of Array.from(this.pendingWarmProbes.keys())) {
      if (key === prefix || key.startsWith(`${prefix}${path.sep}`)) {
        this.pendingWarmProbes.delete(key);
      }
    }
  }
}

function invalidateProjectConfigCaches(changes: readonly FileEvent[]): void {
  for (const change of changes) {
    const configPath = uriToFile(change.uri);
    if (!isProjectConfigFileName(path.basename(configPath))) continue;
    invalidateTsconfigCacheForConfig(configPath);
    if (change.type === FileChangeType.Created) {
      invalidateTsconfigCacheForConfigDir(path.dirname(configPath));
    }
  }
}

function collectClientDiagnosticEvidenceDocuments(
  snapshots: Iterable<ClientDiagnosticSnapshot>,
  cwd: string,
): DiagnosticEvidenceDocument[] {
  return Array.from(snapshots).flatMap((snapshot) =>
    snapshot.documents.map((document) => ({
      file: relativeFilePathFromUri(document.uri, cwd),
      status: document.status,
    })),
  );
}

function collectOutstandingDiagnosticSummaryEntries(
  snapshots: Iterable<ClientDiagnosticSnapshot>,
  cwd: string,
  includeFile: (file: string) => boolean,
  maxSeverity: number,
): OutstandingDiagnosticSummaryEntry[] {
  const fileDiags = new Map<string, OutstandingDiagnosticSummaryEntry>();
  for (const snapshot of snapshots) {
    for (const entry of snapshot.entries) {
      const file = relativeFilePathFromUri(entry.uri, cwd);
      if (!includeFile(file)) continue;
      const existing = fileDiags.get(file) ?? createOutstandingDiagnosticSummary(file);
      const next = accumulateOutstandingDiagnostics(existing, entry.diagnostics, maxSeverity);
      if (next.total > 0) fileDiags.set(file, next);
    }
  }
  return Array.from(fileDiags.values()).sort(
    (a, b) =>
      b.errors - a.errors ||
      b.warnings - a.warnings ||
      b.information - a.information ||
      b.hints - a.hints ||
      a.file.localeCompare(b.file),
  );
}

function evidenceStatusRank(status: DiagnosticEvidenceDocument["status"]): number {
  switch (status) {
    case "confirmed":
      return 1;
    case "unconfirmed":
      return 2;
    case "failed":
      return 3;
    case "removed":
      return 4;
  }
}
