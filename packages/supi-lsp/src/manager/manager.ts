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
import {
  LspClient,
  type LspClientLifecycleTransitionKind,
  RECOVERY_CLIENT_STARTUP_BOUND_MS,
  withTimeout,
} from "../client/client.ts";

export { RECOVERY_CLIENT_STARTUP_BOUND_MS } from "../client/client.ts";

import { getServerForFile } from "../config/config.ts";
import type {
  DetectedProjectServer,
  Diagnostic,
  FileEvent,
  LspConfig,
  ProjectServerInfo,
  ServerConfig,
  SymbolInformation,
  WorkspaceSymbol,
} from "../config/types.ts";
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
import { raceRequestControl } from "../session/readiness.ts";
import {
  displayRelativeFilePath,
  formatCoverageSummaryText,
  formatOutstandingDiagnosticsSummaryText,
  isPathRelevant,
  normalizeRelevantPaths,
  shouldIgnoreLspPath,
} from "../summary.ts";
import { commandExists, resolveSessionPath, uriToFile } from "../utils.ts";
import {
  closeFileAcrossClients,
  pruneMissingFilesFromClients,
  refreshOpenDiagnosticsForClients,
} from "./manager-client-state.ts";
import {
  collectOutstandingDiagnosticsDetailed,
  syncClientFileAndGetDiagnostics,
} from "./manager-diagnostics.ts";
import {
  clientKey,
  isExcludedByPattern,
  rememberKnownRoot,
  resolveRootForFile,
} from "./manager-helpers.ts";
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

// ── LspManager ────────────────────────────────────────────────────────
export class LspManager {
  /** Active clients keyed by "serverName:root" */
  private clients = new Map<string, LspClient>();
  /** Per-root startup failures keyed by "serverName:root" */
  private unavailable = new Map<string, UnavailableReason>();
  /** Memoized per-command availability of LSP server binaries on PATH */
  private commandAvailability = new Map<string, boolean>();
  /** Guards against concurrent client creation for the same server:root key */
  private pendingStarts = new Map<string, Promise<LspClient | null>>();
  /** Monotonic ownership generation for each replaceable client route. */
  private clientGenerations = new Map<string, number>();
  /** Preferred project roots discovered by proactive scan or lazy startup */
  private knownRoots = new Map<string, string[]>();
  /** User-configured gitignore-style exclude patterns */
  private excludePatterns: string[] = [];
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
  constructor(
    private readonly config: LspConfig,
    private readonly cwd: string,
    private readonly onLifecycleTransition?: ManagerLifecycleListener,
  ) {}
  getCwd(): string {
    return this.cwd;
  }
  setExcludePatterns(patterns: string[]): void {
    this.excludePatterns = patterns;
  }

  // ── Public API ────────────────────────────────────────────────────
  registerDetectedServers(detected: DetectedProjectServer[]): void {
    this.knownRoots = projectRoots.buildKnownRootsMap(detected);
  }
  /** Check whether a file path has an available LSP server for explicit semantic operations. */
  canServeFile(filePath: string): boolean {
    const route = this.resolveFileRoute(filePath);
    if (!route) return false;
    if (this.getUnavailableReason(route.key, route.serverConfig.command)) return false;
    return this.isServerCommandAvailable(route.serverConfig.command);
  }

  /**
   * Check whether a file should participate in runtime guidance and diagnostics.
   * This is stricter than {@link canServeFile} and intentionally filters dependency
   * and tsconfig-excluded paths from UI/context behavior.
   */
  isSupportedSourceFile(filePath: string): boolean {
    // Dependency directories are intentionally excluded from recent-path
    // tracking and diagnostic summaries (shouldIgnoreLspPath). Keep runtime
    // guidance activation consistent: reading or editing a file under
    // node_modules / .pnpm must not arm LSP guidance for dependency sources.
    if (shouldIgnoreLspPath(filePath, this.cwd)) return false;
    return this.canServeFile(filePath);
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
  async getClientForFile(filePath: string): Promise<LspClient | null> {
    const route = this.resolveFileRoute(filePath);
    return route ? this.startServerForRoot(route.serverName, route.root) : null;
  }
  async startServerForRoot(serverName: string, root: string): Promise<LspClient | null> {
    const serverConfig = this.config.servers[serverName];
    if (!serverConfig) return null;
    const key = clientKey(serverName, root);
    if (this.getUnavailableReason(key, serverConfig.command)) return null;

    // Return existing client
    const existing = this.clients.get(key);
    if (existing && existing.status === "running") return existing;

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
    if (this.clientGenerations.get(key) !== generation) return;
    if (this.clients.get(key) !== client) return;
    const aggregateKind =
      kind === "readiness" && generation > 1 && client.ready ? "recovery" : kind;
    this.publishLifecycle(aggregateKind);
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
      this.unavailable.delete(key);
      return client;
    } catch {
      this.unavailable.set(key, "start-failed");
      this.clients.delete(key);
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
      const client = this.getExistingClientForFile(filePath);
      if (!client) continue;
      if (options?.pushOnly && client.hasDiagnosticProvider) continue;

      const key = clientKey(client.name, client.root);
      if (seen.has(key)) continue;
      seen.add(key);
      if (this.recoveryRestartEpochs.get(key) === this.invalidationEpoch) continue;

      // Observe cancellation between route restarts so a cancelled pass does
      // not keep restarting further clients.
      throwIfCodeRequestInterrupted(options?.control);
      const result = await this.restartClient(client);
      this.recoveryRestartEpochs.set(key, this.invalidationEpoch);
      restarted.push({ key, serverName: client.name, ...result });
    }

    return restarted;
  }

  private async restartClient(client: LspClient): Promise<{ files: string[]; restarted: boolean }> {
    const key = clientKey(client.name, client.root);
    const serverConfig = this.config.servers[client.name];
    if (!serverConfig) return { files: [], restarted: false };

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
      const failedFiles: string[] = [];
      for (const filePath of files) {
        if (!fs.existsSync(filePath)) {
          failedFiles.push(filePath);
          continue;
        }
        try {
          replacement.didOpen(filePath, fs.readFileSync(filePath, "utf-8"));
        } catch {
          failedFiles.push(filePath);
        }
      }
      for (const filePath of failedFiles) replacement.markFailedFile(filePath);
      return { files, restarted: true };
    } catch {
      this.clients.delete(key);
      this.unavailable.set(key, "start-failed");
      // A bound-exceeded start may have spawned a live process; terminate
      // the tree so the orphan cannot outlive the failed restart.
      void replacement.forceKill().catch(() => {});
      return { files, restarted: false };
    }
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
      },
      this.cwd,
    );
  }
  getKnownProjectServers(detected: DetectedProjectServer[]): ProjectServerInfo[] {
    const known = new Map<string, DetectedProjectServer>();
    for (const entry of detected) {
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
  ): Promise<LspClient | null> {
    throwIfCodeRequestInterrupted(control);
    const resolvedPath = resolveSessionPath(this.cwd, filePath);
    const client = await this.getClientForFile(resolvedPath);
    if (!client) return null;
    // The caller's wait stops on cancellation even though the shared
    // readiness state keeps its own lifecycle.
    await client.getReady(control);
    await this.warmSemanticProject(client, resolvedPath, true, control);
    throwIfCodeRequestInterrupted(control);
    return client;
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
    const client = await this.getClientForFile(resolvedPath);
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
    control?: CodeRequestControl;
  }): Promise<WorkspaceRecoveryResult> {
    return recoverWorkspaceDiagnosticsImpl(this, options);
  }

  /** Shut down all running LSP servers. */
  async shutdownAll(): Promise<void> {
    const shutdowns = Array.from(this.clients.values()).map((c) => c.shutdown().catch(() => {}));
    await Promise.all(shutdowns);
    // Dispose every client so pending or active progress tokens and
    // readiness promises cannot outlive the manager.
    for (const client of this.clients.values()) client.dispose();
    this.clients.clear();
    this.clientGenerations.clear();
    this.recoveryRestartEpochs.clear();
    this.unavailable.clear();
    this.knownRoots.clear();
    this.warmedWorkspaceSymbolProjects.clear();
    this.warmedSemanticProjects.clear();
    this.pendingWarmProbes.clear();
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

  /** Check whether a path belongs to the configured diagnostic evidence scope. */
  isDiagnosticFile(filePath: string): boolean {
    const relative = path.relative(this.cwd, path.resolve(this.cwd, filePath));
    return (
      !shouldIgnoreLspPath(relative, this.cwd) &&
      !isExcludedByPattern(relative, this.excludePatterns)
    );
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
        openFiles: client.openFiles,
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
        if (shouldIgnoreLspPath(relativeFile, this.cwd)) continue;
        if (isExcludedByPattern(relativeFile, this.excludePatterns)) continue;
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
          isPathRelevant(file, normalizedPaths, this.cwd),
        ),
      }))
      .filter((entry) => entry.openFiles.length > 0);
    return formatCoverageSummaryText(relevantEntries, maxServers, maxFiles);
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
        collectDiagnosticSummaryCounts(fileDiags, entry, this.cwd, this.excludePatterns);
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
    const evidence = this.toWorkspaceDiagnosticEvidence(
      collectClientDiagnosticEvidenceDocuments(this.clients.values(), this.cwd),
    );
    const clientCurrent = Array.from(this.clients.values()).every(
      (client) => client.getDiagnosticSnapshot().current,
    );
    return {
      entries: collectOutstandingDiagnosticSummaryEntries(
        this.clients.values(),
        this.cwd,
        this.excludePatterns,
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
        isPathRelevant(entry.file, normalizedPaths, this.cwd),
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
    const clients = Array.from(this.clients.values());
    let clientCurrent = true;
    const evidenceDocuments = clients.flatMap((client) => {
      const snapshot = client.getDiagnosticSnapshot();
      clientCurrent &&= snapshot.current;
      return snapshot.documents.map((document) => ({
        file: relativeFilePathFromUri(document.uri, this.cwd),
        status: document.status,
      }));
    });
    const evidence = this.toWorkspaceDiagnosticEvidence(evidenceDocuments);
    return {
      entries: collectOutstandingDiagnosticsDetailed(
        clients,
        this.cwd,
        this.excludePatterns,
        maxSeverity,
      ),
      current:
        clientCurrent && evidence.documents.every((document) => document.status === "confirmed"),
      evidence,
    };
  }
  private toWorkspaceDiagnosticEvidence(
    documents: readonly DiagnosticEvidenceDocument[],
  ): DiagnosticEvidenceSummary {
    const byFile = new Map<string, DiagnosticEvidenceDocument>();
    for (const document of documents) {
      const file = path.relative(this.cwd, path.resolve(this.cwd, document.file));
      if (shouldIgnoreLspPath(file, this.cwd)) continue;
      if (isExcludedByPattern(file, this.excludePatterns)) continue;
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
  ): Promise<CodeQueryResult<(SymbolInformation | WorkspaceSymbol)[]>> {
    const initial = await collectWorkspaceSymbols(this.clients.values(), query, control);
    if (!initial.hasSupport || initial.results.length > 0) {
      return workspaceSymbolCollectionResult(initial);
    }

    const warmed = await this.warmWorkspaceSymbolProjectsUntilResult({
      findWarmTargets: findWorkspaceSymbolWarmTargets,
      getWarmPosition: getWorkspaceSymbolWarmPosition,
      collect: (clients, value) => collectWorkspaceSymbols(clients, value, control),
      query,
      control,
    });
    return workspaceSymbolCollectionResult(warmed.collection ?? initial);
  }
  async ensureFileOpen(filePath: string): Promise<LspClient | null> {
    const resolvedPath = resolveSessionPath(this.cwd, filePath);
    const client = await this.getClientForFile(resolvedPath);
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
    query: string;
    control?: CodeRequestControl;
  }): Promise<{ warmedAny: boolean; collection: WorkspaceSymbolCollection | null }> {
    const { findWarmTargets, getWarmPosition, collect, query, control } = options;
    let warmedAny = false;

    for (const client of Array.from(this.clients.values())) {
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
        if (this.hasOpenFileInProject(client, target.projectRoot)) {
          this.warmedWorkspaceSymbolProjects.add(projectKey);
          continue;
        }

        const openedClient = await this.ensureFileOpen(target.file);
        if (!openedClient) continue;

        // A cancelled pass must not mark projects warmed on its way out.
        throwIfCodeRequestInterrupted(control);
        this.warmedWorkspaceSymbolProjects.add(projectKey);
        warmedAny = true;

        const symbols = control
          ? await openedClient.documentSymbols(target.file, control)
          : await openedClient.documentSymbols(target.file);
        if (symbols.kind !== "unavailable") {
          const hoverPosition = getWarmPosition(symbols.data);
          if (hoverPosition) {
            if (control) await openedClient.hover(target.file, hoverPosition, control);
            else await openedClient.hover(target.file, hoverPosition);
          }
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
      this.pendingWarmProbes.delete(projectKey);
    }
  }

  private async performWarmProbe(
    _client: LspClient,
    resolvedFile: string,
    projectKey: string,
    control?: CodeRequestControl,
  ): Promise<void> {
    const openedClient = await this.ensureFileOpen(resolvedFile);
    if (!openedClient) return;

    this.warmedSemanticProjects.add(projectKey);

    // The probe is shared state for concurrent callers. One caller's
    // cancellation must not cancel the shared in-flight queries, so only the
    // Debug Operation ID is forwarded; each caller races its own wait above.
    const sharedControl = { operationId: control?.operationId };
    const symbols = await openedClient.documentSymbols(resolvedFile, sharedControl);
    if (symbols.kind === "unavailable") return;
    const hoverPosition = getWorkspaceSymbolWarmPosition(symbols.data);
    if (hoverPosition) {
      await openedClient.hover(resolvedFile, hoverPosition, sharedControl);
    }
  }

  private hasOpenFileInProject(client: LspClient, projectRoot: string): boolean {
    return client.openFiles.some((openFile) => projectRoots.isWithinOrEqual(projectRoot, openFile));
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

function collectClientDiagnosticEvidenceDocuments(
  clients: Iterable<LspClient>,
  cwd: string,
): DiagnosticEvidenceDocument[] {
  return Array.from(clients).flatMap((client) =>
    client.getDiagnosticSnapshot().documents.map((document) => ({
      file: relativeFilePathFromUri(document.uri, cwd),
      status: document.status,
    })),
  );
}

function collectOutstandingDiagnosticSummaryEntries(
  clients: Iterable<LspClient>,
  cwd: string,
  excludePatterns: string[],
  maxSeverity: number,
): OutstandingDiagnosticSummaryEntry[] {
  const fileDiags = new Map<string, OutstandingDiagnosticSummaryEntry>();
  for (const client of clients) {
    for (const entry of client.getDiagnosticSnapshot().entries) {
      const file = relativeFilePathFromUri(entry.uri, cwd);
      if (shouldIgnoreLspPath(file, cwd) || isExcludedByPattern(file, excludePatterns)) continue;
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
