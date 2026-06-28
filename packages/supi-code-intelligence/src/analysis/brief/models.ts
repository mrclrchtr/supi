// Typed DTOs for brief pipeline stages.
//
// Each brief mode produces a typed model (sync, manifest + fs), then
// enrichment adds provider context (async), then renderers consume
// the enriched model to produce markdown.

// ── Brief models (build stage output) ────────────────────────────────

/** Model for a single-file brief. */
export interface FileBriefModel {
  kind: "file";
  file: string;
  relPath: string;
  lineCount: number;
  isEntrypoint: boolean;
  moduleName: string | null;
  moduleRelativePath: string | null;
}

/** Model for a module (package) brief. */
export interface ModuleBriefModel {
  kind: "module";
  name: string;
  shortName: string;
  description: string | null;
  relativePath: string;
  entrypoints: string[];
  sourceFiles: string[];
  allFiles: string[];
}

/** Model for a non-module directory brief. */
export interface DirectoryBriefModel {
  kind: "directory";
  path: string;
  relPath: string;
  directFiles: string[];
  subdirs: Array<{ name: string; fileCount: number }>;
  totalSourceFiles: number;
}

// ── Enrichment (async provider context) ──────────────────────────────

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
  /** Per-file aggregated diagnostics for module briefs. */
  fileDiagnostics?: Array<{ file: string; errors: number; warnings: number }>;
  /** Entrypoint outlines for module briefs. */
  entrypointOutlines?: Array<{
    entrypoint: string;
    items: Array<{ name: string; kind: string; startLine: number }>;
  }>;
}

/** Options for generateFocusedBrief. */
export interface BriefOpts {
  provider?: import("../provider.ts").CodeProvider | null;
  maxResults?: number;
  cwd: string;
  /** Show git context in orientation output. Defaults to true. */
  showGitContext?: boolean;
  /** LSP service state for diagnostic access. */
  lspService?: import("@mrclrchtr/supi-lsp/api").SessionLspServiceState;
}
