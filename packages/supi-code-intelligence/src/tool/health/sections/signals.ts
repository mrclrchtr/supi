// Coverage, unused, and server collection for code_health.
// Extracted from orchestrate.ts.

import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { isWithinOrEqual } from "@mrclrchtr/supi-core/api";
import type { SessionLspService } from "@mrclrchtr/supi-lsp/api";
import { gatherGitContext } from "../../../analysis/signals/git.ts";
import type { LoadedSignals } from "../../../analysis/signals/project.ts";
import type {
  HealthCoverageData,
  HealthData,
  HealthSection,
  HealthUnusedData,
} from "../markdown.ts";

// ── Servers ───────────────────────────────────────────────────────────

export function collectServers(
  service: SessionLspService | null,
  included: string[],
): HealthData["servers"] {
  if (!included.includes("servers") || !service) return [];

  return service.getProjectServers().map((s) => ({
    name: s.name,
    root: s.root,
    fileTypes: s.fileTypes,
    status: s.status,
  }));
}

// ── Coverage ──────────────────────────────────────────────────────────

export function needsPrioritizationSignals(included: HealthSection[]): boolean {
  return included.includes("coverage") || included.includes("unused");
}

export function collectCoverageSection(
  loaded: LoadedSignals | null,
  cwd: string,
  scopeFilter: string | null,
  coveragePath?: string,
): HealthCoverageData {
  const reportPath = resolve(cwd, coveragePath ?? "coverage/coverage-summary.json");
  if (!existsSync(reportPath) || !loaded) {
    return { available: false, entries: [] };
  }

  const entries = [...loaded.coverageByFile.entries()]
    .filter(([file, pct]) => pct < 50 && isWithinOptionalScope(scopeFilter, file))
    .sort((left, right) => left[1] - right[1] || left[0].localeCompare(right[0]))
    .map(([file, pct]) => ({ file, pct }));

  return { available: true, entries };
}

export function collectUnusedSection(
  loaded: LoadedSignals | null,
  cwd: string,
  scopeFilter: string | null,
  unusedPath?: string,
): HealthUnusedData {
  const reportPath = resolve(cwd, unusedPath ?? "knip.json");
  if (!existsSync(reportPath) || !loaded) {
    return { available: false, files: [], exports: [] };
  }

  const files = [...loaded.unusedFiles]
    .filter((file) => isWithinOptionalScope(scopeFilter, file))
    .sort((left, right) => left.localeCompare(right));
  const exports = loaded.unusedExports
    .filter((entry) => isWithinOptionalScope(scopeFilter, entry.file))
    .sort((left, right) => left.name.localeCompare(right.name));

  return { available: true, files, exports };
}

// ── Git context ───────────────────────────────────────────────────────

export function collectGitContext(included: string[], cwd: string) {
  return included.includes("dirty") ? gatherGitContext(cwd) : null;
}

// ── Helpers ───────────────────────────────────────────────────────────

function isWithinOptionalScope(scopeFilter: string | null, file: string): boolean {
  return !scopeFilter || isWithinOrEqual(scopeFilter, file);
}
