import type { ScopedFieldValue } from "@mrclrchtr/supi-core/settings";
import type { LoadedSettingsModule } from "./settings-module-reader.ts";

export interface ScopedRow {
  flatId: string;
  moduleLabel: string;
  field: ScopedFieldValue;
}

export function rowsFromModules(loaded: LoadedSettingsModule[]): ScopedRow[] {
  return loaded.flatMap(({ module, snapshot }) =>
    snapshot.rows.map((field) => ({
      flatId: `${module.id}.${field.field.key}`,
      moduleLabel: module.label,
      field,
    })),
  );
}

/** Return the largest section-header count for any row window of the given size. */
export function maxVisibleSectionCount(rows: ScopedRow[], windowSize: number): number {
  let maximum = 0;
  for (let start = 0; start <= rows.length - windowSize; start++) {
    let count = 0;
    let previousSection: string | undefined;
    for (const row of rows.slice(start, start + windowSize)) {
      if (row.moduleLabel === previousSection) continue;
      count++;
      previousSection = row.moduleLabel;
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
      row.field.field.label.toLowerCase().includes(normalized) ||
      row.field.field.key.toLowerCase().includes(normalized) ||
      row.field.displayValue.toLowerCase().includes(normalized),
  );
}
