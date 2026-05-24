/**
 * Target resolution — facade that delegates to the structured targeting pipeline
 * while preserving backward-compatible types and exports for existing consumers.
 *
 * New code should import from `./targeting/` directly.
 */

import { type Position, toLspPosition } from "@mrclrchtr/supi-lsp/api";
import { normalizePath } from "./search-helpers.ts";
import type { SemanticSubstrate, StructuralSubstrate } from "./substrates/types.ts";
import { resolveAnchoredTarget as resolveAnchored } from "./targeting/resolve-anchored.ts";
import { resolveFileTargetGroup as resolveFile } from "./targeting/resolve-file.ts";
import { resolveSymbolTarget as resolveSymbol } from "./targeting/resolve-symbol.ts";
import type { ConfidenceMode, DisambiguationCandidate } from "./types.ts";

// ── Re-exported legacy types ──────────────────────────────────────────

export interface ResolvedTarget {
  file: string;
  /** 0-based position for LSP API */
  position: Position;
  /** 1-based position for user display */
  displayLine: number;
  displayCharacter: number;
  name: string | null;
  kind: string | null;
  confidence: ConfidenceMode;
}

export interface ResolvedTargetGroup {
  file: string;
  displayName: string;
  targets: ResolvedTarget[];
  confidence: ConfidenceMode;
}

export type TargetResolutionResult =
  | { kind: "resolved"; target: ResolvedTarget }
  | { kind: "disambiguation"; candidates: DisambiguationCandidate[]; omittedCount: number }
  | { kind: "error"; message: string };

// Re-export normalizePath for consumers who import from target-resolution
export { normalizePath } from "./search-helpers.ts";

/**
 * Convert 1-based public coordinates to 0-based LSP Position.
 */
export function toZeroBased(line: number, character: number): Position {
  return toLspPosition(line, character);
}

// ── Anchored resolver ─────────────────────────────────────────────────

/**
 * Resolve a target from anchored coordinates (file + line + character).
 * Delegates to the new targeting pipeline after normalizing the file path.
 */
export function resolveAnchoredTarget(
  file: string,
  line: number,
  character: number,
  cwd: string,
): TargetResolutionResult {
  const resolvedFile = normalizePath(file, cwd);
  const outcome = resolveAnchored(resolvedFile, line, character);

  if (outcome.kind === "resolved") {
    return {
      kind: "resolved",
      target: outcome.target as ResolvedTarget,
    };
  }

  return outcome as TargetResolutionResult;
}

// ── File-level target group ───────────────────────────────────────────

/**
 * Resolve a file-only request into a group of actionable targets.
 * Delegates to the new targeting pipeline with optional structural substrate.
 */
export async function resolveFileTargetGroup(
  file: string,
  cwd: string,
  structural?: StructuralSubstrate,
): Promise<{ kind: "resolved"; group: ResolvedTargetGroup } | { kind: "error"; message: string }> {
  const outcome = await resolveFile(file, cwd, { structural });
  if (outcome.kind === "error") return outcome;
  return {
    kind: "resolved",
    group: outcome.group as ResolvedTargetGroup,
  };
}

// ── Symbol resolver ───────────────────────────────────────────────────

/**
 * Resolve a target from symbol discovery — finds matching declarations.
 * Symbol discovery is semantic-only; it does not fall back to text search.
 */
export async function resolveSymbolTarget(
  symbol: string,
  cwd: string,
  semantic: SemanticSubstrate,
  options?: {
    path?: string;
    kind?: string;
    exportedOnly?: boolean;
  },
): Promise<TargetResolutionResult> {
  const outcome = await resolveSymbol(symbol, cwd, semantic, options);

  if (outcome.kind === "resolved") {
    return {
      kind: "resolved",
      target: outcome.target as ResolvedTarget,
    };
  }

  return outcome as TargetResolutionResult;
}
