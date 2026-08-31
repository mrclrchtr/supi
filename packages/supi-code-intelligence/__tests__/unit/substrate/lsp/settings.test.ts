/**
 * Tests for the updated LSP settings UI (always-on policy).
 *
 * Verifies that the settings UI:
 * - no longer has an "Enable LSP" toggle
 * - no longer has an "Active Servers" allowlist
 * - has a "Disabled Servers" control
 */

import { afterEach, describe, expect, it, vi } from "vitest";

const settingsSpies = vi.hoisted(() => ({
  define: vi.fn((options) => options),
  register: vi.fn(),
}));

vi.mock("@mrclrchtr/supi-core/settings", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@mrclrchtr/supi-core/settings")>();
  return {
    ...actual,
    defineConfigSettings: settingsSpies.define,
    registerSettings: settingsSpies.register,
  };
});

vi.mock("@mrclrchtr/supi-core/config", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@mrclrchtr/supi-core/config")>();
  return {
    ...actual,
    loadSupiConfigSectionForScope: vi.fn(() => ({
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
    const { registerLspSettings } = await import("../../../../src/substrate/lsp/settings.ts");
    registerLspSettings({ on: vi.fn(), events: { on: vi.fn(), emit: vi.fn() } } as never);

    expect(settingsSpies.define).toHaveBeenCalledTimes(1);
    expect(settingsSpies.register).toHaveBeenCalledTimes(1);
    const callArgs = settingsSpies.define.mock.calls[0]?.[0] as {
      fields?: Array<{ key: string; kind: string; description?: string; submenu?: unknown }>;
    };
    const fields = callArgs?.fields;
    if (!fields) {
      throw new Error("fields is required");
    }

    const keys = fields.map((f) => f.key);

    // Removed items
    expect(keys).not.toContain("enabled");
    expect(keys).not.toContain("active");
    expect(keys).not.toContain("severity");

    // Present items
    expect(keys).toContain("disabled_servers");
    expect(keys).toContain("exclude");
    expect(fields.find((field) => field.key === "exclude")?.description).toContain(
      "automatic LSP workspace work",
    );

    // Disabled Servers is a custom field with a submenu
    const disabledServers = fields.find((f) => f.key === "disabled_servers");
    expect(disabledServers?.kind).toBe("custom");
    expect(disabledServers?.submenu).toBeDefined();
  });
});
