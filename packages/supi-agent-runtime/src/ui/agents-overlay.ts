import { DynamicBorder } from "@earendil-works/pi-coding-agent";
import {
  Container,
  type Focusable,
  Key,
  type KeyId,
  matchesKey,
  type TuiMouseEvent,
  type TuiMouseEventResult,
  truncateToWidth,
} from "@earendil-works/pi-tui";
import type {
  AgentOverlayControlResult,
  AgentsDialogDependencies,
  AgentsOverlayData,
  AgentsOverlayRun,
} from "./agents-overlay-data.ts";
import { AGENTS_OVERLAY_MAX_HEIGHT_PERCENT } from "./agents-overlay-data.ts";
import {
  centerLegend,
  renderDiagnosticsSection,
  renderProfilesSection,
} from "./agents-overlay-render.ts";
import { AgentsRunViewer, type AgentsRunViewerAction } from "./agents-run-viewer.ts";
import { AgentsSteeringInput } from "./agents-steering-input.ts";

type AgentsTab = "agents" | "reviews" | "profiles" | "diagnostics";

const AGENTS_TITLE = "Agents";
const CATALOGUE_HINT = "tab/←→ sections · ↑↓ select · esc close";

/** TUI-only Agent Run inspector and selected-run controller. */
export class AgentsDialog implements Focusable {
  #cachedLines: string[] | undefined;
  #cachedWidth: number | undefined;
  #cachedHeight: number | undefined;
  #profileIndex = 0;
  #diagnosticIndex = 0;
  #notice: string | undefined;
  #stopConfirmKey: string | undefined;
  #tabIndex = 0;
  #busy = false;
  #steeringInput: AgentsSteeringInput | undefined;
  #focused = false;
  #unsubscribe: (() => void) | undefined;
  #elapsedInterval: ReturnType<typeof setInterval> | undefined;
  readonly #runViewer: AgentsRunViewer;

  constructor(
    private data: AgentsOverlayData,
    private readonly dependencies: AgentsDialogDependencies,
  ) {
    this.#runViewer = new AgentsRunViewer(
      data,
      dependencies.theme,
      () => this.#changed(),
      dependencies.keybindings,
    );
    this.#runViewer.setSection("agents");
    this.#unsubscribe = dependencies.subscribe?.((next) => this.updateData(next));
    this.#updateElapsedTimer();
  }

  /** Implement Pi's Focusable contract for the embedded steering input. */
  get focused(): boolean {
    return this.#focused;
  }

  set focused(value: boolean) {
    if (this.#focused === value) return;
    this.#focused = value;
    if (this.#steeringInput) this.#steeringInput.focused = value;
    this.#runViewer.focused = value;
    this.#changed();
  }

  render(width: number): string[] {
    const height = Math.max(
      1,
      Math.floor((this.dependencies.tui.terminal.rows * AGENTS_OVERLAY_MAX_HEIGHT_PERCENT) / 100),
    );
    if (this.#cachedLines && this.#cachedWidth === width && this.#cachedHeight === height) {
      return this.#cachedLines;
    }
    this.#cachedLines =
      this.#tab() === "agents" || this.#tab() === "reviews"
        ? this.#runViewer.render({
            width,
            height,
            header: AGENTS_TITLE,
            tabs: this.#tabs(),
            notice: this.#notice,
            steeringLines: this.#steeringLines(width),
            steeringActive: this.#steeringInput !== undefined,
            stopConfirmation: this.#stopConfirmKey !== undefined,
          })
        : this.#renderCataloguePage(width, height);
    this.#cachedWidth = width;
    this.#cachedHeight = height;
    return this.#cachedLines;
  }

  handleInput(data: string): void {
    if (this.#handleSteeringInput(data)) return;
    if (this.#stopConfirmKey) {
      this.#handleStopConfirmation(data);
      return;
    }
    if (this.#runViewer.isList && this.#handleTabInput(data, false)) return;
    if (this.#tab() === "agents" || this.#tab() === "reviews") {
      this.#handleRunInput(data);
      return;
    }
    if (this.#handleCloseInput(data) || this.#handleTabInput(data)) return;
    this.#handleCatalogueInput(data);
  }

  /** Route fullscreen mouse input to the run and transcript panes. */
  handleMouse(event: TuiMouseEvent): TuiMouseEventResult | undefined {
    if (
      (this.#tab() !== "agents" && this.#tab() !== "reviews") ||
      this.#steeringInput ||
      this.#stopConfirmKey
    )
      return undefined;
    return this.#runViewer.handleMouse(event);
  }

  /** Replace live registry data while preserving the selected run when possible. */
  updateData(data: AgentsOverlayData): void {
    this.data = data;
    this.#runViewer.updateData(data);
    this.#updateElapsedTimer();
    this.#diagnosticIndex = Math.min(
      this.#diagnosticIndex,
      Math.max(0, (data.profilePages?.diagnostics.length ?? 0) - 1),
    );
    this.#profileIndex = Math.min(
      this.#profileIndex,
      Math.max(0, (data.profilePages?.profiles.length ?? 0) - 1),
    );
    this.#tabIndex = Math.min(this.#tabIndex, this.#tabsList().length - 1);
    this.#changed();
  }

  /** Release the live registry subscription when Pi removes the overlay. */
  dispose(): void {
    this.#unsubscribe?.();
    this.#unsubscribe = undefined;
    if (this.#elapsedInterval) clearInterval(this.#elapsedInterval);
    this.#elapsedInterval = undefined;
    this.#runViewer.dispose();
    this.#clearSteering();
  }

  invalidate(): void {
    this.#cachedLines = undefined;
    this.#steeringInput?.invalidate();
    this.#runViewer.invalidate();
  }

  #renderCataloguePage(width: number, height: number): string[] {
    const theme = this.dependencies.theme;
    const header =
      height <= 3
        ? [this.#line(`${AGENTS_TITLE}  ${this.#tabs()}`, width)]
        : [
            this.#line(AGENTS_TITLE, width),
            this.#line(this.#tabs(), width),
            ...new DynamicBorder((text: string) => theme.fg("accent", text)).render(width),
          ];
    const footer = [CATALOGUE_HINT].map((hint) => centerLegend(theme.fg("dim", hint), width));
    const bodyHeight = Math.max(0, height - header.length - footer.length);
    const body = new Container();
    if (this.#tab() === "profiles") {
      renderProfilesSection(body, this.data, this.#profileIndex, theme);
    } else {
      renderDiagnosticsSection(body, this.data, this.#diagnosticIndex, theme);
    }
    const lines = [...header, ...body.render(width).slice(0, bodyHeight), ...footer].slice(
      0,
      height,
    );
    while (lines.length < height) lines.push("");
    return lines.map((line) => truncateToWidth(line, width));
  }

  #handleRunViewerAction(action: AgentsRunViewerAction | undefined): boolean {
    if (action === "handled") {
      this.#changed();
      return true;
    }
    if (action === "close") {
      this.dependencies.done();
      return true;
    }
    const run = this.#runViewer.selectedRun;
    if (action === "steer" && run) {
      this.#beginSteering(run);
      return true;
    }
    if (action === "stop" && run) {
      this.#stopConfirmKey = run.runKey ?? run.taskId;
      this.#notice = `Stop ${run.taskId}? Press Enter or y to confirm; Esc to cancel.`;
      this.#changed();
      return true;
    }
    return false;
  }

  #handleSteeringInput(data: string): boolean {
    if (!this.#steeringInput) return false;
    if (matchesKey(data, Key.ctrl("c"))) this.#cancelSteering();
    else {
      this.#steeringInput.handleInput(data);
      this.#changed();
    }
    return true;
  }

  #handleCloseInput(data: string): boolean {
    const interrupted = this.#matches(data, "app.interrupt", Key.escape);
    const canceled = this.#matches(data, "tui.select.cancel", Key.ctrl("c"));
    if (!interrupted && !canceled) return false;
    this.dependencies.done();
    return true;
  }

  #handleRunInput(data: string): boolean {
    if (this.#tab() !== "agents" && this.#tab() !== "reviews") return false;
    const action = this.#runViewer.handleInput(data, !this.#busy);
    return this.#handleRunViewerAction(action);
  }

  #handleTabInput(data: string, allowArrows = true): boolean {
    if (matchesKey(data, Key.tab) || (allowArrows && matchesKey(data, Key.right))) {
      this.#tabIndex = (this.#tabIndex + 1) % this.#tabsList().length;
    } else if (matchesKey(data, Key.shift("tab")) || (allowArrows && matchesKey(data, Key.left))) {
      this.#tabIndex = (this.#tabIndex + this.#tabsList().length - 1) % this.#tabsList().length;
    } else {
      return false;
    }
    if (this.#runViewer.isList) {
      this.#runViewer.setSection(this.#tab() === "reviews" ? "reviews" : "agents");
    }
    this.#changed();
    return true;
  }

  #handleCatalogueInput(data: string): void {
    if (this.#matches(data, "tui.select.up", Key.up)) {
      this.#moveCatalogueSelection(-1);
    } else if (this.#matches(data, "tui.select.down", Key.down)) {
      this.#moveCatalogueSelection(1);
    }
  }

  #moveCatalogueSelection(delta: number): void {
    const pages = this.data.profilePages;
    const length =
      this.#tab() === "profiles" ? (pages?.profiles.length ?? 0) : (pages?.diagnostics.length ?? 0);
    if (length === 0) return;
    if (this.#tab() === "profiles") {
      this.#profileIndex = clamp(this.#profileIndex + delta, 0, length - 1);
    } else {
      this.#diagnosticIndex = clamp(this.#diagnosticIndex + delta, 0, length - 1);
    }
    this.#changed();
  }

  #beginSteering(run: AgentsOverlayRun): void {
    const input = new AgentsSteeringInput(run.taskId, this.dependencies.theme, {
      onSubmit: (message) => {
        this.#clearSteering();
        this.#runControl("Sending steering…", () =>
          this.dependencies.onSteer(run.runKey ?? run.taskId, message),
        );
      },
      onEmpty: () => {
        this.#notice = "Enter a steering message or press Esc to cancel.";
        this.#changed();
      },
      onCancel: () => this.#cancelSteering(),
    });
    input.focused = this.#focused;
    this.#steeringInput = input;
    this.#notice = undefined;
    this.#changed();
  }

  #handleStopConfirmation(data: string): void {
    if (this.#matches(data, "app.interrupt", Key.escape)) {
      this.#stopConfirmKey = undefined;
      this.#notice = "Stop canceled.";
      this.#changed();
      return;
    }
    if (!this.#matches(data, "tui.select.confirm", Key.enter) && data.toLowerCase() !== "y") return;
    const runKey = this.#stopConfirmKey;
    this.#stopConfirmKey = undefined;
    if (runKey) this.#runControl("Stopping selected run…", () => this.dependencies.onStop(runKey));
  }

  #cancelSteering(): void {
    this.#clearSteering();
    this.#notice = "Control canceled.";
    this.#changed();
  }

  #clearSteering(): void {
    if (this.#steeringInput) this.#steeringInput.focused = false;
    this.#steeringInput = undefined;
  }

  #steeringLines(width: number): string[] {
    if (!this.#steeringInput) return [];
    return this.#steeringInput
      .render(Math.max(1, width - 2))
      .map((line) => this.#line(line, width));
  }

  #runControl(message: string, action: () => Promise<AgentOverlayControlResult>): void {
    this.#busy = true;
    this.#notice = message;
    this.#changed();
    void action()
      .then((result) => {
        this.#notice =
          result === "accepted"
            ? "Control accepted."
            : result === "canceled"
              ? "Control canceled."
              : "Selected run is not running.";
      })
      .catch(() => {
        this.#notice = "Control failed.";
      })
      .finally(() => {
        this.#busy = false;
        this.#changed();
      });
  }

  #tabs(): string {
    return this.#tabsList()
      .map((tab, index) => {
        const value = title(tab);
        return index === this.#tabIndex ? `[${value}]` : value;
      })
      .join(this.dependencies.theme.fg("dim", "  "));
  }

  #tabsList(): AgentsTab[] {
    return this.data.profilePages
      ? ["agents", "reviews", "profiles", "diagnostics"]
      : ["agents", "reviews"];
  }

  #tab(): AgentsTab {
    return this.#tabsList()[this.#tabIndex] ?? "agents";
  }

  #matches(
    data: string,
    action: Parameters<NonNullable<AgentsDialogDependencies["keybindings"]>["matches"]>[1],
    fallback: KeyId,
  ): boolean {
    return typeof this.dependencies.keybindings?.matches === "function"
      ? this.dependencies.keybindings.matches(data, action)
      : matchesKey(data, fallback);
  }

  #line(text: string, width: number): string {
    return truncateToWidth(` ${text}`, width);
  }

  #updateElapsedTimer(): void {
    if (!this.data.runs.some((run) => run.active)) {
      clearInterval(this.#elapsedInterval);
      this.#elapsedInterval = undefined;
    } else if (!this.#elapsedInterval) {
      this.#elapsedInterval = setInterval(() => this.#runViewer.refreshElapsed(), 1_000);
      this.#elapsedInterval.unref?.();
    }
  }

  #changed(): void {
    this.#cachedLines = undefined;
    this.#steeringInput?.invalidate();
    this.dependencies.tui.requestRender();
  }
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function title(tab: AgentsTab): string {
  return tab[0]?.toUpperCase() + tab.slice(1);
}
