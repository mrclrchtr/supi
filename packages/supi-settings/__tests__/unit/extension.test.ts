import { createPiMock } from "@mrclrchtr/supi-test-utils";
import { describe, expect, it } from "vitest";
import registerSettingsCommand from "../../src/extension.ts";

describe("supi-settings extension", () => {
  it("registers /supi-settings command", () => {
    const pi = createPiMock();
    registerSettingsCommand(pi as never);
    expect(pi.registerCommand).toHaveBeenCalledWith(
      "supi-settings",
      expect.objectContaining({ description: "Manage SuPi extension settings" }),
    );
  });
});
