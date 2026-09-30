import { describe, expect, it } from "vitest";
import {
  CONSULTING_HANDLE_ENTRY_TYPE,
  ConversationHandleError,
  ConversationHandleStore,
} from "../../src/conversation/handles.ts";

const record = {
  handle: "consult_abcdef",
  agent: "antigravity",
  model: "model-v2",
  continuation: "opaque-state",
  canonicalWorkingDirectory: "/workspace",
  workspaceAccess: true,
  agentVersion: "agent-4",
  status: "active" as const,
};

describe("Conversation Handles", () => {
  it("rebuilds active and retired state from the current branch", () => {
    const store = new ConversationHandleStore();
    store.rebuild([
      {
        type: "custom",
        customType: CONSULTING_HANDLE_ENTRY_TYPE,
        data: { version: 1, action: "created", record },
      },
      {
        type: "custom",
        customType: CONSULTING_HANDLE_ENTRY_TYPE,
        data: { version: 1, action: "retired", handle: record.handle, reason: "failed" },
      },
    ]);
    expect(store.get(record.handle)?.status).toBe("retired");
    expect(() => store.acquire(record.handle, "antigravity")).toThrow(ConversationHandleError);
  });

  it("rejects unsupported agents and overlap without changing active state", () => {
    const store = new ConversationHandleStore();
    store.rebuild([
      {
        type: "custom",
        customType: CONSULTING_HANDLE_ENTRY_TYPE,
        data: { version: 1, action: "created", record },
      },
      {
        type: "custom",
        customType: CONSULTING_HANDLE_ENTRY_TYPE,
        data: {
          version: 1,
          action: "created",
          record: { ...record, handle: "consult_face01", agent: "other-agent" },
        },
      },
    ]);
    expect(() => store.acquire("consult_face01", "antigravity")).toThrow(
      /unsupported Consulting Agent/,
    );
    expect(() => store.acquire(record.handle, "antigravity")).not.toThrow();
    expect(() => store.acquire(record.handle, "antigravity")).toThrow(/already in use/);
    expect(store.get(record.handle)?.status).toBe("active");
    store.release(record.handle);
    expect(store.acquire(record.handle, "antigravity").continuation).toBe("opaque-state");
  });

  it("creates opaque handles that do not equal their continuation state", () => {
    const store = new ConversationHandleStore();
    const created = store.create({
      agent: record.agent,
      model: record.model,
      continuation: record.continuation,
      canonicalWorkingDirectory: record.canonicalWorkingDirectory,
      workspaceAccess: record.workspaceAccess,
      agentVersion: record.agentVersion,
    });
    expect(created.handle).toMatch(/^consult_[0-9a-f]+$/);
    expect(created.handle).not.toBe(created.continuation);
    expect(store.get(created.handle)?.status).toBe("active");
  });

  it("ignores legacy Antigravity entries and results without migrating them", () => {
    const store = new ConversationHandleStore();
    store.rebuild([
      {
        type: "custom",
        customType: "supi-antigravity-handle",
        data: { version: 1, action: "created", record },
      },
      {
        type: "message",
        message: {
          role: "toolResult",
          toolName: "antigravity_run",
          details: {
            handle: record.handle,
            rawAntigravityId: "legacy-id",
            model: "gemini-3.8-flash-low",
            workspaceAccess: true,
            cliVersion: "1.1.25",
            handleState: "active",
          },
        },
      },
    ]);
    expect(store.get(record.handle)).toBeUndefined();
  });

  it("rebuilds new handles from consulting_run result details", () => {
    const store = new ConversationHandleStore();
    store.rebuild([
      {
        type: "message",
        message: {
          role: "toolResult",
          toolName: "consulting_run",
          details: { ...record, handleState: "active" },
        },
      },
    ]);
    expect(store.get(record.handle)).toEqual(record);
  });
});
