// Event-backed settings contribution types for SuPi extensions.
//
// Extensions contribute declarative settings sections through PI's shared
// event bus. The public helper is registerDeclarativeSettings(pi, ...); this module
// owns the internal collector protocol used by /supi-settings.

import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { ScopedFieldValue, SettingsFieldAction } from "./settings-schema.ts";

export const SUPI_SETTINGS_COLLECT_EVENT = "supi:settings:collect";

export type SettingsScope = "project" | "global";

export interface SettingsSection {
  /** Stable contribution identifier — e.g. "lsp", "claude-md". */
  id: string;
  /** Human-readable label shown in the UI. */
  label: string;
  /** Load current ScopedFieldValue[] for the given scope. */
  loadValues: (scope: SettingsScope, cwd: string, ctx?: ExtensionContext) => ScopedFieldValue[];
  /** Handle a user action on a field in the selected scope. */
  handleAction: (
    scope: SettingsScope,
    cwd: string,
    fieldKey: string,
    action: SettingsFieldAction,
    ctx?: ExtensionContext,
  ) => void;
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
