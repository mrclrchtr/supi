/**
 * Shared types for the relations analysis modules.
 *
 * These types are imported by callers.ts, callees.ts, implementations.ts,
 * and the analysis services that wrap them (references/service.ts,
 * calls/service.ts, implementations/service.ts).
 */

/** Describes how caller evidence was collected. */
export type CallerEvidence = "semantic-references" | "verified-call-sites";

/** One caller reference result. */
export interface CallerReference {
  file: string;
  line: number;
  character: number;
  name: string | null;
}

/** Enclosing scope used for direct structural callee lookup. */
export interface CalleeScope {
  name: string;
  file: string;
  startLine: number;
  endLine: number;
}

/** One direct structural callee entry from an enclosing-scope lookup. */
export interface CalleeEntry {
  name: string;
  file: string;
  line: number;
  character: number;
}

/** One implementation entry from a semantic implementation lookup. */
export interface ImplementationEntry {
  file: string;
  line: number;
  character: number;
  name: string | null;
}

/** Shared provider deps for all relation kinds. */
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
      data?: {
        enclosingScope?: {
          name?: string;
          startLine?: number;
          endLine?: number;
        };
        callees: Array<{
          name: string;
          file?: string;
          location?: string;
          startLine?: number;
          startCharacter?: number;
        }>;
      };
      message?: string;
    }>;
  } | null;
}
