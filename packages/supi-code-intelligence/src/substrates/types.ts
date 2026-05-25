// Substrate interfaces for code-intelligence's semantic (LSP) and
// structural (tree-sitter) adapters.
//
// These are type aliases for the canonical provider contracts
// from @mrclrchtr/supi-code-runtime.  Both names are equivalent;
// use SemanticProvider / StructuralProvider when importing from
// the runtime package directly.

import type { SemanticProvider, StructuralProvider } from "@mrclrchtr/supi-code-runtime/api";

export type { CodeLocation, CodePosition } from "@mrclrchtr/supi-core/types";

// ── Provider contracts (aliases for shared runtime types) ────────────

/** Canonical provider alias — same as SemanticProvider from @mrclrchtr/supi-code-runtime/api. */
export type SemanticSubstrate = SemanticProvider;

/** Canonical provider alias — same as StructuralProvider from @mrclrchtr/supi-code-runtime/api. */
export type StructuralSubstrate = StructuralProvider;

// ── Value types (re-exported from shared runtime) ─────────────────────

export type {
  CalleesData,
  CodeResult,
  CodeSymbol,
  ExportData,
  ImportData,
  NodeAtData,
  OutlineData,
  StructuralResult,
} from "@mrclrchtr/supi-code-runtime/api";
