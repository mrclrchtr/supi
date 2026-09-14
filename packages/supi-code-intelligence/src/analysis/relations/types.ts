import type { SemanticProvider, StructuralProvider } from "@mrclrchtr/supi-code-runtime/api";

/**
 * Shared types for the relations analysis modules.
 *
 * These are the canonical entry-point types — consumers import them directly
 * instead of going through thin service wrappers.
 */

/** Describes how caller evidence was collected. */
export type CallerEvidence = "semantic-references" | "verified-call-sites";

/** One caller reference / usages result. */
export interface CallerReference {
  file: string;
  line: number;
  character: number;
  name: string | null;
}

/** Consumer-facing alias for reference/usages entries. */
export type ReferenceEntry = CallerReference;

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

/** One structural call site with a 1-based UTF-16 coordinate. */
export type CallEntry = CalleeEntry;

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
    references?: SemanticProvider["references"];
    implementation?: SemanticProvider["implementation"];
    calleesAt?: StructuralProvider["calleesAt"];
  } | null;
}
