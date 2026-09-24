import { visibleWidth } from "@earendil-works/pi-tui";
import { describe, expect, it, vi } from "vitest";
import {
  createSelectListMenu,
  formatTuiTitleLine,
  renderDescriptionViewport,
  renderSelectableRow,
  renderTuiHintLine,
  type TuiTheme,
} from "../../src/tui.ts";

const theme: TuiTheme = {
  fg: (_color, text) => text,
  bold: (text) => text,
};

describe("shared TUI list rendering", () => {
  it("renders titles with one shared accent and spacing style", () => {
    expect(formatTuiTitleLine("Capabilities", theme, "[Tools]  Skills")).toBe(
      " Capabilities  [Tools]  Skills",
    );
  });

  it("aligns values across rows with different indentation", () => {
    const parent = renderSelectableRow({
      label: "Tools",
      value: "Mixed",
      indent: 2,
      maxIndent: 4,
      maxLabelWidth: 10,
      width: 40,
      selected: true,
      theme,
    });
    const child = renderSelectableRow({
      label: "tool-one",
      value: "Disabled",
      indent: 4,
      maxIndent: 4,
      maxLabelWidth: 10,
      width: 40,
      selected: true,
      theme,
    });

    expect(parent).toContain("→ Tools");
    expect(parent.indexOf("Mixed")).toBe(child.indexOf("Disabled"));
  });

  it("uses one hint separator and dims the full hint line", () => {
    expect(renderTuiHintLine(["Type to search", "Enter for actions"], theme, 80)).toBe(
      "Type to search · Enter for actions",
    );
  });

  it("uses one layout and interaction for action menus", () => {
    const onSelect = vi.fn();
    const menu = createSelectListMenu({
      title: "Actions",
      items: [{ value: "enable", label: "Enable" }],
      theme,
      onSelect,
      onCancel: vi.fn(),
    });

    expect(menu.render(80).join("\n")).toContain("↑↓ navigate · Enter select · Esc cancel");
    menu.handleInput("\r");
    expect(onSelect).toHaveBeenCalledWith({ value: "enable", label: "Enable" });
  });

  it("keeps description previews at four lines and marks overflow", () => {
    const description = renderDescriptionViewport(
      "This description wraps across several lines and must show an overflow mark.",
      20,
    );

    expect(description).toHaveLength(4);
    expect(description[0]?.startsWith("  ")).toBe(true);
    expect(description[3]).toContain("…");
    expect(description.every((line) => visibleWidth(line) <= 20)).toBe(true);
  });
});
