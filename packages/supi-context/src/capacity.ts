/**
 * A small, point-in-time capacity reading without diagnostic attribution.
 */
export interface ContextCapacity {
  contextWindow: number | null;
  usedTokens: number;
  usagePercent: number | null;
  compactionEnabled: boolean;
  reserveTokens: number;
  headroomTokens: number | null;
  pressurePercent: number | null;
  compacted: boolean;
  approximationNote: string | null;
}

/** Agent-facing, constant-shape reading of current context pressure. */
export interface ContextPressureSnapshot extends ContextCapacity {
  modelName: string;
}

/** Inputs that the shared capacity analysis derives from session state. */
export interface ContextCapacityInput {
  contextWindow: number | null;
  usedTokens: number;
  compactionEnabled: boolean;
  configuredReserveTokens: number;
  compacted: boolean;
  approximationNote: string | null;
}

function roundPercentage(value: number): number {
  return Math.round(value * 10) / 10;
}

/**
 * Derive reserve-adjusted capacity without inspecting diagnostic inventories.
 *
 * The configured reserve affects capacity only while auto-compaction is enabled.
 * This lets report and snapshot callers share exactly the same Active Context
 * Limit, Headroom, and Pressure Percentage semantics.
 */
export function analyzeContextCapacity(input: ContextCapacityInput): ContextCapacity {
  const contextWindow = input.contextWindow && input.contextWindow > 0 ? input.contextWindow : null;
  const reserveTokens = input.compactionEnabled ? Math.max(0, input.configuredReserveTokens) : 0;
  const activeLimit = contextWindow === null ? null : contextWindow - reserveTokens;
  const hasUsableActiveLimit = activeLimit !== null && activeLimit > 0;

  return {
    contextWindow,
    usedTokens: input.usedTokens,
    usagePercent:
      contextWindow === null ? null : roundPercentage((input.usedTokens / contextWindow) * 100),
    compactionEnabled: input.compactionEnabled,
    reserveTokens,
    headroomTokens: activeLimit === null ? null : Math.max(0, activeLimit - input.usedTokens),
    pressurePercent: hasUsableActiveLimit
      ? roundPercentage((input.usedTokens / activeLimit) * 100)
      : null,
    compacted: input.compacted,
    approximationNote: input.approximationNote,
  };
}

/** Create the exact agent-facing Context Pressure Snapshot shape. */
export function createContextPressureSnapshot(
  modelName: string,
  capacity: ContextCapacity,
): ContextPressureSnapshot {
  return {
    modelName,
    contextWindow: capacity.contextWindow,
    usedTokens: capacity.usedTokens,
    usagePercent: capacity.usagePercent,
    compactionEnabled: capacity.compactionEnabled,
    reserveTokens: capacity.reserveTokens,
    headroomTokens: capacity.headroomTokens,
    pressurePercent: capacity.pressurePercent,
    compacted: capacity.compacted,
    approximationNote: capacity.approximationNote,
  };
}
