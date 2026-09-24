import type { Theme } from "@earendil-works/pi-coding-agent";
import {
  type SelectItem,
  SelectList,
  type TuiMouseEvent,
  type TuiMouseEventResult,
  truncateToWidth,
  visibleWidth,
  wrapTextWithAnsi,
} from "@earendil-works/pi-tui";

/** The theme methods used by the shared TUI list renderers. */
export type TuiTheme = Pick<Theme, "fg" | "bold">;

/** Settings for one selectable row in a themed list. */
export interface SelectableRowOptions {
  /** The row label. */
  label: string;
  /** The value shown beside the label. */
  value: string;
  /** The row indent in terminal columns. */
  indent: number;
  /** The largest indent used by the list. */
  maxIndent: number;
  /** The label column width. */
  maxLabelWidth: number;
  /** The row width in terminal columns. */
  width: number;
  /** True when this row is selected. */
  selected: boolean;
  /** Theme used for row colors. */
  theme: TuiTheme;
}

/** Settings for a shared action menu. */
export interface SelectListMenuOptions {
  /** The title shown above the choices. */
  title: string;
  /** The choices shown in the menu. */
  items: SelectItem[];
  /** Theme used for menu colors. */
  theme: TuiTheme;
  /** Called when the user selects a choice. */
  onSelect: (item: SelectItem) => void;
  /** Called when the user closes the menu without a choice. */
  onCancel: () => void;
}

/** Component methods for a shared action menu. */
export interface SelectListMenuComponent {
  render(width: number): string[];
  invalidate(): void;
  handleInput(data: string): void;
  handleMouse(event: TuiMouseEvent): TuiMouseEventResult | undefined;
}

/** Build a title line with optional right-side tabs in the shared TUI style. */
export function formatTuiTitleLine(title: string, theme: TuiTheme, trailing = ""): string {
  const titleText = theme.fg("accent", theme.bold(title));
  return ` ${titleText}${trailing ? `  ${trailing}` : ""}`;
}

/** Render one row with a selected marker and an aligned value column. */
export function renderSelectableRow(options: SelectableRowOptions): string {
  const indent = Math.max(0, options.indent);
  const maxIndent = Math.max(indent, options.maxIndent);
  const maxLabelWidth = Math.max(0, options.maxLabelWidth);
  const width = Math.max(0, options.width);
  const label = truncateToWidth(options.label, maxLabelWidth, "");
  const labelWidth = visibleWidth(label);
  const prefix = options.selected
    ? `${" ".repeat(Math.max(0, indent - 2))}${options.theme.fg("accent", "→ ")}`
    : " ".repeat(indent);
  const labelPadding = " ".repeat(maxIndent - indent + maxLabelWidth - labelWidth);
  const valueWidth = Math.max(0, width - maxIndent - maxLabelWidth - 4);
  const value = truncateToWidth(options.value, valueWidth, "");
  const labelText = options.theme.fg(options.selected ? "accent" : "text", label + labelPadding);
  const valueText = options.theme.fg(options.selected ? "accent" : "muted", value);

  return truncateToWidth(`${prefix}${labelText}  ${valueText}`, width);
}

/** Render a fixed-height, four-line description preview for a selected row. */
export function renderDescriptionViewport(
  description: string | undefined,
  width: number,
): string[] {
  const height = 4;
  const indent = "  ";
  const contentWidth = Math.max(1, width - 4);
  const wrapped = description ? wrapTextWithAnsi(description, contentWidth) : [];
  const visible = wrapped.slice(0, height);

  if (wrapped.length > height) {
    const lastIndex = height - 1;
    visible[lastIndex] = truncateToWidth(`${visible[lastIndex] ?? ""}…`, contentWidth, "…");
  }

  while (visible.length < height) visible.push("");
  return visible.map((line) => (line ? `${indent}${line}` : ""));
}

/** Render a dimmed hint line with the shared separator and truncation rules. */
export function renderTuiHintLine(hints: string[], theme: TuiTheme, width: number): string {
  return truncateToWidth(theme.fg("dim", hints.join(" · ")), width);
}

/** Build the shared title, choices, and key hints for an action menu. */
export function createSelectListMenu(options: SelectListMenuOptions): SelectListMenuComponent {
  const { items, onSelect, onCancel, theme, title } = options;
  const selectList = new SelectList(items, Math.min(items.length + 2, 15), {
    selectedPrefix: (text) => theme.fg("accent", text),
    selectedText: (text) => theme.fg("accent", text),
    description: (text) => theme.fg("muted", text),
    scrollInfo: (text) => theme.fg("dim", text),
    noMatch: (text) => theme.fg("warning", text),
  });
  selectList.onSelect = onSelect;
  selectList.onCancel = onCancel;

  return {
    render(width) {
      return [
        truncateToWidth(theme.fg("accent", `  ${title}`), width),
        ...selectList.render(width),
        "",
        renderTuiHintLine(["  ↑↓ navigate", "Enter select", "Esc cancel"], theme, width),
      ];
    },
    invalidate() {
      selectList.invalidate();
    },
    handleInput(data) {
      selectList.handleInput(data);
    },
    handleMouse(event) {
      if (event.y < 1) return undefined;
      return selectList.handleMouse({ ...event, y: event.y - 1 });
    },
  };
}
