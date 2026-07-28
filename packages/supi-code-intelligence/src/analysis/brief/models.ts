// Typed DTOs for structural and diagnostic context enrichment.

/** A single file's diagnostic entry. */
export interface BriefDiagnostic {
  line: number;
  severity: number;
  message: string;
}

/** Provider-enriched context for a file or module. */
export interface BriefEnrichment {
  outline: Array<{ name: string; kind: string; startLine: number; endLine: number }>;
  imports: Array<{ moduleSpecifier: string }>;
  exports: Array<{ name: string; kind: string }>;
  diagnostics: BriefDiagnostic[];
}
