import { isAbsolute, normalize as normalizePath, relative } from "node:path";
import { hashEvidence } from "../../../evidence-hash.ts";
import type { ConsultationUsage } from "../../../types.ts";
import type { ConsultingDeniedOperation, ConsultingFailureDiagnostics } from "../../errors.ts";
import { isWebToolName, isWorkspaceToolName } from "../activity.ts";
import { validateAntigravityAnswer } from "../structured-output.ts";
import type { AntigravityExecutionFacts } from "../types.ts";
import {
  answerCandidate,
  conversationId,
  eventId,
  eventStatus,
  eventType,
  extractUrl,
  extractWorkspacePath,
  isErrorStatus,
  isTerminalEvent,
  isToolResultEvent,
  isToolStartEvent,
  toolInput,
  toolName,
} from "./event-values.ts";
import {
  classifyDeniedOperation,
  classifyToolResult,
  type DiagnosticReadScope,
  FileResources,
  type FileTargetObservation,
  fileTargetUpdate,
  isPermissionDenial,
  terminalDeniedOperations,
} from "./permission-diagnostics.ts";
import {
  hasExplicitSuccess,
  isNonToolStepUpdate,
  isSuccessfulActivity,
  nestedToolEvents,
  normalizeProtocolEvent,
} from "./protocol.ts";
import { AntigravityResponseError } from "./response-error.ts";
import { mergeUsage, readUsage } from "./usage.ts";

interface PendingTool extends FileTargetObservation {
  name: string;
  urlHash?: string;
  pathHash?: string;
  observed?: boolean;
  denied?: boolean;
}

const MAX_COMPLETED_TOOL_IDS = 4_096;

/**
 * Reduces parsed events to bounded execution facts. Raw events and tool payloads
 * are not retained; only bounded structured requested file targets survive pending calls.
 */
export class AntigravityEventAccumulator {
  readonly #workspaceDirectory: string | undefined;
  readonly #readScope: DiagnosticReadScope;
  readonly #expectedResponseToken: string | undefined;
  #pendingTools = new Map<string, PendingTool>();
  #completedToolIds = new Set<string>();
  #conversationId: string | undefined;
  #candidate: Record<string, unknown> | undefined;
  #terminalSeen = false;
  #terminalSucceeded = false;
  #usage: ConsultationUsage | undefined;
  #toolNames: string[] = [];
  #toolCounts = new Map<string, number>();
  #successfulToolNames = new Set<string>();
  #permissionDenials = 0;
  #permissionDenialsByOperation: Partial<Record<ConsultingDeniedOperation, number>> = {};
  #deniedFileAccessOutsideReadRoots = 0;
  #deniedFileResources = new FileResources();
  #unattributedPermissionDenialSeen = false;
  #sourceHashes = new Set<string>();
  #workspacePathHashes = new Set<string>();

  constructor(options: DiagnosticReadScope & { expectedResponseToken?: string } = {}) {
    this.#workspaceDirectory = options.workspaceDirectory;
    this.#readScope = options;
    this.#expectedResponseToken = options.expectedResponseToken;
  }

  /** Consume one already-parsed event. */
  consume(event: Record<string, unknown>): void {
    if (this.#terminalSeen) throw new AntigravityResponseError("events-after-terminal");
    const normalizedEvent = normalizeProtocolEvent(event);
    this.#conversationId =
      conversationId(event) ?? conversationId(normalizedEvent) ?? this.#conversationId;
    this.#usage = mergeUsage(this.#usage, mergeUsage(readUsage(event), readUsage(normalizedEvent)));
    const terminal = isTerminalEvent(normalizedEvent);
    const nestedTools = nestedToolEvents(normalizedEvent);
    for (const toolEvent of nestedTools) this.consume(toolEvent);
    if (nestedTools.length && !terminal) return;

    if (isToolStartEvent(normalizedEvent)) {
      this.#rememberToolStart(normalizedEvent);
      return;
    }
    if (isToolResultEvent(normalizedEvent)) {
      this.#consumeToolResult(normalizedEvent);
      return;
    }
    if (terminal) {
      this.#consumeTerminal(normalizedEvent);
      return;
    }

    this.#consumeActivity(normalizedEvent);
  }

  /** Return safe execution facts even when the response is incomplete. */
  get diagnostics(): ConsultingFailureDiagnostics {
    const denied = this.#deniedFileResources.snapshot;
    const unfinished = new FileResources();
    for (const pending of this.#pendingTools.values()) {
      if (!pending.denied)
        unfinished.record(classifyDeniedOperation(pending.name), pending.requestedResource);
    }
    const pending = unfinished.snapshot;
    return {
      permissionDenials: this.#permissionDenials,
      permissionDenialsByOperation: { ...this.#permissionDenialsByOperation },
      deniedFileAccessOutsideReadRoots: this.#deniedFileAccessOutsideReadRoots,
      deniedResources: denied.resources,
      deniedResourcesOmitted: denied.omitted,
      deniedResourcePathsUnavailable: denied.unavailable,
      unfinishedResources: pending.resources,
      unfinishedResourcesOmitted: pending.omitted,
      unfinishedResourcePathsUnavailable: pending.unavailable,
      terminalSeen: this.#terminalSeen,
      terminalSucceeded: this.#terminalSucceeded,
    };
  }

  /** Finish the reduction and validate terminal structured output. */
  finish(): AntigravityExecutionFacts {
    if (!this.#terminalSeen) throw new AntigravityResponseError("missing-terminal");
    if (!this.#terminalSucceeded) throw new AntigravityResponseError("terminal-failed");
    if (!this.#candidate) throw new AntigravityResponseError("missing-answer");
    if (!this.#conversationId) throw new AntigravityResponseError("missing-conversation");
    const { responseToken, ...candidate } = this.#candidate;
    const answer = validateAntigravityAnswer(candidate);
    if (
      this.#expectedResponseToken !== undefined &&
      responseToken !== this.#expectedResponseToken
    ) {
      throw new AntigravityResponseError("unbound-answer");
    }
    return {
      answer,
      conversationId: this.#conversationId,
      ...(this.#usage ? { usage: this.#usage } : {}),
      observedToolNames: [...this.#toolNames],
      observedToolCounts: Object.fromEntries(this.#toolCounts),
      successfulToolNames: [...this.#successfulToolNames],
      permissionDenials: this.#permissionDenials,
      observedSourceHashes: [...this.#sourceHashes],
      observedWorkspacePathHashes: [...this.#workspacePathHashes],
    };
  }

  #consumeActivity(event: Record<string, unknown>): void {
    if (isNonToolStepUpdate(event)) return;
    const id = eventId(event);
    if (id && this.#completedToolIds.has(id)) return;
    let pending = this.#pendingTools.get(id ?? "");
    const name = toolName(event) ?? pending?.name;
    if (name && eventType(event) === "step_update") {
      pending = this.#recordPendingToolResult(id, name, event, pending);
    }
    if (isPermissionDenial(event)) {
      this.#observeDeniedActivity(name, event, pending);
    } else if (name) {
      this.#observeExplicitOutcome(name, event, pending);
    }
  }

  #observeDeniedActivity(
    name: string | undefined,
    event: Record<string, unknown>,
    pending?: PendingTool,
  ): void {
    const counted = name
      ? this.#recordPermissionDenial(name, event, pending)
      : this.#recordUnattributedPermissionDenial();
    if (counted) this.#countPermissionDenial(name, event, pending);
    if (isErrorStatus(eventStatus(event))) this.#completeToolResult(eventId(event));
  }

  #observeExplicitOutcome(
    name: string,
    event: Record<string, unknown>,
    pending?: PendingTool,
  ): void {
    const successful = isSuccessfulActivity(event);
    if (successful) this.#recordSuccessfulTool(name, event, pending);
    if (successful || isErrorStatus(eventStatus(event))) this.#completeToolResult(eventId(event));
  }

  #rememberToolStart(event: Record<string, unknown>): void {
    const name = toolName(event);
    if (!name) return;
    const input = toolInput(event) ?? event;
    const denied = isPermissionDenial(event);
    const urlHash = hashValue(extractUrl(input));
    const path = extractWorkspacePath(input);
    const pathHash = path ? this.#hashWorkspacePath(path) : undefined;
    const id = eventId(event);
    if (id) this.#completedToolIds.delete(id);
    const previous = id ? this.#pendingTools.get(id) : undefined;
    const pending = mergePendingTool(
      {
        name,
        observed: true,
        ...(urlHash ? { urlHash } : {}),
        ...(pathHash ? { pathHash } : {}),
        ...fileTargetUpdate(name, event, this.#readScope, previous),
        ...(denied ? { denied: true } : {}),
      },
      previous,
    );
    if (!previous) this.#recordObservedTool(name);
    if (id) this.#pendingTools.set(id, pending);
    if (denied && !previous?.denied) this.#countPermissionDenial(name, event, pending);
    if (!denied) this.#observeExplicitOutcome(name, event, pending);
  }

  #consumeToolResult(event: Record<string, unknown>): void {
    const id = eventId(event);
    // Without an ID, each result is a distinct observation because duplicates are unknowable.
    if (id && this.#completedToolIds.has(id)) return;
    const pending = id ? this.#pendingTools.get(id) : undefined;
    const name = toolName(event) ?? pending?.name;
    if (!name) return;
    const classification = classifyToolResult(event);
    if (classification.kind === "pending") {
      this.#recordPendingToolResult(id, name, event, pending);
      return;
    }
    if (id) this.#completeToolResult(id);
    if (classification.kind === "failure") {
      if (classification.denied && !pending?.denied)
        this.#countPermissionDenial(name, event, pending);
      if (!pending?.observed) this.#recordObservedTool(name);
      return;
    }
    this.#recordSuccessfulTool(name, event, pending);
  }

  #recordPendingToolResult(
    id: string | undefined,
    name: string,
    event: Record<string, unknown>,
    pending: PendingTool | undefined,
  ): PendingTool {
    if (!pending?.observed) this.#recordObservedTool(name);
    const updated = {
      ...pending,
      name,
      observed: true,
      ...fileTargetUpdate(name, event, this.#readScope, pending),
    };
    if (id) this.#pendingTools.set(id, updated);
    return updated;
  }

  #completeToolResult(id: string | undefined): void {
    if (!id) return;
    this.#pendingTools.delete(id);
    this.#rememberCompletedToolId(id);
  }

  #countPermissionDenial(
    name: string | undefined,
    event: Record<string, unknown>,
    pending?: PendingTool,
  ): void {
    this.#permissionDenials += 1;
    const operation = classifyDeniedOperation(name);
    this.#permissionDenialsByOperation[operation] =
      (this.#permissionDenialsByOperation[operation] ?? 0) + 1;
    const started = pending ?? this.#pendingTools.get(eventId(event) ?? "");
    const target = fileTargetUpdate(name, event, this.#readScope, started);
    this.#deniedFileResources.record(operation, target.requestedResource);
    if (target.outsideReadRoots) {
      this.#deniedFileAccessOutsideReadRoots += 1;
    }
  }

  #rememberCompletedToolId(id: string): void {
    this.#completedToolIds.add(id);
    if (this.#completedToolIds.size <= MAX_COMPLETED_TOOL_IDS) return;
    const oldest = this.#completedToolIds.values().next().value;
    if (typeof oldest === "string") this.#completedToolIds.delete(oldest);
  }

  #recordObservedTool(name: string): void {
    this.#toolNames = this.#toolNames.includes(name) ? this.#toolNames : [...this.#toolNames, name];
    this.#toolCounts.set(name, (this.#toolCounts.get(name) ?? 0) + 1);
  }

  #recordUnattributedPermissionDenial(): boolean {
    if (this.#unattributedPermissionDenialSeen) return false;
    this.#unattributedPermissionDenialSeen = true;
    return true;
  }

  #recordPermissionDenial(
    name: string,
    event: Record<string, unknown>,
    observation?: PendingTool,
  ): boolean {
    const id = eventId(event);
    if (id && this.#completedToolIds.has(id)) return false;
    const pending = observation ?? (id ? this.#pendingTools.get(id) : undefined);
    if (pending?.denied) return false;
    if (!pending?.observed) this.#recordObservedTool(name);
    if (id) {
      if (pending) pending.denied = true;
      else this.#pendingTools.set(id, { name, observed: true, denied: true });
    }
    return true;
  }

  #recordSuccessfulTool(name: string, event: Record<string, unknown>, pending?: PendingTool): void {
    if (!pending?.observed) this.#recordObservedTool(name);
    this.#successfulToolNames.add(name);
    const input = toolInput(event) ?? event;
    const sourceHash = pending?.urlHash ?? hashValue(extractUrl(input));
    const pathHash = pending?.pathHash ?? this.#hashWorkspacePathValue(extractWorkspacePath(input));
    if (sourceHash && isWebToolName(name)) this.#sourceHashes.add(sourceHash);
    if (pathHash && isWorkspaceToolName(name)) this.#workspacePathHashes.add(pathHash);
  }

  #hashWorkspacePath(value: string): string {
    return hashEvidence(this.#normalizeWorkspacePath(value));
  }

  #hashWorkspacePathValue(value: string | undefined): string | undefined {
    return value ? this.#hashWorkspacePath(value) : undefined;
  }

  #normalizeWorkspacePath(value: string): string {
    const normalized = value.replaceAll("\\", "/");
    if (this.#workspaceDirectory && isAbsolute(normalized)) {
      const distance = relative(this.#workspaceDirectory, normalized);
      if (distance && distance !== ".." && !distance.startsWith("../")) {
        return normalizeWorkspacePath(distance);
      }
    }
    return normalizeWorkspacePath(normalized);
  }

  /** Terminal summaries prove an operation was denied, but supply no call IDs or targets. */
  #consumeTerminalDenials(event: Record<string, unknown>): void {
    const operations = terminalDeniedOperations(event);
    // The generic notice may describe the same denial as the terminal summary.
    // Keep a conservative lower bound without attributing it to a particular call.
    if (operations.size && this.#unattributedPermissionDenialSeen) {
      this.#permissionDenials -= 1;
      const other = (this.#permissionDenialsByOperation.other ?? 1) - 1;
      if (other) this.#permissionDenialsByOperation.other = other;
      else delete this.#permissionDenialsByOperation.other;
    }
    for (const [operation, name] of operations) {
      if (!this.#permissionDenialsByOperation[operation]) {
        this.#countPermissionDenial(name, {});
      }
    }
  }

  #consumeTerminal(event: Record<string, unknown>): void {
    this.#terminalSeen = true;
    this.#consumeTerminalDenials(event);
    const status = eventStatus(event);
    if (isErrorStatus(status) || !hasExplicitSuccess(event, status)) {
      throw new AntigravityResponseError("terminal-failed");
    }
    this.#terminalSucceeded = true;
    this.#candidate = answerCandidate(event);
    this.#conversationId = conversationId(event) ?? this.#conversationId;
  }
}

function mergePendingTool(current: PendingTool, previous: PendingTool | undefined): PendingTool {
  if (previous?.urlHash && !current.urlHash) current.urlHash = previous.urlHash;
  if (previous?.pathHash && !current.pathHash) current.pathHash = previous.pathHash;
  if (previous?.denied) current.denied = true;
  return current;
}

function hashValue(value: string | undefined): string | undefined {
  return value ? hashEvidence(value) : undefined;
}

function normalizeWorkspacePath(value: string): string {
  return normalizePath(value.replaceAll("\\", "/")).replace(/^\.\//, "");
}
