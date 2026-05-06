import { describe, expect, it } from "vitest";
import { computeToolCallShape, stripHumanDetail } from "../../src/forensics/redact.ts";
import type { ForensicsFinding } from "../../src/forensics/types.ts";

function makeFinding(overrides: Partial<ForensicsFinding> = {}): ForensicsFinding {
  return {
    sessionId: "test-session",
    turnIndex: 1,
    previousRate: 80,
    currentRate: 10,
    drop: 70,
    cause: { type: "unknown" },
    toolsBefore: [],
    _pathsInvolved: ["/path/to/file.ts"],
    _commandSummaries: ["git commit -m 'test'"],
    ...overrides,
  };
}

describe("computeToolCallShape", () => {
  it("captures string param shape with length and multiline", () => {
    const shape = computeToolCallShape("write", { file_path: "test.ts", content: "line1\nline2" });
    expect(shape.toolName).toBe("write");
    expect(shape.paramKeys).toEqual(["file_path", "content"]);
    expect(shape.paramShapes.file_path).toEqual({ kind: "string", len: 7, multiline: false });
    expect(shape.paramShapes.content).toEqual({ kind: "string", len: 11, multiline: true });
  });

  it("captures number param shape", () => {
    const shape = computeToolCallShape("scale", { count: 42 });
    expect(shape.paramShapes.count).toEqual({ kind: "number" });
  });

  it("captures boolean param shape", () => {
    const shape = computeToolCallShape("toggle", { enabled: true });
    expect(shape.paramShapes.enabled).toEqual({ kind: "boolean" });
  });

  it("captures object param shape with key count", () => {
    const shape = computeToolCallShape("configure", { options: { a: 1, b: 2, c: 3 } });
    expect(shape.paramShapes.options).toEqual({ kind: "object", keyCount: 3 });
  });

  it("captures array param shape with length", () => {
    const shape = computeToolCallShape("batch", { items: ["a", "b", "c"] });
    expect(shape.paramShapes.items).toEqual({ kind: "array", len: 3 });
  });

  it("handles empty args", () => {
    const shape = computeToolCallShape("noop", {});
    expect(shape.paramKeys).toEqual([]);
    expect(shape.paramShapes).toEqual({});
  });

  it("handles null and undefined values", () => {
    const shape = computeToolCallShape("test", { nullValue: null, undefinedValue: undefined });
    expect(shape.paramShapes.nullValue).toEqual({ kind: "string", len: 0, multiline: false });
    expect(shape.paramShapes.undefinedValue).toEqual({ kind: "string", len: 0, multiline: false });
  });
});

describe("stripHumanDetail", () => {
  it("removes _pathsInvolved and _commandSummaries from findings", () => {
    const findings = [makeFinding()];
    const stripped = stripHumanDetail(findings);

    expect(stripped[0]._pathsInvolved).toBeUndefined();
    expect(stripped[0]._commandSummaries).toBeUndefined();
    expect(stripped[0].sessionId).toBe("test-session");
    expect(stripped[0].drop).toBe(70);
  });

  it("does not mutate the original findings", () => {
    const findings = [makeFinding()];
    stripHumanDetail(findings);

    // Original should still have the fields
    expect(findings[0]._pathsInvolved).toEqual(["/path/to/file.ts"]);
    expect(findings[0]._commandSummaries).toEqual(["git commit -m 'test'"]);
  });

  it("returns a new array, not the same reference", () => {
    const findings = [makeFinding()];
    const stripped = stripHumanDetail(findings);
    expect(stripped).not.toBe(findings);
  });

  it("handles findings without human-only fields", () => {
    const findings = [makeFinding({ _pathsInvolved: undefined, _commandSummaries: undefined })];
    const stripped = stripHumanDetail(findings);
    expect(stripped[0]._pathsInvolved).toBeUndefined();
    expect(stripped[0]._commandSummaries).toBeUndefined();
  });

  it("handles empty array", () => {
    expect(stripHumanDetail([])).toEqual([]);
  });
});
