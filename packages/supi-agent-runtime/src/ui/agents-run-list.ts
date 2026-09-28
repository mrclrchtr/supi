import type { SelectItem } from "@earendil-works/pi-tui";
import type { AgentsOverlayRun } from "./agents-overlay-data.ts";

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
  return [
    ...(review ? [review] : []),
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
