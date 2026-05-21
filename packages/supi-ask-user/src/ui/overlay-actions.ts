import type { Theme } from "@earendil-works/pi-coding-agent";
import { SelectList } from "@earendil-works/pi-tui";
import type { AskUserController } from "../session/controller.ts";
import { makeSelectListTheme } from "./overlay-render.ts";
import { buildTextActionItems, type OverlayAction } from "./overlay-view.ts";

export interface ActionListState {
  entries: Array<{ action: OverlayAction; label: string }>;
  list: SelectList | undefined;
  index: number;
}

export function createActionList(args: {
  controller: AskUserController;
  theme: Theme;
  actionIndex: number;
  onIndexChange: (index: number) => void;
  onAction: (action: OverlayAction) => void;
}): ActionListState {
  const actions = buildTextActionItems(args.controller);
  const entries = actions.map(({ action, item }) => ({ action, label: item.label }));
  if (actions.length === 0) {
    return { entries, list: undefined, index: 0 };
  }

  const index = Math.max(0, Math.min(args.actionIndex, actions.length - 1));
  const list = new SelectList(
    actions.map(({ item }) => item),
    Math.min(actions.length, 6),
    makeSelectListTheme(args.theme),
  );
  list.onSelectionChange = (item) => {
    const nextIndex = actions.findIndex(({ item: candidate }) => candidate.value === item.value);
    if (nextIndex >= 0) args.onIndexChange(nextIndex);
  };
  list.onSelect = (item) => {
    const action = actions.find(({ item: candidate }) => candidate.value === item.value)?.action;
    if (action) args.onAction(action);
  };
  list.setSelectedIndex(index);
  return { entries, list, index };
}
