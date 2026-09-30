import { randomUUID } from "node:crypto";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { ConversationHandleRecord } from "../types.ts";

/** Private custom-entry type used to rebuild handles on the active PI branch. */
export const CONSULTING_HANDLE_ENTRY_TYPE = "supi-consulting-handle";

interface PersistedHandleEntry {
  version: 1;
  action: "created" | "retired";
  record?: ConversationHandleRecord;
  handle?: string;
  reason?: string;
}

/** Preflight failure for a Conversation Handle request. */
export class ConversationHandleError extends Error {
  readonly code: "unknown" | "retired" | "busy" | "unsupported-agent";

  constructor(code: ConversationHandleError["code"]) {
    const messages = {
      unknown: "Unknown Conversation Handle.",
      retired: "That Conversation Handle is retired.",
      busy: "That Conversation Handle is already in use.",
      "unsupported-agent": "That Conversation Handle belongs to an unsupported Consulting Agent.",
    };
    super(messages[code]);
    this.name = "ConversationHandleError";
    this.code = code;
  }
}

/** Session-local Conversation Handle state with branch-aware reconstruction. */
export class ConversationHandleStore {
  #records = new Map<string, ConversationHandleRecord>();
  #busy = new Set<string>();

  /** Rebuild valid handles from one current PI branch. */
  rebuild(branch: readonly unknown[]): void {
    this.#records.clear();
    this.#busy.clear();
    for (const entry of branch) this.#consumeEntry(entry);
  }

  /** Create a new opaque Conversation Handle after a successful Consultation. */
  create(record: Omit<ConversationHandleRecord, "handle" | "status">): ConversationHandleRecord {
    const created: ConversationHandleRecord = Object.freeze({
      ...record,
      handle: createOpaqueHandle(),
      status: "active",
    });
    this.#records.set(created.handle, created);
    return created;
  }

  /** Return a handle record without changing its state. */
  get(handle: string): ConversationHandleRecord | undefined {
    return this.#records.get(handle);
  }

  /** Acquire a handle after rejecting unknown, unsupported, retired, or busy state. */
  acquire(handle: string, supportedAgent: string): ConversationHandleRecord {
    const record = this.#records.get(handle);
    if (!record) throw new ConversationHandleError("unknown");
    if (record.agent !== supportedAgent) throw new ConversationHandleError("unsupported-agent");
    if (record.status === "retired") throw new ConversationHandleError("retired");
    if (this.#busy.has(handle)) throw new ConversationHandleError("busy");
    this.#busy.add(handle);
    return record;
  }

  /** Release a completed or pre-process follow-up. */
  release(handle: string): void {
    this.#busy.delete(handle);
  }

  /** Retire a handle after a started follow-up fails or is canceled. */
  retire(handle: string): ConversationHandleRecord | undefined {
    const record = this.#records.get(handle);
    if (!record) return undefined;
    const retired = Object.freeze({ ...record, status: "retired" as const });
    this.#records.set(handle, retired);
    this.#busy.delete(handle);
    return retired;
  }

  /** Clear all state when the extension instance shuts down. */
  clear(): void {
    this.#records.clear();
    this.#busy.clear();
  }

  #consumeEntry(entry: unknown): void {
    if (!isRecord(entry)) return;
    if (entry.type === "custom" && entry.customType === CONSULTING_HANDLE_ENTRY_TYPE) {
      this.#consumePersistedData(entry.data);
      return;
    }
    if (entry.type === "message" && isRecord(entry.message)) {
      const message = entry.message;
      if (message.role === "toolResult" && message.toolName === "consulting_run") {
        this.#consumeResultDetails(message.details);
      }
    }
  }

  #consumePersistedData(value: unknown): void {
    if (!isRecord(value) || value.version !== 1) return;
    if (value.action === "created" && isHandleRecord(value.record)) {
      this.#records.set(value.record.handle, Object.freeze({ ...value.record }));
      return;
    }
    if (value.action === "retired" && typeof value.handle === "string") {
      this.retire(value.handle);
    }
  }

  #consumeResultDetails(value: unknown): void {
    if (!isRecord(value)) return;
    const record = {
      handle: value.handle,
      agent: value.agent,
      model: value.model,
      continuation: value.continuation,
      canonicalWorkingDirectory: value.canonicalWorkingDirectory,
      workspaceAccess: value.workspaceAccess,
      agentVersion: value.agentVersion,
      status: value.handleState,
    };
    if (isHandleRecord(record) && !this.#records.has(record.handle)) {
      this.#records.set(record.handle, Object.freeze({ ...record }));
    }
  }
}

/** Persist a successful handle without adding model-visible content. */
export function appendHandleCreated(pi: ExtensionAPI, record: ConversationHandleRecord): void {
  const data: PersistedHandleEntry = { version: 1, action: "created", record };
  pi.appendEntry(CONSULTING_HANDLE_ENTRY_TYPE, data);
}

/** Persist a branch-aware retirement without exposing continuation state as model text. */
export function appendHandleRetired(
  pi: ExtensionAPI,
  record: ConversationHandleRecord,
  reason: string,
): void {
  const data: PersistedHandleEntry = {
    version: 1,
    action: "retired",
    handle: record.handle,
    reason: boundedReason(reason),
  };
  pi.appendEntry(CONSULTING_HANDLE_ENTRY_TYPE, data);
}

function createOpaqueHandle(): string {
  return `consult_${randomUUID().replaceAll("-", "")}`;
}

function isHandleRecord(value: unknown): value is ConversationHandleRecord {
  if (!isRecord(value)) return false;
  return (
    typeof value.handle === "string" &&
    /^consult_[0-9a-f]+$/i.test(value.handle) &&
    typeof value.agent === "string" &&
    value.agent.length > 0 &&
    typeof value.model === "string" &&
    value.model.length > 0 &&
    typeof value.continuation === "string" &&
    value.continuation.length > 0 &&
    value.continuation.length <= 1_000 &&
    typeof value.canonicalWorkingDirectory === "string" &&
    value.canonicalWorkingDirectory.length > 0 &&
    typeof value.workspaceAccess === "boolean" &&
    typeof value.agentVersion === "string" &&
    (value.status === "active" || value.status === "retired")
  );
}

function boundedReason(value: string): string {
  return value.replace(/\s+/g, " ").trim().slice(0, 200) || "follow-up failed";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
