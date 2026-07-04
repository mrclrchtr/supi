// Event-backed settings contribution types for SuPi extensions.
//
// Extensions contribute config-backed settings sections through PI's shared
// event bus. The public helper is registerConfigSettings(pi, ...); this module
// owns the internal collector protocol used by /supi-settings.

import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { SettingItem } from "@earendil-works/pi-tui";

export const SUPI_SETTINGS_COLLECT_EVENT = "supi:settings:collect";

export type SettingsScope = "project" | "global";

export interface SettingsSection {
  /** Stable contribution identifier — e.g. "lsp", "claude-md". */
  id: string;
  /** Human-readable label shown in the UI. */
  label: string;
  /** Load current SettingItem[] for the given scope. */
  loadValues: (scope: SettingsScope, cwd: string, ctx?: ExtensionContext) => SettingItem[];
  /** Persist a UI value back to SuPi config. */
  persistChange: (scope: SettingsScope, cwd: string, settingId: string, value: string) => void;
}

export interface SettingsContributionCollector {
  add(section: SettingsSection): void;
}

export interface SettingsCollectionDiagnostic {
  kind: "warning";
  message: string;
}

export interface SettingsCollectionResult {
  sections: SettingsSection[];
  diagnostics: SettingsCollectionDiagnostic[];
}

export function isSettingsContributionCollector(
  value: unknown,
): value is SettingsContributionCollector {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { add?: unknown }).add === "function"
  );
}

/** Create a collector with last-wins duplicate handling and warning diagnostics. */
export function createSettingsContributionCollector(): SettingsContributionCollector & {
  result(): SettingsCollectionResult;
} {
  const sections = new Map<string, SettingsSection>();
  const diagnostics: SettingsCollectionDiagnostic[] = [];

  return {
    add(section: SettingsSection): void {
      if (sections.has(section.id)) {
        diagnostics.push({
          kind: "warning",
          message: `Duplicate SuPi settings contribution "${section.id}"; using the last contribution.`,
        });
      }
      sections.set(section.id, section);
    },
    result(): SettingsCollectionResult {
      return { sections: Array.from(sections.values()), diagnostics: [...diagnostics] };
    },
  };
}
