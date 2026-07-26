// Submenu helpers for SuPi settings.
//
// Reusable pi-tui submenu components shared across the settings overlay
// and available to extensions for custom settings controls.

import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import {
  Container,
  Input,
  Key,
  matchesKey,
  type SelectItem,
  SelectList,
  Text,
} from "@earendil-works/pi-tui";
import { getSelectableModels } from "../model-selection.ts";
import type { ModelPickerField } from "./settings-schema.ts";

/**
 * Creates a pi-tui Input-backed submenu component with enter-to-confirm
 * and escape-to-cancel handling.
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

/**
 * Creates a model picker submenu backed by the scoped model set.
 *
 * The built-in `disabled` choice remains enabled by default. Callers can add
 * host-owned static choices or omit `disabled` through the field options.
 */
export function createModelPickerSubmenu(
  currentValue: string,
  done: (selectedValue?: string) => void,
  ctx?: ExtensionContext,
  options: Pick<ModelPickerField, "includeDisabled" | "staticOptions"> = {},
): {
  render: (width: number) => string[];
  invalidate: () => void;
  handleInput: (data: string) => boolean;
} {
  const items = buildModelItems(ctx, options);
  const initialIndex = Math.max(
    0,
    items.findIndex((item) => item.value === currentValue),
  );

  const container = new Container();
  container.addChild(new Text("  Select model", 1, 0));
  container.addChild(new Text("", 1, 0));

  const selectList = new SelectList(items, Math.min(items.length, 15), {
    selectedPrefix: (t) => `› ${t}`,
    selectedText: (t) => t,
    description: (t) => t,
    scrollInfo: (t) => t,
    noMatch: (t) => t,
  });
  if (initialIndex >= 0) selectList.setSelectedIndex(initialIndex);
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

/** Build static choices followed by the selectable scoped models. */
function buildModelItems(
  ctx: ExtensionContext | undefined,
  options: Pick<ModelPickerField, "includeDisabled" | "staticOptions">,
): SelectItem[] {
  const items: SelectItem[] = [];
  const seen = new Set<string>();
  for (const option of options.staticOptions ?? []) {
    if (seen.has(option.value)) continue;
    items.push({ ...option });
    seen.add(option.value);
  }

  if (options.includeDisabled !== false && !seen.has("disabled")) {
    items.push({ value: "disabled", label: "disabled", description: "No model selected" });
    seen.add("disabled");
  }

  if (!ctx) return items;
  const models = getSelectableModels(ctx);
  for (const model of models) {
    if (seen.has(model.canonicalId)) continue;
    const suffix = model.isCurrent ? "  [current]" : "";
    items.push({
      value: model.canonicalId,
      label: `${model.canonicalId}${suffix}`,
      description: model.label !== model.canonicalId ? model.label : undefined,
    });
    seen.add(model.canonicalId);
  }
  return items;
}
