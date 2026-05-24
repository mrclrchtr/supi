import { clearRegisteredSettings, getRegisteredSettings } from "@mrclrchtr/supi-core/api";
import { afterEach, describe, expect, it } from "vitest";
import { registerLspConfigSettings } from "../../src/lsp/settings.ts";

describe("LSP config settings registration", () => {
  afterEach(() => {
    clearRegisteredSettings();
  });

  it("registers an LSP section when called", () => {
    clearRegisteredSettings();
    registerLspConfigSettings();
    const sections = getRegisteredSettings();
    expect(sections.length).toBeGreaterThan(0);
    const lspSection = sections.find((s: { id: string }) => s.id === "lsp");
    expect(lspSection).toBeDefined();
    expect(lspSection?.label).toBe("LSP");
  });
});
