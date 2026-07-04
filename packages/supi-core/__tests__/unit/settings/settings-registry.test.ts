import { describe, expect, it } from "vitest";
import {
  createSettingsContributionCollector,
  isSettingsContributionCollector,
  type SettingsSection,
} from "../../../src/settings/settings-registry.ts";

function section(id: string, label = id): SettingsSection {
  return {
    id,
    label,
    loadValues: () => [],
    persistChange: () => {},
  };
}

describe("settings contribution collector", () => {
  it("returns empty sections when no contributions are added", () => {
    const collector = createSettingsContributionCollector();

    expect(collector.result()).toEqual({ sections: [], diagnostics: [] });
  });

  it("collects sections in insertion order", () => {
    const collector = createSettingsContributionCollector();
    collector.add(section("lsp"));
    collector.add(section("claude-md"));

    expect(collector.result().sections.map((s) => s.id)).toEqual(["lsp", "claude-md"]);
  });

  it("uses the last duplicate contribution and records a warning", () => {
    const collector = createSettingsContributionCollector();
    collector.add(section("lsp", "LSP"));
    collector.add(section("lsp", "LSP v2"));

    const result = collector.result();
    expect(result.sections).toHaveLength(1);
    expect(result.sections[0]).toMatchObject({ id: "lsp", label: "LSP v2" });
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
