import type { BoolField, ScopedFieldValue, SettingsSection } from "@mrclrchtr/supi-core/settings";
import { describe, expect, it, vi } from "vitest";
import { ScopedSettingsList } from "../../src/ui/scoped-settings-list.ts";

const field: BoolField = { kind: "boolean", key: "enabled", label: "Enabled" };

function makeTheme() {
  return {
    fg: (_color: string, text: string) => text,
    bold: (text: string) => text,
  };
}

function makeSection(): SettingsSection {
  return {
    id: "test",
    label: "Test",
    loadValues: () =>
      [
        {
          field,
          displayValue: "on (project)",
          editValue: "on",
          source: "project",
          inheritanceSource: "default",
        },
      ] satisfies ScopedFieldValue[],
    handleAction: vi.fn(),
  };
}

describe("ScopedSettingsList", () => {
  it("groups settings by section and shows the selected description", () => {
    const describedField: BoolField = {
      ...field,
      description: "Controls the test feature",
    };
    const sections: SettingsSection[] = [
      {
        ...makeSection(),
        id: "alpha",
        label: "Alpha",
        loadValues: () => [
          {
            field: describedField,
            displayValue: "on (project)",
            editValue: "on",
            source: "project",
          },
        ],
      },
      { ...makeSection(), id: "beta", label: "Beta" },
    ];
    const list = new ScopedSettingsList(
      sections,
      "project",
      "/repo",
      undefined,
      makeTheme() as never,
      { requestRender: vi.fn() },
      vi.fn(),
    );

    const rendered = list.render(80).join("\n");

    expect(rendered).toContain("  Alpha\n  → Enabled");
    expect(rendered).toContain("  Beta\n    Enabled");
    expect(rendered).not.toContain("Alpha: Enabled");
    expect(rendered).toContain("Controls the test feature");
  });

  it("requests a re-render after delegated submenu input", () => {
    const requestRender = vi.fn();
    const list = new ScopedSettingsList(
      [makeSection()],
      "project",
      "/repo",
      undefined,
      makeTheme() as never,
      { requestRender },
      vi.fn(),
    );

    list.handleInput("\r");
    requestRender.mockClear();
    list.render(80);

    list.handleInput("\u001b[B");

    expect(requestRender).toHaveBeenCalled();
  });
});
