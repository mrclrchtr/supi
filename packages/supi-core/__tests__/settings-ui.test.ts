import { afterEach, describe, expect, it } from "vitest";
import {
  clearRegisteredSettings,
  getRegisteredSettings,
  registerSettings,
} from "../settings-registry.ts";

describe("settings-ui id collision", () => {
  afterEach(() => {
    clearRegisteredSettings();
  });

  it("prefixes item ids with section id to prevent collision", () => {
    const lspCalls: string[] = [];
    const claudeCalls: string[] = [];

    registerSettings({
      id: "lsp",
      label: "LSP",
      loadValues: () => [
        { id: "enabled", label: "Enable", currentValue: "on", values: ["on", "off"] },
      ],
      persistChange: (_scope, _cwd, id, value) => {
        lspCalls.push(`${id}=${value}`);
      },
    });

    registerSettings({
      id: "claude-md",
      label: "Claude-MD",
      loadValues: () => [
        { id: "enabled", label: "Enable", currentValue: "on", values: ["on", "off"] },
      ],
      persistChange: (_scope, _cwd, id, value) => {
        claudeCalls.push(`${id}=${value}`);
      },
    });

    const sections = getRegisteredSettings();

    // Simulate what settings-ui does: prefix ids
    const flatItems = sections.flatMap((s) =>
      s.loadValues("project", "/tmp").map((item) => ({
        ...item,
        id: `${s.id}.${item.id}`,
      })),
    );

    expect(flatItems.map((i) => i.id)).toEqual(["lsp.enabled", "claude-md.enabled"]);

    // Simulate change routing
    const flatId = "claude-md.enabled";
    const dotIndex = flatId.indexOf(".");
    const sectionId = flatId.slice(0, dotIndex);
    const itemId = flatId.slice(dotIndex + 1);
    const section = sections.find((s) => s.id === sectionId);
    expect(section).toBeDefined();
    section?.persistChange("project", "/tmp", itemId, "off");

    expect(lspCalls).toEqual([]);
    expect(claudeCalls).toEqual(["enabled=off"]);
  });
});
