// Source-aware settings list with scope actions and custom submenus.

import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import {
  Input,
  Key,
  matchesKey,
  truncateToWidth,
  visibleWidth,
  wrapTextWithAnsi,
} from "@earendil-works/pi-tui";
import type { SettingsAction, SettingsModule, SettingsScope } from "@mrclrchtr/supi-core/settings";
import type { ThemeAccessor } from "./settings-action-menu.ts";
import {
  buildActionMenu,
  createActionMenuComponent,
  getConcreteChoices,
} from "./settings-action-menu.ts";
import { type LoadedSettingsModule, readSettingsModules } from "./settings-module-reader.ts";
import { filterSettingsRows, rowsFromModules, type ScopedRow } from "./settings-row-model.ts";
import { createInputSubmenu, createModelPickerSubmenu } from "./settings-submenus.ts";

interface SubmenuState {
  component: {
    render: (w: number) => string[];
    invalidate?: () => void;
    handleInput?: (data: string) => void;
  };
}

export class ScopedSettingsList {
  private modules: SettingsModule[];
  private scope: SettingsScope;
  private cwd: string;
  private ctx: ExtensionContext | undefined;
  private theme: ThemeAccessor;
  private tui: { requestRender: () => void };
  private onCancel: () => void;
  private onError?: (message: string) => void;
  private rows: ScopedRow[] = [];
  private selectedIndex = 0;
  private submenu: SubmenuState | null = null;
  private searchInput?: Input;
  private searchQuery = "";
  private actionPending = false;
  private cachedWidth?: number;
  private cachedLines?: string[];

  // biome-ignore lint/complexity/useMaxParams: component constructor needs all dependencies upfront for immutable wiring
  constructor(
    modules: SettingsModule[],
    initial: LoadedSettingsModule[],
    scope: SettingsScope,
    cwd: string,
    ctx: ExtensionContext | undefined,
    theme: ThemeAccessor,
    tui: { requestRender: () => void },
    onCancel: () => void,
    onError?: (message: string) => void,
  ) {
    this.modules = modules;
    this.scope = scope;
    this.cwd = cwd;
    this.ctx = ctx;
    this.theme = theme;
    this.tui = tui;
    this.onCancel = onCancel;
    this.onError = onError;
    this.rebuildRows(initial);
  }

  async reload(scope: SettingsScope, cwd: string, ctx?: ExtensionContext): Promise<void> {
    this.scope = scope;
    this.cwd = cwd;
    this.ctx = ctx;
    this.actionPending = true;
    try {
      await this.refreshRows();
      this.selectedIndex = Math.min(
        this.selectedIndex,
        Math.max(0, this.filteredRows().length - 1),
      );
    } finally {
      this.actionPending = false;
      this.invalidate();
      this.tui.requestRender();
    }
  }

  /** Return true while a setting editor, action menu, or persistence action owns input. */
  hasOpenSubmenu(): boolean {
    return this.submenu !== null || this.actionPending;
  }

  invalidate(): void {
    this.cachedWidth = undefined;
    this.cachedLines = undefined;
  }

  render(width: number): string[] {
    if (this.cachedLines && this.cachedWidth === width) return this.cachedLines;
    if (this.submenu) {
      this.cachedWidth = width;
      this.cachedLines = this.submenu.component.render(width);
      return this.cachedLines;
    }
    this.cachedWidth = width;
    this.cachedLines = this.renderList(width);
    return this.cachedLines;
  }

  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: One pass handles filtering, grouping, selection, scrolling, and descriptions.
  private renderList(width: number): string[] {
    const lines: string[] = [];
    if (this.searchInput) {
      lines.push(...this.searchInput.render(width));
      lines.push("");
    }
    const displayRows = this.filteredRows();
    if (displayRows.length === 0) {
      lines.push(
        this.theme.fg(
          "dim",
          this.searchQuery ? "  No matching settings" : "  No settings available",
        ),
      );
      lines.push("");
      lines.push(this.renderHint(width));
      return lines;
    }
    const maxVisible = Math.min(displayRows.length, 10);
    const start = Math.max(
      0,
      Math.min(this.selectedIndex - Math.floor(maxVisible / 2), displayRows.length - maxVisible),
    );
    const end = Math.min(start + maxVisible, displayRows.length);
    const maxLabelWidth = Math.min(
      30,
      Math.max(...displayRows.map((row) => visibleWidth(row.field.field.label))),
    );
    let previousSection: string | undefined;
    for (let i = start; i < end; i++) {
      const row = displayRows[i];
      if (!row) continue;
      if (row.moduleLabel !== previousSection) {
        lines.push(
          truncateToWidth(`  ${this.theme.fg("muted", this.theme.bold(row.moduleLabel))}`, width),
        );
        previousSection = row.moduleLabel;
      }
      const isSelected = i === this.selectedIndex;
      const prefix = isSelected ? `  ${this.theme.fg("accent", "→ ")}` : "    ";
      const label = row.field.field.label.padEnd(
        row.field.field.label.length + maxLabelWidth - visibleWidth(row.field.field.label),
      );
      const labelText = this.theme.fg(isSelected ? "accent" : "text", label);
      const valueWidth = Math.max(0, width - 4 - maxLabelWidth - 2);
      const value = truncateToWidth(row.field.displayValue, valueWidth, "");
      const valueText = this.theme.fg(isSelected ? "accent" : "muted", value);
      lines.push(truncateToWidth(`${prefix}${labelText}  ${valueText}`, width));
    }
    if (start > 0 || end < displayRows.length) {
      lines.push(this.theme.fg("dim", `  (${this.selectedIndex + 1}/${displayRows.length})`));
    }
    const description = displayRows[this.selectedIndex]?.field.field.description;
    if (description) {
      lines.push("");
      for (const line of wrapTextWithAnsi(description, Math.max(1, width - 4))) {
        lines.push(this.theme.fg("dim", `  ${line}`));
      }
    }
    lines.push("");
    lines.push(this.renderHint(width));
    return lines;
  }

  private renderHint(width: number): string {
    const hints = [];
    if (this.searchInput) hints.push("Type to search");
    hints.push("Enter for actions", "Space to cycle", "Tab for scope", "Esc to close");
    return truncateToWidth(this.theme.fg("dim", hints.join(" · ")), width);
  }

  handleInput(data: string): void {
    if (this.actionPending) return;
    if (this.submenu) {
      this.submenu.component.handleInput?.(data);
      this.invalidate();
      this.tui.requestRender();
      return;
    }
    if (matchesKey(data, Key.escape)) {
      this.onCancel();
      return;
    }
    if (matchesKey(data, Key.up)) {
      this.moveSelection(-1);
      return;
    }
    if (matchesKey(data, Key.down)) {
      this.moveSelection(1);
      return;
    }
    if (matchesKey(data, Key.enter)) {
      this.activateSelected();
      return;
    }
    if (data === " ") {
      this.cycleSelected();
      return;
    }
    if (this.searchInput) {
      const sanitized = data.replace(/ /g, "");
      if (sanitized) {
        this.searchInput.handleInput(sanitized);
        this.searchQuery = this.searchInput.getValue();
        this.selectedIndex = 0;
        this.invalidate();
        this.tui.requestRender();
      }
    }
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
    this.tui.requestRender();
  }

  enableSearch(): void {
    if (!this.searchInput) this.searchInput = new Input();
  }

  private rebuildRows(loaded: LoadedSettingsModule[]): void {
    this.rows = rowsFromModules(loaded);
  }

  private async refreshRows(): Promise<void> {
    const result = await readSettingsModules(this.modules, {
      scope: this.scope,
      cwd: this.cwd,
      ctx: this.ctx,
    });
    this.rebuildRows(result.loaded);
    for (const error of result.errors) this.onError?.(error);
  }

  private filteredRows(): ScopedRow[] {
    return filterSettingsRows(this.rows, this.searchQuery);
  }

  private activateSelected(): void {
    const rows = this.filteredRows();
    const row = rows[this.selectedIndex];
    if (!row) return;

    const menu = buildActionMenu(row.field, this.scope);
    if (menu.length === 0) return;
    this.submenu = {
      component: createActionMenuComponent(menu, this.doneAction(row), this.theme),
    };
    this.invalidate();
    this.tui.requestRender();
  }

  private doneAction(row: ScopedRow): (action?: string) => void {
    return (action) => {
      this.submenu = null;
      if (!action) {
        this.invalidate();
        this.tui.requestRender();
        return;
      }
      if (action === "inherit" || action === "resetToDefault") {
        this.dispatchAction(row.flatId, { kind: "unset" });
      } else if (action === "edit") {
        this.openFreeInputSubmenu(row);
      } else if (action.startsWith("set:")) {
        this.dispatchAction(row.flatId, { kind: "set", value: action.slice(4) });
      }
      this.invalidate();
      this.tui.requestRender();
    };
  }

  private cycleSelected(): void {
    const rows = this.filteredRows();
    const row = rows[this.selectedIndex];
    if (!row) return;
    const choices = getConcreteChoices(row.field.field);
    if (choices.length === 0) return;
    const idx = choices.indexOf(row.field.editValue);
    const next = choices[idx < 0 ? 0 : (idx + 1) % choices.length] ?? choices[0];
    if (next) this.dispatchAction(row.flatId, { kind: "set", value: next });
  }

  private openFreeInputSubmenu(row: ScopedRow): void {
    const cleanValue = row.field.editValue;
    if (row.field.field.kind === "custom" && row.field.field.submenu) {
      const comp = row.field.field.submenu(
        cleanValue,
        (selectedValue) => {
          this.submenu = null;
          if (selectedValue !== undefined) {
            this.dispatchAction(row.flatId, { kind: "set", value: selectedValue });
          } else {
            void this.reload(this.scope, this.cwd, this.ctx);
          }
          this.invalidate();
          this.tui.requestRender();
        },
        this.scope,
        this.cwd,
        this.ctx,
      );
      this.submenu = { component: comp };
    } else if (row.field.field.kind === "modelPicker") {
      this.submenu = {
        component: createModelPickerSubmenu(
          cleanValue,
          (v) => {
            this.submenu = null;
            if (v !== undefined) this.dispatchAction(row.flatId, { kind: "set", value: v });
            this.invalidate();
            this.tui.requestRender();
          },
          this.ctx,
          row.field.field,
        ),
      };
    } else {
      const label =
        row.field.field.kind === "stringList"
          ? "Enter values (comma-separated):"
          : `Enter ${row.field.field.label.toLowerCase()}:`;
      this.submenu = {
        component: createInputSubmenu(cleanValue, label, (v) => {
          this.submenu = null;
          if (v !== undefined) this.dispatchAction(row.flatId, { kind: "set", value: v });
          this.invalidate();
          this.tui.requestRender();
        }),
      };
    }
    this.invalidate();
    this.tui.requestRender();
  }

  private dispatchAction(flatId: string, action: SettingsAction): void {
    void this.runAction(flatId, action);
  }

  private async runAction(flatId: string, action: SettingsAction): Promise<void> {
    const dotIndex = flatId.indexOf(".");
    if (dotIndex === -1) return;
    const moduleId = flatId.slice(0, dotIndex);
    const fieldKey = flatId.slice(dotIndex + 1);
    const module = this.modules.find((candidate) => candidate.id === moduleId);
    if (!module) return;

    this.actionPending = true;
    try {
      const result = await module.apply({
        scope: this.scope,
        cwd: this.cwd,
        ctx: this.ctx,
        fieldKey,
        action,
      });
      if (result?.notice) {
        this.ctx?.ui.notify(result.notice.message, result.notice.level);
      }
      await this.refreshRows();
    } catch (err) {
      this.onError?.(err instanceof Error ? err.message : String(err));
      await this.refreshRows();
    } finally {
      this.actionPending = false;
      this.invalidate();
      this.tui.requestRender();
    }
  }
}
