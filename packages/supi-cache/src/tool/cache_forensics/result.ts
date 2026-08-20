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
import type { ForensicsResult } from "../../forensics/forensics.ts";

/** Effective query echoed by the bounded envelope. */
export interface ForensicsBoundQuery {
  pattern: string;
  since: string;
  minDrop: number;
  maxSessions: number;
}

/** Result of bounding a forensics tool output. */
export interface BoundedForensicsOutput {
  /** Model-facing text: the full JSON, or the summary envelope. */
  text: string;
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
  const full = JSON.stringify(result, null, 2);
  const { lines, bytes } = measure(full);
  if (lines <= DEFAULT_MAX_LINES && bytes <= DEFAULT_MAX_BYTES) {
    return { text: full, truncated: false };
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
    sessionsScanned: result.sessionsScanned,
    turnsAnalyzed: result.turnsAnalyzed,
  };
  return { text: JSON.stringify(envelope, null, 2), truncated: true, fullOutputPath };
}

/** Assemble the model-facing cache_forensics result for one bounded query. */
export function buildForensicsResult(
  result: ForensicsResult,
  query: ForensicsBoundQuery,
): AgentToolResult<{ fullOutputPath?: string } | undefined> {
  const output = boundForensicsOutput(result, query);
  return {
    content: [{ type: "text", text: output.text }],
    details: output.fullOutputPath ? { fullOutputPath: output.fullOutputPath } : undefined,
  };
}
