import { describe, expect, it } from "vitest";
import {
  ANTIGRAVITY_HANDLE_ENTRY_TYPE,
  ConversationHandleError,
  ConversationHandleStore,
} from "../../src/conversation/handles.ts";

const record = {
  handle: "agy_saved",
  rawAntigravityId: "raw-conversation",
  model: "gemini-3.8-flash-low" as const,
  canonicalWorkingDirectory: "/workspace",
  workspaceAccess: true,
  cliVersion: "1.1.25",
  status: "active" as const,
};

describe("Antigravity Conversation Handles", () => {
  it("rebuilds active and retired state from the current branch", () => {
    const store = new ConversationHandleStore();
    store.rebuild([
      {
        type: "custom",
        customType: ANTIGRAVITY_HANDLE_ENTRY_TYPE,
        data: { version: 1, action: "created", record },
      },
      {
        type: "custom",
        customType: ANTIGRAVITY_HANDLE_ENTRY_TYPE,
        data: { version: 1, action: "retired", handle: record.handle, reason: "failed" },
      },
    ]);
    expect(store.get(record.handle)?.status).toBe("retired");
    expect(() => store.acquire(record.handle)).toThrow(ConversationHandleError);
  });

  it("rejects overlap without changing the handle status", () => {
    const store = new ConversationHandleStore();
    store.rebuild([
      {
        type: "custom",
        customType: ANTIGRAVITY_HANDLE_ENTRY_TYPE,
        data: { version: 1, action: "created", record },
      },
    ]);
    store.acquire(record.handle);
    expect(() => store.acquire(record.handle)).toThrow(/already in use/);
    expect(store.get(record.handle)?.status).toBe("active");
    store.release(record.handle);
    expect(store.acquire(record.handle).rawAntigravityId).toBe("raw-conversation");
  });

  it("creates opaque handles that do not equal the Antigravity ID", () => {
    const store = new ConversationHandleStore();
    const created = store.create({
      rawAntigravityId: record.rawAntigravityId,
      model: record.model,
      canonicalWorkingDirectory: record.canonicalWorkingDirectory,
      workspaceAccess: record.workspaceAccess,
      cliVersion: record.cliVersion,
    });
    expect(created.handle).toMatch(/^agy_[0-9a-f]+$/);
    expect(created.handle).not.toBe(created.rawAntigravityId);
    expect(store.get(created.handle)?.status).toBe("active");
  });
});
