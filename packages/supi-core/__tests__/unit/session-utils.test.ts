import { createPiMock } from "@mrclrchtr/supi-test-utils";
import { describe, expect, it } from "vitest";
import { createSessionNameTracker, getActiveBranchEntries } from "../../src/session-utils.ts";

function makeEntry(
  id: string,
  parentId: string | null,
  customType?: string,
): Record<string, unknown> {
  return {
    type: customType ? "custom" : "message",
    ...(customType ? { customType } : {}),
    id,
    parentId,
    timestamp: new Date().toISOString(),
  };
}

describe("getActiveBranchEntries", () => {
  it("returns empty array for empty input", () => {
    expect(getActiveBranchEntries([])).toEqual([]);
  });

  it("returns empty array when only session header present", () => {
    const entries = [{ type: "session", timestamp: new Date().toISOString() }];
    expect(getActiveBranchEntries(entries as never)).toEqual([]);
  });

  it("walks a linear branch", () => {
    const entries = [makeEntry("1", null), makeEntry("2", "1"), makeEntry("3", "2")];
    const result = getActiveBranchEntries(entries as never);
    expect(result.map((e) => e.id)).toEqual(["1", "2", "3"]);
  });

  it("follows parentId to root, skipping siblings", () => {
    const entries = [
      makeEntry("1", null),
      makeEntry("2", "1"),
      makeEntry("3", "1"), // sibling of 2
      makeEntry("4", "2"), // child of 2 (leaf)
    ];
    const result = getActiveBranchEntries(entries as never);
    expect(result.map((e) => e.id)).toEqual(["1", "2", "4"]);
  });

  it("handles a branch with a gap (parent not in file)", () => {
    const entries = [makeEntry("1", null), makeEntry("2", "missing")];
    const result = getActiveBranchEntries(entries as never);
    expect(result.map((e) => e.id)).toEqual(["2"]);
  });

  it("breaks cycles", () => {
    const entries = [makeEntry("1", "3"), makeEntry("2", "1"), makeEntry("3", "2")];
    const result = getActiveBranchEntries(entries as never);
    expect(result.map((e) => e.id)).toEqual(["1", "2", "3"]);
  });

  it("preserves session entry order (oldest first)", () => {
    const entries = [makeEntry("a", null), makeEntry("b", "a"), makeEntry("c", "b")];
    const result = getActiveBranchEntries(entries as never);
    expect(result[0].id).toBe("a");
    expect(result[1].id).toBe("b");
    expect(result[2].id).toBe("c");
  });

  it("preserves custom entries alongside messages", () => {
    const entries = [
      makeEntry("1", null),
      makeEntry("2", "1", "supi-cache-turn"),
      makeEntry("3", "2"),
    ];
    const result = getActiveBranchEntries(entries as never);
    expect(result.map((e) => e.id)).toEqual(["1", "2", "3"]);
  });
});

describe("createSessionNameTracker", () => {
  it("returns undefined before session_start", () => {
    const pi = createPiMock({ sessionName: "test" });
    const getSessionName = createSessionNameTracker(
      pi as unknown as Parameters<typeof createSessionNameTracker>[0],
    );
    expect(getSessionName()).toBeUndefined();
  });

  it("returns the session name from pi.getSessionName() after session_start", async () => {
    const pi = createPiMock({ sessionName: "my-session" });
    const getSessionName = createSessionNameTracker(
      pi as unknown as Parameters<typeof createSessionNameTracker>[0],
    );

    const handler = pi.handlers.get("session_start")?.[0];
    await handler?.({}, {});

    expect(getSessionName()).toBe("my-session");
  });

  it("updates the name on session_info_changed", async () => {
    const pi = createPiMock({ sessionName: "initial" });
    const getSessionName = createSessionNameTracker(
      pi as unknown as Parameters<typeof createSessionNameTracker>[0],
    );

    // Init via session_start
    const startHandler = pi.handlers.get("session_start")?.[0];
    await startHandler?.({}, {});
    expect(getSessionName()).toBe("initial");

    // Rename via session_info_changed
    const changedHandler = pi.handlers.get("session_info_changed")?.[0];
    await changedHandler?.({ name: "renamed" }, {});

    expect(getSessionName()).toBe("renamed");
  });

  it("clears the name on session_shutdown", async () => {
    const pi = createPiMock({ sessionName: "session" });
    const getSessionName = createSessionNameTracker(
      pi as unknown as Parameters<typeof createSessionNameTracker>[0],
    );

    const startHandler = pi.handlers.get("session_start")?.[0];
    await startHandler?.({}, {});
    expect(getSessionName()).toBe("session");

    const shutdownHandler = pi.handlers.get("session_shutdown")?.[0];
    await shutdownHandler?.({}, {});

    expect(getSessionName()).toBeUndefined();
  });

  it("re-initialises on a new session_start after shutdown", async () => {
    const pi = createPiMock({ sessionName: "second" });
    const getSessionName = createSessionNameTracker(
      pi as unknown as Parameters<typeof createSessionNameTracker>[0],
    );

    const startHandler = pi.handlers.get("session_start")?.[0];
    const shutdownHandler = pi.handlers.get("session_shutdown")?.[0];

    // First session
    await startHandler?.({}, {});
    expect(getSessionName()).toBe("second");

    // Shutdown
    await shutdownHandler?.({}, {});
    expect(getSessionName()).toBeUndefined();

    // New session start
    await startHandler?.({}, {});
    expect(getSessionName()).toBe("second");
  });

  it("handles session_info_changed with undefined name", async () => {
    const pi = createPiMock({ sessionName: "named" });
    const getSessionName = createSessionNameTracker(
      pi as unknown as Parameters<typeof createSessionNameTracker>[0],
    );

    const startHandler = pi.handlers.get("session_start")?.[0];
    await startHandler?.({}, {});
    expect(getSessionName()).toBe("named");

    const changedHandler = pi.handlers.get("session_info_changed")?.[0];
    await changedHandler?.({ name: undefined }, {});

    expect(getSessionName()).toBeUndefined();
  });

  it("does not throw when session_info_changed event has no name property", async () => {
    const pi = createPiMock({ sessionName: "initial" });
    const getSessionName = createSessionNameTracker(
      pi as unknown as Parameters<typeof createSessionNameTracker>[0],
    );

    const startHandler = pi.handlers.get("session_start")?.[0];
    await startHandler?.({}, {});

    const changedHandler = pi.handlers.get("session_info_changed")?.[0];
    await changedHandler?.({}, {});

    expect(getSessionName()).toBeUndefined();
  });
});
