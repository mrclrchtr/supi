import type { ScopedFieldValue } from "@mrclrchtr/supi-core/settings";
import type { LoadedSettingsModule } from "./settings-module-reader.ts";

export interface ScopedRow {
  flatId: string;
  moduleLabel: string;
  subsectionLabel?: string;
  field: ScopedFieldValue;
}

export function rowsFromModules(loaded: LoadedSettingsModule[]): ScopedRow[] {
  const rowsByModuleLabel = new Map<string, ScopedRow[]>();
  for (const { module, snapshot } of loaded) {
    const rows = rowsByModuleLabel.get(module.label) ?? [];
    rows.push(
      ...snapshot.rows.map((field) => ({
        flatId: `${module.id}.${field.field.key}`,
        moduleLabel: module.label,
        subsectionLabel: module.subsection,
        field,
      })),
    );
    rowsByModuleLabel.set(module.label, rows);
  }
  return [...rowsByModuleLabel.values()].flat();
}

/** Return the largest group-header count for any row window of the given size. */
export function maxVisibleHeaderCount(rows: ScopedRow[], windowSize: number): number {
  let maximum = 0;
  for (let start = 0; start <= rows.length - windowSize; start++) {
    let count = 0;
    let previousSection: string | undefined;
    let previousSubsection: string | undefined;
    for (const row of rows.slice(start, start + windowSize)) {
      if (row.moduleLabel !== previousSection) {
        count++;
        previousSection = row.moduleLabel;
        previousSubsection = undefined;
      }
      if (row.subsectionLabel !== previousSubsection) {
        previousSubsection = row.subsectionLabel;
        if (row.subsectionLabel) count++;
      }
    }
    maximum = Math.max(maximum, count);
  }
  return maximum;
}

export function filterSettingsRows(rows: ScopedRow[], query: string): ScopedRow[] {
  if (!query) return rows;
  const normalized = query.toLowerCase();
  return rows.filter(
    (row) =>
      row.moduleLabel.toLowerCase().includes(normalized) ||
      row.subsectionLabel?.toLowerCase().includes(normalized) ||
      row.field.field.label.toLowerCase().includes(normalized) ||
      row.field.field.key.toLowerCase().includes(normalized) ||
      row.field.displayValue.toLowerCase().includes(normalized),
  );
}
