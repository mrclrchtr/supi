// LSP Manager — server pool with lazy spawning and diagnostic collection.
// biome-ignore-all lint/nursery/noExcessiveLinesPerFile: LspManager stays cohesive; recovery and sync helpers are split into manager-*.ts modules.
import * as fs from "node:fs";
import * as path from "node:path";
import * as projectRoots from "@mrclrchtr/supi-core";
import { LspClient } from "../client/client.ts";
import { getServerForFile } from "../config.ts";
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
import type {
  DetectedProjectServer,
  Diagnostic,
  FileEvent,
  LspConfig,
  ProjectServerInfo,
} from "../types.ts";
import { commandExists } from "../utils.ts";
import {
  closeFileAcrossClients,
  pruneMissingFilesFromClients,
  refreshOpenDiagnosticsForClients,
} from "./manager-client-state.ts";
import {
  collectOutstandingDiagnosticsDetailed,
  mapCascadeDiagnosticsToFiles,
  syncClientFileAndGetCascadingDiagnostics,
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
// ── LspManager ────────────────────────────────────────────────────────
export class LspManager {
  /** Active clients keyed by "serverName:root" */
  private clients = new Map<string, LspClient>();
  /** Servers we've already tried and failed to start */
  private unavailable = new Set<string>();
  /** Memoized per-command availability of LSP server binaries on PATH */
  private commandAvailability = new Map<string, boolean>();
  /** Guards against concurrent client creation for the same server:root key */
  private pendingStarts = new Map<string, Promise<LspClient | null>>();
  /** Preferred project roots discovered by proactive scan or lazy startup */
  private knownRoots = new Map<string, string[]>();
  /** User-configured gitignore-style exclude patterns */
  private excludePatterns: string[] = [];
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
  /** Check whether a file path has an available LSP server. */
  isSupportedSourceFile(filePath: string): boolean {
    // Dependency directories are intentionally excluded from recent-path
    // tracking and diagnostic summaries (shouldIgnoreLspPath). Keep runtime
    // guidance activation consistent: reading or editing a file under
    // node_modules / .pnpm must not arm LSP guidance for dependency sources.
    if (shouldIgnoreLspPath(filePath, this.cwd)) return false;
    const match = getServerForFile(this.config, filePath);
    if (!match) return false;
    const [serverName, serverConfig] = match;
    // Mirror getClientForFile's root resolution so the unavailable check stays
    // root-specific. A failed startup in one workspace must not suppress
    // activation for unrelated roots served by the same language server.
    const root = resolveRootForFile(filePath, serverName, serverConfig.rootMarkers, {
      knownRoots: this.knownRoots,
      cwd: this.cwd,
    });
    if (this.unavailable.has(`${serverName}:${root}`)) return false;
    return this.isServerCommandAvailable(serverConfig.command);
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
  /** Get or create an LSP client for the given file. */
  async getClientForFile(filePath: string): Promise<LspClient | null> {
    const match = getServerForFile(this.config, filePath);
    if (!match) return null;
    const [serverName, serverConfig] = match;
    const root = resolveRootForFile(filePath, serverName, serverConfig.rootMarkers, {
      knownRoots: this.knownRoots,
      cwd: this.cwd,
    });
    return this.startServerForRoot(serverName, root);
  }
  async startServerForRoot(serverName: string, root: string): Promise<LspClient | null> {
    const serverConfig = this.config.servers[serverName];
    if (!serverConfig) return null;
    const key = clientKey(serverName, root);
    if (this.unavailable.has(key)) return null;

    // Return existing client
    const existing = this.clients.get(key);
    if (existing && existing.status === "running") return existing;

    // If existing client errored, remove it
    if (existing && existing.status === "error") {
      this.clients.delete(key);
      this.unavailable.add(key);
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
    serverConfig: import("../types.ts").ServerConfig,
    root: string,
    key: string,
  ): Promise<LspClient | null> {
    // Validate command exists
    if (!commandExists(serverConfig.command)) {
      this.unavailable.add(key);
      return null;
    }

    // Spawn new client
    const client = new LspClient(serverName, serverConfig, root);
    this.clients.set(key, client);
    rememberKnownRoot(this.knownRoots, serverName, root);
    try {
      await client.start();
      return client;
    } catch {
      this.unavailable.add(key);
      this.clients.delete(key);
      return null;
    }
  }

  /** Find an already-started client for a file without spawning a new server. */
  private getExistingClientForFile(filePath: string): LspClient | null {
    const match = getServerForFile(this.config, filePath);
    if (!match) return null;
    const [serverName, serverConfig] = match;
    const root = resolveRootForFile(filePath, serverName, serverConfig.rootMarkers, {
      knownRoots: this.knownRoots,
      cwd: this.cwd,
    });
    return this.clients.get(clientKey(serverName, root)) ?? null;
  }

  /** Restart the clients that own the supplied file paths, if any are active. */
  async restartClientsForFiles(filePaths: string[]): Promise<string[]> {
    const restarted: string[] = [];
    const seen = new Set<string>();

    for (const filePath of filePaths) {
      const resolvedPath = path.resolve(this.cwd, filePath);
      const client = this.getExistingClientForFile(resolvedPath);
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
      this.unavailable.add(key);
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
        unavailable: this.unavailable.has(key),
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
  async syncFileAndGetDiagnostics(
    filePath: string,
    maxSeverity: number = 1,
  ): Promise<Diagnostic[]> {
    const resolvedPath = path.resolve(filePath);
    return (
      (await this.syncFileAndGetCascadingDiagnostics(resolvedPath, maxSeverity)).find(
        (entry) => entry.file === resolvedPath,
      )?.diagnostics ?? []
    );
  }
  async syncFileAndGetCascadingDiagnostics(
    filePath: string,
    maxSeverity: number = 1,
  ): Promise<Array<{ file: string; diagnostics: Diagnostic[] }>> {
    const client = await this.getClientForFile(filePath);
    if (!client) return [];
    const resolvedPath = path.resolve(filePath);
    try {
      const { primary, cascade } = await syncClientFileAndGetCascadingDiagnostics(
        client,
        resolvedPath,
        maxSeverity,
      );
      return [
        ...(primary.length > 0 ? [{ file: resolvedPath, diagnostics: primary }] : []),
        ...mapCascadeDiagnosticsToFiles(cascade),
      ];
    } catch {
      this.closeFile(resolvedPath);
      return [];
    }
  }
  /** Close a file across any active LSP clients and clear its cached diagnostics. */
  closeFile(filePath: string): void {
    closeFileAcrossClients(this.clients.values(), filePath);
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
    refreshedClients: number;
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
  async workspaceSymbol(query: string) {
    return (await import("./manager-workspace-symbol.ts")).managerWorkspaceSymbol(
      this.clients.values(),
      query,
    );
  }
  async ensureFileOpen(filePath: string): Promise<LspClient | null> {
    const client = await this.getClientForFile(filePath);
    const resolvedPath = path.resolve(filePath);
    if (!client) return null;
    try {
      client.didOpen(resolvedPath, fs.readFileSync(resolvedPath, "utf-8"));
      return client;
    } catch {
      this.closeFile(resolvedPath);
      return null;
    }
  }
}
