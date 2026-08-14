// LSP session runtime controller — pi-independent lifecycle for LSP session management.
//
// This controller owns session start/shutdown for one cwd:
//   - Creates and disposes the LspManager
//   - Publishes WorkspaceLspRuntime states through the existing registry
//   - Exposes the data the umbrella adapter will need later
//
// It does NOT import pi event types or ExtensionAPI.

// biome-ignore lint/style/noExcessiveLinesPerFile: session lifecycle, capability projection, and telemetry stay in one controller.
import type { WorkspaceRuntime } from "@mrclrchtr/supi-code-runtime/api";
import { recordDebugEvent } from "@mrclrchtr/supi-core/debug";
import { loadConfig } from "../config/config.ts";
import { type LspSettings, loadLspSettings } from "../config/lsp-settings.ts";
import { clearTsconfigCache } from "../config/tsconfig-scope.ts";
import type { DetectedProjectServer, LspConfig, ProjectServerInfo } from "../config/types.ts";
import { truncateIdentity } from "../debug-telemetry.ts";
import { scanWorkspaceSentinels } from "../diagnostics/workspace-sentinels.ts";
import { LspManager, type ManagerLifecycleTransition } from "../manager/manager.ts";
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
import { recordLspRuntimeTransition } from "./runtime-transition-debug.ts";
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

/** Cause of one observable LSP runtime lifecycle transition. */
export type LspRuntimeTransitionKind =
  | "startup"
  | "readiness"
  | "crash"
  | "recovery"
  | "shutdown"
  | "tracked-files";

/** Immutable aggregate state published when the LSP runtime changes. */
export interface LspRuntimeTransition {
  /** Monotonic transition generation for this controller instance. */
  readonly generation: number;
  readonly kind: LspRuntimeTransitionKind;
  /** True only when at least one concrete client is active and ready. */
  readonly semanticReady: boolean;
  readonly projectServers: readonly ProjectServerInfo[];
}

/** Listener for aggregate LSP runtime transitions. */
export type LspRuntimeTransitionListener = (transition: LspRuntimeTransition) => void;

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
  #activeManager: LspManager | null = null;
  #latestManagerTransition: ManagerLifecycleTransition | null = null;
  #projectedSemanticReady: boolean | null = null;
  #lifecycleGeneration = 0;
  #latestLifecycleTransition: LspRuntimeTransition | null = null;
  readonly #lifecycleListeners = new Set<LspRuntimeTransitionListener>();
  /** Monotonic ownership token for starts, shutdowns, and manager callbacks. */
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
   * Subscribe to aggregate runtime transitions.
   *
   * A late subscriber immediately receives the latest transition. The returned
   * function is idempotent and stops all later notifications for this listener.
   */
  subscribeLifecycle(listener: LspRuntimeTransitionListener): () => void {
    this.#lifecycleListeners.add(listener);
    if (this.#latestLifecycleTransition) {
      this.notifyLifecycleListener(listener, this.#latestLifecycleTransition);
    }
    return () => {
      this.#lifecycleListeners.delete(listener);
    };
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
    this.#activeManager = null;
    this.#latestManagerTransition = null;
    await this.#state.runtimeOwner.shutdown();
    if (this.#capabilityRuntime) unregisterLspCapabilities(this.#capabilityRuntime, this.#cwd);
    this.#projectedSemanticReady = null;
    clearWorkspaceLspRuntime(this.#cwd);
  }

  /** Publish an explicit disabled state when no language-server routes remain enabled. */
  private setDisabled(generation: number): LspStartResult {
    if (generation !== this.#readinessGeneration) return supersededStartResult();
    const message = "All language servers are disabled by configuration.";
    this.#activeManager = null;
    this.#latestManagerTransition = null;
    if (this.#capabilityRuntime) unregisterLspCapabilities(this.#capabilityRuntime, this.#cwd);
    this.#projectedSemanticReady = null;
    this.#state = { kind: "disabled", message };
    setWorkspaceLspRuntimeState(this.#cwd, { kind: "disabled" });
    return { kind: "disabled", message };
  }

  /** Set controller state to unavailable with the given error. */
  private setUnavailable(error: unknown, generation: number): LspStartResult {
    if (generation !== this.#readinessGeneration) return supersededStartResult();
    const reason = error instanceof Error ? error.message : String(error);
    this.#activeManager = null;
    this.#latestManagerTransition = null;
    if (this.#capabilityRuntime) unregisterLspCapabilities(this.#capabilityRuntime, this.#cwd);
    this.#projectedSemanticReady = null;
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

    let manager: LspManager;
    manager = new LspManager(config, this.#cwd, (transition) => {
      this.handleManagerLifecycle(manager, generation, transition);
    });
    this.#activeManager = manager;
    this.#latestManagerTransition = null;
    this.publishLifecycle("startup", false, []);
    manager.setExcludePatterns(settings.exclude);
    setWorkspaceLspRuntimeState(this.#cwd, { kind: "pending" });

    const detectedServers = scanProjectCapabilities(config, this.#cwd);
    manager.registerDetectedServers(detectedServers);
    await startDetectedServers(manager, detectedServers);
    if (generation !== this.#readinessGeneration) {
      if (this.#activeManager === manager) this.#activeManager = null;
      await manager.shutdownAll();
      return supersededStartResult();
    }

    scanWorkspaceSentinels(this.#cwd);

    const runtimeOwner = createWorkspaceLspRuntimeOwner(manager);
    const workspaceRuntime = runtimeOwner.runtime;
    setWorkspaceLspRuntimeState(this.#cwd, { kind: "ready", runtime: workspaceRuntime });

    if (this.#capabilityRuntime) {
      registerPendingLspCapabilities(this.#capabilityRuntime, this.#cwd, workspaceRuntime);
      this.#projectedSemanticReady = false;
    }

    const latestManagerTransition = this
      .#latestManagerTransition as ManagerLifecycleTransition | null;
    const projectServers = [
      ...(latestManagerTransition?.projectServers ?? workspaceRuntime.getProjectServers()),
    ];
    const semanticReady =
      latestManagerTransition?.semanticReady ??
      projectServers.some((server) => server.status === "running" && server.ready);

    this.#state = {
      kind: "ready",
      runtimeOwner,
      workspaceRuntime,
      projectServers,
      detectedServers,
      settings,
    };

    this.projectSemanticReadiness(workspaceRuntime, semanticReady);

    return { kind: "ready", runtime: workspaceRuntime };
  }

  private handleManagerLifecycle(
    manager: LspManager,
    readinessGeneration: number,
    transition: ManagerLifecycleTransition,
  ): void {
    if (readinessGeneration !== this.#readinessGeneration) return;
    if (this.#activeManager !== manager) return;
    this.#latestManagerTransition = transition;
    if (this.#state.kind === "ready") {
      this.#state.projectServers = [...transition.projectServers];
      this.projectSemanticReadiness(this.#state.workspaceRuntime, transition.semanticReady);
    }
    this.publishLifecycle(transition.kind, transition.semanticReady, transition.projectServers);
  }

  private projectSemanticReadiness(
    workspaceRuntime: WorkspaceLspRuntime,
    semanticReady: boolean,
  ): void {
    if (!this.#capabilityRuntime) return;
    if (semanticReady) {
      if (this.#projectedSemanticReady === true) return;
      markLspCapabilitiesReady(this.#capabilityRuntime, this.#cwd);
      this.#projectedSemanticReady = true;
      this.recordCapabilityTransition(true);
      return;
    }
    if (this.#projectedSemanticReady === false) return;
    registerPendingLspCapabilities(this.#capabilityRuntime, this.#cwd, workspaceRuntime);
    this.#projectedSemanticReady = false;
    this.recordCapabilityTransition(false);
  }

  /** Record one semantic capability ready↔pending transition for telemetry. */
  private recordCapabilityTransition(ready: boolean): void {
    recordDebugEvent({
      source: "lsp",
      level: "debug",
      category: "capability.transition",
      message: `LSP capability transition: ${ready ? "ready" : "pending"}`,
      cwd: truncateIdentity(this.#cwd),
      data: { ready },
    });
  }

  private publishLifecycle(
    kind: LspRuntimeTransitionKind,
    semanticReady: boolean,
    projectServers: readonly ProjectServerInfo[],
  ): void {
    const transition: LspRuntimeTransition = {
      generation: ++this.#lifecycleGeneration,
      kind,
      semanticReady,
      projectServers: projectServers.map((server) => ({
        ...server,
        fileTypes: [...server.fileTypes],
        supportedActions: [...server.supportedActions],
        openFiles: [...server.openFiles],
      })),
    };
    recordLspRuntimeTransition(this.#cwd, transition);
    this.#latestLifecycleTransition = transition;
    for (const listener of this.#lifecycleListeners) {
      this.notifyLifecycleListener(listener, transition);
    }
  }

  private notifyLifecycleListener(
    listener: LspRuntimeTransitionListener,
    transition: LspRuntimeTransition,
  ): void {
    try {
      listener(transition);
    } catch {
      // Lifecycle observers must not alter runtime behavior.
    }
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
    this.#activeManager = null;
    this.#latestManagerTransition = null;

    if (this.#capabilityRuntime) {
      unregisterLspCapabilities(this.#capabilityRuntime, this.#cwd);
    }
    this.#projectedSemanticReady = null;

    if (this.#cwd) {
      clearWorkspaceLspRuntime(this.#cwd);
    }

    if (this.#state.kind === "ready") {
      await this.#state.runtimeOwner.shutdown();
    }

    this.#state = { kind: "initial" };
    this.publishLifecycle("shutdown", false, []);
  }

  /** Get the missing servers warning (servers whose binary is not on PATH). */
  getMissingServers(): Array<{ name: string; command: string }> {
    if (this.#state.kind !== "ready") return [];
    const config = loadConfig(this.#cwd);
    return scanMissingServers(config, this.#cwd);
  }
}
