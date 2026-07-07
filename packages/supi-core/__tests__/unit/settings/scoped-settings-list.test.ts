import { describe, expect, it, vi } from "vitest";
import { ScopedSettingsList } from "../../../src/settings/scoped-settings-list.ts";
import type { SettingsSection } from "../../../src/settings/settings-registry.ts";
import type { BoolField, ScopedFieldValue } from "../../../src/settings/settings-schema.ts";

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
