import { visibleWidth } from "@earendil-works/pi-tui";
import { makeCtx } from "@mrclrchtr/supi-test-utils";
import { describe, expect, it, vi } from "vitest";
import { AgentsDialog } from "../../src/ui/agents-overlay.ts";
import { centerLegend } from "../../src/ui/agents-overlay-render.ts";

describe("Agents legend alignment", () => {
  it.each([60, 100, 120])("centers the legend in each section at width %i", (width) => {
    const dialog = new AgentsDialog(
      {
        runs: [],
        profiles: [],
        diagnostics: [],
        omittedDiagnosticCount: 0,
        omittedProfileCount: 0,
      },
      {
        theme: makeCtx().ui.theme as never,
        done: vi.fn(),
        tui: { requestRender: vi.fn(), terminal: { rows: 24 } },
        onSteer: vi.fn(async () => "accepted" as const),
        onStop: vi.fn(async () => "accepted" as const),
      },
    );
    for (let section = 0; section < 3; section++) {
      const legend = dialog.render(width).find((line) => line.includes("esc close"));
      expect(legend).toBeDefined();
      const text = legend ?? "";
      const left = text.length - text.trimStart().length;
      const right = width - visibleWidth(text);
      expect(left).toBeGreaterThan(1);
      expect(Math.abs(left - right)).toBeLessThanOrEqual(1);
      dialog.handleInput("\t");
    }
    dialog.dispose();
  });

  it("uses visible columns for styled text", () => {
    const dim = "\u001b[2m";
    const reset = "\u001b[0m";
    const text = `${dim}t thinking${reset}`;
    expect(centerLegend(text, 20)).toBe(`     ${text}`);
  });

  it.each([0, 1, 2, 10])("clips the legend at width %i", (width) => {
    expect(visibleWidth(centerLegend("t/ctrl+t thinking", width))).toBeLessThanOrEqual(width);
  });
});
