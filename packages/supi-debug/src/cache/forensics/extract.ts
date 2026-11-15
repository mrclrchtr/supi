// Session extraction utilities for native Pi cache observations.

import { readFile } from "node:fs/promises";
import type { AssistantMessage } from "@earendil-works/pi-ai";
import type { FileEntry, SessionEntry } from "@earendil-works/pi-coding-agent";
import { migrateSessionEntries, parseSessionEntries } from "@earendil-works/pi-coding-agent";
import { computeToolCallShape } from "./redact.ts";
import {
  type CacheTurn,
  formatCauseNote,
  type RegressionCause,
  resolveTurnCause,
} from "./turns.ts";
import type { ToolCallShape } from "./types.ts";

/** Cache breakpoint changes below this size are provider granularity noise. */
export const CACHE_MISS_NOISE_FLOOR = 1024;

interface UsageData {
  input: number;
  cacheRead: number;
  cacheWrite: number;
  cost: {
    input: number;
    cacheRead: number;
    cacheWrite: number;
  };
}

interface PreviousRequest {
  promptTokens: number;
  modelKey: string;
  timestamp: number;
  reportedCache: boolean;
}

interface CacheMissData {
  missedTokens: number;
  missedCost: number;
  idleMs: number;
  modelChanged: boolean;
}

/** Read and migrate a PI session file. */
export async function parseSessionFile(path: string): Promise<FileEntry[]> {
  const content = await readFile(path, { encoding: "utf-8" });
  const entries = parseSessionEntries(content);
  migrateSessionEntries(entries);
  return entries;
}

/**
 * Extract cache turns from native assistant messages.
 *
 * Sessions written before this migration can contain `supi-cache-turn` custom
 * entries. Native usage is the source of truth when it exists; old records are
 * merged only for their prompt fingerprints and cause notes.
 */
export function extractCacheTurnEntries(branch: SessionEntry[]): CacheTurn[] {
  const legacyTurns = extractLegacyCacheTurns(branch);
  const nativeTurns = extractNativeCacheTurns(branch);

  if (nativeTurns.length === 0) return legacyTurns;
  return mergeLegacyDetails(nativeTurns, legacyTurns);
}

/** Extract cache observations from native PI assistant messages. */
export function extractNativeCacheTurns(branch: SessionEntry[]): CacheTurn[] {
  const turns: CacheTurn[] = [];
  const state: NativeExtractionState = {
    previous: undefined,
    pendingCause: undefined,
    resetNext: false,
  };

  for (const entry of branch) {
    if (consumeStructuralEntry(entry, state)) continue;
    const message = getAssistantWithUsage(entry);
    if (!message) continue;

    const turn = buildNativeTurn(message, entry.timestamp, state, turns.length + 1);
    turns.push(turn);
    advanceNativeState(message, entry.timestamp, state);
  }

  return turns;
}

interface NativeExtractionState {
  previous: PreviousRequest | undefined;
  pendingCause: RegressionCause | undefined;
  resetNext: boolean;
}

function consumeStructuralEntry(entry: SessionEntry, state: NativeExtractionState): boolean {
  switch (entry.type) {
    case "compaction":
      state.previous = undefined;
      state.pendingCause = { type: "compaction" };
      state.resetNext = true;
      return true;
    case "branch_summary":
      state.previous = undefined;
      state.pendingCause = { type: "branch_summary" };
      state.resetNext = true;
      return true;
    case "model_change":
      state.pendingCause = {
        type: "model_change",
        model: `${entry.provider}/${entry.modelId}`,
      };
      return true;
    default:
      return false;
  }
}

function getAssistantWithUsage(entry: SessionEntry): AssistantMessage | undefined {
  if (entry.type !== "message" || entry.message.role !== "assistant") return undefined;
  const message = entry.message as AssistantMessage;
  return message.usage ? message : undefined;
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: native turn metadata has several independent optional fields.
function buildNativeTurn(
  message: AssistantMessage,
  entryTimestamp: string,
  state: NativeExtractionState,
  turnIndex: number,
): CacheTurn {
  const usage = normalizeUsage(message.usage);
  const timestamp = normalizeTimestamp(message.timestamp, entryTimestamp);
  const modelKey = `${message.provider}/${message.model}`;
  const promptTokens = usage.input + usage.cacheRead + usage.cacheWrite;
  const modelChanged = state.previous !== undefined && modelKey !== state.previous.modelKey;
  const miss = detectNativeCacheMiss(state.previous, usage, timestamp, modelKey);
  const cacheKnown =
    usage.cacheRead + usage.cacheWrite > 0 || state.previous?.reportedCache === true;
  const hitRate =
    promptTokens > 0 && cacheKnown ? Math.round((usage.cacheRead / promptTokens) * 100) : undefined;
  const cause =
    state.pendingCause ?? (modelChanged ? { type: "model_change", model: modelKey } : undefined);
  const note = turnIndex === 1 ? "cold start" : cause ? formatCauseNote(cause) : undefined;

  return {
    turnIndex,
    cacheRead: usage.cacheRead,
    cacheWrite: usage.cacheWrite,
    input: usage.input,
    hitRate,
    timestamp,
    ...(note ? { note } : {}),
    ...(cause ? { cause } : {}),
    ...(miss ? { missedTokens: miss.missedTokens, missedCost: miss.missedCost } : {}),
    ...(state.previous
      ? { idleMs: miss?.idleMs ?? Math.max(0, timestamp - state.previous.timestamp) }
      : {}),
    ...(state.previous ? { modelChanged } : {}),
    ...(state.resetNext ? { cacheReset: true } : {}),
  };
}

function advanceNativeState(
  message: AssistantMessage,
  entryTimestamp: string,
  state: NativeExtractionState,
): void {
  const usage = normalizeUsage(message.usage);
  const timestamp = normalizeTimestamp(message.timestamp, entryTimestamp);
  const modelKey = `${message.provider}/${message.model}`;
  const promptTokens = usage.input + usage.cacheRead + usage.cacheWrite;

  if (promptTokens > 0) {
    state.previous = {
      promptTokens,
      modelKey,
      timestamp,
      reportedCache:
        (state.previous?.reportedCache ?? false) || usage.cacheRead + usage.cacheWrite > 0,
    };
  }
  state.pendingCause = undefined;
  state.resetNext = false;
}

function extractLegacyCacheTurns(branch: SessionEntry[]): CacheTurn[] {
  const turns: CacheTurn[] = [];
  for (const entry of branch) {
    if (entry.type !== "custom" || entry.customType !== "supi-cache-turn") continue;
    const data = entry.data as CacheTurn | undefined;
    if (data) turns.push(data);
  }
  return turns;
}

function mergeLegacyDetails(nativeTurns: CacheTurn[], legacyTurns: CacheTurn[]): CacheTurn[] {
  const used = new Set<number>();

  return nativeTurns.map((nativeTurn, index) => {
    const legacyIndex = findLegacyMatch(nativeTurn, legacyTurns, used, index);
    if (legacyIndex === undefined) return nativeTurn;

    used.add(legacyIndex);
    const legacy = legacyTurns[legacyIndex];
    const legacyCause = resolveTurnCause(legacy);
    const cause = mergeCause(nativeTurn, legacyCause);
    const note = legacy.note?.startsWith("⚠") ? legacy.note : nativeTurn.note;

    return {
      ...nativeTurn,
      ...(note ? { note } : {}),
      ...(cause ? { cause } : {}),
      ...(legacy.promptFingerprint ? { promptFingerprint: legacy.promptFingerprint } : {}),
    };
  });
}

function findLegacyMatch(
  nativeTurn: CacheTurn,
  legacyTurns: CacheTurn[],
  used: Set<number>,
  preferredIndex: number,
): number | undefined {
  const preferred = legacyTurns[preferredIndex];
  if (preferred && !used.has(preferredIndex) && closeInTime(nativeTurn, preferred)) {
    return preferredIndex;
  }

  let bestIndex: number | undefined;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (let index = 0; index < legacyTurns.length; index++) {
    if (used.has(index)) continue;
    const candidate = legacyTurns[index];
    const distance = Math.abs(nativeTurn.timestamp - candidate.timestamp);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = index;
    }
  }

  return bestIndex !== undefined && bestDistance <= 5 * 60 * 1000 ? bestIndex : undefined;
}

function closeInTime(left: CacheTurn, right: CacheTurn): boolean {
  return Math.abs(left.timestamp - right.timestamp) <= 5 * 60 * 1000;
}

function mergeCause(
  turn: CacheTurn,
  legacyCause: RegressionCause | undefined,
): RegressionCause | undefined {
  if (turn.cacheReset) return turn.cause;
  if (!legacyCause) return turn.cause;
  if (
    legacyCause.type === "model_change" &&
    legacyCause.model === "unknown" &&
    turn.modelChanged &&
    turn.cause
  ) {
    return turn.cause;
  }
  return legacyCause;
}

function normalizeUsage(usage: AssistantMessage["usage"]): UsageData {
  return {
    input: nonNegativeNumber(usage.input),
    cacheRead: nonNegativeNumber(usage.cacheRead),
    cacheWrite: nonNegativeNumber(usage.cacheWrite),
    cost: {
      input: nonNegativeNumber(usage.cost?.input),
      cacheRead: nonNegativeNumber(usage.cost?.cacheRead),
      cacheWrite: nonNegativeNumber(usage.cost?.cacheWrite),
    },
  };
}

function nonNegativeNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : 0;
}

function normalizeTimestamp(messageTimestamp: unknown, entryTimestamp: string): number {
  if (typeof messageTimestamp === "number" && Number.isFinite(messageTimestamp)) {
    return messageTimestamp;
  }
  const parsed = Date.parse(entryTimestamp);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function detectNativeCacheMiss(
  previous: PreviousRequest | undefined,
  usage: UsageData,
  timestamp: number,
  modelKey: string,
): CacheMissData | undefined {
  const promptTokens = usage.input + usage.cacheRead + usage.cacheWrite;
  if (
    !previous ||
    promptTokens <= 0 ||
    (usage.cacheRead + usage.cacheWrite === 0 && !previous.reportedCache)
  ) {
    return undefined;
  }

  const missedTokens = Math.min(previous.promptTokens, promptTokens) - usage.cacheRead;
  if (missedTokens <= CACHE_MISS_NOISE_FLOOR) return undefined;

  const paidTokens = usage.input + usage.cacheWrite;
  const paidPerToken = paidTokens > 0 ? (usage.cost.input + usage.cost.cacheWrite) / paidTokens : 0;
  const readPerToken = usage.cacheRead > 0 ? usage.cost.cacheRead / usage.cacheRead : 0;

  return {
    missedTokens,
    missedCost: missedTokens * Math.max(0, paidPerToken - readPerToken),
    idleMs: Math.max(0, timestamp - previous.timestamp),
    modelChanged: modelKey !== previous.modelKey,
  };
}

/**
 * Extract tool-call shape fingerprints aligned by cache-turn timestamps.
 *
 * The window uses native assistant message timestamps. This avoids counting
 * assistant messages without usage as separate cache turns.
 */
export function extractToolCallWindows(
  branch: SessionEntry[],
  lookback: number = 2,
): Map<number, ToolCallShape[]> {
  const assistantMessages: { timestampEpoch: number; tools: ToolCallShape[] }[] = [];
  for (const entry of branch) {
    if (entry.type !== "message" || entry.message.role !== "assistant") continue;
    const message = entry.message as AssistantMessage;
    assistantMessages.push({
      timestampEpoch: normalizeTimestamp(message.timestamp, entry.timestamp),
      tools: extractToolCallsFromMessage(message),
    });
  }

  const turns = extractCacheTurnEntries(branch);
  const result = new Map<number, ToolCallShape[]>();
  for (let i = 0; i < turns.length; i++) {
    const turn = turns[i];
    const startIdx = Math.max(0, i - lookback);
    const windowStart = turns[startIdx].timestamp;
    const windowEnd = turn.timestamp;
    const tools: ToolCallShape[] = [];

    for (const message of assistantMessages) {
      if (message.timestampEpoch >= windowStart && message.timestampEpoch < windowEnd) {
        tools.push(...message.tools);
      }
    }
    result.set(turn.turnIndex, tools);
  }

  return result;
}

function extractToolCallsFromMessage(message: AssistantMessage): ToolCallShape[] {
  const shapes: ToolCallShape[] = [];
  for (const block of message.content) {
    if (block.type !== "toolCall") continue;
    shapes.push(computeToolCallShape(block.name, block.arguments));
  }
  return shapes;
}

/** Find the most recent comparable turn before the given index. */
export function findPreviousComparableTurn(
  turns: CacheTurn[],
  index: number,
): CacheTurn | undefined {
  if (turns[index]?.cacheReset) return undefined;

  for (let i = index - 1; i >= 0; i--) {
    if (turns[i].hitRate !== undefined) return turns[i];
    if (turns[i].cacheReset) return undefined;
  }
  return undefined;
}
