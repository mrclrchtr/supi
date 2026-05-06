import { describe, expect, it } from "vitest";
import { getActiveBranchEntries } from "../src/session-utils.ts";

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
