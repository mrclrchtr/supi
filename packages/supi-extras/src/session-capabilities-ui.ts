import {
  DynamicBorder,
  type ExtensionUIContext,
  getSelectListTheme,
} from "@earendil-works/pi-coding-agent";
import {
  fuzzyFilter,
  Input,
  Key,
  matchesKey,
  SelectList,
  type TuiMouseEvent,
  type TuiMouseEventResult,
  truncateToWidth,
  visibleWidth,
} from "@earendil-works/pi-tui";
import type { SessionCapabilitySkill, SessionCapabilityState } from "@mrclrchtr/supi-core/session";
import {
  buildCapabilityRows,
  type CapabilityRow,
  type CapabilitySection,
  type CapabilityToolItem,
  renderDescriptionViewport,
} from "./session-capabilities-ui-rows.ts";

export type { CapabilityToolItem } from "./session-capabilities-ui-rows.ts";

const MAX_VISIBLE_ROWS = 10;
const HEADER_HEIGHT = 2;

interface SelectorComponent {
  render(width: number): string[];
  invalidate(): void;
  handleInput(data: string): void;
  handleMouse(event: TuiMouseEvent): TuiMouseEventResult | undefined;
}

interface CapabilitySelectorOptions {
  done: (result: undefined) => void;
  onChange: (id: string, value: string) => void;
  skills: SessionCapabilitySkill[] | undefined;
  state: SessionCapabilityState;
  theme: ExtensionUIContext["theme"];
  tools: CapabilityToolItem[];
  tui: { requestRender(): void };
}

type RowLayout = { maxLabelWidth: number; maxIndent: number; width: number };

class CapabilityList implements SelectorComponent {
  private rows: CapabilityRow[];
  private selectedIndex = 0;
  private menu: SelectorComponent | null = null;
  private mousePressedIndex: number | undefined;
  private readonly searchInput = new Input();
  private searchQuery = "";
  private cachedWidth?: number;
  private cachedLines?: string[];

  constructor(
    private readonly section: CapabilitySection,
    private readonly options: CapabilitySelectorOptions,
  ) {
    this.rows = this.buildRows();
  }

  hasOpenMenu(): boolean {
    return this.menu !== null;
  }

  invalidate(): void {
    this.cachedWidth = undefined;
    this.cachedLines = undefined;
    this.searchInput.invalidate();
    this.menu?.invalidate();
  }

  render(width: number): string[] {
    if (this.cachedLines && this.cachedWidth === width) return this.cachedLines;
    this.cachedWidth = width;
    this.cachedLines = this.menu ? this.menu.render(width) : this.renderRows(width);
    return this.cachedLines;
  }

  handleInput(data: string): void {
    if (this.menu) {
      this.menu.handleInput(data);
      this.invalidate();
      this.options.tui.requestRender();
      return;
    }
    if (matchesKey(data, Key.escape)) {
      this.options.done(undefined);
    } else if (matchesKey(data, Key.up)) {
      this.moveSelection(-1);
    } else if (matchesKey(data, Key.down)) {
      this.moveSelection(1);
    } else if (matchesKey(data, Key.enter)) {
      this.activateSelected();
    } else if (data === " ") {
      this.toggleSelected();
    } else {
      this.searchInput.handleInput(data);
      this.searchQuery = this.searchInput.getValue();
      this.selectedIndex = 0;
      this.invalidate();
      this.options.tui.requestRender();
    }
  }

  handleMouse(event: TuiMouseEvent): TuiMouseEventResult | undefined {
    if (this.menu) return this.menu.handleMouse(event);
    if (event.type === "wheel" && event.wheelDelta) return this.handleWheel(event.wheelDelta);
    if (event.y === 0) return this.handleSearchMouse(event);
    if (
      event.y === 1 ||
      event.button !== "left" ||
      (event.type !== "press" && event.type !== "click")
    ) {
      return undefined;
    }
    return this.handleRowMouse(event);
  }

  private buildRows(): CapabilityRow[] {
    return buildCapabilityRows(
      this.section,
      this.options.tools,
      this.options.skills,
      this.options.state,
    );
  }

  private filteredRows(): CapabilityRow[] {
    if (!this.searchQuery) return this.rows;
    const matches = fuzzyFilter(this.rows, this.searchQuery, (row) => row.searchText);
    const matchingIds = new Set(matches.map((row) => row.id));
    const parentIds = new Set(matches.flatMap((row) => (row.parentId ? [row.parentId] : [])));
    return this.rows.filter((row) => matchingIds.has(row.id) || parentIds.has(row.id));
  }

  private visibleRange(length: number): { start: number; end: number } {
    const maxVisible = Math.min(length, MAX_VISIBLE_ROWS);
    const start = Math.max(
      0,
      Math.min(this.selectedIndex - Math.floor(maxVisible / 2), length - maxVisible),
    );
    return { start, end: Math.min(start + maxVisible, length) };
  }

  private renderRows(width: number): string[] {
    const lines = [...this.searchInput.render(width), ""];
    const rows = this.filteredRows();
    if (rows.length === 0) return this.renderEmptyRows(lines, width);

    const { start, end } = this.visibleRange(rows.length);
    const maxLabelWidth = Math.min(30, Math.max(...rows.map((row) => visibleWidth(row.label))));
    const maxIndent = Math.max(...rows.map((row) => row.indent));
    lines.push(
      ...this.renderVisibleRows(rows, { start, end }, { maxLabelWidth, maxIndent, width }),
    );
    if (start > 0 || end < rows.length) {
      lines.push(this.options.theme.fg("dim", `  (${this.selectedIndex + 1}/${rows.length})`));
    }
    if (rows.some((row) => row.description)) {
      lines.push("");
      const description = renderDescriptionViewport(rows[this.selectedIndex]?.description, width);
      lines.push(...description.map((line) => (line ? this.options.theme.fg("dim", line) : "")));
    }
    lines.push("", this.renderHint(width));
    return lines;
  }

  private renderEmptyRows(lines: string[], width: number): string[] {
    const text = this.searchQuery ? "  No matching capabilities" : "  No capabilities available";
    lines.push(this.options.theme.fg("dim", text), "", this.renderHint(width));
    return lines;
  }

  private renderVisibleRows(
    rows: CapabilityRow[],
    range: { start: number; end: number },
    layout: RowLayout,
  ): string[] {
    const lines: string[] = [];
    for (let index = range.start; index < range.end; index++) {
      const row = rows[index];
      if (row) lines.push(this.renderRow(row, index, layout));
    }
    return lines;
  }

  private renderRow(row: CapabilityRow, index: number, layout: RowLayout): string {
    const selected = index === this.selectedIndex;
    const prefix = selected
      ? `${" ".repeat(row.indent - 2)}${this.options.theme.fg("accent", "→ ")}`
      : " ".repeat(row.indent);
    const label = truncateToWidth(row.label, layout.maxLabelWidth, "");
    const padding = " ".repeat(
      Math.max(0, layout.maxIndent - row.indent + layout.maxLabelWidth - visibleWidth(label)),
    );
    const labelText = this.options.theme.fg(selected ? "accent" : "text", label + padding);
    const valueWidth = Math.max(0, layout.width - layout.maxIndent - layout.maxLabelWidth - 4);
    const value = truncateToWidth(row.currentValue, valueWidth, "");
    const valueText = this.options.theme.fg(selected ? "accent" : "muted", value);
    return truncateToWidth(`${prefix}${labelText}  ${valueText}`, layout.width);
  }

  private renderHint(width: number): string {
    return truncateToWidth(
      this.options.theme.fg(
        "dim",
        "Type to search · Enter for actions · Space to toggle · Tab to switch · Esc to close",
      ),
      width,
    );
  }

  private handleWheel(wheelDelta: number): TuiMouseEventResult {
    const rows = this.filteredRows();
    const previousIndex = this.selectedIndex;
    this.selectedIndex = Math.max(
      0,
      Math.min(rows.length - 1, this.selectedIndex + (wheelDelta < 0 ? -1 : 1)),
    );
    const changed = previousIndex !== this.selectedIndex;
    if (changed) this.invalidate();
    return { handled: true, render: changed };
  }

  private handleSearchMouse(event: TuiMouseEvent): TuiMouseEventResult | undefined {
    const result = this.searchInput.handleMouse(event);
    return result ? { ...result, focus: true } : undefined;
  }

  private handleRowMouse(event: TuiMouseEvent): TuiMouseEventResult | undefined {
    const rows = this.filteredRows();
    if (rows.length === 0) return undefined;
    const { start, end } = this.visibleRange(rows.length);
    const rowIndex = start + event.y - 2;
    if (rowIndex < start || rowIndex >= end) return undefined;
    if (event.type === "press") {
      this.mousePressedIndex = rowIndex;
      this.selectedIndex = rowIndex;
      this.invalidate();
      return { handled: true, focus: true };
    }
    this.selectedIndex = this.mousePressedIndex ?? rowIndex;
    this.mousePressedIndex = undefined;
    const row = rows[this.selectedIndex];
    if (row?.toggleValues) this.toggleSelected();
    else this.activateSelected();
    return { handled: true };
  }

  private moveSelection(delta: number): void {
    const rows = this.filteredRows();
    if (rows.length === 0) return;
    this.selectedIndex =
      delta < 0
        ? this.selectedIndex <= 0
          ? rows.length - 1
          : this.selectedIndex - 1
        : this.selectedIndex >= rows.length - 1
          ? 0
          : this.selectedIndex + 1;
    this.invalidate();
    this.options.tui.requestRender();
  }

  private toggleSelected(): void {
    const row = this.filteredRows()[this.selectedIndex];
    if (!row?.toggleValues) return;
    const [enabledValue, disabledValue] = row.toggleValues;
    this.options.onChange(row.id, row.currentValue === enabledValue ? disabledValue : enabledValue);
    this.refreshRows(row.id);
  }

  private activateSelected(): void {
    const row = this.filteredRows()[this.selectedIndex];
    if (!row?.actions?.length) return;
    const selectList = new SelectList(
      row.actions,
      Math.min(row.actions.length + 2, 15),
      getSelectListTheme(),
    );
    selectList.onSelect = (item) => {
      this.menu = null;
      this.options.onChange(row.id, item.value);
      this.refreshRows(row.id);
    };
    selectList.onCancel = () => {
      this.menu = null;
      this.invalidate();
      this.options.tui.requestRender();
    };
    this.menu = {
      render: (width) => [
        truncateToWidth(this.options.theme.fg("accent", "  Actions"), width),
        ...selectList.render(width),
        "",
        truncateToWidth(
          this.options.theme.fg("dim", "  ↑↓ navigate · Enter select · Esc cancel"),
          width,
        ),
      ],
      invalidate: () => selectList.invalidate(),
      handleInput: (data) => selectList.handleInput(data),
      handleMouse: (event) =>
        event.y < 1 ? undefined : selectList.handleMouse({ ...event, y: event.y - 1 }),
    };
    this.invalidate();
    this.options.tui.requestRender();
  }

  private refreshRows(selectedId: string): void {
    this.rows = this.buildRows();
    const rows = this.filteredRows();
    const selectedIndex = rows.findIndex((row) => row.id === selectedId);
    this.selectedIndex =
      selectedIndex >= 0 ? selectedIndex : Math.min(this.selectedIndex, rows.length - 1);
    this.invalidate();
    this.options.tui.requestRender();
  }
}

/** Build the searchable selector for the current session. */
export function createCapabilitySelector(options: CapabilitySelectorOptions): SelectorComponent {
  const { theme, tui } = options;
  let section: CapabilitySection = "tools";
  let list = new CapabilityList(section, options);
  const topBorder = new DynamicBorder((text: string) => theme.fg("borderMuted", text));
  const bottomBorder = new DynamicBorder((text: string) => theme.fg("borderMuted", text));

  const renderTitle = (width: number): string => {
    const tabs =
      section === "tools"
        ? `${theme.fg("accent", theme.bold("[Tools]"))}  ${theme.fg("dim", "Skills")}`
        : `${theme.fg("dim", "Tools")}  ${theme.fg("accent", theme.bold("[Skills]"))}`;
    return truncateToWidth(
      ` ${theme.fg("accent", theme.bold("Session Capabilities"))}  ${tabs}`,
      width,
    );
  };

  return {
    render(width) {
      return [
        ...topBorder.render(width),
        renderTitle(width),
        ...list.render(width),
        ...bottomBorder.render(width),
      ];
    },
    invalidate() {
      topBorder.invalidate();
      bottomBorder.invalidate();
      list.invalidate();
    },
    handleInput(data) {
      if (matchesKey(data, Key.tab) && !list.hasOpenMenu()) {
        section = section === "tools" ? "skills" : "tools";
        list = new CapabilityList(section, options);
        tui.requestRender();
        return;
      }
      list.handleInput(data);
    },
    handleMouse(event) {
      if (event.y < HEADER_HEIGHT) return undefined;
      return list.handleMouse({
        ...event,
        y: event.y - HEADER_HEIGHT,
        height: Math.max(0, event.height - HEADER_HEIGHT - 1),
      });
    },
  };
}
