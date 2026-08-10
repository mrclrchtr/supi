import { describe, expect, it } from "vitest";
import {
  createSettingsContributionCollector,
  isSettingsContributionCollector,
  type SettingsModule,
} from "../../../src/settings/settings-registry.ts";
import type { BoolField, ScopedFieldValue } from "../../../src/settings/settings-schema.ts";

function module(id: string, label = id): SettingsModule {
  return {
    id,
    label,
    read: async () => ({
      rows: [
        {
          field: { kind: "boolean", key: "test", label: "Test" } satisfies BoolField,
          displayValue: "on (default)",
          editValue: "on",
          source: "default",
        } satisfies ScopedFieldValue,
      ],
    }),
    apply: async () => ({}),
  };
}

describe("settings contribution collector", () => {
  it("returns empty modules when no contributions are added", () => {
    const collector = createSettingsContributionCollector();

    expect(collector.result()).toEqual({ modules: [], diagnostics: [] });
  });

  it("collects modules in insertion order", () => {
    const collector = createSettingsContributionCollector();
    collector.add(module("lsp"));
    collector.add(module("claude-md"));

    expect(collector.result().modules.map((item) => item.id)).toEqual(["lsp", "claude-md"]);
  });

  it("uses the last duplicate contribution and records a warning", () => {
    const collector = createSettingsContributionCollector();
    collector.add(module("lsp", "LSP"));
    collector.add(module("lsp", "LSP v2"));

    const result = collector.result();
    expect(result.modules).toHaveLength(1);
    expect(result.modules[0]).toMatchObject({ id: "lsp", label: "LSP v2" });
    expect(result.diagnostics).toEqual([
      {
        kind: "warning",
        message: 'Duplicate SuPi settings contribution "lsp"; using the last contribution.',
      },
    ]);
  });

  it("recognizes collector-shaped values", () => {
    const collector = createSettingsContributionCollector();

    expect(isSettingsContributionCollector(collector)).toBe(true);
    expect(isSettingsContributionCollector({})).toBe(false);
  });
});
