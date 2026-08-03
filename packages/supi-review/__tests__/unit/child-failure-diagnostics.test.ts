import { describe, expect, it } from "vitest";
import { formatChildFailureDiagnostics } from "../../src/tool/child-failure-diagnostics.ts";
import type { ChildFailureDiagnostics } from "../../src/types.ts";

describe("review failure diagnostics", () => {
  it("keeps the review-facing Child Lifecycle Trace label over runtime diagnostics", () => {
    const diagnostics: ChildFailureDiagnostics = {
      lifecycleTrace: {
        entries: [{ type: "agent_settled" }],
        droppedCount: 0,
      },
      turns: 0,
      toolUses: 0,
    };

    const lines = formatChildFailureDiagnostics(diagnostics).join("\n");
    expect(lines).toContain("Child Lifecycle Trace");
    expect(lines).not.toContain("Agent Run Lifecycle Trace");
  });
});
