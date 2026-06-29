// Enrichment helpers for the brief pipeline.
//
// Provides three functions:
// - enrichFileContext(provider, file, maxResults) — outline, imports, exports
// - enrichDiagnosticContext(cwd, file, maxResults) — LSP diagnostics
// - gatherBriefEnrichment(provider, cwd, file, maxResults) — orchestrates both

import type { SessionLspServiceState } from "@mrclrchtr/supi-lsp/api";
import { diagnosticMessageString } from "../../substrate/lsp/utils.ts";
import type { CodeProvider } from "../provider.ts";
import type { BriefDiagnostic, BriefEnrichment } from "./models.ts";

// ── Default caps ─────────────────────────────────────────────────────

const DEFAULT_OUTLINE_CAP = 15;
const DEFAULT_IMPORTS_CAP = 10;
const DEFAULT_EXPORTS_CAP = 10;
const DEFAULT_DIAGNOSTICS_CAP = 5;

function cap(count: number | undefined, def: number): number {
  return count != null && count > 0 ? count : def;
}

// ── Structural enrichment ───────────────────────────────────────────

/**
 * Enrich file context with outline, imports, and exports from a provider.
 * Each section is capped at maxResults with per-section defaults.
 */
export async function enrichFileContext(
  provider: CodeProvider,
  file: string,
  maxResults?: number,
): Promise<Pick<BriefEnrichment, "outline" | "imports" | "exports">> {
  const outlineCap = cap(maxResults, DEFAULT_OUTLINE_CAP);
  const importsCap = cap(maxResults, DEFAULT_IMPORTS_CAP);
  const exportsCap = cap(maxResults, DEFAULT_EXPORTS_CAP);

  const outline = await tryOutline(provider, file, outlineCap);
  const imports = await tryImports(provider, file, importsCap);
  const exports = await tryExports(provider, file, exportsCap);

  return { outline, imports, exports };
}

async function tryOutline(
  provider: CodeProvider,
  file: string,
  capN: number,
): Promise<BriefEnrichment["outline"]> {
  try {
    const result = await provider.outline(file);
    if (result.kind !== "success") return [];
    return result.data.slice(0, capN).map((item) => ({
      name: item.name,
      kind: item.kind,
      startLine: item.startLine,
      endLine: item.endLine,
    }));
  } catch {
    return [];
  }
}

async function tryImports(
  provider: CodeProvider,
  file: string,
  capN: number,
): Promise<BriefEnrichment["imports"]> {
  try {
    const result = await provider.imports(file);
    if (result.kind !== "success") return [];
    return result.data.slice(0, capN).map((item) => ({
      moduleSpecifier: item.moduleSpecifier,
    }));
  } catch {
    return [];
  }
}

async function tryExports(
  provider: CodeProvider,
  file: string,
  capN: number,
): Promise<BriefEnrichment["exports"]> {
  try {
    const result = await provider.exports(file);
    if (result.kind !== "success") return [];
    return result.data.slice(0, capN).map((item) => ({
      name: item.name,
      kind: item.kind,
    }));
  } catch {
    return [];
  }
}

// ── Diagnostic enrichment ───────────────────────────────────────────

/**
 * Get LSP diagnostics for a file (errors + warnings).
 * Returns capped diagnostic entries.
 */
export async function enrichDiagnosticContext(
  file: string | undefined,
  maxResults: number | undefined,
  lspService: SessionLspServiceState,
): Promise<Pick<BriefEnrichment, "diagnostics">> {
  if (!file) return { diagnostics: [] };

  const capN = cap(maxResults, DEFAULT_DIAGNOSTICS_CAP);

  try {
    if (lspService.kind !== "ready") return { diagnostics: [] };

    const diags = await lspService.service.fileDiagnostics(file, 2);
    if (!diags || diags.length === 0) return { diagnostics: [] };

    // Map to our DTO shape (1-based line for display)
    const mapped: BriefDiagnostic[] = diags.map((d) => ({
      line: d.range.start.line + 1,
      severity: d.severity ?? 1,
      message: diagnosticMessageString(d),
    }));

    return { diagnostics: mapped.slice(0, capN) };
  } catch {
    return { diagnostics: [] };
  }
}

// ── Combined enrichment ─────────────────────────────────────────────

/**
 * Orchestrate both structural and diagnostic enrichment for a file.
 */
export async function gatherBriefEnrichment(
  provider: CodeProvider | null,
  file: string,
  maxResults: number | undefined,
  lspService: SessionLspServiceState,
): Promise<BriefEnrichment> {
  // Structural context (outline, imports, exports) needs a provider
  const structural = provider
    ? await enrichFileContext(provider, file, maxResults)
    : { outline: [], imports: [], exports: [] };

  // Diagnostics can work independently of provider (reaches LSP directly)
  const diagnostic = await enrichDiagnosticContext(file, maxResults, lspService);

  return {
    outline: structural.outline,
    imports: structural.imports,
    exports: structural.exports,
    diagnostics: diagnostic.diagnostics,
  };
}
