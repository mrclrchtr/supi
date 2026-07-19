// LSP session runtime controller — pi-independent lifecycle for LSP session management.
//
// This controller owns session start/shutdown for one cwd:
//   - Creates and disposes the LspManager
//   - Publishes WorkspaceLspRuntime states through the existing registry
//   - Exposes the data the umbrella adapter will need later
//
// It does NOT import pi event types or ExtensionAPI.

import type { WorkspaceRuntime } from "@mrclrchtr/supi-code-runtime/api";
import { loadConfig } from "../config/config.ts";
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
import {
  clearWorkspaceLspRuntime,
  createWorkspaceLspRuntimeOwner,
  setWorkspaceLspRuntimeState,
  type WorkspaceLspRuntime,
} from "./runtime-registry.ts";
import { scanMissingServers, scanProjectCapabilities, startDetectedServers } from "./scanner.ts";

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

type WorkspaceLspRuntimeOwner = ReturnType<typeof createWorkspaceLspRuntimeOwner>;

interface LspControllerReady {
  kind: "ready";
  runtimeOwner: WorkspaceLspRuntimeOwner;
  workspaceRuntime: WorkspaceLspRuntime;
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
  | { kind: "ready"; runtime: WorkspaceLspRuntime }
  | { kind: "disabled"; message: string }
  | { kind: "unavailable"; reason: string };

function supersededStartResult(): LspStartResult {
  return { kind: "unavailable", reason: "LSP startup was superseded by a newer lifecycle event." };
}

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
 *   // use result.runtime for workspace LSP operations
 * }
 * // later
 * await controller.shutdown();
 * ```
 */
export class LspRuntimeController {
  readonly #cwd: string;
  #state: LspControllerState;
  #capabilityRuntime: WorkspaceRuntime | null;
  /** Monotonic ownership token for starts, shutdowns, and async warm-up. */
  #readinessGeneration = 0;

  constructor(cwd: string, runtime?: WorkspaceRuntime) {
    this.#cwd = cwd;
    this.#state = { kind: "initial" };
    this.#capabilityRuntime = runtime ?? null;
  }

  /** The workspace cwd this controller was created for. */
  get cwd(): string {
    return this.#cwd;
  }

  /** Current controller state. */
  get kind(): LspControllerState["kind"] {
    return this.#state.kind;
  }

  /** Workspace LSP operations, only available when state is "ready". */
  get workspaceRuntime(): WorkspaceLspRuntime | null {
    return this.#state.kind === "ready" ? this.#state.workspaceRuntime : null;
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
  get capabilityRuntime(): WorkspaceRuntime | null {
    return this.#capabilityRuntime;
  }

  /** Attach the capability broker used for semantic registration. */
  setRuntime(runtime: WorkspaceRuntime): void {
    this.#capabilityRuntime = runtime;
  }

  /**
   * Start the LSP session for this controller's cwd.
   *
   * Loads settings, creates the manager, starts detected servers,
   * publishes the session service, and registers capabilities.
   *
   * Always attempts detected servers unless they were explicitly disabled
   * per language via `lsp.servers.<language>.enabled: false`.
   * The global `lsp.enabled` and `lsp.active` keys are deprecated and ignored.
   *
   * Returns the start result and updates the controller's state.
   */
  async start(): Promise<LspStartResult> {
    const generation = ++this.#readinessGeneration;
    clearTsconfigCache();

    // Restart safety: shut down any existing session before creating a new one
    await this.cleanupExistingSession();
    if (generation !== this.#readinessGeneration) return supersededStartResult();

    const lspSettings = loadLspSettings(this.#cwd);
    // Note: lspSettings.enabled is ignored — the global switch is deprecated.
    // Per-language `lsp.servers.<language>.enabled: false` is the supported
    // way to opt out and is already handled by loadConfig.
    // lspSettings.active is also ignored — the allowlist is deprecated.

    const config = loadConfig(this.#cwd);

    try {
      return await this.initializeLspSession(config, lspSettings, generation);
    } catch (error: unknown) {
      return this.setUnavailable(error, generation);
    }
  }

  /**
   * Shut down any existing LSP session before starting a new one.
   */
  private async cleanupExistingSession(): Promise<void> {
    if (this.#state.kind !== "ready") return;
    await this.#state.runtimeOwner.shutdown();
    if (this.#capabilityRuntime) unregisterLspCapabilities(this.#capabilityRuntime, this.#cwd);
    clearWorkspaceLspRuntime(this.#cwd);
  }

  /** Publish an explicit disabled state when no language-server routes remain enabled. */
  private setDisabled(generation: number): LspStartResult {
    if (generation !== this.#readinessGeneration) return supersededStartResult();
    const message = "All language servers are disabled by configuration.";
    if (this.#capabilityRuntime) unregisterLspCapabilities(this.#capabilityRuntime, this.#cwd);
    this.#state = { kind: "disabled", message };
    setWorkspaceLspRuntimeState(this.#cwd, { kind: "disabled" });
    return { kind: "disabled", message };
  }

  /** Set controller state to unavailable with the given error. */
  private setUnavailable(error: unknown, generation: number): LspStartResult {
    if (generation !== this.#readinessGeneration) return supersededStartResult();
    const reason = error instanceof Error ? error.message : String(error);
    this.#state = { kind: "unavailable", reason };
    setWorkspaceLspRuntimeState(this.#cwd, { kind: "unavailable", reason });
    return { kind: "unavailable", reason };
  }

  /**
   * Initialize the LSP session: create manager, detect and start servers,
   * publish service state and capabilities.
   */
  private async initializeLspSession(
    config: LspConfig,
    settings: LspSettings,
    generation: number,
  ): Promise<LspStartResult> {
    if (generation !== this.#readinessGeneration) return supersededStartResult();
    clearWorkspaceLspRuntime(this.#cwd);
    if (Object.keys(config.servers).length === 0) return this.setDisabled(generation);
    this.#state = { kind: "pending" };

    const manager = new LspManager(config, this.#cwd);
    manager.setExcludePatterns(settings.exclude);
    setWorkspaceLspRuntimeState(this.#cwd, { kind: "pending" });

    const detectedServers = scanProjectCapabilities(config, this.#cwd);
    manager.registerDetectedServers(detectedServers);
    await startDetectedServers(manager, detectedServers);
    if (generation !== this.#readinessGeneration) {
      await manager.shutdownAll();
      return supersededStartResult();
    }

    scanWorkspaceSentinels(this.#cwd);

    const runtimeOwner = createWorkspaceLspRuntimeOwner(manager);
    const workspaceRuntime = runtimeOwner.runtime;
    setWorkspaceLspRuntimeState(this.#cwd, { kind: "ready", runtime: workspaceRuntime });

    if (this.#capabilityRuntime) {
      registerPendingLspCapabilities(this.#capabilityRuntime, this.#cwd, workspaceRuntime);
    }

    const projectServers = workspaceRuntime.getProjectServers();

    this.#state = {
      kind: "ready",
      runtimeOwner,
      workspaceRuntime,
      projectServers,
      detectedServers,
      settings,
    };

    void this.promoteSemanticReadiness(workspaceRuntime, generation);

    return { kind: "ready", runtime: workspaceRuntime };
  }

  private async promoteSemanticReadiness(
    workspaceRuntime: WorkspaceLspRuntime,
    readinessGeneration: number,
  ): Promise<void> {
    try {
      const readiness = await workspaceRuntime.waitUntilReadyForWorkspace();
      if (readiness.kind !== "ready") return;
    } catch {
      return;
    }

    if (!this.isCurrentRuntime(workspaceRuntime, readinessGeneration)) return;
    if (this.#state.kind !== "ready") return;

    this.#state.projectServers = workspaceRuntime.getProjectServers();
    if (this.#capabilityRuntime) {
      markLspCapabilitiesReady(this.#capabilityRuntime, this.#cwd);
    }
  }

  private isCurrentRuntime(
    workspaceRuntime: WorkspaceLspRuntime,
    readinessGeneration: number,
  ): boolean {
    return (
      readinessGeneration === this.#readinessGeneration &&
      this.#state.kind === "ready" &&
      this.#state.workspaceRuntime === workspaceRuntime
    );
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

    if (this.#capabilityRuntime) {
      unregisterLspCapabilities(this.#capabilityRuntime, this.#cwd);
    }

    if (this.#cwd) {
      clearWorkspaceLspRuntime(this.#cwd);
    }

    if (this.#state.kind === "ready") {
      await this.#state.runtimeOwner.shutdown();
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
