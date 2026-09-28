import type { AgentsOverlayData, AgentsOverlayRun } from "../../src/ui/agents-overlay-data.ts";

/** Build one neutral run row for viewer tests. */
export function makeAgentsRun(overrides: Partial<AgentsOverlayRun> = {}): AgentsOverlayRun {
  return {
    key: "run:inspect",
    runKey: "inspect",
    batchId: "batch-1",
    taskId: "inspect",
    kind: "Agent Run",
    label: "explore",
    cwd: "/repo",
    modelId: "test/model",
    thinkingLevel: "low",
    tools: ["read"],
    startedAt: Date.now() - 2_000,
    active: true,
    status: "running",
    steeringAvailable: true,
    turns: 1,
    toolUses: 0,
    ...overrides,
  };
}

/** Build an empty run list for viewer tests. */
export function makeAgentsOverlayData(runs: readonly AgentsOverlayRun[] = []): AgentsOverlayData {
  return { runs };
}
