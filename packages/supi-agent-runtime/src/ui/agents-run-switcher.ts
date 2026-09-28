import type { AgentsOverlayRun } from "./agents-overlay-data.ts";

/** Return the next selected run and its index for wrapped or bounded navigation. */
export function nextRunSelection(
  runs: readonly AgentsOverlayRun[],
  currentIndex: number,
  delta: number,
  wrap: boolean,
): { readonly index: number; readonly run: AgentsOverlayRun } | undefined {
  if (runs.length === 0) return undefined;
  const startIndex = wrap && currentIndex < 0 ? (delta < 0 ? 0 : runs.length - 1) : currentIndex;
  const index = wrap
    ? (((startIndex + delta) % runs.length) + runs.length) % runs.length
    : Math.max(0, Math.min(runs.length - 1, startIndex + delta));
  const run = runs[index];
  return run ? { index, run } : undefined;
}

/** Describe where the selected run sits in the filtered result set. */
export function runSwitcherPosition(
  runs: readonly AgentsOverlayRun[],
  selectedKey: string | undefined,
): { readonly position?: number; readonly canSwitch: boolean } {
  const index = runs.findIndex((run) => run.key === selectedKey);
  return {
    ...(index >= 0 ? { position: index + 1 } : {}),
    canSwitch: runs.length > 1 || (runs.length > 0 && index < 0),
  };
}
