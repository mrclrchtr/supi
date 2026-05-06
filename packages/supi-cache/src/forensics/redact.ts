// Redaction utilities — shape fingerprints and human-detail stripping.

import type { ForensicsFinding, ParamShape, ToolCallShape } from "./types.ts";

/**
 * Compute a structural shape fingerprint for a tool call.
 *
 * Captures param keys, types, lengths, and multiline status — enough for
 * pattern detection ("bash calls with pipes precede cache drops") without
 * exposing raw file paths or command text to the agent.
 */
export function computeToolCallShape(
  toolName: string,
  args: Record<string, unknown>,
): ToolCallShape {
  const paramKeys = Object.keys(args);
  const paramShapes: Record<string, ParamShape> = {};

  for (const key of paramKeys) {
    paramShapes[key] = computeParamShape(args[key]);
  }

  return { toolName, paramKeys, paramShapes };
}

function computeParamShape(value: unknown): ParamShape {
  if (typeof value === "string") {
    return {
      kind: "string",
      len: value.length,
      multiline: value.includes("\n"),
    };
  }
  if (typeof value === "number") {
    return { kind: "number" };
  }
  if (typeof value === "boolean") {
    return { kind: "boolean" };
  }
  if (Array.isArray(value)) {
    return { kind: "array", len: value.length };
  }
  if (value !== null && typeof value === "object") {
    return { kind: "object", keyCount: Object.keys(value).length };
  }
  // Fallback for null / undefined / function / symbol
  return { kind: "string", len: 0, multiline: false };
}

/**
 * Strip human-only `_prefixed` fields from findings before returning to agent.
 *
 * Returns a shallow copy with `_pathsInvolved` and `_commandSummaries` removed.
 * Nested objects (e.g., `toolsBefore` arrays) are shared references.
 */
export function stripHumanDetail(findings: ForensicsFinding[]): ForensicsFinding[] {
  return findings.map((f) => {
    const { _pathsInvolved: _p, _commandSummaries: _c, ...rest } = f;
    return rest;
  });
}
