import { describe, expect, it } from "vitest";
import { AGENT_CAPABILITIES, toAgentToolNames } from "../../src/capabilities.ts";

describe("supi_agent_run exclusion", () => {
  it("is absent from every child capability set", () => {
    // Derive from the real AGENT_CAPABILITIES, not a hardcoded list.
    const capabilityIds = AGENT_CAPABILITIES.map((cap) => cap.id);
    expect(capabilityIds).not.toContain("supi_agent_run");

    const names = toAgentToolNames([...capabilityIds]);
    expect(names).not.toContain("supi_agent_run");
  });
});
