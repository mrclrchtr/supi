import { describe, expect, it, vi } from "vitest";

const settingsMocks = vi.hoisted(() => ({
  define: vi.fn((options) => options),
  register: vi.fn(),
}));

vi.mock("@mrclrchtr/supi-core/settings", () => ({
  defineConfigSettings: settingsMocks.define,
  registerSettings: settingsMocks.register,
}));

import { registerPromptSuggestionsSettings } from "../../src/config/settings.ts";

describe("registerPromptSuggestionsSettings", () => {
  it("uses declarative modelPicker so disabled is an explicit value, not a signal to unset", () => {
    registerPromptSuggestionsSettings({} as never);

    expect(settingsMocks.define).toHaveBeenCalledOnce();
    expect(settingsMocks.register).toHaveBeenCalledOnce();
    const options = settingsMocks.define.mock.calls[0][0];

    expect(options.fields).toHaveLength(1);
    expect(options.fields[0]).toMatchObject({
      kind: "modelPicker",
      key: "model",
    });

    // With the declarative schema, all values (including "disabled") are explicit;
    // only the Inherit action deletes the key.
  });
});
