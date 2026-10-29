import type { DiagnosticEvidenceSummary } from "@mrclrchtr/supi-lsp/api";
import type { Static } from "typebox";
import type {
  HealthData,
  HealthDiagnosticScope,
  HealthRefreshAttempt,
  HealthRefreshState,
} from "../../session/health-types.ts";
import { HEALTH_DIAGNOSTIC_MESSAGE_LIMIT } from "../../session/health-types.ts";
import type { HealthOutputSchema } from "./structured-schema.ts";

type Output = Static<typeof HealthOutputSchema>;

// Explicitly copy public fields; provider and session-owned objects must not cross this seam.
function copyEvidence(value: DiagnosticEvidenceSummary) {
  return {
    requested: value.requested,
    confirmed: value.confirmed,
    unconfirmed: value.unconfirmed,
    failed: value.failed,
    removed: value.removed,
    documents: value.documents.map(({ file, status }) => ({ file, status })),
  };
}
function copyScope(value: HealthDiagnosticScope) {
  return value.kind === "file"
    ? { kind: value.kind, path: value.path }
    : { kind: value.kind, filter: value.filter };
}
function copyAttempt(value: HealthRefreshAttempt) {
  const {
    kind,
    attemptedAt,
    elapsedMs,
    requestedDiagnosticScope,
    operationScope,
    attemptedActiveClients,
    restartedClients,
    fileReadiness,
    staleAssessment,
    processCrashRecovery,
    startupRetry: retry,
    sourceTracking,
  } = value;
  const diagnosticEvidence = "diagnosticEvidence" in value ? value.diagnosticEvidence : undefined;
  return {
    kind,
    attemptedAt,
    elapsedMs,
    requestedDiagnosticScope: copyScope(requestedDiagnosticScope),
    operationScope,
    ...(attemptedActiveClients === undefined ? {} : { attemptedActiveClients }),
    ...(restartedClients === undefined ? {} : { restartedClients }),
    ...(fileReadiness === undefined ? {} : { fileReadiness }),
    ...(staleAssessment
      ? {
          staleAssessment: {
            scope: staleAssessment.scope,
            suspected: staleAssessment.suspected,
            matchedFileCount: staleAssessment.matchedFileCount,
            warning: staleAssessment.warning,
          },
        }
      : {}),
    ...(diagnosticEvidence ? { diagnosticEvidence: copyEvidence(diagnosticEvidence) } : {}),
    ...(processCrashRecovery
      ? {
          processCrashRecovery: {
            recoveredRoutes: processCrashRecovery.recoveredRoutes,
            skippedRoutes: processCrashRecovery.skippedRoutes,
            failedRoutes: processCrashRecovery.failedRoutes,
            exhaustedRoutes: processCrashRecovery.exhaustedRoutes,
            omittedEntries: processCrashRecovery.omittedEntries,
            entries: processCrashRecovery.entries.map(
              ({ name, root, outcome, nextAction, failureMessage }) => ({
                name,
                root,
                outcome,
                ...(nextAction === undefined ? {} : { nextAction }),
                ...(failureMessage === undefined ? {} : { failureMessage }),
              }),
            ),
          },
        }
      : {}),
    ...(retry
      ? {
          startupRetry: {
            recoveredRoutes: retry.recoveredRoutes,
            failedRoutes: retry.failedRoutes,
            omittedEntries: retry.omittedEntries,
            entries: retry.entries.map(({ name, root, outcome, nextAction, failureMessage }) => ({
              name,
              root,
              outcome,
              ...(nextAction === undefined ? {} : { nextAction }),
              ...(failureMessage === undefined ? {} : { failureMessage }),
            })),
          },
        }
      : {}),
    ...(sourceTracking
      ? {
          sourceTracking: {
            status: sourceTracking.status,
            reason: sourceTracking.reason,
            observedFileCount: sourceTracking.observedFileCount,
            discovered: [...sourceTracking.discovered],
            tracked: [...sourceTracking.tracked],
            skipped: [...sourceTracking.skipped],
            unavailable: [...sourceTracking.unavailable],
            deferred: sourceTracking.deferred,
          },
        }
      : {}),
    ...(kind === "failed" ? { reason: value.reason } : {}),
  };
}
function copyRefresh(value: HealthRefreshState) {
  return value.kind === "not-requested" || value.kind === "not-attempted"
    ? {
        kind: value.kind,
        reason: value.reason,
        lastAttempt: value.lastAttempt ? copyAttempt(value.lastAttempt) : null,
      }
    : copyAttempt(value);
}
/** Project health workflow facts without including session state or text-preview limits. */
export function structuredHealthResult(data: HealthData): Output {
  const observation = data.diagnostics;
  const entries = observation.entries.map(({ file, errors, warnings, messages }) => ({
    file,
    errors,
    warnings,
    ...(messages
      ? {
          messages: messages.map(({ line, severity, message, source }) => ({
            line,
            severity,
            message,
            ...(source === undefined ? {} : { source }),
          })),
        }
      : {}),
  }));
  const diagnosticResult =
    observation.kind === "not-requested"
      ? { kind: observation.kind, entries }
      : {
          kind: observation.kind,
          entries,
          scope: copyScope(observation.scope),
          evidence: copyEvidence(observation.evidence),
          ...(observation.kind === "completed" ? {} : { reason: observation.reason }),
          ...(observation.scopeStatus
            ? {
                scopeStatus: {
                  status: observation.scopeStatus.status,
                  basis: observation.scopeStatus.basis,
                  configPath: observation.scopeStatus.configPath,
                  caseSensitiveFileNames: observation.scopeStatus.caseSensitiveFileNames,
                },
              }
            : {}),
        };
  const operations = [
    "rename_symbol",
    "prepare_rename",
    "extract_function",
    "extract_variable",
    "update_imports",
    "delete_dead_code",
    "code_action_resolve",
  ] as const;
  const servers = data.servers.map(
    ({
      name,
      root,
      fileTypes,
      status,
      statusReason,
      ready,
      operationSupport,
      typescript,
      failureMessage,
    }) => ({
      name,
      root,
      fileTypes: [...fileTypes],
      status,
      ready,
      ...(statusReason === undefined ? {} : { statusReason }),
      ...(typescript ? { typescript } : {}),
      ...(failureMessage ? { failureMessage } : {}),
      ...(operationSupport
        ? {
            operationSupport: Object.fromEntries(
              operations.flatMap((key) => {
                const item = operationSupport[key];
                return item
                  ? [
                      [
                        key,
                        {
                          server: item.server,
                          supi: item.supi,
                          ...(item.reason === undefined ? {} : { reason: item.reason }),
                        },
                      ],
                    ]
                  : [];
              }),
            ),
          }
        : {}),
    }),
  );
  const semanticState =
    data.semanticState === null
      ? null
      : data.semanticState.kind === "ready"
        ? { kind: "ready" as const }
        : { kind: data.semanticState.kind, reason: data.semanticState.reason };
  // The input types are discriminated more narrowly than the independently projected fields.
  return {
    kind: "completed",
    level: data.level,
    includedSections: [...data.includedSections],
    semanticState,
    ...(data.structuralAvailable === undefined
      ? {}
      : { structuralAvailable: data.structuralAvailable }),
    ...(data.structuralStatus === undefined ? {} : { structuralStatus: data.structuralStatus }),
    diagnostics: diagnosticResult,
    diagnosticMessageLimitPerFile: HEALTH_DIAGNOSTIC_MESSAGE_LIMIT,
    serverInventoryScope: "workspace",
    serverInventoryAvailable: data.serverInventoryAvailable,
    servers,
    refresh: copyRefresh(data.refresh),
    ...(data.capabilityWarnings
      ? {
          capabilityWarnings: {
            hasWarnings: data.capabilityWarnings.hasWarnings,
            warnings: data.capabilityWarnings.warnings.map(
              ({ type, message, language, detail }) => ({
                type,
                message,
                ...(language === undefined ? {} : { language }),
                ...(detail === undefined ? {} : { detail }),
              }),
            ),
          },
        }
      : {}),
  } as Output;
}
