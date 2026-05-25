// Substrate interfaces for code-intelligence's semantic (LSP) and
// structural (tree-sitter) adapters.
//
// These are type aliases for the canonical provider contracts
// now hosted in supi-code-intelligence.

import type { SemanticProvider, StructuralProvider } from "../provider/types.ts";

export type { CodeLocation, CodePosition } from "../types.ts";

// ── Provider contracts (aliases for shared provider types) ───────────

/** Canonical provider alias — same as SemanticProvider. */
export type SemanticSubstrate = SemanticProvider;

/** Canonical provider alias — same as StructuralProvider. */
export type StructuralSubstrate = StructuralProvider;

// ── Value types (re-exported from shared types) ───────────────────────

export type { StructuralResult } from "../provider/types.ts";
export type {
  CalleesData,
  CodeResult,
  CodeSymbol,
  ExportData,
  ImportData,
  NodeAtData,
  OutlineData,
} from "../types.ts";
