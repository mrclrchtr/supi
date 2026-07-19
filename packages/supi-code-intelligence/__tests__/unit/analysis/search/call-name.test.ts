import { describe, expect, it } from "vitest";
import { callableExpressionForMatching } from "../../../../src/analysis/search/call-name.ts";

// biome-ignore lint/security/noSecrets: false positive on the helper name
describe("callableExpressionForMatching", () => {
  it("preserves direct and nested-invocation callable names", () => {
    expect(callableExpressionForMatching("target")).toBe("target");
    expect(callableExpressionForMatching("factory()")).toBe("factory()");
  });

  it("removes callback arguments from a chained callee", () => {
    expect(callableExpressionForMatching("values.filter((value) => target(value)).sort")).toBe(
      "values.filter().sort",
    );
  });

  it("removes array and object receiver payloads", () => {
    expect(callableExpressionForMatching("[target()].join")).toBe("[].join");
    expect(callableExpressionForMatching('{ value: target(")") }.method')).toBe("{}.method");
  });
});
