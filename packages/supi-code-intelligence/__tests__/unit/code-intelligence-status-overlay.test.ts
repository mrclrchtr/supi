import type { OutstandingDiagnosticSummaryEntry, ProjectServerInfo } from "@mrclrchtr/supi-lsp/api";
import { makeCtx } from "@mrclrchtr/supi-test-utils";
import { describe, expect, it, vi } from "vitest";
import {
  type CiStatusData,
  type CiStatusDialogDeps,
  createCiStatusDialog,
} from "../../src/ui/code-intelligence-status-overlay.ts";

const theme = makeCtx().ui.theme;

const mockServers: ProjectServerInfo[] = [
  {
    name: "typescript",
    root: "/project",
    status: "running",
    fileTypes: ["ts", "tsx", "js", "jsx"],
    supportedActions: ["hover", "definition"],
    openFiles: ["src/index.ts", "src/utils.ts"],
    ready: true,
  },
  {
    name: "bash",
    root: "/project",
    status: "running",
    fileTypes: ["sh", "bash"],
    supportedActions: ["hover"],
    openFiles: [],
    ready: true,
  },
];

const mockDiagnostics: OutstandingDiagnosticSummaryEntry[] = [
  { file: "src/index.ts", total: 3, errors: 2, warnings: 1, information: 0, hints: 0 },
  { file: "src/utils.ts", total: 1, errors: 1, warnings: 0, information: 0, hints: 0 },
  { file: "src/types.ts", total: 1, errors: 0, warnings: 1, information: 0, hints: 0 },
];

const baseCapabilities: CiStatusData["capabilities"] = {
  semantic: { kind: "ready", providerAvailable: true },
  structural: { kind: "ready", providerAvailable: true },
  refactorAvailable: true,
};

function makeTui() {
  return { requestRender: vi.fn() };
}

function makeData(overrides: Partial<CiStatusData> = {}): CiStatusData {
  return {
    servers: [],
    diagnostics: [],
    capabilities: baseCapabilities,
    activeTools: [],
    ...overrides,
  };
}

function makeDeps(overrides: Partial<CiStatusDialogDeps> = {}): CiStatusDialogDeps {
  return {
    theme,
    done: vi.fn(),
    tui: makeTui(),
    ...overrides,
  };
}

describe("CiStatusDialog", () => {
  describe("rendering", () => {
    it("renders header with title and toggle hint", () => {
      const dialog = createCiStatusDialog(makeData(), makeDeps());
      const lines = dialog.render(80);
      const all = lines.join("\n");
      expect(all).toContain("Code Intelligence");
      expect(all).toContain("/supi-ci-status");
      expect(all).toContain("esc");
    });

    it("shows servers section when servers provided", () => {
      const dialog = createCiStatusDialog(makeData({ servers: mockServers }), makeDeps());
      const lines = dialog.render(80);
      const all = lines.join("\n");
      expect(all).toContain("Servers");
      expect(all).toContain("typescript");
      expect(all).toContain("bash");
      expect(all).toContain("/project");
    });

    it("hides servers section when empty and LSP not ready", () => {
      const dialog = createCiStatusDialog(
        makeData({
          servers: [],
          diagnostics: [],
          capabilities: {
            semantic: { kind: "unavailable", providerAvailable: false },
            structural: { kind: "unavailable", providerAvailable: false },
            refactorAvailable: false,
          },
        }),
        makeDeps(),
      );
      const lines = dialog.render(80);
      const all = lines.join("\n");
      // The capabilities section should still be visible
      expect(all).toContain("Capabilities");
    });

    it("shows problems section with file list", () => {
      const dialog = createCiStatusDialog(makeData({ diagnostics: mockDiagnostics }), makeDeps());
      const lines = dialog.render(80);
      const all = lines.join("\n");
      expect(all).toContain("src/index.ts");
      expect(all).toContain("src/utils.ts");
      expect(all).toContain("src/types.ts");
      expect(all).toContain("2 errors");
    });

    it('shows "no issues" message when diagnostics empty', () => {
      const dialog = createCiStatusDialog(makeData({ diagnostics: [] }), makeDeps());
      const lines = dialog.render(80);
      const all = lines.join("\n");
      expect(all).toMatch(/no issues|✓.*no.*issues/i);
    });

    it("shows capabilities section with semantic, structural, refactor", () => {
      const dialog = createCiStatusDialog(makeData(), makeDeps());
      const lines = dialog.render(80);
      const all = lines.join("\n");
      expect(all).toContain("Capabilities");
      expect(all).toContain("Semantic");
      expect(all).toContain("Structural");
      expect(all).toContain("Refactor");
    });

    it("shows unavailable state with reason for missing capabilities", () => {
      const dialog = createCiStatusDialog(
        makeData({
          capabilities: {
            semantic: { kind: "unavailable", reason: "no LSP session", providerAvailable: false },
            structural: {
              kind: "unavailable",
              reason: "tree-sitter not installed",
              providerAvailable: false,
            },
            refactorAvailable: false,
          },
        }),
        makeDeps(),
      );
      const lines = dialog.render(80);
      const all = lines.join("\n");
      expect(all).toContain("no LSP session");
      expect(all).toContain("tree-sitter not installed");
    });

    it("shows tools section with active code_* tools", () => {
      const dialog = createCiStatusDialog(
        makeData({ activeTools: ["code_orientation", "code_graph", "code_find"] }),
        makeDeps(),
      );
      const lines = dialog.render(80);
      const all = lines.join("\n");
      expect(all).toContain("code_orientation");
      expect(all).toContain("code_graph");
      expect(all).toContain("code_find");
    });

    it("skips tools section when no active code_* tools", () => {
      const dialog = createCiStatusDialog(makeData({ activeTools: [] }), makeDeps());
      const lines = dialog.render(80);
      const all = lines.join("\n");
      expect(all).not.toContain("Tools:");
    });

    it("every line respects width parameter", () => {
      const dialog = createCiStatusDialog(
        makeData({
          servers: mockServers,
          diagnostics: mockDiagnostics,
          activeTools: ["code_orientation", "code_graph", "code_find", "code_health"],
        }),
        makeDeps(),
      );
      const lines = dialog.render(60);
      for (const line of lines) {
        // visibleWidth of a plain string equals its length
        expect(line.length).toBeLessThanOrEqual(60);
      }
    });
  });

  describe("interaction", () => {
    it("arrow down increments selected file index", () => {
      const dialog = createCiStatusDialog(makeData({ diagnostics: mockDiagnostics }), makeDeps());
      dialog.render(80);
      const first = dialog.render(80).join("\n");
      dialog.handleInput("\x1b[B"); // down
      const second = dialog.render(80).join("\n");
      // Selection indicator should change position
      expect(second).not.toBe(first);
    });

    it("arrow up decrements selected file index and clamps at 0", () => {
      const dialog = createCiStatusDialog(makeData({ diagnostics: mockDiagnostics }), makeDeps());
      dialog.render(80);
      dialog.handleInput("\x1b[A"); // up at idx 0 — should clamp
      // No error, no negative index
      const lines = dialog.render(80);
      expect(lines.length).toBeGreaterThan(0);
    });

    it("enter toggles file expansion on selected row", () => {
      const dialog = createCiStatusDialog(makeData({ diagnostics: mockDiagnostics }), makeDeps());
      dialog.render(80);
      dialog.handleInput("\r"); // enter
      const expanded = dialog.render(80).join("\n");
      // Should show selection/expand indicator change
      // First file was src/index.ts
      dialog.handleInput("\r"); // enter again
      const collapsed = dialog.render(80).join("\n");
      // Output should differ
      expect(expanded).not.toBe(collapsed);
    });

    it("escape calls done callback", () => {
      const done = vi.fn();
      const dialog = createCiStatusDialog(makeData(), makeDeps({ done }));
      dialog.handleInput("\x1b"); // esc
      expect(done).toHaveBeenCalledTimes(1);
    });

    it("'a' collapses all expanded files", () => {
      const dialog = createCiStatusDialog(makeData({ diagnostics: mockDiagnostics }), makeDeps());
      dialog.render(80);
      dialog.handleInput("\r"); // expand first file
      dialog.handleInput("a"); // collapse all
      const lines = dialog.render(80).join("\n");
      // No ▼ indicator — everything collapsed
      expect(lines).not.toContain("▼");
    });

    it("'r' triggers refresh and re-renders", async () => {
      const onRefresh = vi.fn(async () => makeData({ diagnostics: [] }));
      const dialog = createCiStatusDialog(
        makeData({ diagnostics: mockDiagnostics }),
        makeDeps({ onRefresh }),
      );
      dialog.render(80);
      const before = dialog.render(80).join("\n");
      expect(before).toContain("src/index.ts");

      dialog.handleInput("r");
      // Wait for async refresh
      await vi.waitFor(() => {
        expect(onRefresh).toHaveBeenCalled();
      });
      const after = dialog.render(80).join("\n");
      expect(after).toContain("no issues");
    });

    it("state changes call tui.requestRender", () => {
      const tui = makeTui();
      const dialog = createCiStatusDialog(
        makeData({ diagnostics: mockDiagnostics }),
        makeDeps({ tui }),
      );
      dialog.render(80);
      dialog.handleInput("\x1b[B"); // down
      expect(tui.requestRender).toHaveBeenCalled();
    });
  });

  describe("caching", () => {
    it("caches render output by width", () => {
      const dialog = createCiStatusDialog(makeData(), makeDeps());
      const first = dialog.render(80);
      const second = dialog.render(80);
      // Same width → same content
      expect(second).toEqual(first);
    });

    it("invalidates cache on state change", () => {
      const dialog = createCiStatusDialog(makeData({ diagnostics: mockDiagnostics }), makeDeps());
      const before = dialog.render(80);
      dialog.handleInput("\x1b[B"); // down — changes state
      const after = dialog.render(80);
      expect(after).not.toEqual(before);
    });
  });

  // ── RED: degraded coverage in overlay ──────────────────────────

  describe("degraded coverage", () => {
    it("[RED] shows degraded coverage warnings section when semantic coverage is degraded", () => {
      // RED: the overlay should display a dedicated "Degraded Coverage" section
      // when semantic or structural coverage has warnings
      const dialog = createCiStatusDialog(
        makeData({
          servers: [],
          diagnostics: [],
          capabilities: {
            semantic: { kind: "unavailable", reason: "no LSP session", providerAvailable: false },
            structural: { kind: "ready", providerAvailable: true },
            refactorAvailable: false,
          },
          // RED: degradedCoverage is a new field that doesn't exist yet
          degradedCoverage: {
            hasWarnings: true,
            warnings: [
              {
                type: "missing-server",
                language: "python",
                message: "pyright-langserver not found on PATH",
              },
            ],
          },
        }),
        makeDeps(),
      );
      const lines = dialog.render(80).join("\n");
      expect(lines).toContain("Degraded Coverage");
      expect(lines).toContain("python");
    });

    it("[RED] hides degraded coverage section when no warnings exist", () => {
      // RED: the section should be absent when coverage is fully healthy
      const dialog = createCiStatusDialog(
        makeData({
          servers: mockServers,
          diagnostics: [],
          capabilities: {
            semantic: { kind: "ready", providerAvailable: true },
            structural: { kind: "ready", providerAvailable: true },
            refactorAvailable: true,
          },
          degradedCoverage: { hasWarnings: false, warnings: [] },
        }),
        makeDeps(),
      );
      const lines = dialog.render(80).join("\n");
      expect(lines).not.toContain("Degraded Coverage");
    });

    it("[RED] shows deprecation warning for ignored lsp.enabled key", () => {
      const dialog = createCiStatusDialog(
        makeData({
          servers: mockServers,
          diagnostics: [],
          capabilities: {
            semantic: { kind: "ready", providerAvailable: true },
            structural: { kind: "ready", providerAvailable: true },
            refactorAvailable: true,
          },
          degradedCoverage: {
            hasWarnings: true,
            warnings: [
              { type: "deprecated-key", message: "lsp.enabled is deprecated and ignored" },
            ],
          },
        }),
        makeDeps(),
      );
      const lines = dialog.render(80).join("\n");
      expect(lines).toContain("deprecated");
      expect(lines).toContain("lsp.enabled");
    });

    it("[RED] shows structural failure warning when tree-sitter is unavailable", () => {
      const dialog = createCiStatusDialog(
        makeData({
          servers: mockServers,
          diagnostics: [],
          capabilities: {
            semantic: { kind: "ready", providerAvailable: true },
            structural: {
              kind: "unavailable",
              reason: "tree-sitter not initialized",
              providerAvailable: false,
            },
            refactorAvailable: true,
          },
          degradedCoverage: {
            hasWarnings: true,
            warnings: [{ type: "structural-unavailable", message: "Tree-sitter is unavailable" }],
          },
        }),
        makeDeps(),
      );
      const lines = dialog.render(80).join("\n");
      expect(lines).toContain("Degraded Coverage");
      expect(lines).toContain("Tree-sitter");
    });
  });
});
