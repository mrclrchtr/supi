// Event-backed settings module registration and collection.

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { ScopedFieldValue, SettingsAction } from "./settings-schema.ts";

export const SUPI_SETTINGS_COLLECT_EVENT = "supi:settings:collect";

export type SettingsScope = "project" | "global";

/** Scope and PI runtime state supplied for each settings read. */
export interface SettingsContext {
  scope: SettingsScope;
  cwd: string;
  ctx?: ExtensionContext;
}

/** A resolved, source-aware settings view. */
export interface SettingsSnapshot {
  rows: ScopedFieldValue[];
}

/** One user action routed to its owning settings module. */
export interface SettingsActionRequest extends SettingsContext {
  fieldKey: string;
  action: SettingsAction;
}

/** Optional user-facing result from a successful settings action. */
export interface SettingsApplyResult {
  notice?: {
    message: string;
    level: "info" | "warning" | "error";
  };
}

/**
 * Canonical settings interface consumed by `/supi-settings`.
 *
 * Reads are always asynchronous. Apply resolves only after durable writes and
 * module-owned refresh work complete. Implementations throw on failed writes.
 */
export interface SettingsModule {
  id: string;
  label: string;
  read(context: SettingsContext): Promise<SettingsSnapshot>;
  apply(request: SettingsActionRequest): Promise<SettingsApplyResult>;
}

export interface SettingsContributionCollector {
  add(module: SettingsModule): void;
}

export interface SettingsCollectionDiagnostic {
  kind: "warning";
  message: string;
}

export interface SettingsCollectionResult {
  modules: SettingsModule[];
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
  const modules = new Map<string, SettingsModule>();
  const diagnostics: SettingsCollectionDiagnostic[] = [];

  return {
    add(module: SettingsModule): void {
      if (modules.has(module.id)) {
        diagnostics.push({
          kind: "warning",
          message: `Duplicate SuPi settings contribution "${module.id}"; using the last contribution.`,
        });
      }
      modules.set(module.id, module);
    },
    result(): SettingsCollectionResult {
      return { modules: Array.from(modules.values()), diagnostics: [...diagnostics] };
    },
  };
}

/** Register one settings module during extension factory setup. */
export function registerSettings(pi: ExtensionAPI, module: SettingsModule): void {
  const dispose = pi.events.on(SUPI_SETTINGS_COLLECT_EVENT, (collector) => {
    if (isSettingsContributionCollector(collector)) collector.add(module);
  });
  pi.on("session_shutdown", () => dispose());
}
