import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { type AntigravityAvailability, discoverAntigravityAvailability } from "./availability.ts";
import { loadAntigravityConfig } from "./config.ts";
import { ConversationHandleStore } from "./conversation/handles.ts";
import { getIsolatedAntigravityPaths, type IsolatedAntigravityPaths } from "./isolated-home.ts";
import { registerAntigravityRunTool } from "./tool/antigravity_run/register.ts";
import { ANTIGRAVITY_RUN_TOOL_NAME } from "./tool/antigravity_run/spec.ts";
import type { CuratedModel } from "./types.ts";

/** Context needed to show an availability warning. */
export type AntigravityRefreshContext = { ui: Pick<ExtensionContext["ui"], "notify"> } | undefined;

/** Session runtime for immutable availability and Conversation Handle state. */
export class AntigravityRuntime {
  readonly paths: IsolatedAntigravityPaths;
  readonly handles = new ConversationHandleStore();
  #pi: ExtensionAPI;
  #homeDir: string | undefined;
  #discover: typeof discoverAntigravityAvailability;
  #availability: AntigravityAvailability | undefined;
  #refreshGeneration = 0;
  #refreshAbort: AbortController | undefined;
  #toolRegistered = false;

  constructor(options: {
    pi: ExtensionAPI;
    paths?: IsolatedAntigravityPaths;
    homeDir?: string;
    discover?: typeof discoverAntigravityAvailability;
  }) {
    this.#pi = options.pi;
    this.paths = options.paths ?? getIsolatedAntigravityPaths();
    this.#homeDir = options.homeDir;
    this.#discover = options.discover ?? discoverAntigravityAvailability;
  }

  /** The immutable discovery result, if session discovery has completed. */
  get availability(): AntigravityAvailability | undefined {
    return this.#availability;
  }

  /** Rebuild handles from the current PI branch. */
  rebuildHandles(branch: readonly unknown[]): void {
    this.handles.rebuild(branch);
  }

  /** Discover or reuse availability and synchronize the active tool. */
  async refresh(cwd: string, context?: AntigravityRefreshContext): Promise<void> {
    const generation = ++this.#refreshGeneration;
    this.#refreshAbort?.abort();
    const abortController = new AbortController();
    this.#refreshAbort = abortController;
    const config = loadAntigravityConfig(cwd, this.#homeDir);
    if (!config.agentToolEnabled) {
      this.#deactivateTool();
      return;
    }

    let availability = this.#availability;
    if (!availability) {
      try {
        availability = await this.#discover({
          paths: this.paths,
          signal: abortController.signal,
        });
      } catch {
        availability = {
          status: "unavailable",
          reason: "discovery",
          warning:
            "Antigravity availability discovery failed. Check the installation, then reload PI.",
        };
      }
    }
    if (generation !== this.#refreshGeneration || abortController.signal.aborted) return;
    this.#availability = availability;
    if (availability.status === "available") {
      this.#activateTool(availability.catalogue, availability.cliVersion);
      return;
    }
    this.#deactivateTool();
    context?.ui.notify(availability.warning, "warning");
  }

  /** Stop in-flight discovery and clear session-local state. */
  async shutdown(): Promise<void> {
    this.#refreshGeneration += 1;
    this.#refreshAbort?.abort();
    this.#refreshAbort = undefined;
    this.#deactivateTool();
    this.handles.clear();
    await Promise.resolve();
  }

  #activateTool(catalogue: readonly CuratedModel[], cliVersion: string): void {
    if (!this.#toolRegistered) {
      registerAntigravityRunTool({
        pi: this.#pi,
        paths: this.paths,
        catalogue,
        cliVersion,
        handles: this.handles,
      });
      this.#toolRegistered = true;
    }
    const activeTools = this.#pi.getActiveTools();
    if (!activeTools.includes(ANTIGRAVITY_RUN_TOOL_NAME)) {
      this.#pi.setActiveTools([...activeTools, ANTIGRAVITY_RUN_TOOL_NAME]);
    }
  }

  #deactivateTool(): void {
    const activeTools = this.#pi.getActiveTools();
    if (activeTools.includes(ANTIGRAVITY_RUN_TOOL_NAME)) {
      this.#pi.setActiveTools(activeTools.filter((name) => name !== ANTIGRAVITY_RUN_TOOL_NAME));
    }
  }
}
