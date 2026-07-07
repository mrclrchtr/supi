import { describe, expect, it, vi } from "vitest";

const mockRegisterConfigSettings = vi.hoisted(() => vi.fn());
const mockCreateModelPickerSubmenu = vi.hoisted(() => vi.fn());

vi.mock("@mrclrchtr/supi-core/config", () => ({
  registerConfigSettings: mockRegisterConfigSettings,
}));

vi.mock("@mrclrchtr/supi-core/settings-ui", () => ({
  createModelPickerSubmenu: mockCreateModelPickerSubmenu,
}));

import { registerPromptSuggestionsSettings } from "../../src/config/settings.ts";

describe("registerPromptSuggestionsSettings", () => {
  it("persists disabled as an explicit scoped value", () => {
    registerPromptSuggestionsSettings({} as never);

    const options = mockRegisterConfigSettings.mock.calls[0][1];
    const helpers = { set: vi.fn(), unset: vi.fn() };
    options.persistChange("project", "/repo", "model", "disabled", helpers);

    expect(helpers.set).toHaveBeenCalledWith("model", "disabled");
    expect(helpers.unset).not.toHaveBeenCalled();
  });
});
