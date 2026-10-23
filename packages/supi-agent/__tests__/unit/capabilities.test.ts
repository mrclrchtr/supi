import { describe, expect, it } from "vitest";
import { getAgentCapability, isReadOnlyCapabilitySet } from "../../src/api.ts";

describe("Agent Capability Set", () => {
  it("treats only explicitly classified non-mutating tools as read-only", () => {
    expect(isReadOnlyCapabilitySet(["read", "code_find"])).toBe(true);
    expect(isReadOnlyCapabilitySet(["read", "codemode"])).toBe(true);
    expect(isReadOnlyCapabilitySet(["codemode", "bash"])).toBe(false);
    expect(getAgentCapability("codemode")).toMatchObject({
      id: "codemode",
      toolName: "codemode",
      mutationCapable: false,
    });
    expect(isReadOnlyCapabilitySet(["bash"])).toBe(false);
    expect(isReadOnlyCapabilitySet(["future-tool" as never])).toBe(false);
  });
});
