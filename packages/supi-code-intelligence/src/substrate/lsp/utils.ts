/**
 * Shared utilities for working with LSP Diagnostic types.
 *
 * vscode-languageserver-types v3.18.0 widened Diagnostic.message from
 * `string` to `string | MarkupContent`. Use these helpers to safely
 * extract the string representation without repeating the cast.
 */

import type { Diagnostic } from "@mrclrchtr/supi-lsp/api";

/**
 * Return the plain-text message from a Diagnostic, handling both
 * the legacy `string` and new `MarkupContent` forms.
 */
export function diagnosticMessageString(d: Diagnostic): string {
  return typeof d.message === "string" ? d.message : d.message.value;
}
