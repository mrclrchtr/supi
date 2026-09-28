import type { KeybindingsManager, Theme } from "@earendil-works/pi-coding-agent";
import {
  Input,
  Key,
  type KeyId,
  matchesKey,
  type SelectItem,
  SelectList,
  type TuiMouseEvent,
  type TuiMouseEventResult,
  truncateToWidth,
} from "@earendil-works/pi-tui";
import type { AgentsOverlayData, AgentsOverlayRun } from "./agents-overlay-data.ts";
import { orderedRuns, type RunSection, runListItem } from "./agents-run-list.ts";
import { handleTranscriptNavigation } from "./agents-run-viewer-input.ts";
import {
  formatRunConversationHeading,
  formatRunViewerStatus,
  renderAgentsRunFooter,
  renderAgentsRunHeader,
  renderAgentsRunHints,
  renderAgentsRunList,
} from "./agents-run-viewer-render.ts";
import { AgentsTranscriptPane } from "./agents-transcript-pane.ts";

type AgentsKeybindings = Pick<KeybindingsManager, "getKeys" | "matches">;
type KeybindingAction = Parameters<KeybindingsManager["matches"]>[1];
export type AgentsRunViewerAction = "handled" | "steer" | "stop" | "close";

type ViewerPage = "list" | "conversation" | "details";

/** Show a searchable run list and one full-width selected-run view. */
export class AgentsRunViewer {
  #data: AgentsOverlayData;
  #page: ViewerPage = "list";
  #section: RunSection = "agents";
  #selectedKey: string | undefined;
  #selectedIndex = 0;
  #visibleRuns: AgentsOverlayRun[] = [];
  #search = new Input({ prompt: "Search: ", placeholder: "task, label, target, result" });
  #listMaxVisible = 8;
  #listPageSize = 1;
  #selectList: SelectList;
  #listTop = 0;
  #listHeight = 0;
  #bodyTop = 0;
  #bodyHeight = 0;
  #focused = false;
  readonly #transcript: AgentsTranscriptPane;

  constructor(
    data: AgentsOverlayData,
    private readonly theme: Theme,
    private readonly onChange: () => void,
    private readonly keybindings?: AgentsKeybindings,
  ) {
    this.#data = data;
    this.#transcript = new AgentsTranscriptPane(theme, onChange);
    this.#selectList = this.#createSelectList([]);
    this.#refreshList();
  }

  get isList(): boolean {
    return this.#page === "list";
  }

  get selectedRun(): AgentsOverlayRun | undefined {
    return this.#selectedKey
      ? this.#data.runs.find((run) => run.key === this.#selectedKey)
      : this.#visibleRuns[this.#selectedIndex];
  }

  /** Show only the selected caller-facing section. */
  setSection(section: RunSection): void {
    if (this.#section === section) return;
    this.#section = section;
    this.#refreshList();
    this.onChange();
  }

  set focused(value: boolean) {
    this.#focused = value;
    this.#search.focused = value && this.#page === "list";
  }

  /** Rebuild elapsed descriptions without changing the current selection. */
  refreshElapsed(): void {
    const pinnedKey = this.#page === "list" ? undefined : this.selectedRun?.key;
    this.#refreshList(pinnedKey);
    this.onChange();
  }

  /** Replace live data and keep an opened run selected until list return or removal. */
  updateData(data: AgentsOverlayData): void {
    const selectedKey = this.selectedRun?.key;
    this.#data = data;
    const pinnedKey =
      this.#page !== "list" && selectedKey && data.runs.some((run) => run.key === selectedKey)
        ? selectedKey
        : undefined;
    this.#refreshList(pinnedKey);
    if (this.#page !== "list") {
      if (this.selectedRun?.key !== selectedKey) this.#transcript.select(this.selectedRun);
      else this.#transcript.update(this.selectedRun);
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
    if (steeringActive && height <= 4) {
      const content = [
        ...steeringLines,
        ...(notice ? [this.#line(this.theme.fg("warning", notice), width)] : []),
      ].slice(-height);
      while (content.length < height) content.unshift("");
      return content.map((line) => truncateToWidth(line, width));
    }

    const headerLines = renderAgentsRunHeader({
      theme: this.theme,
      header,
      tabs,
      width,
      height,
      steeringActive,
    });
    const pageHeading =
      this.#page === "list"
        ? []
        : [
            this.#line(
              formatRunConversationHeading(this.selectedRun, this.#transcript.isIncomplete),
              width,
            ),
          ];
    const footerContent = renderAgentsRunFooter({
      theme: this.theme,
      hints: renderAgentsRunHints({
        stopConfirmation,
        page: this.#page,
        height,
        run: this.selectedRun,
        theme: this.theme,
        keybindings: this.keybindings,
      }),
      notice,
      status:
        this.#page === "list"
          ? undefined
          : formatRunViewerStatus({
              run: this.selectedRun,
              transcriptStatus: this.#transcript.status,
              transcriptIncomplete: this.#transcript.isIncomplete,
            }),
      steeringLines,
      steeringActive,
      width,
    });
    this.#bodyTop = headerLines.length + pageHeading.length;
    const footerRows = Math.min(footerContent.length, Math.max(0, height - this.#bodyTop));
    // The tail keeps status and notice rows before optional hints when height is low.
    const footer = footerContent.slice(footerContent.length - footerRows);
    this.#bodyHeight = Math.max(0, height - this.#bodyTop - footer.length);

    if (this.#page !== "list") {
      this.#transcript.setBounds({ top: this.#bodyTop, height: this.#bodyHeight, left: 0, width });
    }
    const body =
      this.#page === "list"
        ? this.#renderList(width, this.#bodyHeight)
        : this.#transcript.render(this.selectedRun, width, this.#bodyHeight);
    const lines = [
      ...headerLines,
      ...pageHeading,
      ...body.slice(0, this.#bodyHeight),
      ...footer,
    ].slice(0, height);
    while (lines.length < height) lines.push("");
    return lines.map((line) => truncateToWidth(line, width));
  }

  handleInput(data: string, controlsEnabled: boolean): AgentsRunViewerAction | undefined {
    if (this.#page === "list") return this.#handleListInput(data);
    if (this.#isCancel(data)) {
      this.#page = "list";
      this.#transcript.setDetails(false);
      this.#search.focused = this.#focused;
      this.#refreshList();
      return "handled";
    }
    if (matchesKey(data, Key.tab)) {
      this.#page = this.#page === "conversation" ? "details" : "conversation";
      this.#transcript.setDetails(this.#page === "details");
      return "handled";
    }
    if (this.#handleTranscriptNavigation(data)) return "handled";
    if (this.#matches(data, "app.tools.expand", Key.ctrl("o"))) {
      this.#transcript.toggleToolDetails();
      return "handled";
    }
    if (this.#matches(data, "app.thinking.toggle", Key.ctrl("t"))) {
      this.#transcript.toggleThinking();
      return "handled";
    }
    const run = this.selectedRun;
    if (!controlsEnabled || !run?.active) return undefined;
    if (data === "s" && run.steeringAvailable) return "steer";
    if (data === "x" && (run.status === "starting" || run.status === "running")) return "stop";
    return undefined;
  }

  handleMouse(event: TuiMouseEvent): TuiMouseEventResult | undefined {
    if (this.#page !== "list") {
      if (
        event.type === "wheel" &&
        event.y >= this.#bodyTop &&
        event.y < this.#bodyTop + this.#bodyHeight
      ) {
        this.#transcript.scrollBy(event.wheelDelta ?? 0);
        this.onChange();
        return { handled: true };
      }
      return this.#transcript.handleMouse(event);
    }
    if (event.y < this.#listTop || event.y >= this.#listTop + this.#listHeight) {
      return undefined;
    }
    const result = this.#selectList.handleMouse({ ...event, y: event.y - this.#listTop });
    if (result?.handled) {
      const selected = this.#selectList.getSelectedItem();
      if (selected) this.#selectRun(selected.value);
      this.onChange();
    }
    return result;
  }

  invalidate(): void {
    this.#search.invalidate();
    this.#selectList.invalidate();
    this.#transcript.invalidate();
  }

  dispose(): void {
    this.#transcript.dispose();
  }

  #handleListInput(data: string): AgentsRunViewerAction {
    if (this.#isCancel(data)) return "close";
    if (this.#matches(data, "tui.select.confirm", Key.enter)) {
      this.#openSelectedRun();
      return "handled";
    }
    if (this.#matches(data, "tui.select.up", Key.up)) {
      this.#moveSelection(-1);
      return "handled";
    }
    if (this.#matches(data, "tui.select.down", Key.down)) {
      this.#moveSelection(1);
      return "handled";
    }
    if (this.#matches(data, "tui.select.pageUp", Key.pageUp)) {
      this.#moveSelection(-Math.max(1, this.#listPageSize), false);
      return "handled";
    }
    if (this.#matches(data, "tui.select.pageDown", Key.pageDown)) {
      this.#moveSelection(Math.max(1, this.#listPageSize), false);
      return "handled";
    }
    this.#search.handleInput(data);
    this.#refreshList();
    this.onChange();
    return "handled";
  }

  #renderList(width: number, height: number): string[] {
    const rendered = renderAgentsRunList({
      theme: this.theme,
      search: this.#search,
      getSelectList: (maxVisible) => {
        if (maxVisible !== this.#listMaxVisible) {
          this.#listMaxVisible = maxVisible;
          this.#selectList = this.#createSelectList(
            this.#visibleRuns.map((run) => runListItem(run)),
            maxVisible,
          );
          if (this.#visibleRuns.length > 0) this.#selectList.setSelectedIndex(this.#selectedIndex);
        }
        return this.#selectList;
      },
      selectedRun: this.selectedRun,
      itemCount: this.#visibleRuns.length,
      emptyMessage:
        this.#section === "agents" ? "No Agent Runs are registered." : "No Reviews are registered.",
      width,
      height,
      bodyTop: this.#bodyTop,
    });
    this.#listPageSize = rendered.visibleItemCount;
    this.#listTop = rendered.listTop;
    this.#listHeight = rendered.listHeight;
    return rendered.lines;
  }

  #createSelectList(items: SelectItem[], maxVisible = this.#listMaxVisible): SelectList {
    const list = new SelectList(items, maxVisible, {
      selectedPrefix: (text) => this.theme.fg("accent", text),
      selectedText: (text) => this.theme.fg("accent", text),
      description: (text) => this.theme.fg("dim", text),
      scrollInfo: (text) => this.theme.fg("dim", text),
      noMatch: (text) => this.theme.fg("warning", text),
    });
    list.onSelectionChange = (item) => this.#selectRun(item.value);
    list.onSelect = (item) => {
      this.#selectRun(item.value);
      this.#openSelectedRun();
    };
    return list;
  }

  #refreshList(pinnedKey?: string): void {
    const current = pinnedKey ?? this.selectedRun?.key ?? this.#selectedKey;
    this.#visibleRuns = orderedRuns(this.#data.runs, this.#section, this.#search.getValue());
    const currentIndex = current ? this.#visibleRuns.findIndex((run) => run.key === current) : -1;
    this.#selectedIndex = currentIndex >= 0 ? currentIndex : 0;
    this.#selectedKey = pinnedKey ?? this.#visibleRuns[this.#selectedIndex]?.key;
    this.#selectList = this.#createSelectList(this.#visibleRuns.map((run) => runListItem(run)));
    if (this.#visibleRuns.length > 0) this.#selectList.setSelectedIndex(this.#selectedIndex);
  }

  #moveSelection(delta: number, wrap = true): void {
    if (this.#visibleRuns.length === 0) return;
    const next = wrap
      ? (((this.#selectedIndex + delta) % this.#visibleRuns.length) + this.#visibleRuns.length) %
        this.#visibleRuns.length
      : Math.max(0, Math.min(this.#visibleRuns.length - 1, this.#selectedIndex + delta));
    this.#selectedIndex = next;
    const run = this.#visibleRuns[next];
    if (!run) return;
    this.#selectedKey = run.key;
    this.#selectList.setSelectedIndex(next);
    if (this.#page !== "list") this.#transcript.select(run);
    this.onChange();
  }

  #selectRun(runKey: string): void {
    const index = this.#visibleRuns.findIndex((run) => run.key === runKey);
    if (index < 0) return;
    this.#selectedIndex = index;
    this.#selectedKey = runKey;
    if (this.#page !== "list") this.#transcript.select(this.selectedRun);
  }

  #handleTranscriptNavigation(data: string): boolean {
    return handleTranscriptNavigation(
      data,
      (input, action, fallback) => this.#matches(input, action, fallback),
      (lines) => this.#transcript.scrollBy(lines),
      (action) => this.#transcript.navigate(action),
    );
  }

  #openSelectedRun(): void {
    const run = this.selectedRun;
    if (!run) return;
    this.#page = "conversation";
    this.#search.focused = false;
    this.#transcript.setDetails(false);
    this.#transcript.select(run);
    this.onChange();
  }

  #isCancel(data: string): boolean {
    return (
      this.#matches(data, "app.interrupt", Key.escape) ||
      this.#matches(data, "tui.select.cancel", Key.ctrl("c"))
    );
  }

  #matches(data: string, action: KeybindingAction, fallback: KeyId): boolean {
    return typeof this.keybindings?.matches === "function"
      ? this.keybindings.matches(data, action)
      : matchesKey(data, fallback);
  }

  #line(text: string, width: number): string {
    return truncateToWidth(` ${text}`, width);
  }
}
