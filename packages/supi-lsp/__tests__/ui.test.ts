import { describe, expect, it, vi } from "vitest";
import { type LspInspectorState, toggleLspStatusOverlay } from "../src/ui.ts";

describe("toggleLspStatusOverlay", () => {
  it("uses a wider responsive overlay", async () => {
    const custom = vi.fn((..._args: unknown[]) => Promise.resolve(undefined));
    const ctx = { ui: { custom } } as unknown as Parameters<typeof toggleLspStatusOverlay>[0];
    const manager = {
      getOutstandingDiagnosticSummary: vi.fn(() => []),
      getOutstandingDiagnostics: vi.fn(() => []),
    } as unknown as Parameters<typeof toggleLspStatusOverlay>[1];
    const inspector: LspInspectorState = { handle: null, close: null };

    toggleLspStatusOverlay(
      ctx,
      manager,
      1,
      inspector,
      [] as Parameters<typeof toggleLspStatusOverlay>[4],
    );
    await Promise.resolve();

    expect(custom).toHaveBeenCalledTimes(1);
    const options = custom.mock.calls[0]?.[1] as {
      overlay?: boolean;
      overlayOptions?: {
        anchor?: string;
        width?: string;
        minWidth?: number;
        maxHeight?: string;
      };
    };
    expect(options).toMatchObject({
      overlay: true,
      overlayOptions: {
        anchor: "right-center",
        width: "60%",
        minWidth: 72,
        maxHeight: "90%",
      },
    });
  });

  it("closes the inspector when it is already open", () => {
    const custom = vi.fn();
    const close = vi.fn();
    const inspector: LspInspectorState = { handle: {} as never, close };
    const ctx = { ui: { custom } } as unknown as Parameters<typeof toggleLspStatusOverlay>[0];
    const manager = {
      getOutstandingDiagnosticSummary: vi.fn(() => []),
      getOutstandingDiagnostics: vi.fn(() => []),
    } as unknown as Parameters<typeof toggleLspStatusOverlay>[1];

    toggleLspStatusOverlay(
      ctx,
      manager,
      1,
      inspector,
      [] as Parameters<typeof toggleLspStatusOverlay>[4],
    );

    expect(close).toHaveBeenCalledTimes(1);
    expect(custom).not.toHaveBeenCalled();
  });
});
