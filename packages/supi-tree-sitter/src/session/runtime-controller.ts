// Tree-sitter session runtime controller — pi-independent lifecycle for structural analysis.
//
// This controller owns runtime creation/disposal for one cwd:
//   - Creates and disposes the TreeSitterRuntime
//   - Creates TreeSitterService from the runtime
//   - Publishes SessionTreeSitterService state through the existing registry
//   - Exposes ready/unavailable lifecycle for umbrella adapter consumption

import type { WorkspaceRuntime } from "@mrclrchtr/supi-code-runtime/api";
import type { SessionTreeSitterService, TreeSitterService } from "../types.ts";
import { TreeSitterRuntime } from "./runtime.ts";
import {
  registerTreeSitterCapabilities,
  unregisterTreeSitterCapabilities,
} from "./runtime-registration.ts";
import { clearSessionTreeSitterService, setSessionTreeSitterService } from "./service-registry.ts";
import { createTreeSitterService } from "./session.ts";

// ── Types ─────────────────────────────────────────────────────────────

/** Starting state before or after shutdown. */
export type TsControllerState = TsControllerInitial | TsControllerReady | TsControllerUnavailable;

interface TsControllerInitial {
  kind: "initial";
}

interface TsControllerReady {
  kind: "ready";
  runtime: TreeSitterRuntime;
  service: TreeSitterService;
}

interface TsControllerUnavailable {
  kind: "unavailable";
  reason: string;
}

/** Result type from {@link TreeSitterRuntimeController.start}. */
export type TsStartResult = { kind: "ready" } | { kind: "unavailable"; reason: string };

// ── Controller ────────────────────────────────────────────────────────

/**
 * Pi-independent Tree-sitter session lifecycle controller.
 *
 * Use this in the umbrella extension (supi-code-intelligence) instead of
 * reaching into substrate extension internals.
 *
 * @example
 * ```ts
 * const controller = new TreeSitterRuntimeController(cwd);
 * const result = await controller.start();
 * if (result.kind === "ready") {
 *   // use controller.service, controller.runtime
 * }
 * // later
 * await controller.shutdown();
 * ```
 */
export class TreeSitterRuntimeController {
  readonly #cwd: string;
  #state: TsControllerState;
  #runtime: WorkspaceRuntime | null;

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
  get kind(): TsControllerState["kind"] {
    return this.#state.kind;
  }

  /** The TreeSitterService (structural operations), available when state is "ready". */
  get service(): SessionTreeSitterService | null {
    return this.#state.kind === "ready" ? this.#state.service : null;
  }

  /** The TreeSitterRuntime, available when state is "ready". */
  get runtime(): TreeSitterRuntime | null {
    return this.#state.kind === "ready" ? this.#state.runtime : null;
  }

  /** Attach a WorkspaceRuntime for capability registration. */
  setRuntime(runtime: WorkspaceRuntime): void {
    this.#runtime = runtime;
  }

  /**
   * Start the Tree-sitter session.
   *
   * Creates the runtime, wires the service, and publishes state
   * into the shared registries. Validates that WASM initialization
   * succeeds, returning `unavailable` if it fails.
   */
  async start(): Promise<TsStartResult> {
    // Restart safety: dispose any existing runtime
    if (this.#state.kind === "ready") {
      this.#state.runtime.dispose();
      if (this.#runtime) unregisterTreeSitterCapabilities(this.#runtime, this.#cwd);
      clearSessionTreeSitterService(this.#cwd);
    }

    this.#state = { kind: "unavailable", reason: "Initializing Tree-sitter" };

    try {
      const treeSitterRuntime = new TreeSitterRuntime(this.#cwd);

      // Probe WASM initialization by loading the JavaScript grammar
      // (always vendored). This catches missing web-tree-sitter or
      // corrupted WASM early rather than deferring to first tool use.
      await treeSitterRuntime.ensureGrammarParser("javascript");

      const service = createTreeSitterService(treeSitterRuntime);
      setSessionTreeSitterService(this.#cwd, service);

      if (this.#runtime) {
        registerTreeSitterCapabilities(this.#runtime, this.#cwd, service);
      }

      this.#state = { kind: "ready", runtime: treeSitterRuntime, service };
      return { kind: "ready" };
    } catch (error: unknown) {
      const reason = error instanceof Error ? error.message : String(error);
      this.#state = { kind: "unavailable", reason };
      clearSessionTreeSitterService(this.#cwd);
      return { kind: "unavailable", reason };
    }
  }

  /**
   * Shut down the Tree-sitter session.
   *
   * Disposes the runtime and clears all published state.
   */
  async shutdown(): Promise<void> {
    if (this.#runtime && this.#cwd) {
      unregisterTreeSitterCapabilities(this.#runtime, this.#cwd);
    }

    clearSessionTreeSitterService(this.#cwd);

    if (this.#state.kind === "ready") {
      this.#state.runtime.dispose();
    }

    this.#state = { kind: "initial" };
  }
}
