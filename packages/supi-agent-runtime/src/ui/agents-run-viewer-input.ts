import type { KeybindingsManager } from "@earendil-works/pi-coding-agent";
import { Key, type KeyId, matchesKey } from "@earendil-works/pi-tui";

type KeybindingAction = Parameters<KeybindingsManager["matches"]>[1];
type MatchKey = (data: string, action: KeybindingAction, fallback: KeyId) => boolean;
type TranscriptNavigation = "page-up" | "page-down" | "start" | "end";

/** Handle keys that change the selected run view or run. */
export function handleRunViewerPageInput(
  data: string,
  actions: {
    readonly isCancel: (data: string) => boolean;
    readonly returnToList: () => void;
    readonly toggleView: () => void;
    readonly switchRun: (direction: -1 | 1) => void;
  },
): boolean {
  if (actions.isCancel(data)) {
    actions.returnToList();
    return true;
  }
  if (matchesKey(data, Key.tab)) {
    actions.toggleView();
    return true;
  }
  if (matchesKey(data, Key.alt("left"))) {
    actions.switchRun(-1);
    return true;
  }
  if (matchesKey(data, Key.alt("right"))) {
    actions.switchRun(1);
    return true;
  }
  return false;
}

/** Route transcript navigation keys to the active run view. */
export function handleTranscriptNavigation(
  data: string,
  matches: MatchKey,
  scrollBy: (lines: number) => void,
  navigate: (action: TranscriptNavigation) => void,
): boolean {
  if (matches(data, "tui.select.up", Key.up)) {
    scrollBy(-1);
    return true;
  }
  if (matches(data, "tui.select.down", Key.down)) {
    scrollBy(1);
    return true;
  }
  if (matches(data, "tui.altScreen.pageUp", Key.pageUp)) {
    navigate("page-up");
    return true;
  }
  if (matches(data, "tui.altScreen.pageDown", Key.pageDown)) {
    navigate("page-down");
    return true;
  }
  if (matches(data, "tui.altScreen.top", Key.home)) {
    navigate("start");
    return true;
  }
  if (matches(data, "tui.altScreen.bottom", Key.end)) {
    navigate("end");
    return true;
  }
  return false;
}
