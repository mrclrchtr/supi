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
      status: Type.Enum(["confirmed", "unconfirmed", "failed", "removed"], { type: "string" }),
    }),
  ),
});
const scopeStatus = object({
  status: Type.Enum(["included", "excluded", "no-config", "out-of-tree"], { type: "string" }),
  basis: Type.Union([
    Type.Enum(
      [
        "fileNames",
        "explicit",
        "include-pattern",
        "default-include",
        "exclude-pattern",
        "extension",
      ],
      { type: "string" },
    ),
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
        severity: Type.Enum(["error", "warning"], { type: "string" }),
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
    kind: Type.Enum(["partial", "unavailable"], { type: "string" }),
    scope,
    entries: Type.Array(diagnosticEntry),
    evidence,
    reason: Type.String(),
    scopeStatus: Type.Optional(scopeStatus),
  }),
]);
const operation = object({
  server: Type.Enum(["advertised", "not-advertised", "unknown"], { type: "string" }),
  supi: Type.Enum(["supported", "limited", "unsupported"], { type: "string" }),
  reason: Type.Optional(Type.String()),
  kinds: Type.Optional(Type.Array(Type.String())),
  anyKind: Type.Optional(Type.Boolean()),
});
const support = object({
  rename_symbol: Type.Optional(operation),
  prepare_rename: Type.Optional(operation),
  code_action: Type.Optional(operation),
  source_action: Type.Optional(operation),
  code_action_resolve: Type.Optional(operation),
});
const server = object({
  name: Type.String(),
  root: Type.String(),
  fileTypes: Type.Array(Type.String()),
  status: Type.Enum(["running", "error", "unavailable"], { type: "string" }),
  statusReason: Type.Optional(
    Type.Enum(
      ["process-crashed", "process-crash-recovery-pending", "process-crash-recovery-exhausted"],
      { type: "string" },
    ),
  ),
  ready: Type.Boolean(),
  operationSupport: Type.Optional(support),
  typescript: Type.Optional(
    object({
      backend: Type.Union([Type.Literal("tsserver"), Type.Literal("native")]),
      packageName: Type.String(),
      compilerVersion: Type.Optional(Type.String()),
      wrapperVersion: Type.Optional(Type.String()),
    }),
  ),
  failureMessage: Type.Optional(Type.String()),
});
const stale = object({
  scope: Type.Enum(["file", "workspace"], { type: "string" }),
  suspected: Type.Union([Type.Boolean(), Type.Null()]),
  matchedFileCount: Type.Integer(),
  warning: nullableString,
});
const recoveryEntry = object({
  name: Type.String(),
  root: Type.String(),
  outcome: Type.Enum(
    ["recovered", "skipped-no-retained-file", "recovery-failed", "recovery-exhausted"],
    { type: "string" },
  ),
  nextAction: Type.Optional(Type.Enum(["use-exact-file", "refresh"], { type: "string" })),
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
      outcome: Type.Enum(["recovered", "retry-failed"], { type: "string" }),
      nextAction: Type.Optional(Type.Literal("refresh")),
      failureMessage: Type.Optional(Type.String()),
    }),
  ),
  omittedEntries: Type.Integer(),
});
const tracking = object({
  status: Type.Enum(["complete", "limited"], { type: "string" }),
  reason: Type.Union([
    Type.Enum(["file-limit", "filesystem-error"], { type: "string" }),
    Type.Null(),
  ]),
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
  operationScope: Type.Enum(["file-runtime", "workspace-runtime"], { type: "string" }),
  attemptedActiveClients: Type.Optional(Type.Integer()),
  restartedClients: Type.Optional(Type.Integer()),
  fileReadiness: Type.Optional(Type.Enum(["ready", "pending", "unavailable"], { type: "string" })),
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
    kind: Type.Enum(["not-requested", "not-attempted"], { type: "string" }),
    reason: Type.String(),
    lastAttempt: Type.Union([attempt, Type.Null()]),
  }),
]);
const warningReport = object({
  hasWarnings: Type.Boolean(),
  warnings: Type.Array(
    object({
      type: Type.Enum(
        ["language-disabled", "missing-server", "structural-unavailable", "configuration-error"],
        { type: "string" },
      ),
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
    level: Type.Enum(["summary", "detailed"], { type: "string" }),
    includedSections: Type.Array(Type.Enum(["diagnostics", "servers"], { type: "string" })),
    semanticState: Type.Union([
      object({ kind: Type.Literal("ready") }),
      object({
        kind: Type.Enum(["pending", "inactive", "disabled", "unavailable"], { type: "string" }),
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
