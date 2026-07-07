// Action menu component for SuPi settings rows.
//
// Builds context-sensitive action menus for scoped settings rows: concrete
// value choices, Inherit from global, Use default, and Reset to default.

import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Container, type SelectItem, SelectList, Text } from "@earendil-works/pi-tui";
import type { SettingsScope } from "./settings-registry.ts";
import type { ScopedFieldValue, SettingsField } from "./settings-schema.ts";

/** Theme accessor type matching the TUI custom() theme parameter. */
export type ThemeAccessor = Parameters<Parameters<ExtensionContext["ui"]["custom"]>[0]>[1];

/** One selectable action in the row action menu. */
export interface ActionMenuItem {
  value: string;
  label: string;
}

/**
 * Build the action menu for a settings row given its field state and scope.
 *
 * Menu items include concrete value choices (for cycling fields), edit actions
 * (for free-input fields), and scope-aware Inherit/Reset-to-default actions.
 */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: 5-way branch on field kind + 3-way on scope/source is the natural discriminator for per-kind row actions
export function buildActionMenu(field: ScopedFieldValue, scope: SettingsScope): ActionMenuItem[] {
  const menu: ActionMenuItem[] = [];

  if (field.field.kind === "custom") {
    if (field.field.submenu) menu.push({ value: "edit", label: "Edit…" });
  } else {
    const choices = getConcreteChoices(field.field);
    if (choices.length > 0) {
      for (const choice of choices) menu.push({ value: `set:${choice}`, label: choice });
    } else if (field.field.kind === "number") menu.push({ value: "edit", label: "Edit value…" });
    else if (field.field.kind === "stringList") menu.push({ value: "edit", label: "Edit values…" });
    else if (field.field.kind === "modelPicker")
      menu.push({ value: "edit", label: "Choose model…" });
  }

  if (scope === "project") {
    if (field.source === "project") {
      const label = field.inheritanceSource === "global" ? "Inherit from global" : "Use default";
      menu.push({ value: "inherit", label });
    }
  } else if (field.source === "global") {
    menu.push({ value: "resetToDefault", label: "Reset to default" });
  }

  return menu;
}

/**
 * Return the concrete string choices for a field that supports Space cycling.
 * Returns an empty array for fields that use free-text input or submenus.
 */
export function getConcreteChoices(field: SettingsField): string[] {
  switch (field.kind) {
    case "boolean":
      return ["on", "off"];
    case "enum":
      return field.values;
    case "number":
      return field.values ?? [];
    default:
      return [];
  }
}

/**
 * Create a pi-tui SelectList-backed action menu component.
 */
export function createActionMenuComponent(
  menu: ActionMenuItem[],
  done: (action?: string) => void,
  theme: ThemeAccessor,
) {
  const items: SelectItem[] = menu.map((m) => ({ value: m.value, label: m.label }));
  const container = new Container();
  container.addChild(new Text(theme.fg("accent", "  Actions"), 1, 0));
  const selectList = new SelectList(items, Math.min(items.length + 2, 15), {
    selectedPrefix: (t) => theme.fg("accent", t),
    selectedText: (t) => theme.fg("accent", t),
    description: (t) => theme.fg("muted", t),
    scrollInfo: (t) => theme.fg("dim", t),
    noMatch: (t) => theme.fg("warning", t),
  });
  selectList.onSelect = (item) => done(item.value);
  selectList.onCancel = () => done();
  container.addChild(selectList);
  container.addChild(new Text(theme.fg("dim", "  ↑↓ navigate • enter select • esc cancel"), 1, 0));
  return {
    render: (width: number) => container.render(width),
    invalidate: () => container.invalidate(),
    handleInput: (data: string) => {
      selectList.handleInput(data);
      return true;
    },
  };
}
