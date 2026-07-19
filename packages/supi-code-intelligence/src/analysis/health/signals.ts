// Coverage, unused, and server collection for code_health.
// Extracted from orchestrate.ts.

import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { isWithinOrEqual } from "@mrclrchtr/supi-core/api";
import type { WorkspaceLspRuntime } from "@mrclrchtr/supi-lsp/api";
import type {
  HealthCoverageData,
  HealthData,
  HealthSection,
  HealthUnusedData,
} from "../../session/health-types.ts";
import { gatherGitContext } from "../signals/git.ts";
import type { LoadedSignals } from "../signals/project.ts";

// ── Servers ───────────────────────────────────────────────────────────

export function collectServers(
  service: WorkspaceLspRuntime | null,
  included: string[],
): HealthData["servers"] {
  if (!included.includes("servers") || !service) return [];

  return service.getProjectServers().map((s) => ({
    name: s.name,
    root: s.root,
    fileTypes: s.fileTypes,
    status: s.status,
    ready: s.ready,
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
    return { reportPath, available: false, entries: [] };
  }

  const entries = [...loaded.coverageByFile.entries()]
    .filter(([file, pct]) => pct < 50 && isWithinOptionalScope(scopeFilter, file))
    .sort((left, right) => left[1] - right[1] || left[0].localeCompare(right[0]))
    .map(([file, pct]) => ({ file, pct }));

  return { reportPath, available: true, entries };
}

export function collectUnusedSection(
  loaded: LoadedSignals | null,
  cwd: string,
  scopeFilter: string | null,
  unusedPath?: string,
): HealthUnusedData {
  const reportPath = resolve(cwd, unusedPath ?? "knip.json");
  if (!existsSync(reportPath) || !loaded) {
    return { reportPath, available: false, files: [], exports: [] };
  }

  const files = [...loaded.unusedFiles]
    .filter((file) => isWithinOptionalScope(scopeFilter, file))
    .sort((left, right) => left.localeCompare(right));
  const exports = loaded.unusedExports
    .filter((entry) => isWithinOptionalScope(scopeFilter, entry.file))
    .sort((left, right) => left.name.localeCompare(right.name));

  return { reportPath, available: true, files, exports };
}

// ── Git context ───────────────────────────────────────────────────────

export function collectGitContext(included: string[], cwd: string) {
  return included.includes("dirty") ? gatherGitContext(cwd) : null;
}

// ── Helpers ───────────────────────────────────────────────────────────

function isWithinOptionalScope(scopeFilter: string | null, file: string): boolean {
  return !scopeFilter || isWithinOrEqual(scopeFilter, file);
}
