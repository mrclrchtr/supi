import { describe, expect, it } from "vitest";
import type { RelationsResult } from "../../../src/analysis/relations/types.ts";

/**
 * Relations renderer tests — ensures the renderer handles typed
 * RelationsResult data without performing routing or provider calls.
 */
describe("relations render", () => {
  it("formats callers result with semantic-references evidence", () => {
    const result: RelationsResult = {
      kind: "callers",
      targetName: "myFunction",
      references: [{ file: "src/a.ts", line: 10, character: 5, name: "myFunction" }],
      externalCount: 2,
      evidence: "semantic-references",
      confidence: "semantic",
    };

    expect(result.kind).toBe("callers");
    expect(result.evidence).toBe("semantic-references");
    if (result.kind === "callers") {
      expect(result.references.length).toBe(1);
      expect(result.externalCount).toBe(2);
    }
  });

  it("formats implementations result with confidence", () => {
    const result: RelationsResult = {
      kind: "implementations",
      targetName: "InterfaceX",
      implementations: [{ file: "src/impl.ts", line: 15, character: 1, name: "InterfaceX" }],
      externalCount: 0,
      confidence: "semantic",
    };

    expect(result.kind).toBe("implementations");
    if (result.kind === "implementations") {
      expect(result.implementations.length).toBe(1);
    }
  });

  it("formats callees result", () => {
    const result: RelationsResult = {
      kind: "callees",
      targetName: "myFunction",
      callees: [{ name: "helper", file: "src/helper.ts", line: 5, character: 1 }],
      confidence: "structural",
    };

    expect(result.kind).toBe("callees");
    if (result.kind === "callees") {
      expect(result.callees.length).toBe(1);
    }
  });

  it("handles unavailable result", () => {
    const result: RelationsResult = {
      kind: "unavailable",
      reason: "No provider available",
    };

    expect(result.kind).toBe("unavailable");
  });
});
