// LSP Manager — server pool with lazy spawning and diagnostic collection.
// biome-ignore-all lint/style/noExcessiveLinesPerFile: LspManager stays cohesive; recovery and sync helpers are split into manager-*.ts modules.
import * as fs from "node:fs";
import * as path from "node:path";
import { type CodeQueryResult, unavailableCodeQuery } from "@mrclrchtr/supi-code-runtime/api";
import * as projectRoots from "@mrclrchtr/supi-core/project";
import { LspClient } from "../client/client.ts";
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
  displayRelativeFilePath,
  formatCoverageSummaryText,
  formatOutstandingDiagnosticsSummaryText,
  isPathRelevant,
  normalizeRelevantPaths,
  shouldIgnoreLspPath,
} from "../summary.ts";
import { commandExists, resolveSessionPath } from "../utils.ts";
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
import { recoverWorkspaceDiagnostics as recoverWorkspaceDiagnosticsImpl } from "./manager-workspace-recovery.ts";
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
  /** Preferred project roots discovered by proactive scan or lazy startup */
  private knownRoots = new Map<string, string[]>();
  /** User-configured gitignore-style exclude patterns */
  private excludePatterns: string[] = [];
  /** Project roots already warmed for workspace-symbol queries. */
  private warmedWorkspaceSymbolProjects = new Set<string>();
  /** Project roots whose semantic state was warmed with a readiness probe. */
  private warmedSemanticProjects = new Set<string>();
  /** In-flight warm-up probes keyed by project key so concurrent callers share one probe. */
  private pendingWarmProbes = new Map<string, Promise<void>>();
  constructor(
    private readonly config: LspConfig,
    private readonly cwd: string,
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
    const client = new LspClient(serverName, serverConfig, root);
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

  /** Restart the clients that own the supplied file paths, if any are active. */
  async restartClientsForFiles(filePaths: string[]): Promise<string[]> {
    const restarted: string[] = [];
    const seen = new Set<string>();

    for (const filePath of filePaths) {
      const client = this.getExistingClientForFile(filePath);
      if (!client) continue;

      const key = clientKey(client.name, client.root);
      if (seen.has(key)) continue;
      seen.add(key);

      if (await this.restartClient(client)) {
        restarted.push(key);
      }
    }

    return restarted;
  }

  private async restartClient(client: LspClient): Promise<boolean> {
    const key = clientKey(client.name, client.root);
    const serverConfig = this.config.servers[client.name];
    if (!serverConfig) return false;

    const openFiles = client.openFiles;
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

    const replacement = new LspClient(client.name, serverConfig, client.root);
    this.clients.set(key, replacement);
    rememberKnownRoot(this.knownRoots, client.name, client.root);

    try {
      await replacement.start();
      for (const filePath of openFiles) {
        if (!fs.existsSync(filePath)) continue;
        try {
          replacement.didOpen(filePath, fs.readFileSync(filePath, "utf-8"));
        } catch {
          // Skip unreadable files on restart.
        }
      }
      return true;
    } catch {
      this.clients.delete(key);
      this.unavailable.set(key, "start-failed");
      return false;
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
  async waitUntilFileReady(filePath: string): Promise<LspClient | null> {
    const resolvedPath = resolveSessionPath(this.cwd, filePath);
    const client = await this.getClientForFile(resolvedPath);
    if (!client) return null;
    await client.getReady();
    await this.warmSemanticProject(client, resolvedPath, true);
    return client;
  }

  /**
   * Wait until all started clients are query-ready, then warm one project file per client/root.
   * Returns the number of concrete clients that reached readiness.
   */
  async waitUntilWorkspaceReady(): Promise<number> {
    const activeClients = Array.from(this.clients.values()).filter(
      (client) => client.status === "running",
    );
    await Promise.all(activeClients.map((client) => client.getReady()));

    for (const client of activeClients) {
      const serverConfig = this.config.servers[client.name];
      if (!serverConfig) continue;
      const target = findWorkspaceSymbolWarmTargets(
        client.root,
        serverConfig.rootMarkers,
        serverConfig.fileTypes,
      )[0];
      if (!target) continue;
      await this.warmSemanticProject(client, target.file);
    }
    return activeClients.length;
  }
  async syncFileAndGetDiagnostics(
    filePath: string,
    maxSeverity: number = 1,
  ): Promise<CodeQueryResult<Diagnostic[]>> {
    const resolvedPath = resolveSessionPath(this.cwd, filePath);
    const client = await this.getClientForFile(resolvedPath);
    if (!client) {
      return unavailableCodeQuery(`No LSP client can collect diagnostics for ${resolvedPath}.`);
    }
    try {
      return {
        kind: "completed",
        data: await syncClientFileAndGetDiagnostics(client, resolvedPath, maxSeverity),
      };
    } catch (error) {
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
  /** Re-sync all open documents across active clients and wait for diagnostics to settle. */
  async refreshOpenDiagnostics(options?: { maxWaitMs?: number; quietMs?: number }): Promise<void> {
    await refreshOpenDiagnosticsForClients(this.clients.values(), options);
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

  /** Force a workspace-wide diagnostic recovery pass. */
  async recoverWorkspaceDiagnostics(options?: {
    changes?: FileEvent[];
    restartIfStillStale?: boolean;
    maxWaitMs?: number;
    quietMs?: number;
  }): Promise<{
    attemptedClients: number;
    restartedClients: number;
    staleAssessment: {
      suspected: boolean;
      matchedFiles: Array<{ file: string; diagnostics: Diagnostic[] }>;
      warning: string | null;
    };
  }> {
    return recoverWorkspaceDiagnosticsImpl(this, options);
  }

  /** Shut down all running LSP servers. */
  async shutdownAll(): Promise<void> {
    const shutdowns = Array.from(this.clients.values()).map((c) => c.shutdown().catch(() => {}));
    await Promise.all(shutdowns);
    this.clients.clear();
    this.unavailable.clear();
    this.knownRoots.clear();
    this.warmedWorkspaceSymbolProjects.clear();
    this.warmedSemanticProjects.clear();
    this.pendingWarmProbes.clear();
  }
  /** Get status of all servers. */
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
    this.pruneMissingFiles();
    const fileDiags = new Map<string, { errors: number; warnings: number }>();
    for (const client of this.clients.values()) {
      for (const entry of client.getAllDiagnostics()) {
        collectDiagnosticSummaryCounts(fileDiags, entry, this.cwd, this.excludePatterns);
      }
    }
    return Array.from(fileDiags.entries()).map(([file, counts]) => ({ file, ...counts }));
  }
  /** Get outstanding diagnostics at or above the configured inline threshold. */
  getOutstandingDiagnosticSummary(maxSeverity: number = 1): OutstandingDiagnosticSummaryEntry[] {
    this.pruneMissingFiles();
    const fileDiags = new Map<string, OutstandingDiagnosticSummaryEntry>();
    for (const client of this.clients.values()) {
      for (const entry of client.getAllDiagnostics()) {
        const file = relativeFilePathFromUri(entry.uri, this.cwd);
        if (shouldIgnoreLspPath(file, this.cwd)) continue;
        if (isExcludedByPattern(file, this.excludePatterns)) continue;
        const current = fileDiags.get(file) ?? createOutstandingDiagnosticSummary(file);
        const next = accumulateOutstandingDiagnostics(current, entry.diagnostics, maxSeverity);
        if (next.total > 0) {
          fileDiags.set(file, next);
        }
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
    this.pruneMissingFiles();
    return collectOutstandingDiagnosticsDetailed(
      this.clients.values(),
      this.cwd,
      this.excludePatterns,
      maxSeverity,
    );
  }
  async workspaceSymbol(
    query: string,
  ): Promise<CodeQueryResult<(SymbolInformation | WorkspaceSymbol)[]>> {
    const initial = await collectWorkspaceSymbols(this.clients.values(), query);
    if (!initial.hasSupport || initial.results.length > 0) {
      return workspaceSymbolCollectionResult(initial);
    }

    const warmed = await this.warmWorkspaceSymbolProjectsUntilResult(
      findWorkspaceSymbolWarmTargets,
      getWorkspaceSymbolWarmPosition,
      collectWorkspaceSymbols,
      query,
    );
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
  private async warmWorkspaceSymbolProjectsUntilResult(
    findWarmTargets: (
      root: string,
      rootMarkers: string[],
      fileTypes: string[],
    ) => Array<{ projectRoot: string; file: string }>,
    getWarmPosition: (
      symbols: import("../config/types.ts").DocumentSymbol[] | SymbolInformation[] | null,
    ) => import("../config/types.ts").Position | null,
    collect: (clients: Iterable<LspClient>, query: string) => Promise<WorkspaceSymbolCollection>,
    query: string,
  ): Promise<{ warmedAny: boolean; collection: WorkspaceSymbolCollection | null }> {
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

        this.warmedWorkspaceSymbolProjects.add(projectKey);
        warmedAny = true;

        const symbols = await openedClient.documentSymbols(target.file);
        if (symbols.kind !== "unavailable") {
          const hoverPosition = getWarmPosition(symbols.data);
          if (hoverPosition) await openedClient.hover(target.file, hoverPosition);
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
      await pending;
      return;
    }

    const probe = this.performWarmProbe(client, resolvedFile, projectKey);
    this.pendingWarmProbes.set(projectKey, probe);
    try {
      await probe;
    } finally {
      this.pendingWarmProbes.delete(projectKey);
    }
  }

  private async performWarmProbe(
    _client: LspClient,
    resolvedFile: string,
    projectKey: string,
  ): Promise<void> {
    const openedClient = await this.ensureFileOpen(resolvedFile);
    if (!openedClient) return;

    this.warmedSemanticProjects.add(projectKey);

    const symbols = await openedClient.documentSymbols(resolvedFile);
    if (symbols.kind === "unavailable") return;
    const hoverPosition = getWorkspaceSymbolWarmPosition(symbols.data);
    if (hoverPosition) await openedClient.hover(resolvedFile, hoverPosition);
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
