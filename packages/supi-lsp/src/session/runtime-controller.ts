// LSP runtime controller — stable library-level session lifecycle for peer extensions.
//
// This controller owns non-UI LSP lifecycle: creating and disposing the LspManager,
// scanning and starting servers, and publishing SessionLspService states through the
// shared registry. It is designed to be consumed by `packages/supi-code-intelligence`
// through `@mrclrchtr/supi-lsp/api`, not to depend on pi-specific APIs.

import { loadConfig, resolveLanguageAlias } from "../config/config.ts";
import { loadLspSettings } from "../config/lsp-settings.ts";
import { clearTsconfigCache } from "../config/tsconfig-scope.ts";
import type { DetectedProjectServer, MissingServer, ProjectServerInfo } from "../config/types.ts";
import { LspManager } from "../manager/manager.ts";
import { scanMissingServers, scanProjectCapabilities, startDetectedServers } from "./scanner.ts";
import {
  clearSessionLspService,
  SessionLspService,
  setSessionLspServiceState,
} from "./service-registry.ts";

// ── Start result types ────────────────────────────────────────────────

export type LspControllerStartResult =
  | {
      kind: "ready";
      manager: LspManager;
      service: SessionLspService;
      projectServers: ProjectServerInfo[];
      detectedServers: DetectedProjectServer[];
      missing: MissingServer[];
    }
  | {
      kind: "disabled";
    };

// ── Controller ────────────────────────────────────────────────────────

/**
 * Session-scoped LSP controller.
 *
 * Usage:
 * ```
 * const ctrl = new LspRuntimeController();
 * const result = await ctrl.start(cwd);
 * // ... use result.manager / result.service ...
 * await ctrl.stop();
 * ```
 *
 * The controller publishes service states through the shared
 * session-scoped registry so other library consumers can find the
 * current `SessionLspService` via `getSessionLspService(cwd)`.
 */
export class LspRuntimeController {
  private _manager: LspManager | null = null;
  private _cwd: string | null = null;

  /** The current LspManager, or null if not started. */
  get manager(): LspManager | null {
    return this._manager;
  }

  /** The working directory this controller was started with, or null. */
  get cwd(): string | null {
    return this._cwd;
  }

  /**
   * Start the LSP runtime for the given working directory.
   *
   * If a previous runtime was running, it is stopped first.
   * Publishes `pending`, `disabled`, or `ready` state to the
   * shared session-scoped registry.
   */
  async start(cwd: string): Promise<LspControllerStartResult> {
    // Clean up any previous session
    if (this._manager) {
      // biome-ignore lint/style/noNonNullAssertion: _cwd is set when _manager is set (same if-branch)
      clearSessionLspService(this._cwd!);
      await this._manager.shutdownAll();
      this._manager = null;
      this._cwd = null;
    }

    clearTsconfigCache();
    const lspSettings = loadLspSettings(cwd);

    if (!lspSettings.enabled) {
      clearSessionLspService(cwd);
      setSessionLspServiceState(cwd, { kind: "disabled" });
      return { kind: "disabled" };
    }

    const config = loadConfig(cwd);

    // Apply server allowlist filter
    if (lspSettings.active.length > 0) {
      const allowList = new Set(lspSettings.active.map(resolveLanguageAlias));
      for (const name of Object.keys(config.servers)) {
        if (!allowList.has(name)) {
          delete config.servers[name];
        }
      }
    }

    clearSessionLspService(cwd);
    this._manager = new LspManager(config, cwd);
    this._manager.setExcludePatterns(lspSettings.exclude ?? []);
    this._cwd = cwd;

    setSessionLspServiceState(cwd, { kind: "pending" });

    const detectedServers = scanProjectCapabilities(config, cwd);
    this._manager.registerDetectedServers(detectedServers);
    await startDetectedServers(this._manager, detectedServers);

    const missing = scanMissingServers(config, cwd);

    const service = new SessionLspService(this._manager);
    setSessionLspServiceState(cwd, { kind: "ready", service });

    return {
      kind: "ready",
      manager: this._manager,
      service,
      projectServers: this.getProjectServers(),
      detectedServers,
      missing,
    };
  }

  /**
   * Stop the LSP runtime.
   *
   * Shuts down the manager, clears the session registry entry,
   * and resets internal state. Safe to call when not running.
   */
  async stop(): Promise<void> {
    clearTsconfigCache();
    if (this._manager) {
      // biome-ignore lint/style/noNonNullAssertion: _cwd is set when _manager is set (same if-branch)
      clearSessionLspService(this._cwd!);
      await this._manager.shutdownAll();
      this._manager = null;
      this._cwd = null;
    }
  }

  /** Get current project server info from the running manager. */
  getProjectServers(): ProjectServerInfo[] {
    if (!this._manager) return [];
    return this._manager.getKnownProjectServers([]);
  }
}
