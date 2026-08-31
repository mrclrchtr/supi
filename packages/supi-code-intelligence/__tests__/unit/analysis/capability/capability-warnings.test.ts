/** Tests for Capability Warning evaluation and per-session deduplication. */

import { describe, expect, it } from "vitest";
import {
  CapabilityWarningState,
  evaluateCapabilityWarnings,
} from "../../../../src/analysis/capability/capability-warnings.ts";

const healthyInput = {
  explicitlyDisabledLanguages: [],
  missingServers: [],
  structuralState: { kind: "ready" },
};

describe("evaluateCapabilityWarnings", () => {
  it("reports explicitly disabled language servers", () => {
    const result = evaluateCapabilityWarnings({
      ...healthyInput,
      explicitlyDisabledLanguages: ["python"],
    });

    expect(result.warnings).toEqual([
      expect.objectContaining({ type: "language-disabled", language: "python" }),
    ]);
  });

  it("reports missing server binaries", () => {
    const result = evaluateCapabilityWarnings({
      ...healthyInput,
      missingServers: [{ name: "python", command: "pyright-langserver", foundExtensions: ["py"] }],
    });

    expect(result.warnings).toEqual([
      expect.objectContaining({ type: "missing-server", language: "python" }),
    ]);
  });

  it("reports structural capability failure", () => {
    const result = evaluateCapabilityWarnings({
      ...healthyInput,
      structuralState: { kind: "unavailable", reason: "tree-sitter initialization failed" },
    });

    expect(result.warnings).toEqual([expect.objectContaining({ type: "structural-unavailable" })]);
  });

  it("returns no warnings when all capabilities are healthy", () => {
    expect(evaluateCapabilityWarnings(healthyInput)).toEqual({
      hasWarnings: false,
      warnings: [],
    });
  });
});

describe("CapabilityWarningState", () => {
  const report = {
    hasWarnings: true,
    warnings: [{ type: "missing-server" as const, message: "test warning" }],
  };

  it("holds warnings until the grace period ends", () => {
    expect(new CapabilityWarningState().getPendingWarnings(report, 60_000)).toEqual([]);
  });

  it("does not emit an unchanged warning report twice", () => {
    const state = new CapabilityWarningState();

    expect(state.getPendingWarnings(report, 0)).toHaveLength(1);
    expect(state.getPendingWarnings(report, 0)).toEqual([]);
  });

  it("does not consume emission state for an empty report", () => {
    const state = new CapabilityWarningState();

    expect(state.getPendingWarnings({ hasWarnings: false, warnings: [] }, 0)).toEqual([]);
    expect(state.hasEmitted).toBe(false);
    expect(state.getPendingWarnings(report, 0)).toHaveLength(1);
  });
});
