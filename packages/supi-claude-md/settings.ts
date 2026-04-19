// Interactive settings overlay for supi-claude-md.
//
// Provides a keyboard-driven TUI overlay for viewing and editing
// claude-md configuration with project/global scope support.
// Uses ctx.ui.custom() with custom rendering and Input for editing.

import type { ExtensionContext, Theme } from "@mariozechner/pi-coding-agent";
import { type Component, Input, Key, matchesKey, type TUI } from "@mariozechner/pi-tui";
import { loadSupiConfig, removeSupiConfigKey, writeSupiConfig } from "@mrclrchtr/supi-core";
import { CLAUDE_MD_DEFAULTS, type ClaudeMdConfig } from "./config.ts";

// ── Types ────────────────────────────────────────────────────

export type SettingsScope = "project" | "global";

export interface SettingsRow {
  id: string;
  label: string;
  description: string;
  type: "boolean" | "interval" | "filenames";
  value: string;
}

export interface SettingsOverlayState {
  scope: SettingsScope;
  rows: SettingsRow[];
  selectedIndex: number;
  editing: boolean;
  cachedLines: string[] | undefined;
  cachedWidth: number | undefined;
}

// ── Pure helpers ─────────────────────────────────────────────

export function loadSettingsForScope(_scope: SettingsScope, cwd: string): ClaudeMdConfig {
  // Currently loadSupiConfig merges global+project; scope determines persist target.
  // For display we always show the effective merged config.
  return loadSupiConfig("claude-md", cwd, CLAUDE_MD_DEFAULTS);
}

export function persistSetting(
  scope: SettingsScope,
  cwd: string,
  key: string,
  value: unknown,
): void {
  if (value === undefined) {
    removeSupiConfigKey({ section: "claude-md", scope, cwd }, key);
  } else {
    writeSupiConfig({ section: "claude-md", scope, cwd }, { [key]: value });
  }
}

export function buildSettingsRows(config: ClaudeMdConfig): SettingsRow[] {
  return [
    {
      id: "rereadInterval",
      label: "Root Refresh Interval",
      description: "Turns between re-injecting root context files (0 = off)",
      type: "interval",
      value: config.rereadInterval === 0 ? "off" : String(config.rereadInterval),
    },
    {
      id: "subdirs",
      label: "Subdirectory Discovery",
      description: "Inject CLAUDE.md/AGENTS.md from subdirectories when browsing files",
      type: "boolean",
      value: config.subdirs ? "on" : "off",
    },
    {
      id: "fileNames",
      label: "Context File Names",
      description: "File names to look for in each directory (comma-separated)",
      type: "filenames",
      value: config.fileNames.join(", "),
    },
  ];
}

// ── TUI helpers ──────────────────────────────────────────────

interface ThemeTokens {
  accent: (text: string) => string;
  dim: (text: string) => string;
  muted: (text: string) => string;
  text: (text: string) => string;
}

function getThemeTokens(theme: Theme): ThemeTokens {
  return {
    accent: (text: string) => theme.fg("accent", text),
    dim: (text: string) => theme.fg("dim", text),
    muted: (text: string) => theme.fg("muted", text),
    text: (text: string) => theme.fg("text", text),
  };
}

function getScopeLabel(scope: SettingsScope): string {
  return scope === "project" ? "Project" : "Global";
}

/** All rows — used for navigation and activation. */
function navigableRows(rows: SettingsRow[]): SettingsRow[] {
  return rows;
}

interface OverlayDeps {
  state: SettingsOverlayState;
  input: Input;
  tui: TUI;
  tokens: ThemeTokens;
  cwd: string;
  done: () => void;
}

function invalidate(deps: OverlayDeps): void {
  deps.state.cachedLines = undefined;
  deps.tui.requestRender();
}

function reloadScope(deps: OverlayDeps): void {
  const config = loadSettingsForScope(deps.state.scope, deps.cwd);
  deps.state.rows = buildSettingsRows(config);
}

function handleToggle(deps: OverlayDeps, rowId: string): void {
  const row = deps.state.rows.find((r) => r.id === rowId);
  if (!row || row.type !== "boolean") return;

  const newValue = row.value !== "on";
  persistSetting(deps.state.scope, deps.cwd, rowId, newValue);
  row.value = newValue ? "on" : "off";
}

function handleInputSubmit(deps: OverlayDeps, rawValue: string): void {
  const rows = navigableRows(deps.state.rows);
  const row = rows[deps.state.selectedIndex];
  if (!row) return;

  deps.state.editing = false;

  if (row.type === "interval") {
    submitInterval(deps, row, rawValue.trim());
  } else if (row.type === "filenames") {
    submitFileNames(deps, row, rawValue.trim());
  }
}

function submitInterval(deps: OverlayDeps, row: SettingsRow, trimmed: string): void {
  if (trimmed === "default") {
    persistSetting(deps.state.scope, deps.cwd, "rereadInterval", undefined);
    const config = loadSettingsForScope(deps.state.scope, deps.cwd);
    row.value = config.rereadInterval === 0 ? "off" : String(config.rereadInterval);
    return;
  }

  if (trimmed === "off" || trimmed === "0") {
    persistSetting(deps.state.scope, deps.cwd, "rereadInterval", 0);
    row.value = "off";
    return;
  }

  const n = Number.parseInt(trimmed, 10);
  if (Number.isNaN(n) || n < 0) {
    return; // invalid — cancel editing
  }

  persistSetting(deps.state.scope, deps.cwd, "rereadInterval", n);
  row.value = String(n);
}

function submitFileNames(deps: OverlayDeps, row: SettingsRow, trimmed: string): void {
  if (trimmed.length === 0) return; // don't persist empty

  const names = trimmed
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (names.length === 0) return;

  persistSetting(deps.state.scope, deps.cwd, "fileNames", names);
  row.value = names.join(", ");
}

// ── Input dispatch ───────────────────────────────────────────

function handleEditingInput(data: string, deps: OverlayDeps): void {
  if (matchesKey(data, Key.escape)) {
    deps.state.editing = false;
    invalidate(deps);
    return;
  }
  if (matchesKey(data, Key.enter)) {
    handleInputSubmit(deps, deps.input.getValue());
    invalidate(deps);
    return;
  }
  deps.input.handleInput(data);
  invalidate(deps);
}

function handleNavigateInput(data: string, deps: OverlayDeps): void {
  if (matchesKey(data, Key.escape)) {
    deps.done();
    return;
  }
  if (matchesKey(data, Key.tab)) {
    deps.state.scope = deps.state.scope === "project" ? "global" : "project";
    reloadScope(deps);
    invalidate(deps);
    return;
  }
  if (matchesKey(data, Key.up)) {
    deps.state.selectedIndex = Math.max(0, deps.state.selectedIndex - 1);
    invalidate(deps);
    return;
  }
  if (matchesKey(data, Key.down)) {
    const max = navigableRows(deps.state.rows).length - 1;
    deps.state.selectedIndex = Math.min(max, deps.state.selectedIndex + 1);
    invalidate(deps);
    return;
  }
  if (matchesKey(data, Key.enter) || matchesKey(data, Key.space)) {
    handleActivate(deps);
  }
}

function handleActivate(deps: OverlayDeps): void {
  const rows = navigableRows(deps.state.rows);
  const currentRow = rows[deps.state.selectedIndex];
  if (!currentRow) return;

  if (currentRow.type === "boolean") {
    handleToggle(deps, currentRow.id);
    invalidate(deps);
  } else if (currentRow.type === "interval" || currentRow.type === "filenames") {
    deps.state.editing = true;
    deps.input.setValue(currentRow.value === "off" ? "0" : currentRow.value);
    invalidate(deps);
  }
}

// ── Render ───────────────────────────────────────────────────

function renderRow(row: SettingsRow, selected: boolean, tokens: ThemeTokens): string {
  const cursor = selected ? tokens.accent("> ") : "  ";
  const label = selected ? tokens.accent(row.label) : tokens.text(row.label);
  const value = selected ? tokens.accent(row.value) : tokens.muted(row.value);
  return `${cursor}${label}: ${value}`;
}

function renderDescription(row: SettingsRow, width: number, tokens: ThemeTokens): string {
  const indent = "    ";
  const maxContent = width - indent.length - 1;
  const desc = row.description;
  if (desc.length <= maxContent) {
    return `${indent}${tokens.dim(desc)}`;
  }
  return `${indent}${tokens.dim(desc.slice(0, maxContent))}`;
}

function renderSettingsOverlay(deps: OverlayDeps, width: number): string[] {
  const { state, tokens, input } = deps;
  const lines: string[] = [];
  const separator = "─".repeat(width);

  lines.push(tokens.accent(separator));

  // Scope header
  const scopeLabel = getScopeLabel(state.scope);
  const otherScope = state.scope === "project" ? "Global" : "Project";
  lines.push(
    ` ${tokens.text("Scope:")} ${tokens.accent(scopeLabel)} ${tokens.dim(`(tab → ${otherScope})`)}`,
  );

  lines.push(tokens.accent(separator));

  // All rows (navigable)
  const rows = navigableRows(state.rows);
  for (let i = 0; i < rows.length; i++) {
    lines.push(renderRow(rows[i], i === state.selectedIndex, tokens));
    if (i === state.selectedIndex && !state.editing) {
      lines.push(renderDescription(rows[i], width, tokens));
    }
  }

  // If editing, show input
  if (state.editing) {
    const editingRow = navigableRows(state.rows)[state.selectedIndex];
    const label =
      editingRow?.type === "filenames"
        ? "File names (comma-separated)"
        : "New interval value (number, off, or default)";
    lines.push("");
    lines.push(tokens.dim(`  ${label}:`));
    lines.push(...input.render(width));
  }

  lines.push(tokens.accent(separator));

  // Footer hints
  const hints = state.editing
    ? "enter confirm • esc cancel"
    : "↑↓ navigate • enter edit/toggle • tab scope • esc close";
  lines.push(tokens.dim(` ${hints}`));

  lines.push(tokens.accent(separator));

  return lines;
}

// ── Entry point ──────────────────────────────────────────────

export function openSettingsOverlay(ctx: ExtensionContext): void {
  const config = loadSettingsForScope("project", ctx.cwd);
  const rows = buildSettingsRows(config);
  const state: SettingsOverlayState = {
    scope: "project",
    rows,
    selectedIndex: 0,
    editing: false,
    cachedLines: undefined,
    cachedWidth: undefined,
  };

  const result = ctx.ui.custom<void>((tui, theme, _kb, done) => {
    const tokens = getThemeTokens(theme);
    const input = new Input();

    const deps: OverlayDeps = {
      state,
      input,
      tui,
      tokens,
      cwd: ctx.cwd,
      done: () => done(),
    };

    const component: Component & { dispose?(): void } = {
      render: (width: number) => {
        if (state.cachedWidth !== width) {
          state.cachedLines = undefined;
          state.cachedWidth = width;
        }
        if (!state.cachedLines) {
          state.cachedLines = renderSettingsOverlay(deps, width);
        }
        return state.cachedLines;
      },
      invalidate: () => {
        state.cachedLines = undefined;
      },
      handleInput: (data: string) => {
        if (state.editing) {
          handleEditingInput(data, deps);
        } else {
          handleNavigateInput(data, deps);
        }
      },
    };

    return component;
  });

  // Result promise resolves when overlay closes — we don't need to await it
  void result;
}
