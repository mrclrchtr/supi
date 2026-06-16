// LSP session runtime controller — pi-independent lifecycle for LSP session management.
//
// This controller owns session start/shutdown for one cwd:
//   - Creates and disposes the LspManager
//   - Publishes SessionLspService states through the existing registry
//   - Exposes the data the umbrella adapter will need later
//
// It does NOT import pi event types or ExtensionAPI.

import type { WorkspaceRuntime } from "@mrclrchtr/supi-code-runtime/api";
import { loadConfig, resolveLanguageAlias } from "../config/config.ts";
import { type LspSettings, loadLspSettings } from "../config/lsp-settings.ts";
import { clearTsconfigCache } from "../config/tsconfig-scope.ts";
import type { DetectedProjectServer, LspConfig, ProjectServerInfo } from "../config/types.ts";
import { scanWorkspaceSentinels } from "../diagnostics/workspace-sentinels.ts";
import { LspManager } from "../manager/manager.ts";
import {
  markLspCapabilitiesReady,
  registerPendingLspCapabilities,
  unregisterLspCapabilities,
} from "./runtime-registration.ts";
import { scanMissingServers, scanProjectCapabilities, startDetectedServers } from "./scanner.ts";
import {
  clearSessionLspService,
  SessionLspService,
  setSessionLspServiceState,
} from "./service-registry.ts";

// ── Types ─────────────────────────────────────────────────────────────

/** Starting state before {@link LspRuntimeController.start} is called. */
export type LspControllerState =
  | LspControllerInitial
  | LspControllerPending
  | LspControllerReady
  | LspControllerDisabled
  | LspControllerUnavailable;

interface LspControllerInitial {
  kind: "initial";
}

interface LspControllerPending {
  kind: "pending";
}

interface LspControllerReady {
  kind: "ready";
  manager: LspManager;
  service: SessionLspService;
  projectServers: ProjectServerInfo[];
  detectedServers: DetectedProjectServer[];
  settings: LspSettings;
}

interface LspControllerDisabled {
  kind: "disabled";
  message: string;
}

interface LspControllerUnavailable {
  kind: "unavailable";
  reason: string;
}

/** Result type from {@link LspRuntimeController.start}. */
export type LspStartResult =
  | { kind: "ready"; manager: LspManager; service: SessionLspService }
  | { kind: "disabled"; message: string }
  | { kind: "unavailable"; reason: string };

// ── Controller ────────────────────────────────────────────────────────

/**
 * Pi-independent LSP session lifecycle controller.
 *
 * Use this in the umbrella extension (supi-code-intelligence) instead of
 * reaching into substrate extension internals.
 *
 * @example
 * ```ts
 * const controller = new LspRuntimeController(cwd);
 * const result = await controller.start();
 * if (result.kind === "ready") {
 *   // use controller.manager, controller.service
 * }
 * // later
 * await controller.shutdown();
 * ```
 */
export class LspRuntimeController {
  readonly #cwd: string;
  #state: LspControllerState;
  #runtime: WorkspaceRuntime | null;
  #readinessGeneration = 0;

  constructor(cwd: string, runtime?: WorkspaceRuntime) {
    this.#cwd = cwd;
    this.#state = { kind: "initial" };
    this.#runtime = runtime ?? null;
  }

  /** The workspace cwd this controller was created for. */
  get cwd(): string {
    return this.#cwd;
  }

  /** Current controller state. */
  get kind(): LspControllerState["kind"] {
    return this.#state.kind;
  }

  /** The LspManager, only available when state is "ready". */
  get manager(): LspManager | null {
    return this.#state.kind === "ready" ? this.#state.manager : null;
  }

  /** The SessionLspService, only available when state is "ready". */
  get service(): SessionLspService | null {
    return this.#state.kind === "ready" ? this.#state.service : null;
  }

  /** Project server info, only available when state is "ready". */
  get projectServers(): ProjectServerInfo[] {
    if (this.#state.kind === "ready") return this.#state.projectServers;
    return [];
  }

  /** Detected servers, only available when state is "ready". */
  get detectedServers(): DetectedProjectServer[] {
    if (this.#state.kind === "ready") return this.#state.detectedServers;
    return [];
  }

  /** LSP settings used for this session. */
  get settings(): LspSettings | null {
    if (this.#state.kind === "ready") return this.#state.settings;
    return null;
  }

  /** The WorkspaceRuntime registered for this session's cwd. */
  get runtime(): WorkspaceRuntime | null {
    return this.#runtime;
  }

  /** Attach a WorkspaceRuntime for capability registration. */
  setRuntime(runtime: WorkspaceRuntime): void {
    this.#runtime = runtime;
  }

  /**
   * Start the LSP session for this controller's cwd.
   *
   * Loads settings, creates the manager, starts detected servers,
   * publishes the session service, and registers capabilities.
   *
   * Returns the start result and updates the controller's state.
   */
  async start(): Promise<LspStartResult> {
    clearTsconfigCache();

    // Restart safety: shut down any existing session before creating a new one
    await this.cleanupExistingSession();

    const lspSettings = loadLspSettings(this.#cwd);

    if (!lspSettings.enabled) {
      return this.setDisabled();
    }

    const config = this.applyServerAllowlist(loadConfig(this.#cwd), lspSettings);

    try {
      return await this.initializeLspSession(config, lspSettings);
    } catch (error: unknown) {
      return this.setUnavailable(error);
    }
  }

  /**
   * Shut down any existing LSP session before starting a new one.
   */
  private async cleanupExistingSession(): Promise<void> {
    this.#readinessGeneration++;
    if (this.#state.kind !== "ready") return;
    await this.#state.manager.shutdownAll();
    if (this.#runtime) unregisterLspCapabilities(this.#runtime, this.#cwd);
    clearSessionLspService(this.#cwd);
  }

  /** Set controller state to disabled and publish disabled service state. */
  private setDisabled(): LspStartResult {
    const message = "LSP is disabled in settings";
    this.#state = { kind: "disabled", message };
    clearSessionLspService(this.#cwd);
    setSessionLspServiceState(this.#cwd, { kind: "disabled" });
    return { kind: "disabled", message };
  }

  /** Set controller state to unavailable with the given error. */
  private setUnavailable(error: unknown): LspStartResult {
    const reason = error instanceof Error ? error.message : String(error);
    this.#state = { kind: "unavailable", reason };
    setSessionLspServiceState(this.#cwd, { kind: "unavailable", reason });
    return { kind: "unavailable", reason };
  }

  /**
   * Apply the server allowlist filter from config settings.
   * Removes servers not in the active allowlist.
   */
  private applyServerAllowlist(config: LspConfig, settings: LspSettings): LspConfig {
    if (settings.active.length === 0) return config;

    const allowList = new Set(settings.active.map(resolveLanguageAlias));
    for (const name of Object.keys(config.servers)) {
      if (!allowList.has(name)) {
        delete config.servers[name];
      }
    }
    return config;
  }

  /**
   * Initialize the LSP session: create manager, detect and start servers,
   * publish service state and capabilities.
   */
  private async initializeLspSession(
    config: LspConfig,
    settings: LspSettings,
  ): Promise<LspStartResult> {
    clearSessionLspService(this.#cwd);
    this.#state = { kind: "pending" };

    const manager = new LspManager(config, this.#cwd);
    manager.setExcludePatterns(settings.exclude);
    setSessionLspServiceState(this.#cwd, { kind: "pending" });

    const detectedServers = scanProjectCapabilities(config, this.#cwd);
    manager.registerDetectedServers(detectedServers);
    await startDetectedServers(manager, detectedServers);

    scanWorkspaceSentinels(this.#cwd);

    const service = new SessionLspService(manager);
    setSessionLspServiceState(this.#cwd, { kind: "ready", service });

    if (this.#runtime) {
      registerPendingLspCapabilities(this.#runtime, this.#cwd, service);
    }

    const projectServers = manager.getKnownProjectServers(detectedServers);

    this.#state = {
      kind: "ready",
      manager,
      service,
      projectServers,
      detectedServers,
      settings,
    };

    const readinessGeneration = ++this.#readinessGeneration;
    void this.promoteSemanticReadiness(manager, detectedServers, readinessGeneration);

    return { kind: "ready", manager, service };
  }

  private async promoteSemanticReadiness(
    manager: LspManager,
    detectedServers: DetectedProjectServer[],
    readinessGeneration: number,
  ): Promise<void> {
    try {
      await manager.waitUntilWorkspaceReady();
    } catch {
      this.retractPendingCapabilities();
      return;
    }

    if (
      readinessGeneration !== this.#readinessGeneration ||
      this.#state.kind !== "ready" ||
      this.#state.manager !== manager
    ) {
      return;
    }

    this.#state.projectServers = manager.getKnownProjectServers(detectedServers);
    if (this.#runtime) {
      markLspCapabilitiesReady(this.#runtime, this.#cwd);
    }
  }

  /**
   * Retract the pending semantic registration when warm-up fails.
   * Leaves the workspace in unavailable state so callers see a definitive
   * failure rather than an orphaned pending capability.
   */
  private retractPendingCapabilities(): void {
    if (this.#runtime) {
      unregisterLspCapabilities(this.#runtime, this.#cwd);
    }
    setSessionLspServiceState(this.#cwd, {
      kind: "unavailable",
      reason: "LSP warm-up failed. Check code_health for server status.",
    });
  }

  /**
   * Shut down the LSP session.
   *
   * Unregisters capabilities, clears the service state, and shuts down
   * all LSP clients.
   */
  async shutdown(): Promise<void> {
    this.#readinessGeneration++;
    clearTsconfigCache();

    if (this.#runtime) {
      unregisterLspCapabilities(this.#runtime, this.#cwd);
    }

    if (this.#cwd) {
      clearSessionLspService(this.#cwd);
    }

    if (this.#state.kind === "ready") {
      await this.#state.manager.shutdownAll();
    }

    this.#state = { kind: "initial" };
  }

  /** Get the missing servers warning (servers whose binary is not on PATH). */
  getMissingServers(): Array<{ name: string; command: string }> {
    if (this.#state.kind !== "ready") return [];
    const config = loadConfig(this.#cwd);
    return scanMissingServers(config, this.#cwd);
  }
}
