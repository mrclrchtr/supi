// Substrate interfaces for code-intelligence's semantic (LSP) and
// structural (tree-sitter) adapters.
//
// These are type aliases for the canonical provider contracts
// now hosted in @mrclrchtr/supi-code-runtime.

import type { SemanticProvider, StructuralProvider } from "@mrclrchtr/supi-code-runtime/api";

export type { CodeLocation, CodePosition } from "../types.ts";

// ── Provider contracts (aliases for shared provider types) ───────────

/** Canonical provider alias — same as SemanticProvider. */
export type SemanticSubstrate = SemanticProvider;

/** Canonical provider alias — same as StructuralProvider. */
export type StructuralSubstrate = StructuralProvider;

// ── Value types (re-exported from shared types) ───────────────────────

export type { StructuralResult } from "@mrclrchtr/supi-code-runtime/api";
export type {
  CalleesData,
  CodeResult,
  CodeSymbol,
  ExportData,
  ImportData,
  NodeAtData,
  OutlineData,
} from "../types.ts";
