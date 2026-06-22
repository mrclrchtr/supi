/**
 * Tests for the updated LSP settings UI (always-on policy).
 *
 * Verifies that the settings UI:
 * - no longer has an "Enable LSP" toggle
 * - no longer has an "Active Servers" allowlist
 * - has a "Disabled Servers" control
 */

import { afterEach, describe, expect, it, vi } from "vitest";

const registerConfigSettingsSpy = vi.fn();

vi.mock("@mrclrchtr/supi-core/config", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@mrclrchtr/supi-core/config")>();
  return {
    ...actual,
    registerConfigSettings: registerConfigSettingsSpy,
    loadSupiConfigForScope: vi.fn(() => ({
      enabled: true,
      severity: 1,
      active: [],
      exclude: [],
      servers: {},
    })),
  };
});

vi.mock("@mrclrchtr/supi-lsp/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@mrclrchtr/supi-lsp/api")>();
  return {
    ...actual,
    loadConfig: vi.fn(() => ({
      servers: { typescript: {}, python: {}, rust: {} },
    })),
  };
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("LSP settings UI", () => {
  it("replaces Enable LSP and Active Servers with Disabled Servers", {
    timeout: 30_000,
  }, async () => {
    const { registerLspSettings } = await import("../../src/lsp/settings.ts");
    registerLspSettings();

    expect(registerConfigSettingsSpy).toHaveBeenCalledTimes(1);
    const callArgs = registerConfigSettingsSpy.mock.calls[0]?.[0] as {
      buildItems?: (
        settings: unknown,
        scope: string,
        cwd: string,
      ) => Array<{ id: string; submenu?: unknown }>;
    };
    const buildItems = callArgs?.buildItems;
    if (!buildItems) {
      throw new Error("buildItems is required");
    }

    const items = buildItems(
      { enabled: true, severity: 1, active: [], exclude: [] },
      "project",
      "/tmp",
    );
    const ids = items.map((i) => i.id);

    // Removed items
    expect(ids).not.toContain("enabled");
    expect(ids).not.toContain("active");

    // Added items
    expect(ids).toContain("severity");
    expect(ids).toContain("disabled_servers");
    expect(ids).toContain("exclude");

    // Disabled Servers has a submenu
    const disabledServers = items.find((i) => i.id === "disabled_servers");
    expect(disabledServers?.submenu).toBeDefined();
  });
});
