// Bounded model output for the cache_forensics tool.
//
// The complete redacted result is always serialized and measured first. When
// it fits PI's standard model-output limit it is returned unchanged. When it
// exceeds either limit, the complete JSON is written to a private OS
// temporary directory and only a summary envelope is returned — never a
// partial findings array.

import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AgentToolResult } from "@earendil-works/pi-coding-agent";
import { DEFAULT_MAX_BYTES, DEFAULT_MAX_LINES } from "@earendil-works/pi-coding-agent";
import type { Static } from "typebox";
import type { ForensicsResult } from "../../forensics/forensics.ts";
import type { ForensicsCause, ParamShape } from "../../forensics/types.ts";
import type { forensicsSpillSchema } from "./structured-schema.ts";

/** Effective query echoed by the bounded envelope. */
export interface ForensicsBoundQuery {
  pattern: ForensicsResult["pattern"];
  since: string;
  minDrop: number;
  maxSessions: number;
  limit: number;
}

/** Result of bounding a forensics tool output. */
export interface BoundedForensicsOutput {
  /** Model-facing text: the full JSON, or the summary envelope. */
  text: string;
  /** Native data matching the direct-call JSON. */
  structuredContent:
    | ReturnType<typeof normalizeForensicsOutput>
    | Static<typeof forensicsSpillSchema>;
  /** Whether the complete JSON was spilled to a temporary file. */
  truncated: boolean;
  /** Path to the complete spilled JSON, present only when truncated. */
  fullOutputPath?: string;
}

const ENVELOPE_FILE = "forensics.json";

function measure(text: string): { lines: number; bytes: number } {
  return {
    lines: text.length === 0 ? 0 : text.split("\n").length,
    bytes: Buffer.byteLength(text, "utf-8"),
  };
}

/**
 * Bound a forensics result to PI's standard model-output limit (2,000 lines
 * or 51,200 UTF-8 bytes, whichever is reached first).
 *
 * The complete redacted result is serialized with the same pretty JSON
 * formatting the tool always used. When it fits, it is returned unchanged.
 * When it exceeds either limit, the complete JSON is spilled to a private OS
 * temporary directory and a summary envelope is returned instead. The
 * envelope echoes the effective query and the exact sessions/turns totals; it
 * never contains a partial findings or breakdown array.
 */
export function boundForensicsOutput(
  result: ForensicsResult,
  query: ForensicsBoundQuery,
): BoundedForensicsOutput {
  const data = normalizeForensicsOutput(result);
  const full = JSON.stringify(data, null, 2);
  const { lines, bytes } = measure(full);
  if (lines <= DEFAULT_MAX_LINES && bytes <= DEFAULT_MAX_BYTES) {
    return { text: full, structuredContent: data, truncated: false };
  }

  const dir = mkdtempSync(join(tmpdir(), "supi-cache-"));
  const fullOutputPath = join(dir, ENVELOPE_FILE);
  writeFileSync(fullOutputPath, full, "utf-8");

  const envelope = {
    truncated: true,
    fullOutputPath,
    totalLines: lines,
    totalBytes: bytes,
    maxLines: DEFAULT_MAX_LINES,
    maxBytes: DEFAULT_MAX_BYTES,
    pattern: query.pattern,
    since: query.since,
    minDrop: query.minDrop,
    maxSessions: query.maxSessions,
    limit: query.limit,
    ...(data.findingsTotal !== undefined ? { findingsTotal: data.findingsTotal } : {}),
    ...(data.findingsLimit !== undefined ? { findingsLimit: data.findingsLimit } : {}),
    sessionsScanned: data.sessionsScanned,
    turnsAnalyzed: data.turnsAnalyzed,
  };
  return {
    text: JSON.stringify(envelope, null, 2),
    structuredContent: envelope,
    truncated: true,
    fullOutputPath,
  };
}

/**
 * Project only public facts, including nested causes and tool shapes. Optional
 * observations are absent (not undefined/null), so native data round-trips
 * through JSON exactly like direct-call text and spill files.
 */
function normalizeForensicsOutput(result: ForensicsResult) {
  return {
    pattern: result.pattern,
    ...(result.findings
      ? {
          // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: independent optional public observations must be omitted when unavailable.
          findings: result.findings.map((finding) => ({
            sessionId: finding.sessionId,
            turnIndex: finding.turnIndex,
            ...(finding.previousRate !== undefined ? { previousRate: finding.previousRate } : {}),
            ...(finding.currentRate !== undefined ? { currentRate: finding.currentRate } : {}),
            drop: finding.drop,
            cause: publicCause(finding.cause),
            toolsBefore: finding.toolsBefore.map((tool) => ({
              toolName: tool.toolName,
              paramKeys: [...tool.paramKeys],
              paramShapes: Object.fromEntries(
                Object.entries(tool.paramShapes).map(([key, shape]) => [
                  key,
                  publicParamShape(shape),
                ]),
              ),
            })),
            ...(finding.idleGapMinutes !== undefined
              ? { idleGapMinutes: finding.idleGapMinutes }
              : {}),
            ...(finding.missedTokens !== undefined ? { missedTokens: finding.missedTokens } : {}),
            ...(finding.missedCost !== undefined
              ? { missedCost: Number(finding.missedCost.toFixed(6)) }
              : {}),
            ...(finding.modelChanged !== undefined ? { modelChanged: finding.modelChanged } : {}),
          })),
        }
      : {}),
    ...(result.breakdown
      ? {
          breakdown: {
            compaction: result.breakdown.compaction,
            branch_summary: result.breakdown.branch_summary,
            model_change: result.breakdown.model_change,
            prompt_change: result.breakdown.prompt_change,
            unknown: result.breakdown.unknown,
            idle: result.breakdown.idle,
          },
        }
      : {}),
    sessionsScanned: result.sessionsScanned,
    turnsAnalyzed: result.turnsAnalyzed,
    ...(result.findingsTotal !== undefined ? { findingsTotal: result.findingsTotal } : {}),
    ...(result.findingsLimit !== undefined ? { findingsLimit: result.findingsLimit } : {}),
  };
}

function publicCause(cause: ForensicsCause): ForensicsCause {
  switch (cause.type) {
    case "model_change":
      return { type: cause.type, model: cause.model };
    case "idle":
      return { type: cause.type, idleGapMinutes: cause.idleGapMinutes };
    default:
      return { type: cause.type };
  }
}

function publicParamShape(shape: ParamShape): ParamShape {
  switch (shape.kind) {
    case "string":
      return { kind: shape.kind, len: shape.len, multiline: shape.multiline };
    case "object":
      return { kind: shape.kind, keyCount: shape.keyCount };
    case "array":
      return { kind: shape.kind, len: shape.len };
    default:
      return { kind: shape.kind };
  }
}

/** Assemble the model-facing cache_forensics result for one bounded query. */
export function buildForensicsResult(
  result: ForensicsResult,
  query: ForensicsBoundQuery,
): AgentToolResult<{ fullOutputPath?: string } | undefined> & {
  structuredContent: BoundedForensicsOutput["structuredContent"];
} {
  const output = boundForensicsOutput(result, query);
  return {
    content: [{ type: "text", text: output.text }],
    structuredContent: output.structuredContent,
    details: output.fullOutputPath ? { fullOutputPath: output.fullOutputPath } : undefined,
  };
}
