const FAILURE_MESSAGES = {
  unavailable: "The Consulting Agent is unavailable. Reload PI to check availability.",
  timeout: "The Consultation timed out.",
  cancelled: "The Consultation was canceled.",
  "invalid-response": "The Consulting Agent returned an invalid response.",
  "invalid-continuation": "Invalid Conversation Handle continuation state.",
  "conversation-mismatch":
    "The Consulting Agent returned a different conversation for this handle.",
  execution: "Consultation execution failed.",
} as const;

const FAILURE_REASON_MESSAGES = {
  "missing-terminal": "The Consulting Agent did not return a final result.",
  "terminal-failed": "The Consulting Agent reported an unsuccessful final result.",
  "missing-answer": "The Consulting Agent did not return a final structured answer.",
  "invalid-answer":
    "The Consulting Agent returned an answer that does not match the required schema.",
  "unbound-answer":
    "The Consulting Agent's structured answer could not be verified for the current request. Start a new Consultation.",
  "missing-conversation": "The Consulting Agent did not return a conversation identifier.",
  "events-after-terminal": "The Consulting Agent sent data after its final result.",
  "malformed-json": "The Consulting Agent returned malformed JSON.",
  "invalid-event": "The Consulting Agent returned a non-object response event.",
  "stdout-line-limit": "The Consulting Agent response exceeded the line-size limit.",
  "stdout-byte-limit": "The Consulting Agent response exceeded the total output-size limit.",
  "event-limit": "The Consulting Agent response exceeded the event limit.",
} as const;

/** Fixed failure reasons that do not contain agent output. */
export type ConsultingFailureReason = keyof typeof FAILURE_REASON_MESSAGES;

const DENIED_OPERATIONS = [
  "command",
  "file-read",
  "file-write",
  "web-read",
  "browser",
  "mcp",
  "other",
] as const;

/** Fixed operation categories; raw agent tool names never leave the adapter on failure. */
export type ConsultingDeniedOperation = (typeof DENIED_OPERATIONS)[number];

/** Maximum distinct requested file targets in each failure resource list. */
export const MAX_FAILURE_RESOURCES = 8;
/** Longer paths are unavailable, never silently truncated into a different target. */
export const MAX_FAILURE_RESOURCE_PATH_CHARS = 1_024;

/** Structured requested file target, not a canonical path, rule decision, or outcome. */
export interface ConsultingFileResource {
  operation: "file-read" | "file-write";
  requestedPath: string;
}

/** Failure facts plus bounded requested file targets; never raw tool payloads or output. */
export interface ConsultingFailureDiagnostics {
  permissionDenials?: number;
  /** Deduplicated denial counts, classified into fixed operation categories. */
  permissionDenialsByOperation?: Partial<Record<ConsultingDeniedOperation, number>>;
  /** Denied file operations targeting outside approved roots; not a claim about denial cause. */
  deniedFileAccessOutsideReadRoots?: number;
  /** Distinct requested file targets extracted from correlated structured tool parameters. */
  deniedResources?: readonly ConsultingFileResource[];
  /** File-denial observations whose known targets were omitted because the list is full. */
  deniedResourcesOmitted?: number;
  /** Known file-denial observations without an available, bounded structured target. */
  deniedResourcePathsUnavailable?: number;
  /** Requested file targets of calls without a terminal outcome; not attributed to denials. */
  unfinishedResources?: readonly ConsultingFileResource[];
  /** Unfinished file observations omitted because their target list is full. */
  unfinishedResourcesOmitted?: number;
  /** Unfinished file observations lacking a usable structured target. */
  unfinishedResourcePathsUnavailable?: number;
  eventCount?: number;
  terminalSeen?: boolean;
  terminalSucceeded?: boolean;
  exitCode?: number | null;
}

/** Safe failure categories that can leave a private Consulting Agent adapter. */
export type ConsultingAgentFailureKind = keyof typeof FAILURE_MESSAGES;

/**
 * A bounded failure with fixed reason text and extracted execution metadata, but no raw cause.
 * Permission denials are observations, not a claim about the cause of failure.
 */
export class ConsultingAgentError extends Error {
  readonly kind: ConsultingAgentFailureKind;
  readonly reason: ConsultingFailureReason | undefined;
  readonly diagnostics: ConsultingFailureDiagnostics | undefined;

  constructor(
    kind: ConsultingAgentFailureKind,
    options: { reason?: ConsultingFailureReason; diagnostics?: ConsultingFailureDiagnostics } = {},
  ) {
    const message = options.reason
      ? FAILURE_REASON_MESSAGES[options.reason]
      : FAILURE_MESSAGES[kind];
    const facts = options.diagnostics;
    const diagnostics: ConsultingFailureDiagnostics | undefined = facts
      ? {
          permissionDenials: facts.permissionDenials,
          ...(facts.permissionDenialsByOperation
            ? {
                permissionDenialsByOperation: sanitizeOperationCounts(
                  facts.permissionDenialsByOperation,
                ),
              }
            : {}),
          ...(facts.deniedFileAccessOutsideReadRoots === undefined
            ? {}
            : { deniedFileAccessOutsideReadRoots: facts.deniedFileAccessOutsideReadRoots }),
          ...(facts.deniedResources
            ? { deniedResources: sanitizeFileResources(facts.deniedResources) }
            : {}),
          deniedResourcesOmitted: facts.deniedResourcesOmitted,
          deniedResourcePathsUnavailable: facts.deniedResourcePathsUnavailable,
          ...(facts.unfinishedResources
            ? { unfinishedResources: sanitizeFileResources(facts.unfinishedResources) }
            : {}),
          unfinishedResourcesOmitted: facts.unfinishedResourcesOmitted,
          unfinishedResourcePathsUnavailable: facts.unfinishedResourcePathsUnavailable,
          eventCount: facts.eventCount,
          terminalSeen: facts.terminalSeen,
          terminalSucceeded: facts.terminalSucceeded,
          exitCode: facts.exitCode,
        }
      : undefined;
    super(`${message}${formatFailureContext(diagnostics)}`);
    this.name = "ConsultingAgentError";
    this.kind = kind;
    this.reason = options.reason;
    this.diagnostics = diagnostics;
  }
}

function sanitizeFileResources(
  resources: readonly ConsultingFileResource[],
): ConsultingFileResource[] {
  return resources
    .slice(0, MAX_FAILURE_RESOURCES)
    .flatMap((resource) =>
      (resource.operation === "file-read" || resource.operation === "file-write") &&
      typeof resource.requestedPath === "string" &&
      resource.requestedPath.length > 0 &&
      resource.requestedPath.length <= MAX_FAILURE_RESOURCE_PATH_CHARS
        ? [{ operation: resource.operation, requestedPath: resource.requestedPath }]
        : [],
    );
}

function sanitizeOperationCounts(
  counts: Partial<Record<ConsultingDeniedOperation, number>>,
): Partial<Record<ConsultingDeniedOperation, number>> {
  const result: Partial<Record<ConsultingDeniedOperation, number>> = {};
  for (const operation of DENIED_OPERATIONS) {
    const count = counts[operation];
    if (typeof count === "number" && Number.isSafeInteger(count) && count > 0) {
      result[operation] = count;
    }
  }
  return result;
}

function formatFailureContext(facts: ConsultingFailureDiagnostics | undefined): string {
  if (!facts) return "";
  const parts: string[] = [];
  if (facts.terminalSeen !== undefined) {
    const status = facts.terminalSeen
      ? facts.terminalSucceeded
        ? "success"
        : "unsuccessful"
      : "not observed";
    parts.push(`Agent terminal status: ${status}.`);
  }
  const denial = formatPermissionDenials(facts);
  if (denial) parts.push(denial);
  const unfinished = formatUnfinishedResources(facts);
  if (unfinished) parts.push(unfinished);
  return parts.length > 0 ? ` ${parts.join(" ")}` : "";
}

function formatPermissionDenials(facts: ConsultingFailureDiagnostics): string {
  if ((facts.permissionDenials ?? 0) === 0) return "";
  const parts = [`Observed permission denials: ${facts.permissionDenials}.`];
  const counts = Object.entries(facts.permissionDenialsByOperation ?? {});
  if (counts.length > 0) {
    parts.push(
      `Permission denials by operation: ${counts.map(([operation, count]) => `${operation}=${count}`).join(", ")}.`,
    );
  }
  if ((facts.deniedFileAccessOutsideReadRoots ?? 0) > 0) {
    parts.push(
      `Denied file access outside approved read roots: ${facts.deniedFileAccessOutsideReadRoots}.`,
    );
  }
  const resources = formatDeniedResources(facts);
  if (resources) parts.push(resources);
  parts.push("Permission denials are observations, not proof of the failure cause.");
  if (facts.permissionDenialsByOperation?.command) {
    parts.push("Workspace access does not grant command execution.");
  }
  parts.push(
    "Do not retry denied actions unchanged. Use permitted inspection tools and artifacts in approved read roots, or request a limited/blocked report.",
  );
  return parts.join(" ");
}

function quoteFileResources(resources: readonly ConsultingFileResource[]): string {
  return JSON.stringify(resources).replace(
    /[\u007f-\u009f\u2028\u2029]/g,
    (character) => `\\u${character.charCodeAt(0).toString(16).padStart(4, "0")}`,
  );
}

function formatUnfinishedResources(facts: ConsultingFailureDiagnostics): string {
  const parts: string[] = [];
  if (facts.unfinishedResources?.length) {
    parts.push(
      `Requested file targets of unfinished actions: ${quoteFileResources(facts.unfinishedResources)}.`,
    );
  }
  if ((facts.unfinishedResourcesOmitted ?? 0) > 0) {
    parts.push(
      `Additional unfinished file observations omitted: ${facts.unfinishedResourcesOmitted}.`,
    );
  }
  if ((facts.unfinishedResourcePathsUnavailable ?? 0) > 0) {
    parts.push(
      `Unfinished file observations with unavailable structured targets: ${facts.unfinishedResourcePathsUnavailable}.`,
    );
  }
  if (parts.length)
    parts.push("Unfinished file operations have unknown outcomes; they are not confirmed denials.");
  return parts.join(" ");
}

function formatDeniedResources(facts: ConsultingFailureDiagnostics): string {
  const parts: string[] = [];
  if (facts.deniedResources?.length) {
    const targets = quoteFileResources(facts.deniedResources);
    parts.push(`Requested file targets of denied actions: ${targets}.`);
  }
  if ((facts.deniedResourcesOmitted ?? 0) > 0) {
    parts.push(
      `Additional file-denial observations omitted from target list: ${facts.deniedResourcesOmitted}.`,
    );
  }
  if ((facts.deniedResourcePathsUnavailable ?? 0) > 0) {
    parts.push(
      `File-denial observations with unavailable structured targets: ${facts.deniedResourcePathsUnavailable}.`,
    );
  }
  return parts.join(" ");
}
