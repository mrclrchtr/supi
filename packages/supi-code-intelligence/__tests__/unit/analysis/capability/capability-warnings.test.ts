/** Tests for Capability Warning evaluation and per-session deduplication. */

import { describe, expect, it } from "vitest";
import {
  CapabilityWarningState,
  evaluateCapabilityWarnings,
} from "../../../../src/analysis/capability/capability-warnings.ts";

describe("evaluateCapabilityWarnings", () => {
  it("returns deprecation warning when lsp.enabled is present in config", () => {
    const result = evaluateCapabilityWarnings({
      deprecatedKeys: {
        projectEnabled: true,
        globalEnabled: false,
        projectActive: false,
        globalActive: false,
      },
      explicitlyDisabledLanguages: [],
      missingServers: [],
      structuralState: { kind: "ready" },
    });

    expect(result.hasWarnings).toBe(true);
    expect(
      result.warnings.some((w) => w.type === "deprecated-key" && w.message.includes("lsp.enabled")),
    ).toBe(true);
  });

  it("returns deprecation warning when lsp.active is present in config", () => {
    const result = evaluateCapabilityWarnings({
      deprecatedKeys: {
        projectEnabled: false,
        globalEnabled: false,
        projectActive: true,
        globalActive: false,
      },
      explicitlyDisabledLanguages: [],
      missingServers: [],
      structuralState: { kind: "ready" },
    });

    expect(result.hasWarnings).toBe(true);
    expect(
      result.warnings.some((w) => w.type === "deprecated-key" && w.message.includes("lsp.active")),
    ).toBe(true);
  });

  it("returns language-disabled warning for explicitly disabled language servers", () => {
    const result = evaluateCapabilityWarnings({
      deprecatedKeys: {
        projectEnabled: false,
        globalEnabled: false,
        projectActive: false,
        globalActive: false,
      },
      explicitlyDisabledLanguages: ["python"],
      missingServers: [],
      structuralState: { kind: "ready" },
    });

    expect(result.hasWarnings).toBe(true);
    expect(
      result.warnings.some(
        (warning) =>
          warning.type === "language-disabled" &&
          warning.language === "python" &&
          warning.message.includes("Semantic capability reduced"),
      ),
    ).toBe(true);
  });

  it("returns missing-server warning when a server binary is not on PATH", () => {
    const result = evaluateCapabilityWarnings({
      deprecatedKeys: {
        projectEnabled: false,
        globalEnabled: false,
        projectActive: false,
        globalActive: false,
      },
      explicitlyDisabledLanguages: [],
      missingServers: [{ name: "python", command: "pyright-langserver", foundExtensions: ["py"] }],
      structuralState: { kind: "ready" },
    });

    expect(result.hasWarnings).toBe(true);
    expect(
      result.warnings.some((w) => w.type === "missing-server" && w.language === "python"),
    ).toBe(true);
  });

  it("returns structural-unavailable warning when tree-sitter is unavailable", () => {
    const result = evaluateCapabilityWarnings({
      deprecatedKeys: {
        projectEnabled: false,
        globalEnabled: false,
        projectActive: false,
        globalActive: false,
      },
      explicitlyDisabledLanguages: [],
      missingServers: [],
      structuralState: { kind: "unavailable", reason: "tree-sitter initialization failed" },
    });

    expect(result.hasWarnings).toBe(true);
    expect(
      result.warnings.some(
        (warning) =>
          warning.type === "structural-unavailable" &&
          warning.message.includes("Structural capability unavailable"),
      ),
    ).toBe(true);
  });

  it("returns empty warnings when everything is healthy", () => {
    const result = evaluateCapabilityWarnings({
      deprecatedKeys: {
        projectEnabled: false,
        globalEnabled: false,
        projectActive: false,
        globalActive: false,
      },
      explicitlyDisabledLanguages: [],
      missingServers: [],
      structuralState: { kind: "ready" },
    });

    expect(result.hasWarnings).toBe(false);
    expect(result.warnings).toEqual([]);
  });

  describe("CapabilityWarningState", () => {
    it("respects grace period — no pending warnings before grace expires", () => {
      const state = new CapabilityWarningState();
      const report = {
        hasWarnings: true,
        warnings: [{ type: "deprecated-key" as const, message: "test warning" }],
      };

      // With a long grace period, no warnings should be pending
      const pending = state.getPendingWarnings(report, 60_000);
      expect(pending).toEqual([]);
    });

    it("deduplicates — same warning report not emitted twice", () => {
      const state = new CapabilityWarningState();
      const report = {
        hasWarnings: true,
        warnings: [{ type: "deprecated-key" as const, message: "test warning" }],
      };

      expect(state.getPendingWarnings(report, 0)).toHaveLength(1);
      expect(state.getPendingWarnings(report, 0)).toEqual([]);
    });

    it("does not consume emission state for an empty report", () => {
      const state = new CapabilityWarningState();
      expect(state.getPendingWarnings({ hasWarnings: false, warnings: [] }, 0)).toEqual([]);
      expect(state.hasEmitted).toBe(false);

      const warningReport = {
        hasWarnings: true,
        warnings: [{ type: "deprecated-key" as const, message: "test warning" }],
      };
      expect(state.getPendingWarnings(warningReport, 0)).toHaveLength(1);
    });
  });
});
