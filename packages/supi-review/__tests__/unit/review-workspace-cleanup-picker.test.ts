import type { Theme } from "@earendil-works/pi-coding-agent";
import { visibleWidth } from "@earendil-works/pi-tui";
import { describe, expect, it, vi } from "vitest";
import { ReviewWorkspaceCleanupPicker } from "../../src/ui/review-workspace-cleanup-picker.ts";

const theme = { fg: (_color: string, text: string) => text, bold: (text: string) => text } as Theme;
const candidates = [
  { workspacePath: "/tmp/one", owner: "absent" as const },
  { workspacePath: "/tmp/two", owner: "active" as const },
];

describe("review workspace cleanup picker", () => {
  it("toggles several candidates and returns the selected paths in inventory order", () => {
    const done = vi.fn();
    const picker = new ReviewWorkspaceCleanupPicker(candidates, theme, vi.fn(), done);

    picker.handleInput(" ");
    picker.handleInput("j");
    picker.handleInput(" ");
    picker.handleInput("\r");

    expect(done).toHaveBeenCalledWith(["/tmp/one", "/tmp/two"]);
  });

  it("keeps every rendered line within the supplied terminal width", () => {
    const picker = new ReviewWorkspaceCleanupPicker(candidates, theme, vi.fn(), vi.fn());

    expect(picker.render(20).every((line) => visibleWidth(line) <= 20)).toBe(true);
  });
});
