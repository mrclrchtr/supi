// Single-file diagnostics collection for code_health.
//
// Owns the file-scope health request: the live pull, the tsconfig scope
// decision for the requested file, and the evidence factories shared by the
// file-scope outcomes. Kept separate from the workspace-tracked collection
// (diagnostics.ts) so the scope-decision surface stays in one place.

import { existsSync } from "node:fs";
import {
  type CodeRequestControl,
  isCodeRequestInterruption,
} from "@mrclrchtr/supi-code-runtime/api";
import {
  type Diagnostic,
  type DiagnosticEvidenceDocument,
  type DiagnosticEvidenceSummary,
  type FileScopeDecision,
  getFileScopeDecision,
  type WorkspaceLspRuntime,
} from "@mrclrchtr/supi-lsp/api";
import type {
  HealthDiagnosticEntry,
  HealthDiagnosticMessage,
  HealthDiagnosticObservation,
  HealthDiagnosticScope,
} from "../../session/health-types.ts";

/** Collect a live per-file diagnostic pull with its tsconfig scope decision. */
export async function collectScopedFileDiagnostics(options: {
  service: WorkspaceLspRuntime;
  scope: Extract<HealthDiagnosticScope, { kind: "file" }>;
  cwd: string;
  detailed?: boolean;
  requestControl?: CodeRequestControl;
}): Promise<HealthDiagnosticObservation> {
  const { service, scope, cwd, detailed, requestControl } = options;
  try {
    const result = await service.fileDiagnostics(scope.path, 4, requestControl);
    if (result.kind === "unavailable") {
      return unavailableDiagnostics(
        scope,
        result.reason,
        unavailableFileEvidence(scope.path),
        fileScopeStatus(scope.path, cwd),
      );
    }

    const entries = toFileDiagnosticEntries(scope.path, result.data, detailed);
    const status = fileScopeStatus(scope.path, cwd);
    return result.kind === "partial"
      ? {
          kind: "partial",
          scope,
          entries,
          evidence: singleFileEvidence(scope.path, "unconfirmed"),
          reason: result.reason,
          ...(status ? { scopeStatus: status } : {}),
        }
      : {
          kind: "completed",
          scope,
          entries,
          evidence: singleFileEvidence(scope.path, "confirmed"),
          ...(status ? { scopeStatus: status } : {}),
        };
  } catch (error) {
    if (isCodeRequestInterruption(error, requestControl)) throw error;
    return unavailableDiagnostics(
      scope,
      errorMessage(error, "File diagnostic request failed."),
      unavailableFileEvidence(scope.path),
      fileScopeStatus(scope.path, cwd),
    );
  }
}

/**
 * Tsconfig scope decision for the requested file, when it can be computed.
 *
 * Uses the same decision model the diagnostic filter delegates to, so the
 * rendered status line cannot drift from filter behavior. Telemetry-only:
 * a failure to compute never fails the diagnostic request.
 */
export function fileScopeStatus(filePath: string, cwd: string): FileScopeDecision | null {
  try {
    return getFileScopeDecision(filePath, cwd);
  } catch {
    return null;
  }
}

export function toFileDiagnosticEntries(
  file: string,
  diagnostics: ReadonlyArray<Pick<Diagnostic, "severity" | "message" | "source" | "range">>,
  detailed?: boolean,
): HealthDiagnosticEntry[] {
  const errors = diagnostics.filter((diagnostic) => (diagnostic.severity ?? 1) === 1).length;
  const warnings = diagnostics.filter((diagnostic) => (diagnostic.severity ?? 1) === 2).length;
  if (!hasIssueCounts(errors, warnings)) return [];
  const entry: HealthDiagnosticEntry = { file, errors, warnings };
  if (detailed) {
    return [{ ...entry, messages: extractMessages(diagnostics) }];
  }
  return [entry];
}

// ── Message extraction ────────────────────────────────────────────────

const MAX_MESSAGES_PER_FILE = 3;

function extractMessages(
  diagnostics: ReadonlyArray<Pick<Diagnostic, "severity" | "message" | "source" | "range">>,
): HealthDiagnosticMessage[] {
  const errorsAndWarnings = diagnostics
    .filter((d) => (d.severity ?? 1) <= 2)
    .sort(
      (a, b) => (a.severity ?? 1) - (b.severity ?? 1) || a.range.start.line - b.range.start.line,
    );

  return errorsAndWarnings.slice(0, MAX_MESSAGES_PER_FILE).map((d) => ({
    line: d.range.start.line + 1,
    severity: (d.severity ?? 1) === 1 ? ("error" as const) : ("warning" as const),
    message: typeof d.message === "string" ? d.message : d.message.value,
    ...(d.source ? { source: d.source } : {}),
  }));
}

export function unavailableDiagnostics(
  scope: HealthDiagnosticScope,
  reason: string,
  evidence: DiagnosticEvidenceSummary = emptyEvidence(),
  scopeStatus?: FileScopeDecision | null,
): HealthDiagnosticObservation {
  return {
    kind: "unavailable",
    scope,
    entries: [],
    evidence,
    reason,
    ...(scopeStatus ? { scopeStatus } : {}),
  };
}

export function unavailableFileEvidence(file: string): DiagnosticEvidenceSummary {
  return singleFileEvidence(file, existsSync(file) ? "failed" : "removed");
}

export function singleFileEvidence(
  file: string,
  status: DiagnosticEvidenceDocument["status"],
): DiagnosticEvidenceSummary {
  return {
    requested: 1,
    confirmed: status === "confirmed" ? 1 : 0,
    unconfirmed: status === "unconfirmed" ? 1 : 0,
    failed: status === "failed" ? 1 : 0,
    removed: status === "removed" ? 1 : 0,
    documents: [{ file, status }],
  };
}

function emptyEvidence(): DiagnosticEvidenceSummary {
  return {
    requested: 0,
    confirmed: 0,
    unconfirmed: 0,
    failed: 0,
    removed: 0,
    documents: [],
  };
}

function hasIssueCounts(errors: number, warnings: number): boolean {
  return errors > 0 || warnings > 0;
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}
