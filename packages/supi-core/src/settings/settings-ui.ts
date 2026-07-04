// Generic settings overlay for SuPi extensions.
//
// Uses pi-tui's SettingsList with scope toggle (Tab), extension grouping,
// and search. Each extension declares its settings via registerSettings().

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { getSettingsListTheme } from "@earendil-works/pi-coding-agent";
import {
  Container,
  Input,
  Key,
  matchesKey,
  type SelectItem,
  SelectList,
  type SelectListTheme,
  type SettingItem,
  SettingsList,
  Text,
} from "@earendil-works/pi-tui";
import { getSelectableModels } from "../model-selection.ts";
import {
  createSettingsContributionCollector,
  type SettingsCollectionDiagnostic,
  type SettingsScope,
  type SettingsSection,
  SUPI_SETTINGS_COLLECT_EVENT,
} from "./settings-registry.ts";

// ── Input submenu component ──────────────────────────────────

/**
 * Creates a pi-tui Input-backed submenu component with enter-to-confirm
 * and escape-to-cancel handling.
 *
 * @param currentValue - Initial value for the text input.
 * @param label - Label text displayed above the input.
 * @param done - Callback invoked with the confirmed value, or undefined on cancel.
 */
export function createInputSubmenu(
  currentValue: string,
  label: string,
  done: (selectedValue?: string) => void,
): {
  render: (width: number) => string[];
  invalidate: () => void;
  handleInput: (data: string) => boolean;
} {
  const input = new Input();
  input.setValue(currentValue);

  return {
    render: (_width: number) => {
      const lines = [`  ${label}`];
      lines.push(...input.render(_width));
      lines.push("  enter confirm • esc cancel");
      return lines;
    },
    invalidate: () => {
      input.invalidate();
    },
    handleInput: (data: string) => {
      if (matchesKey(data, Key.escape)) {
        done();
        return true;
      }
      if (matchesKey(data, Key.enter)) {
        done(input.getValue());
        return true;
      }
      input.handleInput(data);
      return true;
    },
  };
}

// ── Types ────────────────────────────────────────────────────

interface OverlayStatus {
  kind: "warning" | "error";
  message: string;
}

interface OverlayState {
  scope: SettingsScope;
  cwd: string;
  status?: OverlayStatus;
}

// ── Pure helpers ─────────────────────────────────────────────

function getScopeLabel(scope: SettingsScope): string {
  return scope === "project" ? "Project" : "Global";
}

function buildFlatItems(
  sections: SettingsSection[],
  scope: SettingsScope,
  cwd: string,
  ctx?: ExtensionContext,
): SettingItem[] {
  const items: SettingItem[] = [];
  for (const section of sections) {
    const sectionItems = section.loadValues(scope, cwd, ctx);
    for (const item of sectionItems) {
      items.push({
        ...item,
        id: `${section.id}.${item.id}`,
        label: `${section.label}: ${item.label}`,
      });
    }
  }
  return items;
}

function findSectionAndId(
  sections: SettingsSection[],
  flatId: string,
): { section: SettingsSection; itemId: string } | null {
  const dotIndex = flatId.indexOf(".");
  if (dotIndex === -1) return null;
  const sectionId = flatId.slice(0, dotIndex);
  const itemId = flatId.slice(dotIndex + 1);
  const section = sections.find((s) => s.id === sectionId);
  if (!section) return null;
  return { section, itemId };
}

function collectSettingsSections(pi: ExtensionAPI) {
  const collector = createSettingsContributionCollector();
  pi.events.emit(SUPI_SETTINGS_COLLECT_EVENT, collector);
  return collector.result();
}

function latestStatus(diagnostics: SettingsCollectionDiagnostic[]): OverlayStatus | undefined {
  const latest = diagnostics.at(-1);
  return latest ? { kind: latest.kind, message: latest.message } : undefined;
}

function formatSettingsError(settingId: string, error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return `Could not save SuPi setting "${settingId}": ${message}`;
}

// ── Component ────────────────────────────────────────────────

interface SettingsOverlayDeps {
  ctx: ExtensionContext;
  sections: SettingsSection[];
  state: OverlayState;
  container: Container;
  settingsList: SettingsList | null;
  tui: Parameters<Parameters<ExtensionContext["ui"]["custom"]>[0]>[0];
  theme: Parameters<Parameters<ExtensionContext["ui"]["custom"]>[0]>[1];
  done: () => void;
}

function createSettingsList(deps: SettingsOverlayDeps): SettingsList {
  const items = buildFlatItems(deps.sections, deps.state.scope, deps.state.cwd, deps.ctx);
  const onChange = (flatId: string, newValue: string) => {
    const found = findSectionAndId(deps.sections, flatId);
    try {
      if (found) {
        found.section.persistChange(deps.state.scope, deps.state.cwd, found.itemId, newValue);
        deps.state.status = undefined;
      }
    } catch (error) {
      deps.state.status = {
        kind: "error",
        message: formatSettingsError(found?.itemId ?? flatId, error),
      };
    }
    // Re-read all values to reflect persisted changes, but keep the list
    // instance (and its selectedIndex) intact.
    const updatedItems = buildFlatItems(deps.sections, deps.state.scope, deps.state.cwd, deps.ctx);
    for (const updated of updatedItems) {
      const existing = items.find((i) => i.id === updated.id);
      if (existing && existing.currentValue !== updated.currentValue) {
        settingsList.updateValue(updated.id, updated.currentValue);
      }
    }
    deps.tui.requestRender();
  };
  const settingsList = new SettingsList(
    items,
    Math.min(items.length + 4, 20),
    getSettingsListTheme(),
    onChange,
    () => deps.done(),
    { enableSearch: true },
  );
  return settingsList;
}

function rebuildSettingsList(deps: SettingsOverlayDeps): SettingsList {
  const settingsList = createSettingsList(deps);
  deps.settingsList = settingsList;

  deps.container.clear();
  deps.container.addChild(createHeaderComponent(deps));
  deps.container.addChild(createStatusComponent(deps));
  deps.container.addChild(settingsList);

  return settingsList;
}

function createHeaderComponent(deps: SettingsOverlayDeps): Text {
  const { theme, state } = deps;
  const scopeLabel = getScopeLabel(state.scope);
  const otherScope = state.scope === "project" ? "Global" : "Project";
  const headerText = new Text(
    `${theme.fg("accent", theme.bold("SuPi Settings"))}  ${theme.fg("text", `Scope: ${scopeLabel}`)} ${theme.fg("dim", `(tab → ${otherScope})`)}`,
    0,
    0,
  );
  return headerText;
}

function createStatusComponent(deps: SettingsOverlayDeps): {
  render: () => string[];
  invalidate: () => void;
} {
  return {
    render: () => {
      const status = deps.state.status;
      if (!status) return [];
      return [deps.theme.fg(status.kind, status.message)];
    },
    invalidate: () => {},
  };
}

function handleScopeToggle(deps: SettingsOverlayDeps): void {
  deps.state.scope = deps.state.scope === "project" ? "global" : "project";
  rebuildSettingsList(deps);
  deps.tui.requestRender();
}

/** Minimal SelectList theme — uses identity so the parent SettingsList provides styling context. */
const PASSTHROUGH_THEME: SelectListTheme = {
  selectedPrefix: (text) => `› ${text}`,
  selectedText: (text) => text,
  description: (text) => text,
  scrollInfo: (text) => text,
  noMatch: (text) => text,
};

/**
 * Create a model picker submenu for settings.
 *
 * Shows a scrollable list of selectable models from the scoped model set,
 * with the current session model annotated `[current]`.  The first entry is
 * always `"disabled"`.
 *
 * @param currentValue - Currently configured canonical model id or `"disabled"`.
 * @param done - Callback invoked with the selected value, or undefined on cancel.
 * @param ctx - Extension context for model listing.  When undefined, only
 *   `"disabled"` is offered.
 */
export function createModelPickerSubmenu(
  currentValue: string,
  done: (selectedValue?: string) => void,
  ctx?: ExtensionContext,
): {
  render: (width: number) => string[];
  invalidate: () => void;
  handleInput: (data: string) => boolean;
} {
  const items = buildModelItems(ctx);

  const initialIndex =
    currentValue === "disabled"
      ? 0
      : Math.max(
          0,
          items.findIndex((item) => item.value === currentValue),
        );

  const container = new Container();
  container.addChild(new Text("  Select suggestion model", 1, 0));
  container.addChild(new Text("", 1, 0));

  const selectList = new SelectList(items, Math.min(items.length, 15), PASSTHROUGH_THEME);

  if (initialIndex >= 0) {
    selectList.setSelectedIndex(initialIndex);
  }

  selectList.onSelect = (item) => done(item.value);
  selectList.onCancel = () => done();

  container.addChild(selectList);
  container.addChild(new Text("  ↑↓ navigate • enter select • esc cancel", 1, 0));

  return {
    render: (width: number) => container.render(width),
    invalidate: () => container.invalidate(),
    handleInput: (data: string) => {
      selectList.handleInput(data);
      return true;
    },
  };
}

/** Build selectable model items with "disabled" first. */
function buildModelItems(ctx?: ExtensionContext): SelectItem[] {
  const items: SelectItem[] = [
    {
      value: "disabled",
      label: "disabled",
      description: "No prompt suggestions",
    },
  ];

  if (!ctx) return items;

  const models = getSelectableModels(ctx);

  for (const model of models) {
    const suffix = model.isCurrent ? "  [current]" : "";
    items.push({
      value: model.canonicalId,
      label: `${model.canonicalId}${suffix}`,
      description: model.label !== model.canonicalId ? model.label : undefined,
    });
  }

  return items;
}

// ── Entry point ──────────────────────────────────────────────

export function openSettingsOverlay(pi: ExtensionAPI, ctx: ExtensionContext): void {
  const collection = collectSettingsSections(pi);
  if (collection.sections.length === 0) {
    ctx.ui.notify("No settings registered by SuPi extensions", "info");
    return;
  }

  void ctx.ui.custom<void>((tui, theme, _kb, done) => {
    const state: OverlayState = {
      scope: "project",
      cwd: ctx.cwd,
      status: latestStatus(collection.diagnostics),
    };
    const container = new Container();

    const deps: SettingsOverlayDeps = {
      ctx,
      sections: collection.sections,
      state,
      container,
      settingsList: null,
      tui,
      theme,
      done,
    };

    rebuildSettingsList(deps);

    const component = {
      render: (width: number) => container.render(width),
      invalidate: () => container.invalidate(),
      handleInput: (data: string) => {
        if (matchesKey(data, Key.tab)) {
          handleScopeToggle(deps);
          return true;
        }
        // Delegate input to the settings list (always set after rebuildSettingsList)
        deps.settingsList?.handleInput?.(data);
        deps.tui.requestRender();
        return true;
      },
    };

    return component;
  });
}
