// Substrate interfaces for code-intelligence's semantic (LSP) and
// structural (tree-sitter) adapters.
//
// These are now type aliases matching the canonical provider contracts
// from @mrclrchtr/supi-code-runtime.  New code should import the
// canonical types from the runtime package directly.

import type { SemanticProvider, StructuralProvider } from "@mrclrchtr/supi-code-runtime/api";

export type { CodeLocation, CodePosition } from "@mrclrchtr/supi-core/types";

// ── Provider contracts (now aliases for shared runtime) ───────────────

/** @deprecated Import SemanticProvider from @mrclrchtr/supi-code-runtime/api. */
export type SemanticSubstrate = SemanticProvider;

/** @deprecated Import StructuralProvider from @mrclrchtr/supi-code-runtime/api. */
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
