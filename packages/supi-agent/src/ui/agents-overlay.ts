import { DynamicBorder } from "@earendil-works/pi-coding-agent";
import { Container, Key, matchesKey, Spacer, Text, truncateToWidth } from "@earendil-works/pi-tui";
import type {
  AgentOverlayControlResult,
  AgentsDialogDependencies,
  AgentsOverlayData,
} from "./agents-overlay-data.ts";
import { AGENTS_CONVERSATION_PAGE_SIZE } from "./agents-overlay-data.ts";
import {
  renderDiagnosticsSection,
  renderProfilesSection,
  renderRunsSection,
} from "./agents-overlay-render.ts";

const TABS = ["runs", "profiles", "diagnostics"] as const;

type AgentsTab = (typeof TABS)[number];

/** TUI-only Agent Run inspector and selected-run controller. */
export class AgentsDialog {
  #cachedLines: string[] | undefined;
  #cachedWidth: number | undefined;
  #conversationEnd = Number.POSITIVE_INFINITY;
  #diagnosticIndex = 0;
  #notice: string | undefined;
  #profileIndex = 0;
  #runIndex = 0;
  #tabIndex = 0;
  #busy = false;
  #unsubscribe: (() => void) | undefined;

  constructor(
    private data: AgentsOverlayData,
    private readonly dependencies: AgentsDialogDependencies,
  ) {
    this.#unsubscribe = dependencies.subscribe?.((next) => this.updateData(next));
  }

  render(width: number): string[] {
    if (this.#cachedLines && this.#cachedWidth === width) return this.#cachedLines;
    const container = new Container();
    container.addChild(
      new DynamicBorder((text: string) => this.dependencies.theme.fg("accent", text)),
    );
    container.addChild(new Text(this.#header(), 1, 0));
    container.addChild(new Text(this.#tabs(), 1, 0));
    container.addChild(new Spacer(1));
    switch (this.#tab()) {
      case "runs":
        renderRunsSection({
          container,
          data: this.data,
          selectedIndex: this.#runIndex,
          conversationEnd: this.#conversationEnd,
          theme: this.dependencies.theme,
        });
        break;
      case "profiles":
        renderProfilesSection(container, this.data, this.#profileIndex, this.dependencies.theme);
        break;
      case "diagnostics":
        renderDiagnosticsSection(
          container,
          this.data,
          this.#diagnosticIndex,
          this.dependencies.theme,
        );
        break;
    }
    if (this.#notice) {
      container.addChild(new Text(this.dependencies.theme.fg("warning", this.#notice), 1, 0));
    }
    container.addChild(new Spacer(1));
    container.addChild(new Text(this.#hints(), 1, 0));
    container.addChild(
      new DynamicBorder((text: string) => this.dependencies.theme.fg("accent", text)),
    );
    this.#cachedLines = container.render(width).map((line) => truncateToWidth(line, width));
    this.#cachedWidth = width;
    return this.#cachedLines;
  }

  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: one keyboard dispatcher owns the dialog controls.
  handleInput(data: string): void {
    if (matchesKey(data, Key.escape) || matchesKey(data, Key.ctrl("c"))) {
      this.dependencies.done();
      return;
    }
    if (matchesKey(data, Key.tab) || matchesKey(data, Key.right)) {
      this.#tabIndex = (this.#tabIndex + 1) % TABS.length;
      this.#changed();
      return;
    }
    if (matchesKey(data, Key.left)) {
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
    if (matchesKey(data, Key.pageUp)) {
      this.#pageConversation(-1);
      return;
    }
    if (matchesKey(data, Key.pageDown)) {
      this.#pageConversation(1);
      return;
    }
    const run = this.data.runs[this.#runIndex];
    if (!run?.active || this.#busy) return;
    if (data === "s" && run.status === "running") {
      this.#runControl("Sending steering…", () => this.dependencies.onSteer(run.taskId));
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
      this.#conversationEnd = Number.POSITIVE_INFINITY;
    }
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
  }

  invalidate(): void {
    this.#cachedLines = undefined;
    this.#cachedWidth = undefined;
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
      this.#runIndex = clamp(this.#runIndex + delta, 0, length - 1);
      this.#conversationEnd = Number.POSITIVE_INFINITY;
    } else if (this.#tab() === "profiles") {
      this.#profileIndex = clamp(this.#profileIndex + delta, 0, length - 1);
    } else {
      this.#diagnosticIndex = clamp(this.#diagnosticIndex + delta, 0, length - 1);
    }
    this.#changed();
  }

  #pageConversation(direction: -1 | 1): void {
    const length = this.data.runs[this.#runIndex]?.conversationView?.entries.length ?? 0;
    const current = Math.min(length, this.#conversationEnd);
    this.#conversationEnd = clamp(
      current + direction * AGENTS_CONVERSATION_PAGE_SIZE,
      Math.min(AGENTS_CONVERSATION_PAGE_SIZE, length),
      length,
    );
    this.#changed();
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

  #hints(): string {
    const theme = this.dependencies.theme;
    const run = this.data.runs[this.#runIndex];
    const controls =
      this.#tab() !== "runs" || !run?.active
        ? "controls unavailable"
        : run.status === "running"
          ? "s steer · x stop"
          : run.status === "starting"
            ? "x stop · steering unavailable"
            : "controls unavailable";
    return theme.fg(
      "dim",
      `tab/←→ sections · ↑↓ select · pgup/pgdn conversation · ${controls} · esc close`,
    );
  }

  #tab(): AgentsTab {
    return TABS[this.#tabIndex] ?? "runs";
  }

  #changed(): void {
    this.invalidate();
    this.dependencies.tui.requestRender();
  }
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function title(tab: AgentsTab): string {
  return tab[0]?.toUpperCase() + tab.slice(1);
}
