import type { Theme } from "@earendil-works/pi-coding-agent";
import { visibleWidth } from "@earendil-works/pi-tui";
import { describe, expect, it } from "vitest";
import { renderMiniBox } from "../../src/ui/form-render-primitives.ts";

const theme = {
  fg: (_color: string, text: string) => text,
  bold: (text: string) => text,
} as unknown as Theme;

describe("renderMiniBox", () => {
  it("wraps the full body text inside the box", () => {
    const text = "alpha beta gamma delta";
    const lines = renderMiniBox(theme, "Note", [text], 12);
    const output = lines.join("\n");

    for (const word of text.split(" ")) expect(output).toContain(word);
    expect(lines.every((line) => visibleWidth(line) <= 12)).toBe(true);
  });
});
