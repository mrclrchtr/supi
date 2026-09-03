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
  toolInput,
  toolName,
} from "./event-values.ts";

interface PendingTool {
  name: string;
  urlHash?: string;
  pathHash?: string;
  observed?: boolean;
  denied?: boolean;
}

/**
 * Reduces parsed events to bounded execution facts. Raw events and tool payloads
 * are not retained after each event is processed.
 */
export class AntigravityEventAccumulator {
  readonly #workspaceDirectory: string | undefined;
  #pendingTools = new Map<string, PendingTool>();
  #conversationId: string | undefined;
  #candidate: Record<string, unknown> | undefined;
  #terminalSeen = false;
  #terminalSucceeded = false;
  #usage: AntigravityUsage | undefined;
  #toolNames: string[] = [];
  #toolCounts = new Map<string, number>();
  #successfulToolNames = new Set<string>();
  #permissionDenials = 0;
  #sourceHashes = new Set<string>();
  #workspacePathHashes = new Set<string>();

  constructor(options: { workspaceDirectory?: string } = {}) {
    this.#workspaceDirectory = options.workspaceDirectory;
  }

  /** Consume one already-parsed event. */
  consume(event: Record<string, unknown>): void {
    if (this.#terminalSeen)
      throw new Error("Antigravity returned events after its terminal event.");
    this.#conversationId = conversationId(event) ?? this.#conversationId;
    this.#usage = mergeUsage(this.#usage, readUsage(event));
    const nestedTools = consumeNestedToolBlocks(this, event);
    if (nestedTools) return;

    if (isToolStartEvent(event)) {
      this.#rememberToolStart(event);
      return;
    }
    if (isToolResultEvent(event)) {
      this.#consumeToolResult(event);
      return;
    }
    if (isTerminalEvent(event)) {
      this.#consumeTerminal(event);
      return;
    }

    const directName = toolName(event);
    if (directName && isSuccessfulActivity(event)) this.#recordSuccessfulTool(directName, event);
    if (directName && isPermissionDenial(event)) this.#recordObservedTool(directName);
    if (isPermissionDenial(event)) this.#permissionDenials += 1;
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

  /** Consume a nested tool block from an assistant or tool-result message. */
  consumeToolBlock(event: Record<string, unknown>): void {
    if (isToolStartEvent(event)) {
      this.#rememberToolStart(event);
      return;
    }
    if (isToolResultEvent(event)) this.#consumeToolResult(event);
  }

  #rememberToolStart(event: Record<string, unknown>): void {
    const name = toolName(event);
    if (!name) return;
    const input = toolInput(event) ?? event;
    const denied = isPermissionDenial(event);
    const pending: PendingTool = {
      name,
      observed: true,
      ...(extractUrl(input) ? { urlHash: hashEvidence(extractUrl(input) as string) } : {}),
      ...(extractWorkspacePath(input)
        ? { pathHash: this.#hashWorkspacePath(extractWorkspacePath(input) as string) }
        : {}),
      ...(denied ? { denied: true } : {}),
    };
    this.#recordObservedTool(name);
    const id = eventId(event);
    if (id) this.#pendingTools.set(id, pending);
    if (isSuccessfulActivity(event)) this.#recordSuccessfulTool(name, event, pending);
    if (isPermissionDenial(event)) this.#permissionDenials += 1;
  }

  #consumeToolResult(event: Record<string, unknown>): void {
    const id = eventId(event);
    const pending = id ? this.#pendingTools.get(id) : undefined;
    if (id) this.#pendingTools.delete(id);
    const name = toolName(event) ?? pending?.name;
    if (!name) return;
    const status = eventStatus(event);
    if (!pending?.observed) this.#recordObservedTool(name);
    if (isPermissionDenial(event) || isErrorStatus(status)) {
      if (isPermissionDenial(event) && !pending?.denied) this.#permissionDenials += 1;
      return;
    }
    if (!isSuccessStatus(status)) return;
    this.#recordSuccessfulTool(name, event, pending);
  }

  #recordObservedTool(name: string): void {
    this.#toolNames = this.#toolNames.includes(name) ? this.#toolNames : [...this.#toolNames, name];
    this.#toolCounts.set(name, (this.#toolCounts.get(name) ?? 0) + 1);
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
    if (!isToolStartEvent(block) && !isToolResultEvent(block)) continue;
    accumulator.consumeToolBlock(block);
    consumed = true;
  }
  return consumed;
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

function hashValue(value: string | undefined): string | undefined {
  return value ? hashEvidence(value) : undefined;
}

function normalizeWorkspacePath(value: string): string {
  return normalizePath(value.replaceAll("\\", "/")).replace(/^\.\//, "");
}

function readUsage(event: Record<string, unknown>): AntigravityUsage | undefined {
  const value = isRecord(event.usage)
    ? event.usage
    : isRecord(event.token_usage)
      ? event.token_usage
      : isRecord(event.tokenUsage)
        ? event.tokenUsage
        : undefined;
  if (!value) return undefined;
  const inputTokens = finiteToken(value.input_tokens ?? value.inputTokens ?? value.prompt_tokens);
  const outputTokens = finiteToken(
    value.output_tokens ?? value.outputTokens ?? value.completion_tokens,
  );
  const totalTokens = finiteToken(value.total_tokens ?? value.totalTokens ?? value.total);
  if (inputTokens === undefined && outputTokens === undefined && totalTokens === undefined)
    return undefined;
  return {
    ...(inputTokens === undefined ? {} : { inputTokens }),
    ...(outputTokens === undefined ? {} : { outputTokens }),
    ...(totalTokens === undefined ? {} : { totalTokens }),
  };
}

function finiteToken(value: unknown): number | undefined {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : undefined;
}

function mergeUsage(
  left: AntigravityUsage | undefined,
  right: AntigravityUsage | undefined,
): AntigravityUsage | undefined {
  if (!left) return right;
  if (!right) return left;
  return {
    ...(left.inputTokens === undefined && right.inputTokens === undefined
      ? {}
      : { inputTokens: right.inputTokens ?? left.inputTokens }),
    ...(left.outputTokens === undefined && right.outputTokens === undefined
      ? {}
      : { outputTokens: right.outputTokens ?? left.outputTokens }),
    ...(left.totalTokens === undefined && right.totalTokens === undefined
      ? {}
      : { totalTokens: right.totalTokens ?? left.totalTokens }),
  };
}
