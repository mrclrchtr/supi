import { afterEach, describe, expect, it } from "vitest";
import {
  clearRegisteredSettings,
  getRegisteredSettings,
  registerSettings,
  type SettingsSection,
} from "../src/settings-registry.ts";

describe("settings-registry", () => {
  afterEach(() => {
    clearRegisteredSettings();
  });

  it("returns empty array when no sections registered", () => {
    expect(getRegisteredSettings()).toEqual([]);
  });

  it("registers and retrieves a section", () => {
    const section: SettingsSection = {
      id: "lsp",
      label: "LSP",
      loadValues: () => [],
      persistChange: () => {},
    };
    registerSettings(section);

    const result = getRegisteredSettings();
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ id: "lsp", label: "LSP" });
  });

  it("registers multiple sections in order", () => {
    const s1: SettingsSection = {
      id: "lsp",
      label: "LSP",
      loadValues: () => [],
      persistChange: () => {},
    };
    const s2: SettingsSection = {
      id: "claude-md",
      label: "Claude-MD",
      loadValues: () => [],
      persistChange: () => {},
    };
    registerSettings(s1);
    registerSettings(s2);

    const result = getRegisteredSettings();
    expect(result).toHaveLength(2);
    expect(result.map((s) => s.id)).toEqual(["lsp", "claude-md"]);
  });

  it("replaces previous registration with duplicate id", () => {
    const original: SettingsSection = {
      id: "lsp",
      label: "LSP",
      loadValues: () => [],
      persistChange: () => {},
    };
    const replacement: SettingsSection = {
      id: "lsp",
      label: "LSPv2",
      loadValues: () => [],
      persistChange: () => {},
    };
    registerSettings(original);
    registerSettings(replacement);

    const result = getRegisteredSettings();
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ id: "lsp", label: "LSPv2" });
  });

  it("clearRegisteredSettings empties the registry", () => {
    registerSettings({
      id: "lsp",
      label: "LSP",
      loadValues: () => [],
      persistChange: () => {},
    });
    expect(getRegisteredSettings()).toHaveLength(1);

    clearRegisteredSettings();
    expect(getRegisteredSettings()).toHaveLength(0);
  });

  it("calls loadValues and persistChange callbacks", () => {
    const loadedValues = [{ id: "foo", label: "Foo", currentValue: "on" }];
    const persistCalls: Array<{
      scope: "project" | "global";
      cwd: string;
      id: string;
      value: string;
    }> = [];

    const section: SettingsSection = {
      id: "test",
      label: "Test",
      loadValues: (scope, cwd) => {
        expect(scope).toBe("project");
        expect(cwd).toBe("/tmp");
        return loadedValues;
      },
      persistChange: (scope, cwd, id, value) => {
        persistCalls.push({ scope, cwd, id, value });
      },
    };
    registerSettings(section);

    const settings = getRegisteredSettings();
    const loaded = settings[0].loadValues("project", "/tmp");
    expect(loaded).toEqual(loadedValues);

    settings[0].persistChange("global", "/tmp", "foo", "off");
    expect(persistCalls).toEqual([{ scope: "global", cwd: "/tmp", id: "foo", value: "off" }]);
  });
});
