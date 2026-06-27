/**
 * Tests for the degraded-coverage warning evaluation module.
 *
 * These tests were RED (failing without the module) and now validate
 * the evaluateCoverageWarnings API contract.
 */

import { describe, expect, it } from "vitest";

describe("evaluateCoverageWarnings", () => {
  it("returns deprecation warning when lsp.enabled is present in config", async () => {
    const { evaluateCoverageWarnings } = await import("../../src/lsp/coverage-warnings.ts");

    const result = evaluateCoverageWarnings({
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

  it("returns deprecation warning when lsp.active is present in config", async () => {
    const { evaluateCoverageWarnings } = await import("../../src/lsp/coverage-warnings.ts");

    const result = evaluateCoverageWarnings({
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

  it("returns language-disabled warning for explicitly disabled language servers", async () => {
    const { evaluateCoverageWarnings } = await import("../../src/lsp/coverage-warnings.ts");

    const result = evaluateCoverageWarnings({
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
      result.warnings.some((w) => w.type === "language-disabled" && w.language === "python"),
    ).toBe(true);
  });

  it("returns missing-server warning when a server binary is not on PATH", async () => {
    const { evaluateCoverageWarnings } = await import("../../src/lsp/coverage-warnings.ts");

    const result = evaluateCoverageWarnings({
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

  it("returns structural-unavailable warning when tree-sitter is unavailable", async () => {
    const { evaluateCoverageWarnings } = await import("../../src/lsp/coverage-warnings.ts");

    const result = evaluateCoverageWarnings({
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
    expect(result.warnings.some((w) => w.type === "structural-unavailable")).toBe(true);
  });

  it("returns empty warnings when everything is healthy", async () => {
    const { evaluateCoverageWarnings } = await import("../../src/lsp/coverage-warnings.ts");

    const result = evaluateCoverageWarnings({
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

  describe("CoverageWarningState", () => {
    it("respects grace period — no pending warnings before grace expires", async () => {
      const { CoverageWarningState } = await import("../../src/lsp/coverage-warnings.ts");

      const state = new CoverageWarningState();
      const report = {
        hasWarnings: true,
        warnings: [{ type: "deprecated-key" as const, message: "test warning" }],
      };

      // With a long grace period, no warnings should be pending
      const pending = state.getPendingWarnings(report, 60_000);
      expect(pending).toEqual([]);
    });

    it("deduplicates — same warning report not emitted twice", async () => {
      const { CoverageWarningState } = await import("../../src/lsp/coverage-warnings.ts");

      const state = new CoverageWarningState();
      const report = {
        hasWarnings: true,
        warnings: [{ type: "deprecated-key" as const, message: "test warning" }],
      };

      expect(state.getPendingWarnings(report, 0)).toHaveLength(1);
      expect(state.getPendingWarnings(report, 0)).toEqual([]);
    });

    it("does not consume emission state for an empty report", async () => {
      const { CoverageWarningState } = await import("../../src/lsp/coverage-warnings.ts");

      const state = new CoverageWarningState();
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
