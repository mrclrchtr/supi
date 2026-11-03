import type { DiagnosticEvidenceSummary } from "@mrclrchtr/supi-lsp/api";
import { formatProjectServerRoot } from "../../analysis/health/server-status.ts";
import { toDisplayPath } from "../../analysis/search/paths.ts";
import type {
  HealthData,
  HealthDiagnosticScope,
  HealthRefreshAttempt,
} from "../../session/health-types.ts";

/** Clone source navigation and recovery labels for display; retain observed ownership identities and stored session facts. */
export function displayHealthPaths(input: HealthData, cwd: string): HealthData {
  const display = (file: string) => toDisplayPath(cwd, file);
  const scope = (value: HealthDiagnosticScope): HealthDiagnosticScope =>
    value.kind === "file"
      ? { ...value, path: display(value.path) }
      : { ...value, filter: value.filter === null ? null : display(value.filter) };
  const evidence = (value: DiagnosticEvidenceSummary): DiagnosticEvidenceSummary => ({
    ...value,
    documents: value.documents.map((document) => ({ ...document, file: display(document.file) })),
  });
  const attempt = (value: HealthRefreshAttempt): HealthRefreshAttempt => ({
    ...value,
    requestedDiagnosticScope: scope(value.requestedDiagnosticScope),
    ...(value.processCrashRecovery
      ? {
          processCrashRecovery: {
            ...value.processCrashRecovery,
            entries: value.processCrashRecovery.entries.map((entry) => ({
              ...entry,
              root: formatProjectServerRoot(cwd, entry.root),
            })),
          },
        }
      : {}),
    ...(value.startupRetry
      ? {
          startupRetry: {
            ...value.startupRetry,
            entries: value.startupRetry.entries.map((entry) => ({
              ...entry,
              root: formatProjectServerRoot(cwd, entry.root),
            })),
          },
        }
      : {}),
    ...("diagnosticEvidence" in value && value.diagnosticEvidence
      ? { diagnosticEvidence: evidence(value.diagnosticEvidence) }
      : {}),
    ...(value.sourceTracking
      ? {
          sourceTracking: {
            ...value.sourceTracking,
            discovered: value.sourceTracking.discovered.map(display),
            tracked: value.sourceTracking.tracked.map(display),
            skipped: value.sourceTracking.skipped.map(display),
            unavailable: value.sourceTracking.unavailable.map(display),
          },
        }
      : {}),
  });
  const { diagnostics, refresh } = input;
  return {
    ...input,
    diagnostics:
      diagnostics.kind === "not-requested"
        ? diagnostics
        : {
            ...diagnostics,
            scope: scope(diagnostics.scope),
            entries: diagnostics.entries.map((entry) => ({ ...entry, file: display(entry.file) })),
            evidence: evidence(diagnostics.evidence),
            ...(diagnostics.scopeStatus
              ? {
                  scopeStatus: {
                    ...diagnostics.scopeStatus,
                    configPath:
                      diagnostics.scopeStatus.configPath === null
                        ? null
                        : display(diagnostics.scopeStatus.configPath),
                  },
                }
              : {}),
          },
    refresh:
      refresh.kind === "not-requested" || refresh.kind === "not-attempted"
        ? {
            ...refresh,
            lastAttempt: refresh.lastAttempt === null ? null : attempt(refresh.lastAttempt),
          }
        : attempt(refresh),
  };
}
