import {
  DynamicBorder,
  type KeybindingsManager,
  type Theme,
} from "@earendil-works/pi-coding-agent";
import { type Input, type SelectList, truncateToWidth } from "@earendil-works/pi-tui";
import type { AgentsOverlayRun } from "./agents-overlay-data.ts";
import { centerLegend } from "./agents-overlay-render.ts";
import { formatElapsed, type RunSection, runListPreview } from "./agents-run-list.ts";
import { runSwitcherPosition } from "./agents-run-switcher.ts";

/** Render the selected run, its filtered position, and its stable status. */
export function formatRunConversationHeading(
  run: AgentsOverlayRun | undefined,
  runs: readonly AgentsOverlayRun[],
  section: RunSection,
  transcriptIncomplete: boolean,
): { readonly text: string; readonly canSwitchRuns: boolean } {
  const position = runSwitcherPosition(runs, run?.key);
  if (!run) return { text: "No Agent Run selected", canSwitchRuns: position.canSwitch };
  const sectionLabel = section === "agents" ? "Agents" : "Reviews";
  const runPosition =
    position.position === undefined ? "pinned" : `${position.position}/${runs.length}`;
  const state = `${run.status} · ${formatElapsed(run)}`;
  const target = run.result?.display?.target ?? run.display?.target;
  const verdict = run.result?.display?.verdict;
  const review = [
    target ? `target ${target}` : undefined,
    verdict ? `verdict ${verdict}` : undefined,
  ]
    .filter(Boolean)
    .join(" · ");
  return {
    text: `${sectionLabel} · ${runPosition} · ${run.taskId} — ${run.label} · ${state}${review ? ` · ${review}` : ""}${transcriptIncomplete ? " · transcript incomplete" : ""}`,
    canSwitchRuns: position.canSwitch,
  };
}

/** Keep incomplete-transcript warnings at the start of the viewer status line. */
export function formatRunViewerStatus(options: {
  readonly run?: AgentsOverlayRun;
  readonly transcriptStatus: string;
  readonly transcriptIncomplete: boolean;
}): string {
  const { run, transcriptStatus, transcriptIncomplete } = options;
  const omitted = run?.conversation?.omittedEntryCount ?? 0;
  const retention = omitted > 0 ? ` · ${omitted} entries omitted` : "";
  const state = `${transcriptStatus} · ${run?.status ?? "No run selected"}${retention}`;
  return transcriptIncomplete ? `Transcript incomplete · ${state}` : state;
}

type KeybindingAction = Parameters<KeybindingsManager["matches"]>[1];

/** Format one keyboard hint with the active keybinding when available. */
export function formatAgentsRunKeyHint(options: {
  readonly theme: Theme;
  readonly keybindings?: Pick<KeybindingsManager, "getKeys">;
  readonly action: KeybindingAction;
  readonly fallback: string;
  readonly label: string;
}): string {
  const { theme, keybindings, action, fallback, label } = options;
  const keys = keybindings?.getKeys(action).join("/") || fallback;
  return `${theme.fg("dim", keys)}${theme.fg("muted", ` ${label}`)}`;
}

/** Return concise keyboard hints for the active viewer page. */
export function renderAgentsRunHints(options: {
  readonly stopConfirmation: boolean;
  readonly page: "list" | "conversation" | "details";
  readonly height: number;
  readonly run?: AgentsOverlayRun;
  readonly theme: Theme;
  readonly keybindings?: Pick<KeybindingsManager, "getKeys">;
  readonly canSwitchRuns: boolean;
}): string[] {
  const { stopConfirmation, page, height, run, theme, keybindings, canSwitchRuns } = options;
  if (stopConfirmation) return ["Enter/y confirm stop · Esc cancel"];
  if (page === "list") return renderAgentsRunListHints(height);
  if (height <= 8) return renderCompactRunHints(page, canSwitchRuns);
  const controls = renderRunControlHints(run);
  const toolsHint = formatAgentsRunKeyHint({
    theme,
    keybindings,
    action: "app.tools.expand",
    fallback: "ctrl+o",
    label: "tools",
  });
  const thinkingHint = formatAgentsRunKeyHint({
    theme,
    keybindings,
    action: "app.thinking.toggle",
    fallback: "ctrl+t",
    label: "thinking",
  });
  return [
    "↑↓ scroll · PgUp/PgDn · Home/End",
    ...(canSwitchRuns ? ["Alt+← previous · Alt+→ next"] : []),
    [page === "details" ? "tab conversation" : "tab details", toolsHint, thinkingHint].join(" · "),
    [...controls, "esc list"].join(" · "),
  ];
}

function renderAgentsRunListHints(height: number): string[] {
  return height <= 8
    ? ["↑↓ move · type search · enter open · esc close"]
    : ["↑↓ move · type to search · enter open", "tab sections · esc close"];
}

function renderCompactRunHints(page: "conversation" | "details", canSwitchRuns: boolean): string[] {
  const navigationHint = canSwitchRuns ? "Alt+← previous · Alt+→ next" : "↑↓ scroll";
  return [`${navigationHint} · tab ${page === "details" ? "conversation" : "details"} · esc list`];
}

function renderRunControlHints(run?: AgentsOverlayRun): string[] {
  if (!run?.active) return [];
  const controls: string[] = [];
  if (run.steeringAvailable) controls.push("s steer");
  if (run.status === "starting" || run.status === "running") controls.push("x stop");
  return controls;
}

/** Render the full-width header for the selected section. */
export function renderAgentsRunHeader(options: {
  readonly theme: Theme;
  readonly header: string;
  readonly tabs: string;
  readonly width: number;
  readonly height: number;
  readonly steeringActive: boolean;
}): string[] {
  const { theme, header, tabs, width, height, steeringActive } = options;
  if (height <= 8 || steeringActive) return [line(`${header}  ${tabs}`, width)];
  return [
    line(header, width),
    line(tabs, width),
    ...new DynamicBorder((text: string) => theme.fg("accent", text)).render(width),
  ];
}

/** Render the selected page's instructions and current run status. */
export function renderAgentsRunFooter(options: {
  readonly theme: Theme;
  readonly hints: readonly string[];
  readonly notice?: string;
  readonly status?: string;
  readonly steeringLines: readonly string[];
  readonly steeringActive: boolean;
  readonly width: number;
}): string[] {
  const { theme, hints, notice, status, steeringLines, steeringActive, width } = options;
  if (steeringActive) {
    return [...steeringLines, ...(notice ? [line(theme.fg("warning", notice), width)] : [])];
  }
  return [
    ...hints.map((hint) => centerLegend(theme.fg("dim", hint), width)),
    ...(notice ? [line(theme.fg("warning", notice), width)] : []),
    ...(status ? [line(status, width)] : []),
  ];
}

/** Fit list rows and the scroll marker inside the rows available to the list. */
export function runListViewport(
  height: number,
  searchLineCount: number,
  previewLineCount: number,
  itemCount: number,
): {
  readonly previewHeight: number;
  readonly listBudget: number;
  readonly maxVisible: number;
  readonly visibleItemCount: number;
} {
  const previewHeight = Math.min(previewLineCount, Math.max(0, height - searchLineCount - 1));
  const listBudget = Math.max(0, height - searchLineCount - previewHeight);
  const scrollInfoRows = itemCount > listBudget && listBudget > 1 ? 1 : 0;
  const maxVisible = Math.max(1, Math.min(itemCount || 1, listBudget - scrollInfoRows));
  return {
    previewHeight,
    listBudget,
    maxVisible,
    visibleItemCount: Math.min(itemCount, maxVisible, listBudget),
  };
}

/** Render the search box, run rows, and selected-run preview. */
export function renderAgentsRunList(options: {
  readonly theme: Theme;
  readonly search: Input;
  readonly getSelectList: (maxVisible: number) => SelectList;
  readonly selectedRun?: AgentsOverlayRun;
  readonly itemCount: number;
  readonly emptyMessage: string;
  readonly width: number;
  readonly height: number;
  readonly bodyTop: number;
}): {
  readonly lines: string[];
  readonly listTop: number;
  readonly listHeight: number;
  readonly visibleItemCount: number;
} {
  const {
    theme,
    search,
    getSelectList,
    selectedRun,
    itemCount,
    emptyMessage,
    width,
    height,
    bodyTop,
  } = options;
  if (height <= 0) return { lines: [], listTop: bodyTop, listHeight: 0, visibleItemCount: 0 };
  const searchLines = search.render(width).slice(0, height);
  if (!selectedRun) {
    const query = search.getValue().trim();
    const message = query ? `No tasks match “${query}”.` : emptyMessage;
    const listTop = bodyTop + searchLines.length;
    const messageLines = height > searchLines.length ? [line(theme.fg("dim", message), width)] : [];
    return {
      lines: [...searchLines, ...messageLines],
      listTop,
      listHeight: messageLines.length,
      visibleItemCount: 0,
    };
  }
  const preview = runListPreview(selectedRun);
  const viewport = runListViewport(height, searchLines.length, preview.length, itemCount);
  const listTop = bodyTop + searchLines.length;
  const selectList = getSelectList(viewport.maxVisible);
  const listLines = selectList.render(width).slice(0, viewport.listBudget);
  const previewLines = preview
    .slice(0, viewport.previewHeight)
    .map((text) => line(theme.fg("dim", text), width));
  return {
    lines: [...searchLines, ...listLines, ...previewLines],
    listTop,
    listHeight: listLines.length,
    visibleItemCount: viewport.visibleItemCount,
  };
}

function line(text: string, width: number): string {
  return truncateToWidth(` ${text}`, width);
}
