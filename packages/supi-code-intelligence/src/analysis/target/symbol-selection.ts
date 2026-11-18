/**
 * Automatic selection among exact-name symbol matches: which matches declare the name, and how
 * the unselected ones are disclosed.
 */

import * as path from "node:path";
import type {
  CodeRequestControl,
  CodeSymbol,
  StructuralProvider as StructuralSubstrate,
} from "@mrclrchtr/supi-code-runtime/api";
import { collectBindingRanges, isBindingPosition } from "./file-outline-omissions.ts";

/** Exact-name matches checked for import/export-list bindings; each costs a syntax query. */
const MAX_BINDING_CHECKS = 8;
const MAX_NOTE_NAMES = 3;

/**
 * Drop exact-name matches that only import or re-export the name, such as the `alias` symbol
 * tsserver reports for `export { foo } from "./foo"`. Keeps every match when the syntax
 * provider is absent, when a file cannot be classified, or when no declaration would remain.
 */
export async function declarationsAmong(
  exact: readonly CodeSymbol[],
  structural: StructuralSubstrate | undefined,
  control?: CodeRequestControl,
): Promise<readonly CodeSymbol[]> {
  if (!structural || exact.length > MAX_BINDING_CHECKS) return exact;
  const files = [...new Set(exact.map((candidate) => candidate.file))];
  const ranges = new Map(
    await Promise.all(
      files.map(
        async (file) => [file, await collectBindingRanges(file, structural, control)] as const,
      ),
    ),
  );
  const declared = exact.filter((candidate) => {
    const fileRanges = ranges.get(candidate.file);
    return (
      !fileRanges ||
      !isBindingPosition(fileRanges, candidate.nameAnchor ?? candidate.declarationAnchor)
    );
  });
  return declared.length > 0 ? declared : exact;
}

/** Name what was passed over for the selected match: bindings of its name and partial names. */
export function unselectedNote(
  candidates: readonly CodeSymbol[],
  selected: CodeSymbol,
  symbol: string,
): string | undefined {
  const others = candidates.filter((candidate) => candidate !== selected);
  if (others.length === 0) return undefined;
  const bindings = others.filter((candidate) => candidate.name === symbol);
  const partial = others.filter((candidate) => candidate.name !== symbol);
  const parts: string[] = [];
  if (bindings.length > 0) {
    const files = [...new Set(bindings.map((candidate) => path.basename(candidate.file)))];
    parts.push(
      `${count(bindings.length, "import or export-list binding")} of that name (${listed(files)})`,
    );
  }
  if (partial.length > 0) {
    const names = [...new Set(partial.map((candidate) => candidate.name))];
    parts.push(`${count(partial.length, "partial-name match", "es")} (${listed(names)})`);
  }
  const subject = bindings.length > 0 ? "declaration of that name" : "exact-name match";
  const verb = others.length === 1 ? "was" : "were";
  return `Selected the only ${subject}; ${parts.join(" and ")} ${verb} not selected.`;
}

function count(n: number, noun: string, plural = "s"): string {
  return `${n} ${noun}${n === 1 ? "" : plural}`;
}

function listed(values: readonly string[]): string {
  const shown = values.slice(0, MAX_NOTE_NAMES).map((value) => `\`${value}\``);
  if (values.length > MAX_NOTE_NAMES) shown.push(`${values.length - MAX_NOTE_NAMES} more`);
  return shown.join(", ");
}
