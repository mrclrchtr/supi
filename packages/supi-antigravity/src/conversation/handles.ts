import { randomUUID } from "node:crypto";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { type ConversationHandleRecord, isCuratedModel } from "../types.ts";

/** Private custom-entry type used to rebuild handles on the active PI branch. */
export const ANTIGRAVITY_HANDLE_ENTRY_TYPE = "supi-antigravity-handle";

interface PersistedHandleEntry {
  version: 1;
  action: "created" | "retired";
  record?: ConversationHandleRecord;
  handle?: string;
  reason?: string;
}

/** Preflight failure for a Conversation Handle request. */
export class ConversationHandleError extends Error {
  readonly code: "unknown" | "retired" | "busy";

  constructor(code: ConversationHandleError["code"]) {
    const message =
      code === "unknown"
        ? "Unknown Antigravity Conversation Handle."
        : code === "retired"
          ? "That Antigravity Conversation Handle is retired."
          : "That Antigravity Conversation Handle is already in use.";
    super(message);
    this.name = "ConversationHandleError";
    this.code = code;
  }
}

/** Session-local Conversation Handle state with branch-aware reconstruction. */
export class ConversationHandleStore {
  #records = new Map<string, ConversationHandleRecord>();
  #busy = new Set<string>();

  /** Rebuild active and retired handles from one current PI branch. */
  rebuild(branch: readonly unknown[]): void {
    this.#records.clear();
    this.#busy.clear();
    for (const entry of branch) {
      this.#consumeEntry(entry);
    }
  }

  /** Create a new opaque handle for a successful Antigravity Run. */
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

  /** Acquire a handle for one follow-up, rejecting overlap before process startup. */
  acquire(handle: string): ConversationHandleRecord {
    const record = this.#records.get(handle);
    if (!record) throw new ConversationHandleError("unknown");
    if (record.status === "retired") throw new ConversationHandleError("retired");
    if (this.#busy.has(handle)) throw new ConversationHandleError("busy");
    this.#busy.add(handle);
    return record;
  }

  /** Release a successfully completed or pre-process follow-up. */
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
    if (entry.type === "custom" && entry.customType === ANTIGRAVITY_HANDLE_ENTRY_TYPE) {
      this.#consumePersistedData(entry.data);
      return;
    }
    if (entry.type === "message" && isRecord(entry.message)) {
      const message = entry.message;
      if (message.role === "toolResult" && message.toolName === "antigravity_run") {
        this.#consumeResultDetails(message.details);
      }
    }
  }

  #consumePersistedData(value: unknown): void {
    if (!isRecord(value) || value.version !== 1) return;
    const action = value.action;
    if (action === "created" && isHandleRecord(value.record)) {
      this.#records.set(value.record.handle, Object.freeze({ ...value.record }));
      return;
    }
    if (action === "retired" && typeof value.handle === "string") {
      this.retire(value.handle);
    }
  }

  #consumeResultDetails(value: unknown): void {
    if (!isRecord(value)) return;
    const record = {
      handle: value.handle,
      rawAntigravityId: value.rawAntigravityId,
      model: value.model,
      canonicalWorkingDirectory: value.canonicalWorkingDirectory,
      workspaceAccess: value.workspaceAccess,
      cliVersion: value.cliVersion,
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
  pi.appendEntry(ANTIGRAVITY_HANDLE_ENTRY_TYPE, data);
}

/** Persist a branch-aware retirement without exposing the raw ID to the model. */
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
  pi.appendEntry(ANTIGRAVITY_HANDLE_ENTRY_TYPE, data);
}

function createOpaqueHandle(): string {
  return `agy_${randomUUID().replaceAll("-", "")}`;
}

function isHandleRecord(value: unknown): value is ConversationHandleRecord {
  if (!isRecord(value)) return false;
  return (
    typeof value.handle === "string" &&
    value.handle.length > 0 &&
    typeof value.rawAntigravityId === "string" &&
    value.rawAntigravityId.length > 0 &&
    isCuratedModel(value.model) &&
    typeof value.canonicalWorkingDirectory === "string" &&
    typeof value.workspaceAccess === "boolean" &&
    typeof value.cliVersion === "string" &&
    (value.status === "active" || value.status === "retired")
  );
}

function boundedReason(value: string): string {
  return value.replace(/\s+/g, " ").trim().slice(0, 200) || "follow-up failed";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
