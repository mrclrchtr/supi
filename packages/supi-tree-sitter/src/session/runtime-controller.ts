// Tree-sitter runtime controller — stable library-level session lifecycle for peer extensions.
//
// This controller owns runtime creation/disposal for a working directory and
// publishes SessionTreeSitterService states through the shared registry.
// It is designed to be consumed by `packages/supi-code-intelligence` through
// `@mrclrchtr/supi-tree-sitter/api`, not to depend on pi-specific APIs.

import { TreeSitterRuntime } from "./runtime.ts";
import { clearSessionTreeSitterService, setSessionTreeSitterService } from "./service-registry.ts";
import { createTreeSitterService } from "./session.ts";

/**
 * Session-scoped Tree-sitter runtime controller.
 *
 * Usage:
 * ```
 * const ctrl = new TreeSitterRuntimeController();
 * await ctrl.start(cwd);
 * // ... use ctrl.runtime ...
 * await ctrl.stop();
 * ```
 *
 * The controller publishes service states through the shared
 * session-scoped registry so other library consumers can find
 * the current service via `getSessionTreeSitterService(cwd)`.
 */
export class TreeSitterRuntimeController {
  private _runtime: TreeSitterRuntime | null = null;
  private _cwd: string | null = null;

  /** The current TreeSitterRuntime, or null if not started. */
  get runtime(): TreeSitterRuntime | null {
    return this._runtime;
  }

  /** The working directory this controller was started with, or null. */
  get cwd(): string | null {
    return this._cwd;
  }

  /**
   * Start the Tree-sitter runtime for the given working directory.
   *
   * If a previous runtime was running, it is stopped first.
   * Publishes a ready state to the shared session-scoped registry.
   */
  async start(cwd: string): Promise<void> {
    // Clean up any previous session
    if (this._runtime && this._cwd) {
      clearSessionTreeSitterService(this._cwd);
      this._runtime.dispose();
      this._runtime = null;
      this._cwd = null;
    }

    this._runtime = new TreeSitterRuntime(cwd);
    this._cwd = cwd;

    const service = createTreeSitterService(this._runtime);
    setSessionTreeSitterService(cwd, service);
  }

  /**
   * Stop the Tree-sitter runtime.
   *
   * Clears the session registry entry, disposes the runtime,
   * and resets internal state. Safe to call when not running.
   */
  async stop(): Promise<void> {
    if (this._runtime && this._cwd) {
      clearSessionTreeSitterService(this._cwd);
      this._runtime.dispose();
      this._runtime = null;
      this._cwd = null;
    }
  }
}
