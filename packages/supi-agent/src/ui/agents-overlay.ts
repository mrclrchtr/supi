import { DynamicBorder } from "@earendil-works/pi-coding-agent";
import {
  Container,
  type Focusable,
  Key,
  matchesKey,
  Spacer,
  Text,
  truncateToWidth,
} from "@earendil-works/pi-tui";
import { type CachedRunSection, renderCachedRunsSection } from "./agents-overlay-cache.ts";
import type {
  AgentOverlayControlResult,
  AgentsDialogDependencies,
  AgentsOverlayData,
} from "./agents-overlay-data.ts";
import { AGENTS_OVERLAY_MAX_HEIGHT_PERCENT } from "./agents-overlay-data.ts";
import { renderDiagnosticsSection, renderProfilesSection } from "./agents-overlay-render.ts";
import { type AgentRunBlock, AgentRunViewport } from "./agents-run-viewport.ts";
import { AgentsSteeringInput } from "./agents-steering-input.ts";

const TABS = ["runs", "profiles", "diagnostics"] as const;

type AgentsTab = (typeof TABS)[number];

/** TUI-only Agent Run inspector and selected-run controller. */
export class AgentsDialog implements Focusable {
  #cachedLines: string[] | undefined;
  #cachedWidth: number | undefined;
  #cachedHeight: number | undefined;
  #cachedRunSection: CachedRunSection | undefined;
  #viewport = new AgentRunViewport();
  #diagnosticIndex = 0;
  #notice: string | undefined;
  #profileIndex = 0;
  #runIndex = 0;
  #tabIndex = 0;
  #busy = false;
  #steeringInput: AgentsSteeringInput | undefined;
  #focused = false;
  #unsubscribe: (() => void) | undefined;

  constructor(
    private data: AgentsOverlayData,
    private readonly dependencies: AgentsDialogDependencies,
  ) {
    this.#unsubscribe = dependencies.subscribe?.((next) => this.updateData(next));
  }

  /** Implement PI's Focusable contract for the embedded steering input. */
  get focused(): boolean {
    return this.#focused;
  }

  set focused(value: boolean) {
    if (this.#focused === value) return;
    this.#focused = value;
    if (this.#steeringInput) this.#steeringInput.focused = value;
    this.#invalidateRender();
    this.dependencies.tui.requestRender();
  }

  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: one render pass owns responsive overlay layout.
  render(width: number): string[] {
    const height = Math.max(
      1,
      Math.floor((this.dependencies.tui.terminal.rows * AGENTS_OVERLAY_MAX_HEIGHT_PERCENT) / 100),
    );
    if (this.#cachedLines && this.#cachedWidth === width && this.#cachedHeight === height) {
      return this.#cachedLines;
    }
    const theme = this.dependencies.theme;
    const border = new DynamicBorder((text: string) => theme.fg("accent", text));
    const header = new Container();
    header.addChild(border);
    header.addChild(new Text(this.#header(), 1, 0));
    header.addChild(new Text(this.#tabs(), 1, 0));
    const body = new Container();
    let blocks: AgentRunBlock[] = [];
    const runs = this.#tab() === "runs";
    const steeringLines = this.#steeringLines(width);
    const footerContent =
      this.#steeringInput && height === 1
        ? steeringLines.slice(-1)
        : [
            ...this.#hints().map((hint) => this.#line(theme.fg("dim", hint), width)),
            ...steeringLines,
            ...(this.#notice ? [this.#line(theme.fg("warning", this.#notice), width)] : []),
            ...(this.#steeringInput && height <= 2 ? [] : border.render(width)),
          ];
    const footerLimit = this.#steeringInput ? height : Math.max(0, height - 1);
    const footer = footerContent.slice(Math.max(0, footerContent.length - footerLimit));
    const statusRows = runs && this.data.runs.length > 0 && height > footer.length + 1 ? 1 : 0;
    const headerCapacity = Math.max(0, height - footer.length - statusRows - 1);
    let runLines: readonly string[] = [];
    switch (this.#tab()) {
      case "runs": {
        const listRows = Math.max(1, Math.min(8, Math.floor(height / 4), headerCapacity - 4));
        const section = renderCachedRunsSection(this.#cachedRunSection, {
          data: this.data,
          selectedIndex: this.#runIndex,
          width,
          listRows,
          theme,
        });
        this.#cachedRunSection = section;
        blocks = [...section.blocks];
        runLines = section.lines.slice(0, headerCapacity);
        break;
      }
      case "profiles":
        renderProfilesSection(body, this.data, this.#profileIndex, theme);
        break;
      case "diagnostics":
        renderDiagnosticsSection(body, this.data, this.#diagnosticIndex, theme);
        break;
    }
    header.addChild(new Spacer(1));
    const headerLines =
      headerCapacity > 0 && headerCapacity <= 3
        ? [
            this.#line(`${this.#header()}  ${this.#tabs()}`, width),
            ...runLines.slice(0, Math.max(0, headerCapacity - 1)),
          ]
        : [
            ...header.render(width).slice(0, Math.max(0, headerCapacity - runLines.length)),
            ...runLines,
          ];
    const bodyHeight = Math.max(
      this.#steeringInput ? 0 : 1,
      height - headerLines.length - footer.length - statusRows,
    );
    const bodyLines =
      bodyHeight === 0
        ? []
        : runs
          ? this.#viewport.render(blocks, bodyHeight)
          : body.render(width).slice(0, bodyHeight);
    const status = statusRows ? [this.#line(this.#viewStatus(), width)] : [];
    this.#cachedLines = [...headerLines, ...bodyLines, ...status, ...footer].map((line) =>
      truncateToWidth(line, width),
    );
    this.#cachedWidth = width;
    this.#cachedHeight = height;
    return this.#cachedLines;
  }

  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: one keyboard dispatcher owns the dialog controls.
  handleInput(data: string): void {
    if (this.#steeringInput) {
      if (matchesKey(data, Key.ctrl("c"))) {
        this.#cancelSteering();
        return;
      }
      this.#steeringInput.handleInput(data);
      this.#changed();
      return;
    }
    if (matchesKey(data, Key.escape) || matchesKey(data, Key.ctrl("c"))) {
      this.dependencies.done();
      return;
    }
    if (matchesKey(data, Key.tab) || matchesKey(data, Key.right)) {
      this.#tabIndex = (this.#tabIndex + 1) % TABS.length;
      this.#changed();
      return;
    }
    if (matchesKey(data, Key.left) || matchesKey(data, Key.shift("tab"))) {
      this.#tabIndex = (this.#tabIndex + TABS.length - 1) % TABS.length;
      this.#changed();
      return;
    }
    if (matchesKey(data, Key.up) || data === "k") {
      this.#moveSelection(-1);
      return;
    }
    if (matchesKey(data, Key.down) || data === "j") {
      this.#moveSelection(1);
      return;
    }
    if (this.#tab() !== "runs") return;
    if (this.#navigate(data)) return;
    const run = this.data.runs[this.#runIndex];
    if (!run?.active || this.#busy) return;
    if (data === "s" && run.status === "running") {
      this.#beginSteering(run.taskId);
    } else if (data === "x" && (run.status === "starting" || run.status === "running")) {
      this.#runControl("Stopping selected run…", () => this.dependencies.onStop(run.taskId));
    }
  }

  /** Replace live registry data while preserving the selected run when possible. */
  updateData(data: AgentsOverlayData): void {
    const selectedKey = this.data.runs[this.#runIndex]?.key;
    this.data = data;
    const nextIndex = selectedKey ? data.runs.findIndex((run) => run.key === selectedKey) : -1;
    this.#runIndex =
      nextIndex >= 0 ? nextIndex : Math.min(this.#runIndex, Math.max(0, data.runs.length - 1));
    if (data.runs[this.#runIndex]?.key !== selectedKey) {
      this.#viewport.reset();
    }
    this.#cachedRunSection = undefined;
    this.#profileIndex = Math.min(this.#profileIndex, Math.max(0, data.profiles.length - 1));
    this.#diagnosticIndex = Math.min(
      this.#diagnosticIndex,
      Math.max(0, data.diagnostics.length - 1),
    );
    this.#changed();
  }

  /** Release the live registry subscription when PI removes the overlay. */
  dispose(): void {
    this.#unsubscribe?.();
    this.#unsubscribe = undefined;
    this.#clearSteering();
  }

  invalidate(): void {
    this.#invalidateRender();
    this.#cachedRunSection = undefined;
  }

  #viewStatus(): string {
    const theme = this.dependencies.theme;
    const omitted = this.data.runs[this.#runIndex]?.conversationView?.omittedEntryCount ?? 0;
    const retention = omitted > 0 ? theme.fg("warning", ` · ${omitted} entries omitted`) : "";
    return theme.fg("accent", this.#viewport.status) + retention;
  }

  #line(text: string, width: number): string {
    return ` ${truncateToWidth(text, Math.max(0, width - 2))}`;
  }

  #header(): string {
    const theme = this.dependencies.theme;
    const active = this.data.runs.filter((run) => run.active).length;
    return `${theme.fg("accent", theme.bold("◆ Agents"))}${theme.fg("dim", `  ${active} active`)}`;
  }

  #tabs(): string {
    const theme = this.dependencies.theme;
    const counts = {
      runs: this.data.runs.length,
      profiles: this.data.profiles.length,
      diagnostics: this.data.diagnostics.length,
    };
    return TABS.map((tab, index) => {
      const label = `${title(tab)} ${counts[tab]}`;
      return index === this.#tabIndex ? theme.fg("accent", `[${label}]`) : theme.fg("dim", label);
    }).join(theme.fg("dim", "  "));
  }

  #moveSelection(delta: number): void {
    const limits = {
      runs: this.data.runs.length,
      profiles: this.data.profiles.length,
      diagnostics: this.data.diagnostics.length,
    };
    const length = limits[this.#tab()];
    if (length === 0) return;
    if (this.#tab() === "runs") {
      const nextIndex = clamp(this.#runIndex + delta, 0, length - 1);
      if (nextIndex === this.#runIndex) return;
      this.#runIndex = nextIndex;
      this.#viewport.reset();
    } else if (this.#tab() === "profiles") {
      this.#profileIndex = clamp(this.#profileIndex + delta, 0, length - 1);
    } else {
      this.#diagnosticIndex = clamp(this.#diagnosticIndex + delta, 0, length - 1);
    }
    this.#changed();
  }

  #navigate(data: string): boolean {
    const actions = [
      [Key.pageUp, "page-up"],
      [Key.pageDown, "page-down"],
      [Key.home, "start"],
      [Key.end, "end"],
      ["f", "toggle"],
    ] as const;
    const action = actions.find(([key]) => matchesKey(data, key));
    if (!action) return false;
    this.#viewport.navigate(action[1]);
    this.#changed();
    return true;
  }

  #beginSteering(taskId: string): void {
    const input = new AgentsSteeringInput(taskId, this.dependencies.theme, {
      onSubmit: (message) => {
        this.#clearSteering();
        this.#runControl("Sending steering…", () => this.dependencies.onSteer(taskId, message));
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

  #hints(): string[] {
    if (this.#steeringInput) return ["enter send · esc cancel"];
    const run = this.data.runs[this.#runIndex];
    const controls =
      this.#tab() !== "runs" || !run?.active
        ? "controls unavailable"
        : run.status === "running"
          ? "s steer · x stop"
          : run.status === "starting"
            ? "x stop · steering unavailable"
            : "controls unavailable";
    return this.#tab() === "runs"
      ? [
          "pgup/pgdn scroll · home start · end live · f pause/resume",
          `↑↓ select · ${controls}`,
          "tab/←→ sections · esc close",
        ]
      : ["tab/←→ sections · ↑↓ select · esc close"];
  }

  #tab(): AgentsTab {
    return TABS[this.#tabIndex] ?? "runs";
  }

  #invalidateRender(): void {
    this.#cachedLines = undefined;
    this.#cachedWidth = undefined;
    this.#cachedHeight = undefined;
    this.#steeringInput?.invalidate();
  }

  #changed(): void {
    this.#invalidateRender();
    this.dependencies.tui.requestRender();
  }
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function title(tab: AgentsTab): string {
  return tab[0]?.toUpperCase() + tab.slice(1);
}
