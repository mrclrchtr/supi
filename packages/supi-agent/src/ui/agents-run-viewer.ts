import type { Theme } from "@earendil-works/pi-coding-agent";
import { DynamicBorder } from "@earendil-works/pi-coding-agent";
import {
  Key,
  matchesKey,
  type TuiMouseEvent,
  type TuiMouseEventResult,
  truncateToWidth,
  visibleWidth,
} from "@earendil-works/pi-tui";
import type { AgentsOverlayData, AgentsOverlayRun } from "./agents-overlay-data.ts";
import { centerLegend } from "./agents-overlay-render.ts";
import { AgentsTranscriptPane } from "./agents-transcript-pane.ts";

export type AgentsRunViewerAction = "handled" | "steer" | "stop";

/** Own the adaptive run list, transcript pane, and their navigation. */
export class AgentsRunViewer {
  #data: AgentsOverlayData;
  #runIndex = 0;
  #narrowPane: "list" | "transcript";
  #lastWidth = 0;
  #bodyTop = 0;
  #bodyHeight = 0;
  readonly #transcript: AgentsTranscriptPane;

  constructor(
    data: AgentsOverlayData,
    private readonly theme: Theme,
    private readonly onChange: () => void,
  ) {
    this.#data = data;
    this.#narrowPane = data.runs.length > 0 ? "transcript" : "list";
    this.#transcript = new AgentsTranscriptPane(theme, onChange);
    this.#transcript.select(this.selectedRun);
  }

  get selectedRun(): AgentsOverlayRun | undefined {
    return this.#data.runs[this.#runIndex];
  }

  /** Replace run data while keeping the selected run when it is still present. */
  updateData(data: AgentsOverlayData): void {
    const selectedKey = this.selectedRun?.key;
    this.#data = data;
    const nextIndex = selectedKey ? data.runs.findIndex((run) => run.key === selectedKey) : -1;
    this.#runIndex =
      nextIndex >= 0 ? nextIndex : Math.min(this.#runIndex, Math.max(0, data.runs.length - 1));
    const selectedRun = this.selectedRun;
    if (!selectedRun) {
      this.#narrowPane = "list";
      this.#transcript.select(undefined);
    } else if (selectedRun.key !== selectedKey) {
      this.#narrowPane = "transcript";
      this.#transcript.select(selectedRun);
    } else {
      this.#transcript.update(selectedRun);
    }
  }

  render(options: {
    readonly width: number;
    readonly height: number;
    readonly header: string;
    readonly tabs: string;
    readonly notice?: string;
    readonly steeringLines: readonly string[];
    readonly steeringActive: boolean;
    readonly stopConfirmation: boolean;
  }): string[] {
    const { width, height, header, tabs, notice, steeringLines, steeringActive, stopConfirmation } =
      options;
    this.#lastWidth = width;
    if (height === 1 && steeringActive) {
      return [steeringLines.at(-1) ?? this.#line(header, width)];
    }
    const border = new DynamicBorder((text: string) => this.theme.fg("accent", text)).render(width);
    const compactHeader = height <= 5 || steeringActive;
    const headerLines = compactHeader
      ? [this.#line(`${header}  ${tabs}`, width)]
      : [this.#line(header, width), this.#line(tabs, width), ...border];
    const status = this.#line(this.#viewStatus(), width);
    const footerContent = steeringActive
      ? [...steeringLines, ...(notice ? [this.#line(this.theme.fg("warning", notice), width)] : [])]
      : [
          ...this.hints(stopConfirmation).map((hint) =>
            centerLegend(this.theme.fg("dim", hint), width),
          ),
          ...(notice ? [this.#line(this.theme.fg("warning", notice), width)] : []),
          status,
        ];
    const footerRows = Math.min(footerContent.length, Math.max(0, height - headerLines.length));
    const footer = footerContent.slice(footerContent.length - footerRows);
    this.#bodyTop = headerLines.length;
    this.#bodyHeight = Math.max(0, height - headerLines.length - footer.length);
    const body = this.#isWide(width)
      ? this.#renderSplitPane(width, this.#bodyHeight)
      : this.#renderNarrowPane(width, this.#bodyHeight);
    const lines = [...headerLines, ...body.slice(0, this.#bodyHeight), ...footer].slice(0, height);
    while (lines.length < height) lines.push("");
    return lines.map((line) => truncateToWidth(line, width));
  }

  handleInput(data: string, controlsEnabled: boolean): AgentsRunViewerAction | undefined {
    if (this.#handleNarrowInput(data) || this.#handleSelectionInput(data)) return "handled";
    if (this.#navigate(data)) return "handled";
    if (matchesKey(data, "o") || matchesKey(data, Key.ctrl("o"))) {
      this.#transcript.toggleToolDetails();
      return "handled";
    }
    if (matchesKey(data, "t") || matchesKey(data, Key.ctrl("t"))) {
      this.#transcript.toggleThinking();
      return "handled";
    }
    return this.#controlAction(data, controlsEnabled);
  }

  handleMouse(event: TuiMouseEvent): TuiMouseEventResult | undefined {
    if (event.type === "wheel") return this.#handleWheel(event);
    if (event.type === "click" && event.button === "left") return this.#handleClick(event);
    return undefined;
  }

  #handleNarrowInput(data: string): boolean {
    if (!this.#isNarrow()) return false;
    if (this.#narrowPane === "list") {
      if (!matchesKey(data, Key.enter) && !matchesKey(data, Key.right)) return false;
      this.#narrowPane = "transcript";
      return true;
    }
    if (matchesKey(data, Key.left)) {
      this.#narrowPane = "list";
      return true;
    }
    if (matchesKey(data, Key.up) || data === "k") {
      this.#transcript.scrollBy(-1);
      return true;
    }
    if (matchesKey(data, Key.down) || data === "j") {
      this.#transcript.scrollBy(1);
      return true;
    }
    return false;
  }

  #handleSelectionInput(data: string): boolean {
    if (matchesKey(data, Key.up) || data === "k") {
      if (!this.#isNarrow() || this.#narrowPane === "list") this.#moveSelection(-1);
      return true;
    }
    if (matchesKey(data, Key.down) || data === "j") {
      if (!this.#isNarrow() || this.#narrowPane === "list") this.#moveSelection(1);
      return true;
    }
    return false;
  }

  #controlAction(data: string, controlsEnabled: boolean): AgentsRunViewerAction | undefined {
    const run = this.selectedRun;
    if (!controlsEnabled || !run?.active) return undefined;
    if (data === "s" && run.status === "running") return "steer";
    if (data === "x" && (run.status === "starting" || run.status === "running")) return "stop";
    return undefined;
  }

  #handleWheel(event: TuiMouseEvent): TuiMouseEventResult | undefined {
    if (!this.#insideBody(event)) return undefined;
    const delta = event.wheelDelta ?? 0;
    if (this.#isListArea(event.x)) {
      this.#moveSelection(delta < 0 ? -1 : 1);
    } else {
      this.#transcript.scrollBy(delta);
    }
    this.onChange();
    return { handled: true };
  }

  #handleClick(event: TuiMouseEvent): TuiMouseEventResult | undefined {
    if (this.#clickRun(event)) {
      this.onChange();
      return { handled: true };
    }
    return this.#transcript.handleMouse(event);
  }

  #isListArea(x: number): boolean {
    if (this.#isWide()) return x < this.#listWidth(this.#lastWidth);
    return this.#narrowPane === "list";
  }

  hints(stopConfirmation: boolean): string[] {
    if (stopConfirmation) return ["Enter/y confirm stop · Esc cancel"];
    if (this.#isNarrow() && this.#narrowPane === "list") {
      return ["↑↓ select · enter view · tab sections · esc close"];
    }
    const run = this.selectedRun;
    const controls = run?.active
      ? run.status === "running"
        ? "s steer · x stop"
        : run.status === "starting"
          ? "x stop"
          : "controls unavailable"
      : "controls unavailable";
    if (this.#isNarrow()) {
      return [
        "← list · ↑↓ scroll · pgup/pgdn · home · end/f live",
        `o tools · t thinking · ${controls} · tab · esc close`,
      ];
    }
    return [
      "↑↓ select · pgup/pgdn scroll · home start · end live · f pause/resume",
      `o tools · t thinking · ${controls} · tab sections · esc close`,
    ];
  }

  invalidate(): void {
    this.#transcript.invalidate();
  }

  dispose(): void {
    this.#transcript.dispose();
  }

  #renderSplitPane(width: number, height: number): string[] {
    const listWidth = this.#listWidth(width);
    const detailWidth = Math.max(1, width - listWidth - 3);
    const list = this.#renderRunList(listWidth, height);
    this.#transcript.setBounds({
      top: this.#bodyTop,
      height,
      left: listWidth + 3,
      width: detailWidth,
    });
    const transcript = this.#transcript.render(this.selectedRun, detailWidth, height);
    const divider = this.theme.fg("dim", "│");
    return Array.from({ length: height }, (_, index) => {
      const left = padToWidth(list[index] ?? "", listWidth);
      return truncateToWidth(`${left} ${divider} ${transcript[index] ?? ""}`, width);
    });
  }

  #renderNarrowPane(width: number, height: number): string[] {
    if (this.#narrowPane === "list") {
      this.#transcript.setBounds({ top: 0, height: 0, left: 0, width: 0 });
      return this.#renderRunList(width, height);
    }
    this.#transcript.setBounds({ top: this.#bodyTop, height, left: 0, width });
    return this.#transcript.render(this.selectedRun, width, height);
  }

  #renderRunList(width: number, height: number): string[] {
    if (height <= 0) return [];
    if (this.#data.runs.length === 0) {
      return [this.#line(this.theme.fg("dim", "No Agent Runs."), width)];
    }
    const start = runWindowStart(this.#data.runs.length, this.#runIndex, height);
    return this.#data.runs.slice(start, start + height).map((run, index) => {
      const selected = start + index === this.#runIndex;
      const metrics = `${run.turns} turns · ${run.toolUses} tools`;
      const scope = run.active ? "active" : "completed";
      const label = `${selected ? "▶" : " "} ${run.status} · ${run.taskId} (${run.profileId}) · ${metrics} · ${scope}`;
      return truncateToWidth(
        selected ? this.theme.fg("accent", label) : this.theme.fg("dim", label),
        width,
      );
    });
  }

  #viewStatus(): string {
    const run = this.selectedRun;
    const omitted = run?.conversationView?.omittedEntryCount ?? 0;
    const retention = omitted > 0 ? this.theme.fg("warning", ` · ${omitted} entries omitted`) : "";
    const capture = this.#transcript.isIncomplete
      ? this.theme.fg("warning", " · transcript incomplete")
      : "";
    const loading = this.#transcript.isLoading ? this.theme.fg("dim", " · loading transcript") : "";
    const runStatus = run
      ? `${run.status}${run.failureCode ? ` (${run.failureCode})` : ""} · ${run.turns} turns · ${run.toolUses} tools${run.usage ? ` · ${run.usage.totalTokens.toLocaleString("en-US")} tokens` : ""}`
      : "No run selected";
    return (
      this.theme.fg("accent", this.#transcript.status) +
      retention +
      this.theme.fg("accent", ` · ${runStatus}`) +
      capture +
      loading
    );
  }

  #insideBody(event: TuiMouseEvent): boolean {
    return event.y >= this.#bodyTop && event.y < this.#bodyTop + this.#bodyHeight;
  }

  #clickRun(event: TuiMouseEvent): boolean {
    if (this.#isNarrow() && this.#narrowPane !== "list") return false;
    const listWidth = this.#isWide() ? this.#listWidth(this.#lastWidth) : this.#lastWidth;
    if (event.x >= listWidth || !this.#insideBody(event)) return false;
    const row = event.y - this.#bodyTop;
    const start = runWindowStart(this.#data.runs.length, this.#runIndex, this.#bodyHeight);
    const selected = start + row;
    if (selected < 0 || selected >= this.#data.runs.length) return true;
    this.#selectRun(selected);
    if (this.#isNarrow()) this.#narrowPane = "transcript";
    return true;
  }

  #selectRun(index: number): void {
    if (index === this.#runIndex) return;
    this.#runIndex = index;
    this.#transcript.select(this.selectedRun);
  }

  #moveSelection(delta: number): void {
    this.#selectRun(clamp(this.#runIndex + delta, 0, Math.max(0, this.#data.runs.length - 1)));
  }

  #navigate(data: string): boolean {
    if (matchesKey(data, Key.pageUp)) {
      this.#transcript.navigate("page-up");
      return true;
    }
    if (matchesKey(data, Key.pageDown)) {
      this.#transcript.navigate("page-down");
      return true;
    }
    if (matchesKey(data, Key.home)) {
      this.#transcript.navigate("start");
      return true;
    }
    if (matchesKey(data, Key.end)) {
      this.#transcript.navigate("end");
      return true;
    }
    if (data === "f") {
      this.#transcript.navigate("toggle");
      return true;
    }
    return false;
  }

  #isWide(width = this.#lastWidth): boolean {
    return width >= 100;
  }

  #isNarrow(): boolean {
    return !this.#isWide();
  }

  #listWidth(width: number): number {
    return Math.min(36, Math.max(24, Math.floor(width * 0.3)));
  }

  #line(text: string, width: number): string {
    return truncateToWidth(` ${text}`, width);
  }
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function runWindowStart(length: number, selected: number, size: number): number {
  return Math.min(Math.max(0, length - size), Math.max(0, selected - Math.floor(size / 2)));
}

function padToWidth(text: string, width: number): string {
  const clipped = truncateToWidth(text, width);
  return `${clipped}${" ".repeat(Math.max(0, width - visibleWidth(clipped)))}`;
}
