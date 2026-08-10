import { createPiMock } from "@mrclrchtr/supi-test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockFns = vi.hoisted(() => ({
  openSettingsOverlay: vi.fn(),
}));

vi.mock("../../src/ui/settings-ui.ts", () => ({
  openSettingsOverlay: mockFns.openSettingsOverlay,
}));

import registerSettingsExtension from "../../src/extension.ts";

describe("supi-settings extension", () => {
  beforeEach(() => {
    mockFns.openSettingsOverlay.mockReset();
  });

  it("registers /supi-settings and opens the settings UI", async () => {
    const pi = createPiMock();
    registerSettingsExtension(pi as never);

    expect(pi.registerCommand).toHaveBeenCalledWith(
      "supi-settings",
      expect.objectContaining({ description: "Manage SuPi extension settings" }),
    );

    const command = vi.mocked(pi.registerCommand).mock.calls[0]?.[1] as
      | { handler: (args: string, ctx: never) => Promise<void> }
      | undefined;
    const ctx = { cwd: "/tmp", ui: {} };
    await command?.handler("", ctx as never);

    expect(mockFns.openSettingsOverlay).toHaveBeenCalledWith(pi, ctx);
  });
});
