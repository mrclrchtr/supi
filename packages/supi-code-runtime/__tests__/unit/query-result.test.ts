import { describe, expect, it } from "vitest";
import {
  completedCodeQuery,
  mapCodeQueryResult,
  partialCodeQuery,
  unavailableCodeQuery,
} from "../../src/query-result.ts";

describe("CodeQueryResult", () => {
  it("preserves successful empty data as completed", () => {
    expect(completedCodeQuery([])).toEqual({ kind: "completed", data: [] });
    expect(completedCodeQuery(null)).toEqual({ kind: "completed", data: null });
  });

  it("maps completed and partial data without erasing state", () => {
    expect(mapCodeQueryResult(completedCodeQuery([1]), (items) => items.length)).toEqual({
      kind: "completed",
      data: 1,
    });
    expect(
      mapCodeQueryResult(partialCodeQuery([1], "one branch failed"), (items) => items.length),
    ).toEqual({
      kind: "partial",
      data: 1,
      reason: "one branch failed",
    });
  });

  it("preserves unavailable reasons without invoking the mapper", () => {
    const mapper = () => {
      throw new Error("must not run");
    };
    expect(mapCodeQueryResult(unavailableCodeQuery("offline"), mapper)).toEqual({
      kind: "unavailable",
      reason: "offline",
    });
  });
});
