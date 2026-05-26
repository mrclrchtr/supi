/**
 * Typed relation result and evidence shapes for code_relations.
 *
 * These types decouple the analysis layer from the presentation layer:
 * - The analysis service returns typed RelationsResult
 * - The renderer consumes RelationsResult and formats as markdown
 * - The renderer does NOT perform routing, provider calls, or target resolution
 */

import type { ConfidenceMode } from "../../types.ts";

/**
 * Describes how caller evidence was collected.
 * - "semantic-references": used LSP references as caller evidence
 * - "verified-call-sites": confirmed call-site data (e.g., AST-level verification)
 */
export type CallerEvidence = "semantic-references" | "verified-call-sites";

/**
 * One caller reference result.
 */
export interface CallerReference {
  file: string;
  line: number;
  character: number;
  name: string | null;
}

/**
 * One callee entry from a structural callee lookup.
 */
export interface CalleeEntry {
  name: string;
  file: string;
  line: number;
  character: number;
}

/**
 * One implementation entry from a semantic implementation lookup.
 */
export interface ImplementationEntry {
  file: string;
  line: number;
  character: number;
  name: string | null;
}

/**
 * Typed relations result.
 *
 * The renderer consumes this and formats as markdown.
 * It does NOT perform routing, provider calls, or target resolution.
 */
export type RelationsResult =
  | {
      kind: "callers";
      targetName: string;
      confidence: ConfidenceMode;
      references: CallerReference[];
      externalCount: number;
      evidence: CallerEvidence;
    }
  | {
      kind: "implementations";
      targetName: string;
      implementations: ImplementationEntry[];
      externalCount: number;
      confidence: ConfidenceMode;
    }
  | {
      kind: "callees";
      targetName: string;
      callees: CalleeEntry[];
      confidence: ConfidenceMode;
    }
  | {
      kind: "unavailable";
      reason: string;
    };

/**
 * Relations service input, shared across all relation kinds.
 */
export interface RelationsServiceInput {
  kind: "callers" | "callees" | "implementations";
  file?: string;
  line?: number;
  character?: number;
  symbol?: string;
  path?: string;
  maxResults?: number;
  cwd: string;
}

export interface RelationsServiceDeps {
  cwd: string;
  provider: {
    references?: (
      file: string,
      pos: { line: number; character: number },
    ) => Promise<Array<{
      uri: string;
      range: {
        start: { line: number; character: number };
        end: { line: number; character: number };
      };
    }> | null>;
    implementation?: (
      file: string,
      pos: { line: number; character: number },
    ) => Promise<Array<{
      uri?: string;
      targetUri?: string;
      range?: { start: { line: number }; end?: { line: number } };
      targetRange?: { start: { line: number }; end?: { line: number } };
    }> | null>;
    calleesAt?: (
      file: string,
      line: number,
      character: number,
    ) => Promise<{
      kind: string;
      data?: { callees: Array<{ name: string; file?: string; location?: string }> };
      message?: string;
    }>;
  } | null;
}
