import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { FOOTER_INVALIDATE_EVENT } from "@mrclrchtr/supi-core/footer-registry";
import { BRAILLE_SPINNER_FRAMES, SPINNER_INTERVAL_MS } from "@mrclrchtr/supi-core/spinner-frames";
import { type AntigravityAvailability, discoverAntigravityAvailability } from "./availability.ts";
import { loadAntigravityConfig } from "./config.ts";
import { ConversationHandleStore } from "./conversation/handles.ts";
import { ANTIGRAVITY_FOOTER_KEY, ANTIGRAVITY_READY_ICON } from "./footer-constants.ts";
import { getIsolatedAntigravityPaths, type IsolatedAntigravityPaths } from "./isolated-home.ts";
import { registerAntigravityRunTool } from "./tool/antigravity_run/register.ts";
import { ANTIGRAVITY_RUN_TOOL_NAME } from "./tool/antigravity_run/spec.ts";
import type { CuratedModel } from "./types.ts";

type FooterState = "idle" | "checking" | "ready";

/** Context needed to report availability and update the footer. */
export type AntigravityRefreshContext = {
  ui: Pick<ExtensionContext["ui"], "notify" | "setStatus">;
};

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
  #statusUi: Pick<ExtensionContext["ui"], "setStatus"> | undefined;
  #footerState: FooterState = "idle";
  #spinnerTimer: ReturnType<typeof setInterval> | undefined;
  #spinnerFrame = 0;
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

  /** Whether the discovered Antigravity tool is ready for use. */
  get isReady(): boolean {
    return this.#footerState === "ready";
  }

  /** Return the animated checking icon or the settled ready icon for the footer. */
  get footerIcon(): string | undefined {
    if (this.#footerState === "checking") {
      return BRAILLE_SPINNER_FRAMES[this.#spinnerFrame % BRAILLE_SPINNER_FRAMES.length];
    }
    return this.#footerState === "ready" ? ANTIGRAVITY_READY_ICON : undefined;
  }

  /** Rebuild handles from the current PI branch. */
  rebuildHandles(branch: readonly unknown[]): void {
    this.handles.rebuild(branch);
  }

  /** Start availability discovery without making Pi session startup wait. */
  startRefresh(cwd: string, context?: AntigravityRefreshContext): Promise<void> {
    return this.refresh(cwd, context).catch((error) => {
      try {
        // biome-ignore lint/suspicious/noConsole: unexpected failures must stay visible.
        console.warn(`[supi-antigravity] Availability check failed: ${formatRefreshError(error)}`);
        context?.ui.notify("Antigravity availability check failed. Reload PI to retry.", "warning");
      } catch {
        // PI may be shutting down while the refresh completes.
      }
    });
  }

  /** Discover or reuse availability and synchronize the active tool. */
  async refresh(cwd: string, context?: AntigravityRefreshContext): Promise<void> {
    const generation = ++this.#refreshGeneration;
    this.#refreshAbort?.abort();
    const abortController = new AbortController();
    this.#refreshAbort = abortController;
    if (context) this.#statusUi = context.ui;
    this.#stopSpinner();
    this.#setFooterState("idle");
    const config = loadAntigravityConfig(cwd, this.#homeDir);
    if (!config.agentToolEnabled) {
      this.#deactivateTool();
      return;
    }
    this.#startSpinner();

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
      try {
        this.#activateTool(availability.catalogue, availability.cliVersion);
      } catch (error) {
        this.#stopSpinner();
        this.#setFooterState("idle");
        throw error;
      }
      this.#stopSpinner();
      this.#setFooterState("ready");
      return;
    }
    this.#stopSpinner();
    this.#setFooterState("idle");
    this.#deactivateTool();
    notifyRefreshWarning(context, availability.warning);
  }

  /** Stop in-flight discovery and clear session-local state. */
  async shutdown(): Promise<void> {
    this.#refreshGeneration += 1;
    this.#refreshAbort?.abort();
    this.#refreshAbort = undefined;
    this.#stopSpinner();
    this.#setFooterState("idle");
    this.#deactivateTool();
    this.#statusUi = undefined;
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

  #startSpinner(): void {
    this.#stopSpinner();
    this.#spinnerFrame = 0;
    this.#setFooterState("checking");
    this.#spinnerTimer = setInterval(() => {
      if (this.#footerState !== "checking") return;
      this.#spinnerFrame = (this.#spinnerFrame + 1) % BRAILLE_SPINNER_FRAMES.length;
      this.#publishFooter();
      this.#invalidateFooter();
    }, SPINNER_INTERVAL_MS);
    this.#spinnerTimer.unref?.();
  }

  #stopSpinner(): void {
    if (this.#spinnerTimer === undefined) return;
    clearInterval(this.#spinnerTimer);
    this.#spinnerTimer = undefined;
  }

  #setFooterState(state: FooterState): void {
    const changed = this.#footerState !== state;
    this.#footerState = state;
    this.#publishFooter();
    if (!changed) return;
    this.#invalidateFooter();
  }

  #publishFooter(): void {
    try {
      this.#statusUi?.setStatus(ANTIGRAVITY_FOOTER_KEY, this.footerIcon);
    } catch {
      // PI may be shutting down while the footer status changes.
    }
  }

  #invalidateFooter(): void {
    try {
      this.#pi.events.emit(FOOTER_INVALIDATE_EVENT, {});
    } catch {
      // Footer refresh is optional and must not change runtime state.
    }
  }
}

function formatRefreshError(error: unknown): string {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "object" &&
          error !== null &&
          "message" in error &&
          typeof error.message === "string"
        ? error.message
        : String(error);
  return message.replace(/\s+/g, " ").trim().slice(0, 200) || "unknown error";
}

function notifyRefreshWarning(
  context: AntigravityRefreshContext | undefined,
  message: string,
): void {
  try {
    context?.ui.notify(message, "warning");
  } catch {
    // PI may be shutting down while the refresh reports its result.
  }
}
