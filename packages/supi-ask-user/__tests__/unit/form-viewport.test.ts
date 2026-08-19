import { describe, expect, it } from "vitest";
import { calculateFormHeightLimit, layoutFormViewport } from "../../src/ui/form-viewport.ts";

const lines = Array.from({ length: 20 }, (_entry, index) => `line ${index + 1}`);

describe("calculateFormHeightLimit", () => {
  it("uses the absolute cap on a large terminal", () => {
    expect(calculateFormHeightLimit(60)).toBe(36);
  });

  it("uses a proportional height on a medium terminal", () => {
    expect(calculateFormHeightLimit(20)).toBe(17);
  });

  it("keeps a usable proportional height on a small terminal", () => {
    expect(calculateFormHeightLimit(8)).toBe(6);
    expect(calculateFormHeightLimit(4)).toBe(3);
    expect(calculateFormHeightLimit(0)).toBe(1);
  });
});

describe("layoutFormViewport", () => {
  it("returns the requested content window", () => {
    const viewport = layoutFormViewport({
      lines,
      maxRows: 5,
      scrollOffset: 4,
      revealFocus: false,
    });

    expect(viewport.lines).toEqual(["line 5", "line 6", "line 7", "line 8", "line 9"]);
    expect(viewport.hiddenAbove).toBe(4);
    expect(viewport.hiddenBelow).toBe(11);
  });

  it("clamps an offset after content or height changes", () => {
    const viewport = layoutFormViewport({
      lines,
      maxRows: 8,
      scrollOffset: 100,
      revealFocus: false,
    });

    expect(viewport.scrollOffset).toBe(12);
    expect(viewport.lines.at(-1)).toBe("line 20");
  });

  it("reveals a focused range below the current window", () => {
    const viewport = layoutFormViewport({
      lines,
      maxRows: 5,
      scrollOffset: 0,
      focusedRange: { start: 10, end: 12 },
      revealFocus: true,
    });

    expect(viewport.scrollOffset).toBe(7);
    expect(viewport.lines).toContain("line 11");
    expect(viewport.lines).toContain("line 12");
  });

  it("preserves manual scrolling when focus reveal is disabled", () => {
    const viewport = layoutFormViewport({
      lines,
      maxRows: 5,
      scrollOffset: 2,
      focusedRange: { start: 15, end: 16 },
      revealFocus: false,
    });

    expect(viewport.scrollOffset).toBe(2);
    expect(viewport.lines[0]).toBe("line 3");
  });
});
