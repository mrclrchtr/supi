import { type Diagnostic, DiagnosticSeverity } from "../config/types.ts";

/** Return Error when a diagnostic omits the optional LSP severity. */
export function effectiveDiagnosticSeverity(diagnostic: Diagnostic): DiagnosticSeverity {
  return diagnostic.severity ?? DiagnosticSeverity.Error;
}
