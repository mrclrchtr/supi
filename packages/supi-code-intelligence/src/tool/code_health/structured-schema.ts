import { StringEnum } from "@earendil-works/pi-ai";
import { Type } from "typebox";
import { HEALTH_DIAGNOSTIC_MESSAGE_LIMIT } from "../../session/health-types.ts";

const object = <T extends import("typebox").TProperties>(properties: T) =>
  Type.Object(properties, { additionalProperties: false });
const nullableString = Type.Union([Type.String(), Type.Null()]);
const scope = Type.Union([
  object({ kind: Type.Literal("file"), path: Type.String() }),
  object({ kind: Type.Literal("tracked-files"), filter: nullableString }),
]);
const evidence = object({
  requested: Type.Integer(),
  confirmed: Type.Integer(),
  unconfirmed: Type.Integer(),
  failed: Type.Integer(),
  removed: Type.Integer(),
  documents: Type.Array(
    object({
      file: Type.String(),
      status: StringEnum(["confirmed", "unconfirmed", "failed", "removed"]),
    }),
  ),
});
const scopeStatus = object({
  status: StringEnum(["included", "excluded", "no-config", "out-of-tree"]),
  basis: Type.Union([
    StringEnum([
      "fileNames",
      "explicit",
      "include-pattern",
      "default-include",
      "exclude-pattern",
      "extension",
    ]),
    Type.Null(),
  ]),
  configPath: nullableString,
  caseSensitiveFileNames: Type.Boolean(),
});
const diagnosticEntry = object({
  file: Type.String(),
  errors: Type.Integer(),
  warnings: Type.Integer(),
  messages: Type.Optional(
    Type.Array(
      object({
        line: Type.Integer({ description: "1-based line." }),
        severity: StringEnum(["error", "warning"]),
        message: Type.String(),
        source: Type.Optional(Type.String()),
      }),
    ),
  ),
});
const diagnostics = Type.Union([
  object({ kind: Type.Literal("not-requested"), entries: Type.Array(diagnosticEntry) }),
  object({
    kind: Type.Literal("completed"),
    scope,
    entries: Type.Array(diagnosticEntry),
    evidence,
    scopeStatus: Type.Optional(scopeStatus),
  }),
  object({
    kind: StringEnum(["partial", "unavailable"]),
    scope,
    entries: Type.Array(diagnosticEntry),
    evidence,
    reason: Type.String(),
    scopeStatus: Type.Optional(scopeStatus),
  }),
]);
const operation = object({
  server: StringEnum(["advertised", "not-advertised", "unknown"]),
  supi: StringEnum(["supported", "limited", "unsupported"]),
  reason: Type.Optional(Type.String()),
});
const support = object({
  rename_symbol: Type.Optional(operation),
  prepare_rename: Type.Optional(operation),
  extract_function: Type.Optional(operation),
  extract_variable: Type.Optional(operation),
  update_imports: Type.Optional(operation),
  delete_dead_code: Type.Optional(operation),
  code_action_resolve: Type.Optional(operation),
});
const server = object({
  name: Type.String(),
  root: Type.String(),
  fileTypes: Type.Array(Type.String()),
  status: StringEnum(["running", "error", "unavailable"]),
  statusReason: Type.Optional(
    StringEnum([
      "process-crashed",
      "process-crash-recovery-pending",
      "process-crash-recovery-exhausted",
    ]),
  ),
  ready: Type.Boolean(),
  operationSupport: Type.Optional(support),
  typescript: Type.Optional(
    object({
      backend: Type.Literal("tsserver"),
      packageName: Type.String(),
      compilerVersion: Type.Optional(Type.String()),
      wrapperVersion: Type.Optional(Type.String()),
    }),
  ),
  failureMessage: Type.Optional(Type.String()),
});
const stale = object({
  scope: StringEnum(["file", "workspace"]),
  suspected: Type.Union([Type.Boolean(), Type.Null()]),
  matchedFileCount: Type.Integer(),
  warning: nullableString,
});
const recoveryEntry = object({
  name: Type.String(),
  root: Type.String(),
  outcome: StringEnum([
    "recovered",
    "skipped-no-retained-file",
    "recovery-failed",
    "recovery-exhausted",
  ]),
  nextAction: Type.Optional(StringEnum(["use-exact-file", "refresh"])),
  failureMessage: Type.Optional(Type.String()),
});
const crashRecovery = object({
  recoveredRoutes: Type.Integer(),
  skippedRoutes: Type.Integer(),
  failedRoutes: Type.Integer(),
  exhaustedRoutes: Type.Integer(),
  entries: Type.Array(recoveryEntry),
  omittedEntries: Type.Integer(),
});
const startupRetry = object({
  recoveredRoutes: Type.Integer(),
  failedRoutes: Type.Integer(),
  entries: Type.Array(
    object({
      name: Type.String(),
      root: Type.String(),
      outcome: StringEnum(["recovered", "retry-failed"]),
      nextAction: Type.Optional(Type.Literal("refresh")),
      failureMessage: Type.Optional(Type.String()),
    }),
  ),
  omittedEntries: Type.Integer(),
});
const tracking = object({
  status: StringEnum(["complete", "limited"]),
  reason: Type.Union([StringEnum(["file-limit", "filesystem-error"]), Type.Null()]),
  observedFileCount: Type.Integer(),
  discovered: Type.Array(Type.String()),
  tracked: Type.Array(Type.String()),
  skipped: Type.Array(Type.String()),
  unavailable: Type.Array(Type.String()),
  deferred: Type.Integer(),
});
const attemptFields = {
  attemptedAt: Type.Number(),
  elapsedMs: Type.Number(),
  requestedDiagnosticScope: scope,
  operationScope: StringEnum(["file-runtime", "workspace-runtime"]),
  attemptedActiveClients: Type.Optional(Type.Integer()),
  restartedClients: Type.Optional(Type.Integer()),
  fileReadiness: Type.Optional(StringEnum(["ready", "pending", "unavailable"])),
  staleAssessment: Type.Optional(stale),
  diagnosticEvidence: Type.Optional(evidence),
  processCrashRecovery: Type.Optional(crashRecovery),
  startupRetry: Type.Optional(startupRetry),
  sourceTracking: Type.Optional(tracking),
};
const completedAttemptFields = {
  ...attemptFields,
  attemptedActiveClients: Type.Integer(),
  restartedClients: Type.Integer(),
  staleAssessment: stale,
  processCrashRecovery: crashRecovery,
};
const attempt = Type.Union([
  object({
    kind: Type.Literal("completed"),
    ...completedAttemptFields,
    operationScope: Type.Literal("workspace-runtime"),
    diagnosticEvidence: evidence,
  }),
  object({
    kind: Type.Literal("completed"),
    ...completedAttemptFields,
    operationScope: Type.Literal("file-runtime"),
  }),
  object({ kind: Type.Literal("failed"), ...attemptFields, reason: Type.String() }),
]);
const refresh = Type.Union([
  attempt,
  object({
    kind: StringEnum(["not-requested", "not-attempted"]),
    reason: Type.String(),
    lastAttempt: Type.Union([attempt, Type.Null()]),
  }),
]);
const warningReport = object({
  hasWarnings: Type.Boolean(),
  warnings: Type.Array(
    object({
      type: StringEnum([
        "language-disabled",
        "missing-server",
        "structural-unavailable",
        "configuration-error",
      ]),
      message: Type.String(),
      language: Type.Optional(Type.String()),
      detail: Type.Optional(Type.String()),
    }),
  ),
});

/** Complete collected health facts; diagnostic observations never imply workspace-wide coverage. */
export const HealthOutputSchema = Type.Union([
  object({ kind: Type.Literal("invalid-input"), message: Type.String() }),
  object({
    kind: Type.Literal("completed"),
    level: StringEnum(["summary", "detailed"]),
    includedSections: Type.Array(StringEnum(["diagnostics", "servers"])),
    semanticState: Type.Union([
      object({ kind: Type.Literal("ready") }),
      object({
        kind: StringEnum(["pending", "inactive", "disabled", "unavailable"]),
        reason: Type.String(),
      }),
      Type.Null(),
    ]),
    structuralAvailable: Type.Optional(Type.Boolean()),
    structuralStatus: Type.Optional(Type.String()),
    diagnostics,
    diagnosticMessageLimitPerFile: Type.Literal(HEALTH_DIAGNOSTIC_MESSAGE_LIMIT, {
      description:
        "Detailed diagnostics include at most three error/warning messages per file; line numbers are 1-based.",
    }),
    serverInventoryScope: Type.Literal("workspace"),
    serverInventoryAvailable: Type.Boolean(),
    servers: Type.Array(server),
    refresh,
    capabilityWarnings: Type.Optional(warningReport),
  }),
]);
