import { describe, expect, it, vi } from "vitest";

const mockRegisterDeclarativeSettings = vi.hoisted(() => vi.fn());

vi.mock("@mrclrchtr/supi-core/settings", () => ({
  registerDeclarativeSettings: mockRegisterDeclarativeSettings,
}));

import { registerPromptSuggestionsSettings } from "../../src/config/settings.ts";

describe("registerPromptSuggestionsSettings", () => {
  it("uses declarative modelPicker so disabled is an explicit value, not a signal to unset", () => {
    registerPromptSuggestionsSettings({} as never);

    expect(mockRegisterDeclarativeSettings).toHaveBeenCalledOnce();
    const options = mockRegisterDeclarativeSettings.mock.calls[0][1];

    expect(options.fields).toHaveLength(1);
    expect(options.fields[0]).toMatchObject({
      kind: "modelPicker",
      key: "model",
    });

    // With the declarative schema, all values (including "disabled") are explicit;
    // only the Inherit action deletes the key.
  });
});
