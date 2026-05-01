// Generic settings overlay for SuPi extensions.
//
// Uses pi-tui's SettingsList with scope toggle (Tab), extension grouping,
// and search. Each extension declares its settings via registerSettings().

import type { ExtensionContext } from "@mariozechner/pi-coding-agent";
import { getSettingsListTheme } from "@mariozechner/pi-coding-agent";
import {
  Container,
  Key,
  matchesKey,
  type SettingItem,
  SettingsList,
  Text,
} from "@mariozechner/pi-tui";
import {
  getRegisteredSettings,
  type SettingsScope,
  type SettingsSection,
} from "./settings-registry.ts";

// ── Types ────────────────────────────────────────────────────

interface OverlayState {
  scope: SettingsScope;
  cwd: string;
}

// ── Pure helpers ─────────────────────────────────────────────

function getScopeLabel(scope: SettingsScope): string {
  return scope === "project" ? "Project" : "Global";
}

function buildFlatItems(
  sections: SettingsSection[],
  scope: SettingsScope,
  cwd: string,
): SettingItem[] {
  const items: SettingItem[] = [];
  for (const section of sections) {
    const sectionItems = section.loadValues(scope, cwd);
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

// ── Component ────────────────────────────────────────────────

interface SettingsOverlayDeps {
  state: OverlayState;
  container: Container;
  settingsList: SettingsList;
  tui: Parameters<Parameters<ExtensionContext["ui"]["custom"]>[0]>[0];
  theme: Parameters<Parameters<ExtensionContext["ui"]["custom"]>[0]>[1];
  done: () => void;
}

function createSettingsList(deps: SettingsOverlayDeps): SettingsList {
  const sections = getRegisteredSettings();
  const items = buildFlatItems(sections, deps.state.scope, deps.state.cwd);

  return new SettingsList(
    items,
    Math.min(items.length + 4, 20),
    getSettingsListTheme(),
    (flatId: string, newValue: string) => {
      const found = findSectionAndId(sections, flatId);
      if (found) {
        found.section.persistChange(deps.state.scope, deps.state.cwd, found.itemId, newValue);
      }
      // Re-read all values to reflect persisted changes, but keep the list
      // instance (and its selectedIndex) intact.
      const updatedItems = buildFlatItems(sections, deps.state.scope, deps.state.cwd);
      for (const updated of updatedItems) {
        const existing = items.find((i) => i.id === updated.id);
        if (existing && existing.currentValue !== updated.currentValue) {
          deps.settingsList.updateValue(updated.id, updated.currentValue);
        }
      }
      deps.tui.requestRender();
    },
    () => deps.done(),
    { enableSearch: true },
  );
}

function rebuildSettingsList(deps: SettingsOverlayDeps): SettingsList {
  const settingsList = createSettingsList(deps);
  deps.settingsList = settingsList;

  deps.container.clear();
  deps.container.addChild(createHeaderComponent(deps));
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

function handleScopeToggle(deps: SettingsOverlayDeps): void {
  deps.state.scope = deps.state.scope === "project" ? "global" : "project";
  rebuildSettingsList(deps);
  deps.tui.requestRender();
}

// ── Entry point ──────────────────────────────────────────────

export function openSettingsOverlay(ctx: ExtensionContext): void {
  const sections = getRegisteredSettings();
  if (sections.length === 0) {
    ctx.ui.notify("No settings registered by SuPi extensions", "info");
    return;
  }

  void ctx.ui.custom<void>((tui, theme, _kb, done) => {
    const state: OverlayState = { scope: "project", cwd: ctx.cwd };
    const container = new Container();

    const deps = {
      state,
      container,
      settingsList: null as unknown as SettingsList,
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
        // Find the SettingsList child and delegate
        const settingsList = container.children.find(
          (c): c is SettingsList => c instanceof SettingsList,
        );
        settingsList?.handleInput?.(data);
        return true;
      },
    };

    return component;
  });
}
