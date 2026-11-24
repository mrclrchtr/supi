import type { Theme } from "@earendil-works/pi-coding-agent";
import { type SelectItem, SelectList } from "@earendil-works/pi-tui";
import type { AgentsOverlayRun } from "./agents-overlay-data.ts";
import { formatRunUsageStatus } from "./agents-run-usage.ts";

export type RunSection = "agents" | "reviews";

export function orderedRuns(
  runs: readonly AgentsOverlayRun[],
  section: RunSection,
  query: string,
): AgentsOverlayRun[] {
  const normalizedQuery = query.trim().toLowerCase();
  const groups = new Map<string, AgentsOverlayRun[]>();
  for (const run of runs) {
    if (isReviewRun(run) !== (section === "reviews") || !matchesQuery(run, normalizedQuery))
      continue;
    const group = groups.get(run.batchId) ?? [];
    group.push(run);
    groups.set(run.batchId, group);
  }
  return [...groups.values()]
    .sort((left, right) => latestStarted(right) - latestStarted(left))
    .flat();
}

/**
 * Fit the run name column to the longest name, up to 64 columns, instead of SelectList's fixed
 * 32. SelectList still narrows it on small terminals and keeps room for the status column.
 */
const RUN_LIST_LAYOUT = { minPrimaryColumnWidth: 24, maxPrimaryColumnWidth: 64 } as const;

/** Create the themed run list with a name column sized for long run names. */
export function createRunSelectList(
  items: SelectItem[],
  maxVisible: number,
  theme: Pick<Theme, "fg">,
): SelectList {
  return new SelectList(
    items,
    maxVisible,
    {
      selectedPrefix: (text) => theme.fg("accent", text),
      selectedText: (text) => theme.fg("accent", text),
      description: (text) => theme.fg("dim", text),
      scrollInfo: (text) => theme.fg("dim", text),
      noMatch: (text) => theme.fg("warning", text),
    },
    RUN_LIST_LAYOUT,
  );
}

export function runListItem(run: AgentsOverlayRun, now = Date.now()): SelectItem {
  const batchLabel = run.display?.batchLabel ?? run.batchId.slice(0, 8);
  return {
    value: run.key,
    label: `${run.taskId} — ${run.label}`,
    description: `${run.status} · ${formatElapsed(run, now)} · batch ${batchLabel}`,
  };
}

export function runListPreview(run: AgentsOverlayRun): string[] {
  const display = run.result?.display;
  const target = display?.target ?? run.display?.target;
  const findings =
    display?.findingCount === undefined
      ? undefined
      : `${display.findingCount} findings${display.blockingFindingCount ? `, ${display.blockingFindingCount} blocking` : ""}`;
  const review = [
    target ? `Target: ${target}` : undefined,
    display?.verdict ? `verdict ${display.verdict}` : undefined,
    findings,
  ]
    .filter((value): value is string => value !== undefined)
    .join(" · ");
  const summary = run.active
    ? run.recentActivity?.at(-1)
    : run.result?.finalText?.split("\n", 1)[0]?.trim();
  const usage = formatRunUsageStatus(run);
  return [
    ...(review ? [review] : []),
    ...(usage ? [usage] : []),
    ...(summary ? [`${run.active ? "Activity" : "Result"}: ${summary}`] : []),
  ];
}

function matchesQuery(run: AgentsOverlayRun, query: string): boolean {
  if (!query) return true;
  return [
    run.taskId,
    run.label,
    run.kind,
    run.batchId,
    run.taskDescription,
    run.display?.target,
    run.result?.display?.target,
    run.result?.display?.verdict,
    run.result?.finalText,
    ...(run.recentActivity ?? []),
  ]
    .filter((value): value is string => typeof value === "string")
    .join(" ")
    .toLowerCase()
    .includes(query);
}

function isReviewRun(run: AgentsOverlayRun): boolean {
  return run.kind.toLowerCase().includes("review");
}

function latestStarted(group: readonly AgentsOverlayRun[]): number {
  return Math.max(...group.map((run) => run.startedAt));
}

export function formatElapsed(run: AgentsOverlayRun, now = Date.now()): string {
  const end = run.finishedAt ?? now;
  const seconds = Math.max(0, Math.floor((end - run.startedAt) / 1_000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  if (minutes < 60) return remainder === 0 ? `${minutes}m` : `${minutes}m ${remainder}s`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes === 0 ? `${hours}h` : `${hours}h ${remainingMinutes}m`;
}
