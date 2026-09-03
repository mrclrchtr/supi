import { isAbsolute, normalize as normalizePath, relative } from "node:path";
import { isWebToolName, isWorkspaceToolName } from "../activity.ts";
import { validateAntigravityAnswer } from "../structured-output.ts";
import type { AntigravityExecutionFacts, AntigravityUsage } from "../types.ts";
import {
  answerCandidate,
  conversationId,
  eventId,
  eventStatus,
  eventType,
  extractUrl,
  extractWorkspacePath,
  hashEvidence,
  isErrorStatus,
  isRecord,
  isSuccessStatus,
  isTerminalEvent,
  isToolResultEvent,
  isToolStartEvent,
  safeString,
  toolInput,
  toolName,
} from "./event-values.ts";
import { normalizeProtocolEvent } from "./protocol.ts";
import { mergeUsage, readUsage } from "./usage.ts";

interface PendingTool {
  name: string;
  urlHash?: string;
  pathHash?: string;
  observed?: boolean;
  denied?: boolean;
}

interface ToolResultClassification {
  kind: "pending" | "failure" | "success";
  denied: boolean;
}

const MAX_COMPLETED_TOOL_IDS = 4_096;

/**
 * Reduces parsed events to bounded execution facts. Raw events and tool payloads
 * are not retained after each event is processed.
 */
export class AntigravityEventAccumulator {
  readonly #workspaceDirectory: string | undefined;
  #pendingTools = new Map<string, PendingTool>();
  #completedToolIds = new Set<string>();
  #conversationId: string | undefined;
  #candidate: Record<string, unknown> | undefined;
  #terminalSeen = false;
  #terminalSucceeded = false;
  #usage: AntigravityUsage | undefined;
  #toolNames: string[] = [];
  #toolCounts = new Map<string, number>();
  #successfulToolNames = new Set<string>();
  #permissionDenials = 0;
  #unattributedPermissionDenialSeen = false;
  #sourceHashes = new Set<string>();
  #workspacePathHashes = new Set<string>();

  constructor(options: { workspaceDirectory?: string } = {}) {
    this.#workspaceDirectory = options.workspaceDirectory;
  }

  /** Consume one already-parsed event. */
  consume(event: Record<string, unknown>): void {
    if (this.#terminalSeen)
      throw new Error("Antigravity returned events after its terminal event.");
    const normalizedEvent = normalizeProtocolEvent(event);
    this.#conversationId =
      conversationId(event) ?? conversationId(normalizedEvent) ?? this.#conversationId;
    this.#usage = mergeUsage(this.#usage, mergeUsage(readUsage(event), readUsage(normalizedEvent)));
    const terminal = isTerminalEvent(normalizedEvent);
    const nestedTools = consumeNestedToolBlocks(this, normalizedEvent);
    if (nestedTools && !terminal) return;

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

    const directName = toolName(normalizedEvent);
    if (directName && isSuccessfulActivity(normalizedEvent)) {
      this.#recordSuccessfulTool(directName, normalizedEvent);
    }
    const denied = isPermissionDenial(normalizedEvent);
    if (denied && !isNonToolStepUpdate(normalizedEvent)) {
      const counted = directName
        ? this.#recordPermissionDenial(directName, normalizedEvent)
        : this.#recordUnattributedPermissionDenial();
      if (counted) this.#permissionDenials += 1;
    }
  }

  /** Finish the reduction and validate terminal structured output. */
  finish(): AntigravityExecutionFacts {
    if (!this.#terminalSeen || !this.#terminalSucceeded) {
      throw new Error("Antigravity did not return a successful terminal event.");
    }
    if (!this.#candidate)
      throw new Error("Antigravity terminal output was missing structured data.");
    if (!this.#conversationId) throw new Error("Antigravity did not return a conversation handle.");
    return {
      answer: validateAntigravityAnswer(this.#candidate),
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
        ...(denied ? { denied: true } : {}),
      },
      previous,
    );
    if (!previous) this.#recordObservedTool(name);
    if (id) this.#pendingTools.set(id, pending);
    if (isSuccessfulActivity(event)) this.#recordSuccessfulTool(name, event, pending);
    if (denied && !previous?.denied) this.#permissionDenials += 1;
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
      this.#recordPendingToolResult(id, name, pending);
      return;
    }
    if (id) this.#completeToolResult(id);
    if (classification.kind === "failure") {
      this.#recordFailedToolResult(name, pending, classification.denied);
      return;
    }
    this.#recordSuccessfulTool(name, event, pending);
  }

  #recordPendingToolResult(
    id: string | undefined,
    name: string,
    pending: PendingTool | undefined,
  ): void {
    if (!pending?.observed) this.#recordObservedTool(name);
    if (id && !pending) this.#pendingTools.set(id, { name, observed: true });
  }

  #completeToolResult(id: string): void {
    this.#pendingTools.delete(id);
    this.#rememberCompletedToolId(id);
  }

  #recordFailedToolResult(name: string, pending: PendingTool | undefined, denied: boolean): void {
    if (denied && !pending?.denied) this.#permissionDenials += 1;
    if (!pending?.observed) this.#recordObservedTool(name);
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

  #recordPermissionDenial(name: string, event: Record<string, unknown>): boolean {
    const id = eventId(event);
    if (id && this.#completedToolIds.has(id)) return false;
    const pending = id ? this.#pendingTools.get(id) : undefined;
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

  #consumeTerminal(event: Record<string, unknown>): void {
    this.#terminalSeen = true;
    const status = eventStatus(event);
    if (isErrorStatus(status) || !hasExplicitSuccess(event, status)) {
      throw new Error("Antigravity returned a non-success terminal status.");
    }
    this.#terminalSucceeded = true;
    this.#candidate = answerCandidate(event);
    this.#conversationId = conversationId(event) ?? this.#conversationId;
  }
}

function consumeNestedToolBlocks(
  accumulator: AntigravityEventAccumulator,
  event: Record<string, unknown>,
): boolean {
  const message = isRecord(event.message) ? event.message : undefined;
  const content = message?.content;
  if (!Array.isArray(content)) return false;
  let consumed = false;
  for (const block of content) {
    if (!isRecord(block)) continue;
    const normalizedBlock = normalizeProtocolEvent(block);
    if (!isToolActivityBlock(normalizedBlock)) continue;
    accumulator.consume(normalizedBlock);
    consumed = true;
  }
  return consumed;
}

function isToolActivityBlock(event: Record<string, unknown>): boolean {
  if (isToolStartEvent(event) || isToolResultEvent(event)) return true;
  return eventType(event) === "step_update" && !isNonToolStepUpdate(event);
}

function hasExplicitSuccess(event: Record<string, unknown>, status: string | undefined): boolean {
  return status !== undefined
    ? isSuccessStatus(status)
    : event.is_error === false || event.isError === false || event.success === true;
}

function isSuccessfulActivity(event: Record<string, unknown>): boolean {
  const status = eventStatus(event);
  return (
    !isErrorStatus(status) &&
    isSuccessStatus(status) &&
    (status !== undefined || event.success === true || event.ok === true)
  );
}

function isNonToolStepUpdate(event: Record<string, unknown>): boolean {
  const type = eventType(event);
  if (!["assistant", "step_update"].includes(type)) return false;
  const declaredType = safeString(event.step_type ?? event.stepType, 40)?.toLowerCase();
  if (declaredType) return declaredType !== "tool";
  return toolName(event) === undefined && !isRecord(event.tool_info) && !isRecord(event.toolInfo);
}

function classifyToolResult(event: Record<string, unknown>): ToolResultClassification {
  const status = eventStatus(event);
  const denied = isPermissionDenial(event);
  if (denied || isErrorStatus(status)) return { kind: "failure", denied };
  return { kind: isSuccessStatus(status) ? "success" : "pending", denied };
}

function isPermissionDenial(event: Record<string, unknown>): boolean {
  const status = eventStatus(event);
  if (["denied", "permission_denied", "forbidden", "blocked"].includes(status ?? "")) return true;
  const type = eventType(event);
  if (type.includes("permission") || type.includes("denied") || type.includes("blocked"))
    return true;
  const hasExplicitFailure =
    event.is_error === true ||
    event.isError === true ||
    isErrorStatus(status) ||
    event.error !== undefined ||
    event.reason !== undefined;
  if (!hasExplicitFailure) return false;
  const message = [event.error, event.reason, event.message, event.content]
    .map((value) => safeDenialText(value))
    .join(" ")
    .toLowerCase();
  return message.includes("permission") || message.includes("denied");
}

function safeDenialText(value: unknown, depth = 0): string {
  if (depth > 3) return "";
  if (typeof value === "string") return value.slice(0, 4_000);
  if (Array.isArray(value)) {
    return value
      .slice(0, 20)
      .map((item) => safeDenialText(item, depth + 1))
      .join(" ");
  }
  if (!isRecord(value)) return "";
  return ["text", "message", "content", "error", "reason"]
    .map((key) => safeDenialText(value[key], depth + 1))
    .join(" ");
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
