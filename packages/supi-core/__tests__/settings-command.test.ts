import { beforeEach, describe, expect, it, vi } from "vitest";

const mockFns = vi.hoisted(() => ({
  openSettingsOverlay: vi.fn(),
}));

vi.mock("../src/settings-ui.ts", () => ({
  openSettingsOverlay: mockFns.openSettingsOverlay,
}));

import { registerSettingsCommand } from "../src/settings-command.ts";

describe("registerSettingsCommand", () => {
  beforeEach(() => {
    mockFns.openSettingsOverlay.mockReset();
  });

  it("registers /supi-settings and delegates to openSettingsOverlay", async () => {
    let handler:
      | ((args: string[], ctx: { cwd: string; ui: Record<string, unknown> }) => Promise<void>)
      | undefined;

    const pi = {
      registerCommand: vi.fn(
        (
          name: string,
          spec: {
            description: string;
            handler: (
              args: string[],
              ctx: { cwd: string; ui: Record<string, unknown> },
            ) => Promise<void>;
          },
        ) => {
          expect(name).toBe("supi-settings");
          expect(spec.description).toBe("Manage SuPi extension settings");
          handler = spec.handler;
        },
      ),
    };

    registerSettingsCommand(pi as never);

    expect(pi.registerCommand).toHaveBeenCalledOnce();
    expect(handler).toBeDefined();

    const ctx = { cwd: "/tmp", ui: {} };
    await handler?.([], ctx);

    expect(mockFns.openSettingsOverlay).toHaveBeenCalledWith(ctx);
  });
});
