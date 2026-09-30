import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { FOOTER_INVALIDATE_EVENT } from "@mrclrchtr/supi-core/footer-registry";
import { BRAILLE_SPINNER_FRAMES, SPINNER_INTERVAL_MS } from "@mrclrchtr/supi-core/spinner-frames";
import type {
  ConsultingAgentAdapter,
  ConsultingAgentAvailability,
  ConsultingAvailability,
} from "./agents/types.ts";
import { loadConsultingConfig } from "./config.ts";
import { ConversationHandleStore } from "./conversation/handles.ts";
import { CONSULTING_FOOTER_KEY, CONSULTING_READY_ICON } from "./footer-constants.ts";
import { registerConsultingRunTool } from "./tool/consulting_run/register.ts";
import { CONSULTING_RUN_TOOL_NAME } from "./tool/consulting_run/spec.ts";

type FooterState = "idle" | "checking" | "ready";

/** Context needed to report availability and update the footer. */
export type ConsultingRefreshContext = {
  ui: Pick<ExtensionContext["ui"], "notify" | "setStatus">;
};

/** Session runtime for immutable availability and Conversation Handle state. */
export class ConsultingRuntime {
  readonly handles = new ConversationHandleStore();
  readonly adapter: ConsultingAgentAdapter;
  #pi: ExtensionAPI;
  #homeDir: string | undefined;
  #availability: ConsultingAgentAvailability | undefined;
  #refreshGeneration = 0;
  #refreshAbort: AbortController | undefined;
  #statusUi: Pick<ExtensionContext["ui"], "setStatus"> | undefined;
  #footerState: FooterState = "idle";
  #spinnerTimer: ReturnType<typeof setInterval> | undefined;
  #spinnerFrame = 0;
  #toolRegistered = false;

  constructor(options: { pi: ExtensionAPI; adapter: ConsultingAgentAdapter; homeDir?: string }) {
    this.#pi = options.pi;
    this.adapter = options.adapter;
    this.#homeDir = options.homeDir;
  }

  /** The immutable discovery result, if session discovery has completed. */
  get availability(): ConsultingAgentAvailability | undefined {
    return this.#availability;
  }

  /** Whether the discovered Consultation tool is ready for use. */
  get isReady(): boolean {
    return this.#footerState === "ready";
  }

  /** Return the animated checking icon or the settled ready icon for the footer. */
  get footerIcon(): string | undefined {
    if (this.#footerState === "checking") {
      return BRAILLE_SPINNER_FRAMES[this.#spinnerFrame % BRAILLE_SPINNER_FRAMES.length];
    }
    return this.#footerState === "ready" ? CONSULTING_READY_ICON : undefined;
  }

  /** Rebuild handles from the current PI branch. */
  rebuildHandles(branch: readonly unknown[]): void {
    this.handles.rebuild(branch);
  }

  /** Start availability discovery without making Pi session startup wait. */
  startRefresh(cwd: string, context?: ConsultingRefreshContext): Promise<void> {
    return this.refresh(cwd, context).catch((error) => {
      try {
        // biome-ignore lint/suspicious/noConsole: unexpected failures must stay visible.
        console.warn(`[supi-consulting] Availability check failed: ${formatRefreshError(error)}`);
        context?.ui.notify("Consulting availability check failed. Reload PI to retry.", "warning");
      } catch {
        // PI may be shutting down while the refresh completes.
      }
    });
  }

  /** Discover or reuse availability and synchronize the active tool. */
  async refresh(cwd: string, context?: ConsultingRefreshContext): Promise<void> {
    const generation = ++this.#refreshGeneration;
    this.#refreshAbort?.abort();
    const abortController = new AbortController();
    this.#refreshAbort = abortController;
    if (context) this.#statusUi = context.ui;
    this.#stopSpinner();
    this.#setFooterState("idle");
    const config = loadConsultingConfig(cwd, this.#homeDir);
    if (!config.agentToolEnabled) {
      this.#deactivateTool();
      return;
    }
    this.#startSpinner();

    let availability: ConsultingAvailability =
      this.#availability ??
      (await this.adapter.discover({ signal: abortController.signal }).catch(() => ({
        status: "unavailable",
        reason: "discovery",
        warning:
          "Consulting Agent availability discovery failed. Check the installation, then reload PI.",
      })));
    if (generation !== this.#refreshGeneration || abortController.signal.aborted) return;
    if (availability.status === "available") {
      try {
        availability = freezeAvailability(availability, this.adapter.identity);
        this.#availability = availability;
        this.#activateTool(availability);
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

  #activateTool(availability: ConsultingAgentAvailability): void {
    if (!this.#toolRegistered) {
      registerConsultingRunTool({
        pi: this.#pi,
        adapter: this.adapter,
        availability,
        handles: this.handles,
      });
      this.#toolRegistered = true;
    }
    const activeTools = this.#pi.getActiveTools();
    if (!activeTools.includes(CONSULTING_RUN_TOOL_NAME)) {
      this.#pi.setActiveTools([...activeTools, CONSULTING_RUN_TOOL_NAME]);
    }
  }

  #deactivateTool(): void {
    const activeTools = this.#pi.getActiveTools();
    if (activeTools.includes(CONSULTING_RUN_TOOL_NAME)) {
      this.#pi.setActiveTools(activeTools.filter((name) => name !== CONSULTING_RUN_TOOL_NAME));
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
      this.#statusUi?.setStatus(CONSULTING_FOOTER_KEY, this.footerIcon);
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

function freezeAvailability(
  availability: ConsultingAgentAvailability,
  expectedAgent: string,
): ConsultingAgentAvailability {
  if (
    availability.agent !== expectedAgent ||
    !availability.agentVersion ||
    availability.catalogue.length === 0 ||
    availability.catalogue.some((model) => typeof model !== "string" || model.length === 0)
  ) {
    throw new Error("Consulting Agent returned an invalid availability snapshot.");
  }
  return Object.freeze({
    ...availability,
    catalogue: Object.freeze([...availability.catalogue]),
  });
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
  context: ConsultingRefreshContext | undefined,
  message: string,
): void {
  try {
    context?.ui.notify(message, "warning");
  } catch {
    // PI may be shutting down while the refresh reports its result.
  }
}
